-- Controlled customer and vendor lifecycle for existing tenants.
-- Physical rows remain read-only; exact admin RPCs create, update, or retire a
-- party with append-only before/after evidence. Retired parties cannot be used
-- by new posted invoices or bills.

BEGIN;

LOCK TABLE public.profiles, public.user_roles, public.customers, public.vendors,
  public.invoices, public.bills IN SHARE ROW EXCLUSIVE MODE;

-- The containment migration installed an unconditional write guard. Replace it
-- only while these tables are transactionally locked; controlled guards are
-- installed again before commit.
DROP TRIGGER IF EXISTS guard_master_write ON public.customers;
DROP TRIGGER IF EXISTS guard_master_truncate ON public.customers;
DROP TRIGGER IF EXISTS guard_party_write ON public.customers;
DROP TRIGGER IF EXISTS guard_party_truncate ON public.customers;
DROP TRIGGER IF EXISTS guard_master_write ON public.vendors;
DROP TRIGGER IF EXISTS guard_master_truncate ON public.vendors;
DROP TRIGGER IF EXISTS guard_party_write ON public.vendors;
DROP TRIGGER IF EXISTS guard_party_truncate ON public.vendors;

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS is_active boolean;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS is_active boolean;
UPDATE public.customers SET is_active = true WHERE is_active IS NULL;
UPDATE public.vendors SET is_active = true WHERE is_active IS NULL;
ALTER TABLE public.customers ALTER COLUMN is_active SET DEFAULT true;
ALTER TABLE public.customers ALTER COLUMN is_active SET NOT NULL;
ALTER TABLE public.customers ALTER COLUMN payment_terms SET NOT NULL;
ALTER TABLE public.vendors ALTER COLUMN is_active SET DEFAULT true;
ALTER TABLE public.vendors ALTER COLUMN is_active SET NOT NULL;
ALTER TABLE public.vendors ALTER COLUMN payment_terms SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.customers
    WHERE name IS DISTINCT FROM btrim(name) OR name = '' OR length(name) > 200
       OR name ~ '[[:cntrl:]]'
       OR (email IS NOT NULL AND (email IS DISTINCT FROM btrim(email)
         OR email = '' OR length(email) > 320 OR email ~ '[[:cntrl:]]'))
       OR (phone IS NOT NULL AND (phone IS DISTINCT FROM btrim(phone)
         OR phone = '' OR length(phone) > 80 OR phone ~ '[[:cntrl:]]'))
       OR (address IS NOT NULL AND (address IS DISTINCT FROM btrim(address)
         OR address = '' OR length(address) > 2000 OR address ~ '[[:cntrl:]]'))
       OR payment_terms IS NULL OR payment_terms NOT BETWEEN 0 AND 3650
       OR (credit_limit IS NOT NULL AND (credit_limit < 0
         OR round(credit_limit, 2) IS DISTINCT FROM credit_limit))
  ) OR EXISTS (
    SELECT 1 FROM public.vendors
    WHERE name IS DISTINCT FROM btrim(name) OR name = '' OR length(name) > 200
       OR name ~ '[[:cntrl:]]'
       OR (email IS NOT NULL AND (email IS DISTINCT FROM btrim(email)
         OR email = '' OR length(email) > 320 OR email ~ '[[:cntrl:]]'))
       OR (phone IS NOT NULL AND (phone IS DISTINCT FROM btrim(phone)
         OR phone = '' OR length(phone) > 80 OR phone ~ '[[:cntrl:]]'))
       OR (address IS NOT NULL AND (address IS DISTINCT FROM btrim(address)
         OR address = '' OR length(address) > 2000 OR address ~ '[[:cntrl:]]'))
       OR payment_terms IS NULL OR payment_terms NOT BETWEEN 0 AND 3650
  ) THEN
    RAISE EXCEPTION 'party maintenance preflight: invalid customer or vendor data';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_master_fields_check') THEN
    ALTER TABLE public.customers ADD CONSTRAINT customers_master_fields_check CHECK (
      name = btrim(name) AND name <> '' AND length(name) <= 200 AND name !~ '[[:cntrl:]]'
      AND (email IS NULL OR (email = btrim(email) AND email <> ''
        AND length(email) <= 320 AND email !~ '[[:cntrl:]]'))
      AND (phone IS NULL OR (phone = btrim(phone) AND phone <> ''
        AND length(phone) <= 80 AND phone !~ '[[:cntrl:]]'))
      AND (address IS NULL OR (address = btrim(address) AND address <> ''
        AND length(address) <= 2000 AND address !~ '[[:cntrl:]]'))
      AND payment_terms BETWEEN 0 AND 3650
      AND (credit_limit IS NULL OR (credit_limit >= 0
        AND round(credit_limit, 2) = credit_limit))
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vendors_master_fields_check') THEN
    ALTER TABLE public.vendors ADD CONSTRAINT vendors_master_fields_check CHECK (
      name = btrim(name) AND name <> '' AND length(name) <= 200 AND name !~ '[[:cntrl:]]'
      AND (email IS NULL OR (email = btrim(email) AND email <> ''
        AND length(email) <= 320 AND email !~ '[[:cntrl:]]'))
      AND (phone IS NULL OR (phone = btrim(phone) AND phone <> ''
        AND length(phone) <= 80 AND phone !~ '[[:cntrl:]]'))
      AND (address IS NULL OR (address = btrim(address) AND address <> ''
        AND length(address) <= 2000 AND address !~ '[[:cntrl:]]'))
      AND payment_terms BETWEEN 0 AND 3650
    );
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.party_master_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  party_type text NOT NULL,
  party_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  event_type text NOT NULL,
  reason text NOT NULL,
  idempotency_key text NOT NULL,
  old_snapshot jsonb,
  new_snapshot jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT party_master_events_actor_profile_fkey
    FOREIGN KEY (org_id, actor_id) REFERENCES public.profiles(org_id, id),
  CONSTRAINT party_master_events_org_idempotency_uidx UNIQUE (org_id, idempotency_key),
  CONSTRAINT party_master_events_party_type_check CHECK (party_type IN ('customer','vendor')),
  CONSTRAINT party_master_events_event_type_check CHECK (event_type IN ('CREATE','UPDATE','RETIRE')),
  CONSTRAINT party_master_events_reason_check CHECK (
    reason = btrim(reason) AND reason <> '' AND length(reason) <= 500
    AND reason !~ '[[:cntrl:]]'
  ),
  CONSTRAINT party_master_events_idempotency_check CHECK (
    idempotency_key = btrim(idempotency_key) AND idempotency_key <> ''
    AND length(idempotency_key) <= 200 AND idempotency_key !~ '[[:cntrl:]]'
  ),
  CONSTRAINT party_master_events_snapshot_check CHECK (
    jsonb_typeof(new_snapshot) = 'object'
    AND (old_snapshot IS NULL OR jsonb_typeof(old_snapshot) = 'object')
    AND new_snapshot->>'id' = party_id::text
    AND new_snapshot->>'org_id' = org_id::text
    AND new_snapshot->>'party_type' = party_type
    AND ((event_type = 'CREATE' AND old_snapshot IS NULL)
      OR (event_type IN ('UPDATE','RETIRE') AND old_snapshot IS NOT NULL
        AND old_snapshot->>'id' = party_id::text
        AND old_snapshot->>'org_id' = org_id::text
        AND old_snapshot->>'party_type' = party_type))
  )
);

