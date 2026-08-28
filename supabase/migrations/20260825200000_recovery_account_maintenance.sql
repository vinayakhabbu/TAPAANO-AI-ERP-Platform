-- Controlled chart-of-accounts maintenance for existing tenants.
-- Accounts may be created, renamed, or retired only through tenant-admin RPCs.
-- Codes, types, parents, tenant lineage, and historical rows never mutate.

BEGIN;

CREATE TABLE IF NOT EXISTS public.account_master_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  account_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  event_type text NOT NULL,
  reason text NOT NULL,
  idempotency_key text NOT NULL,
  old_snapshot jsonb,
  new_snapshot jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT account_master_events_actor_profile_fkey
    FOREIGN KEY (org_id, actor_id) REFERENCES public.profiles(org_id, id),
  CONSTRAINT account_master_events_account_fkey
    FOREIGN KEY (org_id, account_id) REFERENCES public.accounts(org_id, id)
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT account_master_events_org_idempotency_uidx
    UNIQUE (org_id, idempotency_key),
  CONSTRAINT account_master_events_type_check
    CHECK (event_type IN ('CREATE', 'RENAME', 'RETIRE')),
  CONSTRAINT account_master_events_reason_check
    CHECK (reason = btrim(reason) AND reason <> '' AND length(reason) <= 500
      AND reason !~ '[[:cntrl:]]'),
  CONSTRAINT account_master_events_idempotency_check
    CHECK (idempotency_key = btrim(idempotency_key) AND idempotency_key <> ''
      AND length(idempotency_key) <= 200 AND idempotency_key !~ '[[:cntrl:]]'),
  CONSTRAINT account_master_events_snapshot_check CHECK (
    jsonb_typeof(new_snapshot) = 'object'
    AND (old_snapshot IS NULL OR jsonb_typeof(old_snapshot) = 'object')
    AND new_snapshot->>'id' = account_id::text
    AND new_snapshot->>'org_id' = org_id::text
    AND new_snapshot->>'code' ~ '^[A-Za-z0-9][A-Za-z0-9._/-]*$'
    AND new_snapshot->>'name' = btrim(new_snapshot->>'name')
    AND new_snapshot->>'name' <> ''
    AND new_snapshot->>'name' !~ '[[:cntrl:]]'
    AND new_snapshot->>'account_type' IN ('asset','liability','equity','revenue','expense')
    AND (
      (event_type = 'CREATE' AND old_snapshot IS NULL
        AND new_snapshot->>'is_active' = 'true')
      OR (event_type = 'RENAME' AND old_snapshot IS NOT NULL
        AND old_snapshot->>'id' = account_id::text
        AND old_snapshot->>'org_id' = org_id::text
        AND old_snapshot->>'is_active' = 'true'
        AND new_snapshot->>'is_active' = 'true'
        AND old_snapshot - 'name' = new_snapshot - 'name'
        AND old_snapshot->>'name' IS DISTINCT FROM new_snapshot->>'name')
      OR (event_type = 'RETIRE' AND old_snapshot IS NOT NULL
        AND old_snapshot->>'id' = account_id::text
        AND old_snapshot->>'org_id' = org_id::text
        AND old_snapshot->>'is_active' = 'true'
        AND new_snapshot->>'is_active' = 'false'
        AND old_snapshot - 'is_active' = new_snapshot - 'is_active')
    )
  )
);

LOCK TABLE public.profiles, public.user_roles, public.accounts,
  public.account_master_events, public.entity_invoice_account_controls,
  public.entity_customer_receipt_controls,
  public.entity_supplier_bill_account_controls,
  public.entity_supplier_payment_account_controls
  IN SHARE ROW EXCLUSIVE MODE;

CREATE OR REPLACE FUNCTION public.account_master_snapshot(p_account public.accounts)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', p_account.id,
    'org_id', p_account.org_id,
    'code', p_account.code,
    'name', p_account.name,
    'account_type', p_account.account_type,
    'parent_id', p_account.parent_id,
    'is_active', p_account.is_active
  )
$$;

