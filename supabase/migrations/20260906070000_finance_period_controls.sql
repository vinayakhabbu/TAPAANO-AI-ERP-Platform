BEGIN;

CREATE OR REPLACE FUNCTION public.create_accounting_period(
  p_entity_id uuid,
  p_period_start date,
  p_period_end date,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_org_id uuid;
  v_actor_org uuid;
  v_actor uuid;
  v_period_id uuid;
BEGIN
  v_actor_org := public.get_user_org_id();
  IF v_actor_org IS NULL THEN RAISE EXCEPTION 'accounting actor identity is unavailable'; END IF;
  v_actor := public.assert_accounting_actor(v_actor_org);
  SELECT org_id INTO v_org_id FROM public.entities
  WHERE id = p_entity_id AND org_id = v_actor_org;
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'entity not found or unavailable'; END IF;

  IF p_period_start IS NULL OR p_period_end IS NULL OR p_period_start > p_period_end
    OR p_period_start < DATE '0001-01-01' OR p_period_end > DATE '9999-12-31' THEN
    RAISE EXCEPTION 'invalid accounting period date range';
  END IF;
  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' OR length(p_idempotency_key)>200 THEN
    RAISE EXCEPTION 'accounting period idempotency key is required';
  END IF;

  PERFORM set_config('tapaano.accounting_write', 'trusted', true);
  LOCK TABLE public.accounting_periods IN SHARE ROW EXCLUSIVE MODE;

  SELECT id INTO v_period_id
  FROM public.accounting_periods
  WHERE org_id = v_org_id AND entity_id = p_entity_id AND idempotency_key = p_idempotency_key;
  IF v_period_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.accounting_periods WHERE id=v_period_id
      AND period_start=p_period_start AND period_end=p_period_end) THEN
      RAISE EXCEPTION 'accounting period idempotency key conflicts with another payload';
    END IF;
    RETURN v_period_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.accounting_periods
    WHERE org_id = v_org_id AND entity_id = p_entity_id
      AND daterange(period_start, period_end, '[]') && daterange(p_period_start, p_period_end, '[]')
  ) THEN
    RAISE EXCEPTION 'accounting period overlaps an existing period';
  END IF;

  INSERT INTO public.accounting_periods (
    org_id, entity_id, period_start, period_end, status, idempotency_key,
    version, created_by, updated_by
  ) VALUES (
    v_org_id, p_entity_id, p_period_start, p_period_end, 'OPEN', p_idempotency_key,
    1, v_actor, v_actor
  ) RETURNING id INTO v_period_id;

  INSERT INTO public.accounting_period_events (
    accounting_period_id, org_id, entity_id, from_status, to_status,
    reason, actor_id, period_version
  ) VALUES (
    v_period_id, v_org_id, p_entity_id, NULL, 'OPEN',
    'Accounting period created', v_actor, 1
  );
  RETURN v_period_id;
END;
$$;

ALTER TABLE public.accounting_period_events
  ADD COLUMN IF NOT EXISTS request_key text,
  ADD COLUMN IF NOT EXISTS request_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS accounting_period_events_request_idx
  ON public.accounting_period_events(org_id,request_key) WHERE request_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.guard_period_event_immutability()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'immutable: accounting period evidence cannot be changed'; END;
$$;
DROP TRIGGER IF EXISTS period_event_immutable ON public.accounting_period_events;
CREATE TRIGGER period_event_immutable BEFORE UPDATE OR DELETE ON public.accounting_period_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_period_event_immutability();
REVOKE ALL ON FUNCTION public.guard_period_event_immutability() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.change_accounting_period(
  p_period_id uuid, p_expected_version integer, p_to_status text,
  p_reason text, p_idempotency_key text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE
  v_org uuid:=public.get_user_org_id(); v_actor uuid;
  v_period public.accounting_periods%ROWTYPE; v_prior public.accounting_period_events%ROWTYPE;
  v_hash text;
BEGIN
  IF auth.uid() IS NULL OR v_org IS NULL THEN RAISE EXCEPTION 'tenant membership is unavailable' USING ERRCODE='42501'; END IF;
  v_actor:=public.assert_accounting_actor(v_org);
  IF p_expected_version IS NULL OR p_expected_version<1 OR p_to_status IS NULL
    OR p_to_status NOT IN ('OPEN','SOFT_CLOSED','HARD_CLOSED') THEN
    RAISE EXCEPTION 'invalid period transition request';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason))<3 OR length(p_reason)>2000
    OR p_idempotency_key IS NULL OR btrim(p_idempotency_key)='' OR length(p_idempotency_key)>200 THEN
    RAISE EXCEPTION 'a reason and a valid request key are required';
  END IF;
  v_hash:=md5(jsonb_build_object('period',p_period_id,'version',p_expected_version,
    'status',p_to_status,'reason',btrim(p_reason),'actor',v_actor)::text);

  -- Matches posting's lock order. A posting either commits before the close or
  -- observes the closed period; it cannot slip between the status check and write.
  LOCK TABLE public.journal_entries IN SHARE ROW EXCLUSIVE MODE;
  SELECT * INTO v_period FROM public.accounting_periods WHERE id=p_period_id AND org_id=v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'accounting period not found or unavailable' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_prior FROM public.accounting_period_events WHERE org_id=v_org AND request_key=p_idempotency_key;
  IF FOUND THEN
    IF v_prior.request_hash IS DISTINCT FROM v_hash THEN RAISE EXCEPTION 'period request key conflicts with another payload'; END IF;
    RETURN v_prior.accounting_period_id;
  END IF;
  IF v_period.version<>p_expected_version THEN
    RAISE EXCEPTION 'period changed; refresh before submitting' USING ERRCODE='40001';
  END IF;
  IF v_period.status='HARD_CLOSED' THEN RAISE EXCEPTION 'HARD_CLOSED is terminal'; END IF;
  IF NOT ((v_period.status='OPEN' AND p_to_status='SOFT_CLOSED')
    OR (v_period.status='SOFT_CLOSED' AND p_to_status IN ('OPEN','HARD_CLOSED'))) THEN
    RAISE EXCEPTION 'soft close the period before final close, or select a valid transition';
  END IF;
  PERFORM set_config('tapaano.accounting_write','trusted',true);
  UPDATE public.accounting_periods SET status=p_to_status,version=version+1,updated_by=v_actor,updated_at=now()
    WHERE id=v_period.id;
  INSERT INTO public.accounting_period_events(accounting_period_id,org_id,entity_id,from_status,to_status,
    reason,actor_id,period_version,request_key,request_hash)
  VALUES(v_period.id,v_org,v_period.entity_id,v_period.status,p_to_status,btrim(p_reason),v_actor,
    v_period.version+1,p_idempotency_key,v_hash);
  RETURN v_period.id;
END;
$$;

-- All browser transitions now require a version and a durable idempotency key.
REVOKE ALL ON FUNCTION public.transition_accounting_period(uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.create_accounting_period(uuid,date,date,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.change_accounting_period(uuid,integer,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.create_accounting_period(uuid,date,date,text),
  public.change_accounting_period(uuid,integer,text,text,text) TO authenticated;

COMMIT;