LOCK TABLE public.party_master_events IN SHARE ROW EXCLUSIVE MODE;

CREATE OR REPLACE FUNCTION public.customer_master_snapshot(p_customer public.customers)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT jsonb_build_object(
    'party_type','customer','id',p_customer.id,'org_id',p_customer.org_id,
    'name',p_customer.name,'email',p_customer.email,'phone',p_customer.phone,
    'address',p_customer.address,'payment_terms',p_customer.payment_terms,
    'credit_limit',p_customer.credit_limit,'is_active',p_customer.is_active
  )
$$;

CREATE OR REPLACE FUNCTION public.vendor_master_snapshot(p_vendor public.vendors)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT jsonb_build_object(
    'party_type','vendor','id',p_vendor.id,'org_id',p_vendor.org_id,
    'name',p_vendor.name,'email',p_vendor.email,'phone',p_vendor.phone,
    'address',p_vendor.address,'payment_terms',p_vendor.payment_terms,
    'is_active',p_vendor.is_active
  )
$$;

CREATE OR REPLACE FUNCTION public.guard_party_master_event_write()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,auth AS $$
DECLARE
  v_event_id uuid;
  v_actor_role public.app_role;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'party master audit is immutable';
  END IF;
  BEGIN
    v_event_id := NULLIF(current_setting('tapaano.party_master_event_id', true), '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    v_event_id := NULL;
  END;
  SELECT assigned.role INTO v_actor_role
  FROM public.profiles profile
  JOIN public.user_roles assigned
    ON (assigned.org_id,assigned.user_id,assigned.role)=(profile.org_id,profile.id,profile.role)
  WHERE profile.id=auth.uid() AND profile.org_id=NEW.org_id;
  IF current_setting('tapaano.party_master_purpose', true)
       IS DISTINCT FROM NEW.party_type || ':' || lower(NEW.event_type)
     OR v_event_id IS DISTINCT FROM NEW.id
     OR auth.uid() IS DISTINCT FROM NEW.actor_id
     OR v_actor_role IS DISTINCT FROM 'admin'::public.app_role THEN
    RAISE EXCEPTION 'party master audit is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_controlled_customer_master()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,auth AS $$
DECLARE
  v_event_id uuid;
  v_purpose text := current_setting('tapaano.party_master_purpose', true);
BEGIN
  IF TG_OP IN ('DELETE','TRUNCATE') THEN
    RAISE EXCEPTION 'customer data is immutable; use controlled party maintenance';
  END IF;
  BEGIN
    v_event_id := NULLIF(current_setting('tapaano.party_master_event_id', true), '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    v_event_id := NULL;
  END;
  IF TG_OP = 'INSERT' THEN
    IF v_purpose IS DISTINCT FROM 'customer:create' OR v_event_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.party_master_events event
      WHERE event.id=v_event_id AND event.org_id=NEW.org_id AND event.party_type='customer'
        AND event.party_id=NEW.id AND event.actor_id=auth.uid() AND event.event_type='CREATE'
        AND event.old_snapshot IS NULL AND event.new_snapshot=public.customer_master_snapshot(NEW)
    ) THEN RAISE EXCEPTION 'customer data is immutable; use controlled party maintenance'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.org_id IS DISTINCT FROM OLD.org_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.updated_at <= OLD.updated_at
     OR v_event_id IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.party_master_events event
       WHERE event.id=v_event_id AND event.org_id=OLD.org_id AND event.party_type='customer'
         AND event.party_id=OLD.id AND event.actor_id=auth.uid()
         AND event.event_type=upper(split_part(v_purpose,':',2))
         AND event.old_snapshot=public.customer_master_snapshot(OLD)
         AND event.new_snapshot=public.customer_master_snapshot(NEW)
     ) THEN RAISE EXCEPTION 'customer data is immutable; use controlled party maintenance'; END IF;
  IF v_purpose='customer:update' AND OLD.is_active AND NEW.is_active
     AND public.customer_master_snapshot(OLD) IS DISTINCT FROM public.customer_master_snapshot(NEW) THEN
    RETURN NEW;
  END IF;
  IF v_purpose='customer:retire' AND OLD.is_active AND NOT NEW.is_active
     AND public.customer_master_snapshot(OLD)-'is_active'=public.customer_master_snapshot(NEW)-'is_active' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'customer data is immutable; use controlled party maintenance';
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_controlled_vendor_master()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,auth AS $$
DECLARE
  v_event_id uuid;
  v_purpose text := current_setting('tapaano.party_master_purpose', true);
