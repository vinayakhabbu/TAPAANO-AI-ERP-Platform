BEGIN;

-- Serialize before checking the request key so concurrent retries return the same journal.
CREATE OR REPLACE FUNCTION public.post_manual_journal(
  p_entity_id uuid,
  p_entry_number text,
  p_entry_date date,
  p_memo text,
  p_lines jsonb,
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
  v_event_id uuid;
  v_entry_id uuid;
  v_existing_hash text;
  v_payload_hash text;
  v_line jsonb;
  v_account_id uuid;
  v_debit numeric;
  v_credit numeric;
  v_total_debit numeric := 0;
  v_total_credit numeric := 0;
  v_line_number integer := 0;
BEGIN
  v_actor_org := public.get_user_org_id();
  IF v_actor_org IS NULL THEN RAISE EXCEPTION 'accounting actor identity is unavailable'; END IF;
  v_actor := public.assert_accounting_actor(v_actor_org);
  SELECT org_id INTO v_org_id FROM public.entities
  WHERE id = p_entity_id AND org_id = v_actor_org;
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'entity not found or unavailable'; END IF;

  IF p_entry_number IS NULL OR btrim(p_entry_number) = '' OR p_entry_date IS NULL OR p_entry_date<DATE '0001-01-01' OR p_entry_date>DATE '9999-12-31' OR length(p_entry_number)>100 THEN
    RAISE EXCEPTION 'entry number and date are required';
  END IF;
  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' OR length(p_idempotency_key)>200 THEN
    RAISE EXCEPTION 'journal idempotency key is required';
  END IF;
  IF length(p_memo)>2000 THEN RAISE EXCEPTION 'journal memo is too long'; END IF;
  IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lines) < 2 OR jsonb_array_length(p_lines)>500 THEN
    RAISE EXCEPTION 'journal requires at least two lines';
  END IF;

  v_payload_hash := md5(jsonb_build_object(
    'entity_id', p_entity_id, 'entry_number', btrim(p_entry_number),
    'entry_date', p_entry_date, 'memo', p_memo, 'lines', p_lines
  )::text);

  LOCK TABLE public.journal_entries IN SHARE ROW EXCLUSIVE MODE;
  SELECT id, journal_entry_id, payload_hash
  INTO v_event_id, v_entry_id, v_existing_hash
  FROM public.accounting_events
  WHERE org_id = v_org_id AND source_type = 'manual_journal' AND idempotency_key = p_idempotency_key;
  IF v_event_id IS NOT NULL THEN
    IF v_entry_id IS NULL OR v_existing_hash IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION 'journal idempotency key conflicts with another payload';
    END IF;
    RETURN v_entry_id;
  END IF;

  SELECT id INTO v_period_id
  FROM public.accounting_periods
  WHERE org_id = v_org_id AND entity_id = p_entity_id
    AND p_entry_date BETWEEN period_start AND period_end
    AND status = 'OPEN'
  FOR UPDATE;
  IF v_period_id IS NULL THEN RAISE EXCEPTION 'an OPEN accounting period is required'; END IF;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    IF jsonb_typeof(v_line) IS DISTINCT FROM 'object'
      OR (v_line-ARRAY['account_id','debit','credit','memo'])<>'{}'::jsonb
      OR length(v_line->>'memo')>1000 THEN RAISE EXCEPTION 'invalid journal line fields'; END IF;
    BEGIN
      v_account_id := (v_line->>'account_id')::uuid;
      v_debit := (v_line->>'debit')::numeric;
      v_credit := (v_line->>'credit')::numeric;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'invalid journal line';
    END;
    IF v_debit IS NULL OR v_credit IS NULL OR abs(v_debit)>9999999999999.99 OR abs(v_credit)>9999999999999.99
       OR v_debit::text IN ('NaN', 'Infinity', '-Infinity')
       OR v_credit::text IN ('NaN', 'Infinity', '-Infinity')
       OR round(v_debit, 2) IS DISTINCT FROM v_debit
       OR round(v_credit, 2) IS DISTINCT FROM v_credit
       OR NOT ((v_debit > 0 AND v_credit = 0) OR (v_credit > 0 AND v_debit = 0)) THEN
      RAISE EXCEPTION 'invalid journal line amount';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.accounts
      WHERE id = v_account_id AND org_id = v_org_id AND is_active = true
    ) THEN
      RAISE EXCEPTION 'account is inactive or outside the organization';
    END IF;
    v_total_debit := v_total_debit + v_debit;
    v_total_credit := v_total_credit + v_credit;
  END LOOP;
  IF v_total_debit <= 0 OR v_total_debit IS DISTINCT FROM v_total_credit THEN
    RAISE EXCEPTION 'journal must be balanced';
  END IF;

  PERFORM set_config('tapaano.accounting_write', 'trusted', true);
  INSERT INTO public.accounting_events (
    org_id, entity_id, event_type, source_type, source_id, idempotency_key,
    payload_hash, actor_id
  ) VALUES (
    v_org_id, p_entity_id, 'manual_journal_posted', 'manual_journal', NULL,
    p_idempotency_key, v_payload_hash, v_actor
  ) RETURNING id INTO v_event_id;

  INSERT INTO public.journal_entries (
    org_id, entity_id, entry_number, entry_date, memo, status, created_by,
    posted_at, source_module, accounting_period_id, accounting_event_id
  ) VALUES (
    v_org_id, p_entity_id, btrim(p_entry_number), p_entry_date, p_memo,
    'posted', v_actor, now(), 'gl', v_period_id, v_event_id
  ) RETURNING id INTO v_entry_id;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    v_line_number := v_line_number + 1;
    INSERT INTO public.journal_lines (
      journal_entry_id, account_id, debit, credit, memo,
      org_id, entity_id, line_number
    ) VALUES (
      v_entry_id, (v_line->>'account_id')::uuid,
      (v_line->>'debit')::numeric, (v_line->>'credit')::numeric,
      NULLIF(v_line->>'memo', ''), v_org_id, p_entity_id, v_line_number
    );
  END LOOP;

  UPDATE public.accounting_events SET journal_entry_id = v_entry_id WHERE id = v_event_id;
  RETURN v_entry_id;
END;
$$;

REVOKE ALL ON FUNCTION public.post_manual_journal(uuid,text,date,text,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.post_manual_journal(uuid,text,date,text,jsonb,text) TO authenticated;

COMMIT;