CREATE OR REPLACE FUNCTION public.guard_account_master_event_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, auth
AS $$
DECLARE
  v_event_id uuid;
  v_actor_role public.app_role;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'account master audit is immutable';
  END IF;
  BEGIN
    v_event_id := NULLIF(current_setting('tapaano.account_master_event_id', true), '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    v_event_id := NULL;
  END;
  SELECT assigned_role.role INTO v_actor_role
  FROM public.profiles profile
  JOIN public.user_roles assigned_role
    ON (assigned_role.org_id, assigned_role.user_id, assigned_role.role) =
       (profile.org_id, profile.id, profile.role)
  WHERE profile.id = auth.uid() AND profile.org_id = NEW.org_id;
  IF current_setting('tapaano.account_master_purpose', true)
       IS DISTINCT FROM lower(NEW.event_type)
     OR v_event_id IS DISTINCT FROM NEW.id
     OR auth.uid() IS DISTINCT FROM NEW.actor_id
     OR v_actor_role IS DISTINCT FROM 'admin'::public.app_role THEN
    RAISE EXCEPTION 'account master audit is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_controlled_account_master()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, auth
AS $$
DECLARE
  v_event_id uuid;
  v_purpose text := current_setting('tapaano.account_master_purpose', true);
  v_snapshot jsonb;
BEGIN
  IF TG_OP = 'TRUNCATE' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'account data is immutable; use controlled account maintenance';
  END IF;
  BEGIN
    v_event_id := NULLIF(current_setting('tapaano.account_master_event_id', true), '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    v_event_id := NULL;
  END;

  IF TG_OP = 'INSERT' THEN
    v_snapshot := public.account_master_snapshot(NEW);
    IF v_purpose IS DISTINCT FROM 'create'
       OR v_event_id IS NULL
       OR NOT EXISTS (
         SELECT 1 FROM public.account_master_events event
         WHERE event.id = v_event_id AND event.org_id = NEW.org_id
           AND event.account_id = NEW.id AND event.actor_id = auth.uid()
           AND event.event_type = 'CREATE' AND event.old_snapshot IS NULL
           AND event.new_snapshot = v_snapshot
       ) THEN
      RAISE EXCEPTION 'account data is immutable; use controlled account maintenance';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.org_id IS DISTINCT FROM OLD.org_id
     OR NEW.code IS DISTINCT FROM OLD.code
     OR NEW.account_type IS DISTINCT FROM OLD.account_type
     OR NEW.parent_id IS DISTINCT FROM OLD.parent_id
     OR NEW.controlling_category IS DISTINCT FROM OLD.controlling_category
     OR NEW.default_cost_center_id IS DISTINCT FROM OLD.default_cost_center_id
     OR NEW.default_internal_order_id IS DISTINCT FROM OLD.default_internal_order_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.updated_at < OLD.updated_at THEN
    RAISE EXCEPTION 'account data is immutable; use controlled account maintenance';
  END IF;

  IF v_event_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.account_master_events event
    WHERE event.id = v_event_id AND event.org_id = OLD.org_id
      AND event.account_id = OLD.id AND event.actor_id = auth.uid()
      AND event.event_type = upper(v_purpose)
      AND event.old_snapshot = public.account_master_snapshot(OLD)
      AND event.new_snapshot = public.account_master_snapshot(NEW)
  ) THEN
    RAISE EXCEPTION 'account data is immutable; use controlled account maintenance';
  END IF;

  IF v_purpose = 'rename'
     AND NEW.name IS DISTINCT FROM OLD.name
     AND NEW.is_active IS NOT DISTINCT FROM OLD.is_active
     AND NEW.name = btrim(NEW.name) AND NEW.name <> ''
     AND length(NEW.name) <= 200 AND NEW.name !~ '[[:cntrl:]]' THEN
    RETURN NEW;
  END IF;
  IF v_purpose = 'retire'
     AND NEW.name IS NOT DISTINCT FROM OLD.name
     AND OLD.is_active AND NOT NEW.is_active THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'account data is immutable; use controlled account maintenance';
END;
$$;

CREATE OR REPLACE FUNCTION public.create_tenant_account(
  p_code text,
  p_name text,
  p_account_type public.account_type,
  p_parent_id uuid,
  p_reason text,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_org_id uuid;
  v_actor_role public.app_role;
  v_code text := btrim(p_code);
  v_name text := btrim(p_name);
  v_reason text := btrim(p_reason);
  v_key text := btrim(p_idempotency_key);
  v_parent public.accounts%ROWTYPE;
  v_existing public.account_master_events%ROWTYPE;
  v_account_id uuid := gen_random_uuid();
  v_event_id uuid := gen_random_uuid();
  v_now timestamptz := clock_timestamp();
  v_snapshot jsonb;
BEGIN
  IF p_code IS NULL OR p_code IS DISTINCT FROM v_code OR length(v_code) > 50
     OR v_code !~ '^[A-Za-z0-9][A-Za-z0-9._/-]*$' THEN
    RAISE EXCEPTION 'account code must be normalized and valid';
  END IF;
  IF p_name IS NULL OR p_name IS DISTINCT FROM v_name OR v_name = ''
     OR length(v_name) > 200 OR v_name ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'account name must be normalized and valid';
  END IF;
  IF p_account_type IS NULL THEN
    RAISE EXCEPTION 'account type is required';
  END IF;
  IF p_reason IS NULL OR p_reason IS DISTINCT FROM v_reason OR v_reason = ''
     OR length(v_reason) > 500 OR v_reason ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'account maintenance reason must be normalized and valid';
  END IF;
  IF p_idempotency_key IS NULL OR p_idempotency_key IS DISTINCT FROM v_key OR v_key = ''
     OR length(v_key) > 200 OR v_key ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'account maintenance idempotency key must be normalized and valid';
  END IF;

  SELECT profile.org_id, assigned_role.role INTO v_org_id, v_actor_role
  FROM public.profiles profile
  JOIN public.user_roles assigned_role
    ON (assigned_role.org_id, assigned_role.user_id, assigned_role.role) =
       (profile.org_id, profile.id, profile.role)
  WHERE profile.id = v_actor
  FOR UPDATE OF profile, assigned_role;
  IF v_actor IS NULL OR v_actor_role IS DISTINCT FROM 'admin'::public.app_role THEN
    RAISE EXCEPTION 'account maintenance requires a tenant admin';
  END IF;

  LOCK TABLE public.accounts, public.account_master_events IN SHARE ROW EXCLUSIVE MODE;
  SELECT * INTO v_existing FROM public.account_master_events event
  WHERE event.org_id = v_org_id AND event.idempotency_key = v_key;
  IF FOUND THEN
    IF v_existing.actor_id IS DISTINCT FROM v_actor
       OR v_existing.event_type <> 'CREATE'
       OR v_existing.reason IS DISTINCT FROM v_reason
       OR v_existing.new_snapshot->>'code' IS DISTINCT FROM v_code
       OR v_existing.new_snapshot->>'name' IS DISTINCT FROM v_name
       OR v_existing.new_snapshot->>'account_type' IS DISTINCT FROM p_account_type::text
       OR NULLIF(v_existing.new_snapshot->>'parent_id', '')::uuid IS DISTINCT FROM p_parent_id THEN
      RAISE EXCEPTION 'account maintenance idempotency key conflict';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.accounts account
      WHERE account.id = v_existing.account_id AND account.org_id = v_org_id
        AND account.code = v_code AND account.account_type = p_account_type
        AND account.parent_id IS NOT DISTINCT FROM p_parent_id
    ) THEN
      RAISE EXCEPTION 'account maintenance reconciliation failed';
    END IF;
    RETURN v_existing.account_id;
  END IF;

  IF p_parent_id IS NOT NULL THEN
    SELECT * INTO v_parent FROM public.accounts account
    WHERE account.id = p_parent_id AND account.org_id = v_org_id
      AND account.is_active AND account.account_type = p_account_type
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'parent account is unavailable';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM public.accounts account
    WHERE account.org_id = v_org_id AND account.code = v_code) THEN
    RAISE EXCEPTION 'account code is unavailable';
  END IF;

  v_snapshot := jsonb_build_object(
    'id', v_account_id, 'org_id', v_org_id, 'code', v_code, 'name', v_name,
    'account_type', p_account_type, 'parent_id', p_parent_id, 'is_active', true
  );
  PERFORM set_config('tapaano.account_master_purpose', 'create', true);
  PERFORM set_config('tapaano.account_master_event_id', v_event_id::text, true);
  INSERT INTO public.account_master_events(
    id,org_id,account_id,actor_id,event_type,reason,idempotency_key,
    old_snapshot,new_snapshot,occurred_at
  ) VALUES (
    v_event_id,v_org_id,v_account_id,v_actor,'CREATE',v_reason,v_key,
    NULL,v_snapshot,v_now
  );
  INSERT INTO public.accounts(
    id,org_id,code,name,account_type,parent_id,is_active,controlling_category,
    default_cost_center_id,default_internal_order_id,created_at,updated_at
  ) VALUES (
    v_account_id,v_org_id,v_code,v_name,p_account_type,p_parent_id,true,'no_co',
    NULL,NULL,v_now,v_now
  );
  PERFORM set_config('tapaano.account_master_event_id', '', true);
  PERFORM set_config('tapaano.account_master_purpose', '', true);
  SET CONSTRAINTS account_master_events_account_fkey IMMEDIATE;
  RETURN v_account_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.rename_tenant_account(
  p_account_id uuid,
  p_name text,
  p_reason text,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_org_id uuid;
  v_actor_role public.app_role;
  v_name text := btrim(p_name);
  v_reason text := btrim(p_reason);
  v_key text := btrim(p_idempotency_key);
  v_account public.accounts%ROWTYPE;
  v_existing public.account_master_events%ROWTYPE;
  v_event_id uuid := gen_random_uuid();
  v_new_snapshot jsonb;
BEGIN
  IF p_account_id IS NULL THEN RAISE EXCEPTION 'account is unavailable'; END IF;
  IF p_name IS NULL OR p_name IS DISTINCT FROM v_name OR v_name = ''
     OR length(v_name) > 200 OR v_name ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'account name must be normalized and valid';
  END IF;
  IF p_reason IS NULL OR p_reason IS DISTINCT FROM v_reason OR v_reason = ''
     OR length(v_reason) > 500 OR v_reason ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'account maintenance reason must be normalized and valid';
  END IF;
  IF p_idempotency_key IS NULL OR p_idempotency_key IS DISTINCT FROM v_key OR v_key = ''
     OR length(v_key) > 200 OR v_key ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'account maintenance idempotency key must be normalized and valid';
  END IF;
  SELECT profile.org_id, assigned_role.role INTO v_org_id, v_actor_role
  FROM public.profiles profile
  JOIN public.user_roles assigned_role
    ON (assigned_role.org_id, assigned_role.user_id, assigned_role.role) =
       (profile.org_id, profile.id, profile.role)
  WHERE profile.id = v_actor FOR UPDATE OF profile, assigned_role;
  IF v_actor IS NULL OR v_actor_role IS DISTINCT FROM 'admin'::public.app_role THEN
    RAISE EXCEPTION 'account maintenance requires a tenant admin';
  END IF;

  LOCK TABLE public.accounts, public.account_master_events IN SHARE ROW EXCLUSIVE MODE;
  SELECT * INTO v_existing FROM public.account_master_events event
  WHERE event.org_id = v_org_id AND event.idempotency_key = v_key FOR UPDATE;
  IF FOUND THEN
    IF v_existing.actor_id IS DISTINCT FROM v_actor OR v_existing.event_type <> 'RENAME'
       OR v_existing.account_id IS DISTINCT FROM p_account_id
       OR v_existing.reason IS DISTINCT FROM v_reason
       OR v_existing.new_snapshot->>'name' IS DISTINCT FROM v_name THEN
      RAISE EXCEPTION 'account maintenance idempotency key conflict';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.accounts account
      WHERE account.id = p_account_id AND account.org_id = v_org_id
        AND account.code = v_existing.new_snapshot->>'code'
        AND account.account_type::text = v_existing.new_snapshot->>'account_type'
        AND account.parent_id IS NOT DISTINCT FROM
          NULLIF(v_existing.new_snapshot->>'parent_id','')::uuid) THEN
      RAISE EXCEPTION 'account maintenance reconciliation failed';
    END IF;
    RETURN v_existing.id;
  END IF;

  SELECT * INTO v_account FROM public.accounts account
  WHERE account.id = p_account_id AND account.org_id = v_org_id AND account.is_active
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'account is unavailable'; END IF;
  IF v_account.name = v_name THEN RAISE EXCEPTION 'account name is unchanged'; END IF;
  v_new_snapshot := public.account_master_snapshot(v_account)
    || jsonb_build_object('name', v_name);
  PERFORM set_config('tapaano.account_master_purpose', 'rename', true);
  PERFORM set_config('tapaano.account_master_event_id', v_event_id::text, true);
  INSERT INTO public.account_master_events(
    id,org_id,account_id,actor_id,event_type,reason,idempotency_key,old_snapshot,new_snapshot
  ) VALUES (
    v_event_id,v_org_id,p_account_id,v_actor,'RENAME',v_reason,v_key,
    public.account_master_snapshot(v_account),v_new_snapshot
  );
  UPDATE public.accounts SET name=v_name,updated_at=clock_timestamp()
  WHERE id=p_account_id;
  PERFORM set_config('tapaano.account_master_event_id', '', true);
  PERFORM set_config('tapaano.account_master_purpose', '', true);
  RETURN v_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.retire_tenant_account(
  p_account_id uuid,
  p_reason text,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_org_id uuid;
  v_actor_role public.app_role;
  v_reason text := btrim(p_reason);
  v_key text := btrim(p_idempotency_key);
  v_account public.accounts%ROWTYPE;
  v_existing public.account_master_events%ROWTYPE;
  v_event_id uuid := gen_random_uuid();
  v_new_snapshot jsonb;
BEGIN
  IF p_account_id IS NULL THEN RAISE EXCEPTION 'account is unavailable'; END IF;
  IF p_reason IS NULL OR p_reason IS DISTINCT FROM v_reason OR v_reason = ''
     OR length(v_reason) > 500 OR v_reason ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'account maintenance reason must be normalized and valid';
  END IF;
  IF p_idempotency_key IS NULL OR p_idempotency_key IS DISTINCT FROM v_key OR v_key = ''
     OR length(v_key) > 200 OR v_key ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'account maintenance idempotency key must be normalized and valid';
  END IF;
  SELECT profile.org_id, assigned_role.role INTO v_org_id, v_actor_role
  FROM public.profiles profile
  JOIN public.user_roles assigned_role
    ON (assigned_role.org_id, assigned_role.user_id, assigned_role.role) =
       (profile.org_id, profile.id, profile.role)
  WHERE profile.id = v_actor FOR UPDATE OF profile, assigned_role;
  IF v_actor IS NULL OR v_actor_role IS DISTINCT FROM 'admin'::public.app_role THEN
    RAISE EXCEPTION 'account maintenance requires a tenant admin';
  END IF;

  LOCK TABLE public.accounts, public.account_master_events IN SHARE ROW EXCLUSIVE MODE;
  SELECT * INTO v_existing FROM public.account_master_events event
  WHERE event.org_id = v_org_id AND event.idempotency_key = v_key FOR UPDATE;
  IF FOUND THEN
    IF v_existing.actor_id IS DISTINCT FROM v_actor OR v_existing.event_type <> 'RETIRE'
       OR v_existing.account_id IS DISTINCT FROM p_account_id
       OR v_existing.reason IS DISTINCT FROM v_reason THEN
      RAISE EXCEPTION 'account maintenance idempotency key conflict';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.accounts account
      WHERE account.id=p_account_id AND account.org_id=v_org_id AND NOT account.is_active) THEN
      RAISE EXCEPTION 'account maintenance reconciliation failed';
    END IF;
    RETURN v_existing.id;
  END IF;

  SELECT * INTO v_account FROM public.accounts account
  WHERE account.id=p_account_id AND account.org_id=v_org_id AND account.is_active
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'account is unavailable'; END IF;
  IF EXISTS (SELECT 1 FROM public.accounts child
    WHERE child.org_id=v_org_id AND child.parent_id=p_account_id AND child.is_active) THEN
    RAISE EXCEPTION 'account with an active child cannot be retired';
  END IF;
  IF EXISTS (SELECT 1 FROM public.entity_invoice_account_controls control
      WHERE control.org_id=v_org_id AND p_account_id IN (control.ar_account_id,control.revenue_account_id))
     OR EXISTS (SELECT 1 FROM public.entity_customer_receipt_controls control
      WHERE control.org_id=v_org_id AND control.cash_account_id=p_account_id)
     OR EXISTS (SELECT 1 FROM public.entity_supplier_bill_account_controls control
      WHERE control.org_id=v_org_id AND p_account_id IN (control.ap_account_id,control.expense_account_id))
     OR EXISTS (SELECT 1 FROM public.entity_supplier_payment_account_controls control
      WHERE control.org_id=v_org_id AND control.cash_account_id=p_account_id) THEN
    RAISE EXCEPTION 'account used by an immutable accounting control cannot be retired';
  END IF;
  v_new_snapshot := public.account_master_snapshot(v_account)
    || jsonb_build_object('is_active', false);
  PERFORM set_config('tapaano.account_master_purpose', 'retire', true);
  PERFORM set_config('tapaano.account_master_event_id', v_event_id::text, true);
  INSERT INTO public.account_master_events(
    id,org_id,account_id,actor_id,event_type,reason,idempotency_key,old_snapshot,new_snapshot
  ) VALUES (
    v_event_id,v_org_id,p_account_id,v_actor,'RETIRE',v_reason,v_key,
    public.account_master_snapshot(v_account),v_new_snapshot
  );
  UPDATE public.accounts SET is_active=false,updated_at=clock_timestamp()
  WHERE id=p_account_id;
  PERFORM set_config('tapaano.account_master_event_id', '', true);
  PERFORM set_config('tapaano.account_master_purpose', '', true);
  RETURN v_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_tenant_account_events()