BEGIN
  IF TG_OP IN ('DELETE','TRUNCATE') THEN
    RAISE EXCEPTION 'vendor data is immutable; use controlled party maintenance';
  END IF;
  BEGIN
    v_event_id := NULLIF(current_setting('tapaano.party_master_event_id', true), '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    v_event_id := NULL;
  END;
  IF TG_OP = 'INSERT' THEN
    IF v_purpose IS DISTINCT FROM 'vendor:create' OR v_event_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.party_master_events event
      WHERE event.id=v_event_id AND event.org_id=NEW.org_id AND event.party_type='vendor'
        AND event.party_id=NEW.id AND event.actor_id=auth.uid() AND event.event_type='CREATE'
        AND event.old_snapshot IS NULL AND event.new_snapshot=public.vendor_master_snapshot(NEW)
    ) THEN RAISE EXCEPTION 'vendor data is immutable; use controlled party maintenance'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.org_id IS DISTINCT FROM OLD.org_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.updated_at <= OLD.updated_at
     OR v_event_id IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.party_master_events event
       WHERE event.id=v_event_id AND event.org_id=OLD.org_id AND event.party_type='vendor'
         AND event.party_id=OLD.id AND event.actor_id=auth.uid()
         AND event.event_type=upper(split_part(v_purpose,':',2))
         AND event.old_snapshot=public.vendor_master_snapshot(OLD)
         AND event.new_snapshot=public.vendor_master_snapshot(NEW)
     ) THEN RAISE EXCEPTION 'vendor data is immutable; use controlled party maintenance'; END IF;
  IF v_purpose='vendor:update' AND OLD.is_active AND NEW.is_active
     AND public.vendor_master_snapshot(OLD) IS DISTINCT FROM public.vendor_master_snapshot(NEW) THEN
    RETURN NEW;
  END IF;
  IF v_purpose='vendor:retire' AND OLD.is_active AND NOT NEW.is_active
     AND public.vendor_master_snapshot(OLD)-'is_active'=public.vendor_master_snapshot(NEW)-'is_active' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'vendor data is immutable; use controlled party maintenance';
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_active_invoice_customer()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.accounting_status='POSTED' THEN
    PERFORM 1 FROM public.customers
    WHERE (org_id,id,is_active)=(NEW.org_id,NEW.customer_id,true) FOR KEY SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'customer not found or unavailable'; END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_active_bill_vendor()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.accounting_status='POSTED' THEN
    PERFORM 1 FROM public.vendors
    WHERE (org_id,id,is_active)=(NEW.org_id,NEW.vendor_id,true) FOR KEY SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'vendor not found or unavailable'; END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_master_write ON public.customers;
DROP TRIGGER IF EXISTS guard_master_truncate ON public.customers;
DROP TRIGGER IF EXISTS guard_party_write ON public.customers;
DROP TRIGGER IF EXISTS guard_party_truncate ON public.customers;
CREATE TRIGGER guard_party_write BEFORE INSERT OR UPDATE OR DELETE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.guard_controlled_customer_master();
CREATE TRIGGER guard_party_truncate BEFORE TRUNCATE ON public.customers
  FOR EACH STATEMENT EXECUTE FUNCTION public.guard_controlled_customer_master();

DROP TRIGGER IF EXISTS guard_master_write ON public.vendors;
DROP TRIGGER IF EXISTS guard_master_truncate ON public.vendors;
DROP TRIGGER IF EXISTS guard_party_write ON public.vendors;
DROP TRIGGER IF EXISTS guard_party_truncate ON public.vendors;
CREATE TRIGGER guard_party_write BEFORE INSERT OR UPDATE OR DELETE ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.guard_controlled_vendor_master();
CREATE TRIGGER guard_party_truncate BEFORE TRUNCATE ON public.vendors
  FOR EACH STATEMENT EXECUTE FUNCTION public.guard_controlled_vendor_master();

DROP TRIGGER IF EXISTS guard_party_event_write ON public.party_master_events;
DROP TRIGGER IF EXISTS guard_party_event_truncate ON public.party_master_events;
CREATE TRIGGER guard_party_event_write BEFORE INSERT OR UPDATE OR DELETE ON public.party_master_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_party_master_event_write();
CREATE TRIGGER guard_party_event_truncate BEFORE TRUNCATE ON public.party_master_events
  FOR EACH STATEMENT EXECUTE FUNCTION public.guard_party_master_event_write();

DROP TRIGGER IF EXISTS guard_active_customer_for_posted_invoice ON public.invoices;
CREATE TRIGGER guard_active_customer_for_posted_invoice BEFORE INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.guard_active_invoice_customer();
DROP TRIGGER IF EXISTS guard_active_vendor_for_posted_bill ON public.bills;
CREATE TRIGGER guard_active_vendor_for_posted_bill BEFORE INSERT ON public.bills
  FOR EACH ROW EXECUTE FUNCTION public.guard_active_bill_vendor();