RETURNS TABLE (
  event_id uuid,
  account_id uuid,
  event_type text,
  actor_id uuid,
  reason text,
  old_snapshot jsonb,
  new_snapshot jsonb,
  occurred_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_org_id uuid;
  v_actor_role public.app_role;
BEGIN
  SELECT profile.org_id, assigned_role.role INTO v_org_id, v_actor_role
  FROM public.profiles profile
  JOIN public.user_roles assigned_role
    ON (assigned_role.org_id, assigned_role.user_id, assigned_role.role) =
       (profile.org_id, profile.id, profile.role)
  WHERE profile.id=v_actor;
  IF v_actor IS NULL OR v_actor_role IS DISTINCT FROM 'admin'::public.app_role THEN
    RAISE EXCEPTION 'account maintenance requires a tenant admin';
  END IF;
  RETURN QUERY SELECT event.id,event.account_id,event.event_type,event.actor_id,
    event.reason,event.old_snapshot,event.new_snapshot,event.occurred_at
  FROM public.account_master_events event
  WHERE event.org_id=v_org_id
  ORDER BY event.occurred_at DESC,event.id;
END;
$$;

DO $$
DECLARE
  trigger_record record;
  policy_record record;
  column_record record;
  function_record record;
  role_name text;
BEGIN
  FOR trigger_record IN
    SELECT trigger_info.tgname FROM pg_trigger trigger_info
    JOIN pg_class relation ON relation.oid=trigger_info.tgrelid
    JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
    WHERE namespace.nspname='public' AND relation.relname='accounts'
      AND NOT trigger_info.tgisinternal
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.accounts',trigger_record.tgname);
  END LOOP;
  CREATE TRIGGER guard_master_write BEFORE INSERT OR UPDATE OR DELETE ON public.accounts
    FOR EACH ROW EXECUTE FUNCTION public.guard_controlled_account_master();
  CREATE TRIGGER guard_master_truncate BEFORE TRUNCATE ON public.accounts
    FOR EACH STATEMENT EXECUTE FUNCTION public.guard_controlled_account_master();

  FOR trigger_record IN
    SELECT trigger_info.tgname FROM pg_trigger trigger_info
    JOIN pg_class relation ON relation.oid=trigger_info.tgrelid
    JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
    WHERE namespace.nspname='public' AND relation.relname='account_master_events'
      AND NOT trigger_info.tgisinternal
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.account_master_events',trigger_record.tgname);
  END LOOP;
  CREATE TRIGGER guard_account_master_event_write
    BEFORE INSERT OR UPDATE OR DELETE ON public.account_master_events
    FOR EACH ROW EXECUTE FUNCTION public.guard_account_master_event_write();
  CREATE TRIGGER guard_account_master_event_truncate
    BEFORE TRUNCATE ON public.account_master_events
    FOR EACH STATEMENT EXECUTE FUNCTION public.guard_account_master_event_write();

  ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
  FOR policy_record IN SELECT policyname FROM pg_policies
    WHERE schemaname='public' AND tablename='accounts'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.accounts',policy_record.policyname); END LOOP;
  CREATE POLICY accounts_tenant_master_read ON public.accounts FOR SELECT TO authenticated
    USING (org_id=public.get_user_org_id());
  REVOKE ALL ON TABLE public.accounts FROM PUBLIC,anon,authenticated,service_role;
  FOR column_record IN SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='accounts'
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES (%I) ON public.accounts FROM PUBLIC',column_record.column_name);
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      EXECUTE format('REVOKE ALL PRIVILEGES (%I) ON public.accounts FROM %I',column_record.column_name,role_name);
    END LOOP;
  END LOOP;
  GRANT SELECT ON TABLE public.accounts TO authenticated,service_role;

  ALTER TABLE public.account_master_events ENABLE ROW LEVEL SECURITY;
  FOR policy_record IN SELECT policyname FROM pg_policies
    WHERE schemaname='public' AND tablename='account_master_events'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.account_master_events',policy_record.policyname); END LOOP;
  REVOKE ALL ON TABLE public.account_master_events FROM PUBLIC,anon,authenticated,service_role;
  FOR column_record IN SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='account_master_events'
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES (%I) ON public.account_master_events FROM PUBLIC',column_record.column_name);
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      EXECUTE format('REVOKE ALL PRIVILEGES (%I) ON public.account_master_events FROM %I',column_record.column_name,role_name);
    END LOOP;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime'
    AND schemaname='public' AND tablename='account_master_events') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.account_master_events;
  END IF;

  FOR function_record IN
    SELECT namespace.nspname,procedure_info.proname,
      pg_get_function_identity_arguments(procedure_info.oid) AS identity_arguments
    FROM pg_proc procedure_info JOIN pg_namespace namespace
      ON namespace.oid=procedure_info.pronamespace
    WHERE namespace.nspname='public' AND procedure_info.proname IN
      ('create_tenant_account','rename_tenant_account','retire_tenant_account','list_tenant_account_events')
      AND NOT (
        (procedure_info.proname='create_tenant_account' AND oidvectortypes(procedure_info.proargtypes)='text, text, account_type, uuid, text, text')
        OR (procedure_info.proname='rename_tenant_account' AND oidvectortypes(procedure_info.proargtypes)='uuid, text, text, text')
        OR (procedure_info.proname='retire_tenant_account' AND oidvectortypes(procedure_info.proargtypes)='uuid, text, text')
        OR (procedure_info.proname='list_tenant_account_events' AND oidvectortypes(procedure_info.proargtypes)='')
      )
  LOOP
    EXECUTE format('DROP FUNCTION %I.%I(%s)',function_record.nspname,function_record.proname,function_record.identity_arguments);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.account_master_snapshot(public.accounts)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.guard_account_master_event_write()
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.guard_controlled_account_master()
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.create_tenant_account(text,text,public.account_type,uuid,text,text)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.rename_tenant_account(uuid,text,text,text)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.retire_tenant_account(uuid,text,text)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.list_tenant_account_events()
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.create_tenant_account(text,text,public.account_type,uuid,text,text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.rename_tenant_account(uuid,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.retire_tenant_account(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_tenant_account_events() TO authenticated;

COMMIT;