CREATE OR REPLACE FUNCTION public.assert_party_maintenance_admin()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE v_org_id uuid; v_role public.app_role;
BEGIN
  SELECT profile.org_id, assigned.role INTO v_org_id,v_role
  FROM public.profiles profile JOIN public.user_roles assigned
    ON (assigned.org_id,assigned.user_id,assigned.role)=(profile.org_id,profile.id,profile.role)
  WHERE profile.id=auth.uid() FOR UPDATE OF profile,assigned;
  IF auth.uid() IS NULL OR v_role IS DISTINCT FROM 'admin'::public.app_role THEN
    RAISE EXCEPTION 'party maintenance requires a tenant admin';
  END IF;
  RETURN v_org_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_party_maintenance_input(
  p_party_type text,p_name text,p_email text,p_phone text,p_address text,
  p_payment_terms integer,p_credit_limit numeric,p_reason text,p_idempotency_key text
) RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
BEGIN
  IF p_party_type NOT IN ('customer','vendor') THEN RAISE EXCEPTION 'invalid party type'; END IF;
  IF p_name IS NULL OR p_name IS DISTINCT FROM btrim(p_name) OR p_name=''
     OR length(p_name)>200 OR p_name~'[[:cntrl:]]' THEN
    RAISE EXCEPTION '% name must be normalized and valid',p_party_type;
  END IF;
  IF p_email IS NOT NULL AND (p_email IS DISTINCT FROM btrim(p_email) OR p_email=''
     OR length(p_email)>320 OR p_email~'[[:cntrl:]]') THEN RAISE EXCEPTION 'email must be normalized and valid'; END IF;
  IF p_phone IS NOT NULL AND (p_phone IS DISTINCT FROM btrim(p_phone) OR p_phone=''
     OR length(p_phone)>80 OR p_phone~'[[:cntrl:]]') THEN RAISE EXCEPTION 'phone must be normalized and valid'; END IF;
  IF p_address IS NOT NULL AND (p_address IS DISTINCT FROM btrim(p_address) OR p_address=''
     OR length(p_address)>2000 OR p_address~'[[:cntrl:]]') THEN RAISE EXCEPTION 'address must be normalized and valid'; END IF;
  IF p_payment_terms IS NULL OR p_payment_terms NOT BETWEEN 0 AND 3650 THEN RAISE EXCEPTION 'payment terms must be valid'; END IF;
  IF p_party_type='customer' AND p_credit_limit IS NOT NULL
     AND (p_credit_limit<0 OR round(p_credit_limit,2) IS DISTINCT FROM p_credit_limit) THEN
    RAISE EXCEPTION 'credit limit must be nonnegative with at most two decimals';
  END IF;
  IF p_reason IS NULL OR p_reason IS DISTINCT FROM btrim(p_reason) OR p_reason=''
     OR length(p_reason)>500 OR p_reason~'[[:cntrl:]]' THEN RAISE EXCEPTION 'party maintenance reason must be normalized and valid'; END IF;
  IF p_idempotency_key IS NULL OR p_idempotency_key IS DISTINCT FROM btrim(p_idempotency_key)
     OR p_idempotency_key='' OR length(p_idempotency_key)>200 OR p_idempotency_key~'[[:cntrl:]]' THEN
    RAISE EXCEPTION 'party maintenance idempotency key must be normalized and valid';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.maintain_tenant_party(
  p_party_type text,p_event_type text,p_party_id uuid,p_name text,p_email text,p_phone text,
  p_address text,p_payment_terms integer,p_credit_limit numeric,p_reason text,p_idempotency_key text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE
  v_org_id uuid := public.assert_party_maintenance_admin();
  v_actor uuid := auth.uid();
  v_event public.party_master_events%ROWTYPE;
  v_event_id uuid := gen_random_uuid();
  v_party_id uuid := COALESCE(p_party_id,gen_random_uuid());
  v_old jsonb; v_new jsonb; v_now timestamptz := clock_timestamp();
  v_customer public.customers%ROWTYPE; v_vendor public.vendors%ROWTYPE;
BEGIN
  IF p_event_type NOT IN ('CREATE','UPDATE','RETIRE') THEN RAISE EXCEPTION 'invalid party event'; END IF;
  IF p_event_type IN ('CREATE','UPDATE') THEN
    PERFORM public.validate_party_maintenance_input(p_party_type,p_name,p_email,p_phone,p_address,
      p_payment_terms,p_credit_limit,p_reason,p_idempotency_key);
  ELSE
    PERFORM public.validate_party_maintenance_input(p_party_type,'retirement',NULL,NULL,NULL,0,NULL,
      p_reason,p_idempotency_key);
  END IF;
  IF (p_event_type='CREATE') IS DISTINCT FROM (p_party_id IS NULL) THEN
    RAISE EXCEPTION 'invalid party target';
  END IF;

  LOCK TABLE public.party_master_events,public.customers,public.vendors IN SHARE ROW EXCLUSIVE MODE;
  SELECT * INTO v_event FROM public.party_master_events
  WHERE org_id=v_org_id AND idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF v_event.actor_id IS DISTINCT FROM v_actor OR v_event.party_type IS DISTINCT FROM p_party_type
       OR v_event.event_type IS DISTINCT FROM p_event_type OR v_event.reason IS DISTINCT FROM p_reason THEN
      RAISE EXCEPTION 'party maintenance idempotency key conflict';
    END IF;
    IF p_event_type IN ('CREATE','UPDATE') THEN
      IF v_event.new_snapshot->>'name' IS DISTINCT FROM p_name
         OR v_event.new_snapshot->>'email' IS DISTINCT FROM p_email
         OR v_event.new_snapshot->>'phone' IS DISTINCT FROM p_phone
         OR v_event.new_snapshot->>'address' IS DISTINCT FROM p_address
         OR (v_event.new_snapshot->>'payment_terms')::integer IS DISTINCT FROM p_payment_terms
         OR (p_party_type='customer' AND (v_event.new_snapshot->>'credit_limit')::numeric IS DISTINCT FROM p_credit_limit)
         OR (p_party_id IS NOT NULL AND v_event.party_id IS DISTINCT FROM p_party_id) THEN
        RAISE EXCEPTION 'party maintenance idempotency key conflict';
      END IF;
    ELSIF v_event.party_id IS DISTINCT FROM p_party_id THEN
      RAISE EXCEPTION 'party maintenance idempotency key conflict';
    END IF;
    RETURN v_event.party_id;
  END IF;

  IF p_party_type='customer' THEN
    IF p_event_type='CREATE' THEN
      v_new:=jsonb_build_object('party_type','customer','id',v_party_id,'org_id',v_org_id,
        'name',p_name,'email',p_email,'phone',p_phone,'address',p_address,
        'payment_terms',p_payment_terms,'credit_limit',p_credit_limit,'is_active',true);
    ELSE
      SELECT * INTO v_customer FROM public.customers
      WHERE id=p_party_id AND org_id=v_org_id AND is_active FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'party not found or unavailable'; END IF;
      v_old:=public.customer_master_snapshot(v_customer);
      IF p_event_type='UPDATE' THEN
        v_new:=jsonb_build_object('party_type','customer','id',v_customer.id,'org_id',v_customer.org_id,
          'name',p_name,'email',p_email,'phone',p_phone,'address',p_address,
          'payment_terms',p_payment_terms,'credit_limit',p_credit_limit,'is_active',true);
        IF v_new=v_old THEN RAISE EXCEPTION 'party update must change at least one field'; END IF;
      ELSE v_new:=jsonb_set(v_old,'{is_active}','false'::jsonb); END IF;
    END IF;
  ELSE
    IF p_event_type='CREATE' THEN
      v_new:=jsonb_build_object('party_type','vendor','id',v_party_id,'org_id',v_org_id,
        'name',p_name,'email',p_email,'phone',p_phone,'address',p_address,
        'payment_terms',p_payment_terms,'is_active',true);
    ELSE
      SELECT * INTO v_vendor FROM public.vendors
      WHERE id=p_party_id AND org_id=v_org_id AND is_active FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'party not found or unavailable'; END IF;
      v_old:=public.vendor_master_snapshot(v_vendor);
      IF p_event_type='UPDATE' THEN
        v_new:=jsonb_build_object('party_type','vendor','id',v_vendor.id,'org_id',v_vendor.org_id,
          'name',p_name,'email',p_email,'phone',p_phone,'address',p_address,
          'payment_terms',p_payment_terms,'is_active',true);
        IF v_new=v_old THEN RAISE EXCEPTION 'party update must change at least one field'; END IF;
      ELSE v_new:=jsonb_set(v_old,'{is_active}','false'::jsonb); END IF;
    END IF;
  END IF;

  PERFORM set_config('tapaano.party_master_purpose',p_party_type||':'||lower(p_event_type),true);
  PERFORM set_config('tapaano.party_master_event_id',v_event_id::text,true);
  INSERT INTO public.party_master_events(id,org_id,party_type,party_id,actor_id,event_type,
    reason,idempotency_key,old_snapshot,new_snapshot)
  VALUES(v_event_id,v_org_id,p_party_type,v_party_id,v_actor,p_event_type,p_reason,
    p_idempotency_key,v_old,v_new);

  IF p_party_type='customer' THEN
    IF p_event_type='CREATE' THEN
      INSERT INTO public.customers(id,org_id,name,email,phone,address,payment_terms,credit_limit,
        is_active,created_at,updated_at)
      VALUES(v_party_id,v_org_id,p_name,p_email,p_phone,p_address,p_payment_terms,p_credit_limit,
        true,v_now,v_now);
    ELSIF p_event_type='UPDATE' THEN
      UPDATE public.customers SET name=p_name,email=p_email,phone=p_phone,address=p_address,
        payment_terms=p_payment_terms,credit_limit=p_credit_limit,updated_at=v_now WHERE id=p_party_id;
    ELSE UPDATE public.customers SET is_active=false,updated_at=v_now WHERE id=p_party_id; END IF;
  ELSE
    IF p_event_type='CREATE' THEN
      INSERT INTO public.vendors(id,org_id,name,email,phone,address,payment_terms,is_active,created_at,updated_at)
      VALUES(v_party_id,v_org_id,p_name,p_email,p_phone,p_address,p_payment_terms,true,v_now,v_now);
    ELSIF p_event_type='UPDATE' THEN
      UPDATE public.vendors SET name=p_name,email=p_email,phone=p_phone,address=p_address,
        payment_terms=p_payment_terms,updated_at=v_now WHERE id=p_party_id;
    ELSE UPDATE public.vendors SET is_active=false,updated_at=v_now WHERE id=p_party_id; END IF;
  END IF;
  RETURN v_party_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_tenant_customer(
  p_name text,p_email text,p_phone text,p_address text,p_payment_terms integer,
  p_credit_limit numeric,p_reason text,p_idempotency_key text
) RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path=public,auth AS $$
  SELECT public.maintain_tenant_party('customer','CREATE',NULL,p_name,p_email,p_phone,p_address,
    p_payment_terms,p_credit_limit,p_reason,p_idempotency_key)
$$;
CREATE OR REPLACE FUNCTION public.update_tenant_customer(
  p_customer_id uuid,p_name text,p_email text,p_phone text,p_address text,p_payment_terms integer,
  p_credit_limit numeric,p_reason text,p_idempotency_key text
) RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path=public,auth AS $$
  SELECT public.maintain_tenant_party('customer','UPDATE',p_customer_id,p_name,p_email,p_phone,p_address,
    p_payment_terms,p_credit_limit,p_reason,p_idempotency_key)
$$;
CREATE OR REPLACE FUNCTION public.retire_tenant_customer(
  p_customer_id uuid,p_reason text,p_idempotency_key text
) RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path=public,auth AS $$
  SELECT public.maintain_tenant_party('customer','RETIRE',p_customer_id,NULL,NULL,NULL,NULL,NULL,NULL,
    p_reason,p_idempotency_key)
$$;
CREATE OR REPLACE FUNCTION public.create_tenant_vendor(
  p_name text,p_email text,p_phone text,p_address text,p_payment_terms integer,
  p_reason text,p_idempotency_key text
) RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path=public,auth AS $$
  SELECT public.maintain_tenant_party('vendor','CREATE',NULL,p_name,p_email,p_phone,p_address,
    p_payment_terms,NULL,p_reason,p_idempotency_key)
$$;
CREATE OR REPLACE FUNCTION public.update_tenant_vendor(
  p_vendor_id uuid,p_name text,p_email text,p_phone text,p_address text,p_payment_terms integer,
  p_reason text,p_idempotency_key text
) RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path=public,auth AS $$
  SELECT public.maintain_tenant_party('vendor','UPDATE',p_vendor_id,p_name,p_email,p_phone,p_address,
    p_payment_terms,NULL,p_reason,p_idempotency_key)
$$;
CREATE OR REPLACE FUNCTION public.retire_tenant_vendor(
  p_vendor_id uuid,p_reason text,p_idempotency_key text
) RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path=public,auth AS $$
  SELECT public.maintain_tenant_party('vendor','RETIRE',p_vendor_id,NULL,NULL,NULL,NULL,NULL,NULL,
    p_reason,p_idempotency_key)
$$;

CREATE OR REPLACE FUNCTION public.list_tenant_party_events()
RETURNS TABLE(event_id uuid,party_type text,party_id uuid,actor_id uuid,event_type text,
  reason text,old_name text,new_name text,occurred_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE v_org_id uuid := public.assert_party_maintenance_admin();
BEGIN
  RETURN QUERY SELECT event.id,event.party_type,event.party_id,event.actor_id,event.event_type,
    event.reason,event.old_snapshot->>'name',event.new_snapshot->>'name',event.occurred_at
  FROM public.party_master_events event WHERE event.org_id=v_org_id
  ORDER BY event.occurred_at,event.id;
END;
$$;

DO $$
DECLARE routine record; policy_record record; column_record record; role_name text;
BEGIN
  FOR routine IN SELECT p.oid::regprocedure AS signature,p.proname,oidvectortypes(p.proargtypes) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN (
      'create_tenant_customer','update_tenant_customer','retire_tenant_customer',
      'create_tenant_vendor','update_tenant_vendor','retire_tenant_vendor','list_tenant_party_events'
    )
  LOOP
    IF NOT (
      (routine.proname='create_tenant_customer' AND routine.args='text, text, text, text, integer, numeric, text, text') OR
      (routine.proname='update_tenant_customer' AND routine.args='uuid, text, text, text, text, integer, numeric, text, text') OR
      (routine.proname='retire_tenant_customer' AND routine.args='uuid, text, text') OR
      (routine.proname='create_tenant_vendor' AND routine.args='text, text, text, text, integer, text, text') OR
      (routine.proname='update_tenant_vendor' AND routine.args='uuid, text, text, text, text, integer, text, text') OR
      (routine.proname='retire_tenant_vendor' AND routine.args='uuid, text, text') OR
      (routine.proname='list_tenant_party_events' AND routine.args='')
    ) THEN EXECUTE format('DROP FUNCTION %s CASCADE',routine.signature); END IF;
  END LOOP;

  ALTER TABLE public.party_master_events ENABLE ROW LEVEL SECURITY;
  FOR policy_record IN SELECT policyname FROM pg_policies
    WHERE schemaname='public' AND tablename='party_master_events'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.party_master_events',policy_record.policyname); END LOOP;

  FOREACH role_name IN ARRAY ARRAY['PUBLIC','anon','authenticated','service_role'] LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.party_master_events FROM %s',role_name);
  END LOOP;
  FOR column_record IN SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='party_master_events'
  LOOP
    FOREACH role_name IN ARRAY ARRAY['PUBLIC','anon','authenticated','service_role'] LOOP
      EXECUTE format('REVOKE ALL PRIVILEGES (%I) ON TABLE public.party_master_events FROM %s',column_record.column_name,role_name);
    END LOOP;
  END LOOP;

  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    EXECUTE format('REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.customers,public.vendors FROM %I',role_name);
  END LOOP;
  FOR column_record IN SELECT table_name,column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name IN ('customers','vendors')
  LOOP
    FOREACH role_name IN ARRAY ARRAY['PUBLIC','anon','authenticated','service_role'] LOOP
      EXECUTE format('REVOKE ALL PRIVILEGES (%I) ON TABLE public.%I FROM %s',column_record.column_name,column_record.table_name,role_name);
    END LOOP;
  END LOOP;
  GRANT SELECT ON public.customers,public.vendors TO authenticated,service_role;
END;
$$;

REVOKE ALL ON FUNCTION public.customer_master_snapshot(public.customers) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.vendor_master_snapshot(public.vendors) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.guard_party_master_event_write() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.guard_controlled_customer_master() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.guard_controlled_vendor_master() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.guard_active_invoice_customer() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.guard_active_bill_vendor() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.assert_party_maintenance_admin() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.validate_party_maintenance_input(text,text,text,text,text,integer,numeric,text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.maintain_tenant_party(text,text,uuid,text,text,text,text,integer,numeric,text,text) FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION public.create_tenant_customer(text,text,text,text,integer,numeric,text,text) FROM PUBLIC,anon,service_role;
REVOKE ALL ON FUNCTION public.update_tenant_customer(uuid,text,text,text,text,integer,numeric,text,text) FROM PUBLIC,anon,service_role;
REVOKE ALL ON FUNCTION public.retire_tenant_customer(uuid,text,text) FROM PUBLIC,anon,service_role;
REVOKE ALL ON FUNCTION public.create_tenant_vendor(text,text,text,text,integer,text,text) FROM PUBLIC,anon,service_role;
REVOKE ALL ON FUNCTION public.update_tenant_vendor(uuid,text,text,text,text,integer,text,text) FROM PUBLIC,anon,service_role;
REVOKE ALL ON FUNCTION public.retire_tenant_vendor(uuid,text,text) FROM PUBLIC,anon,service_role;
REVOKE ALL ON FUNCTION public.list_tenant_party_events() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.create_tenant_customer(text,text,text,text,integer,numeric,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_tenant_customer(uuid,text,text,text,text,integer,numeric,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.retire_tenant_customer(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_tenant_vendor(text,text,text,text,integer,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_tenant_vendor(uuid,text,text,text,text,integer,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.retire_tenant_vendor(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_tenant_party_events() TO authenticated;

COMMIT;
