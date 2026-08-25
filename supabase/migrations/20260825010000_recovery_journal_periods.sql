-- Recovery foundation: deterministic, tenant-bound journal posting/reversal and
-- explicit accounting-period control. Unsupported source workflows remain
-- fail-closed; this migration does not invent periods for legacy journals.

BEGIN;

LOCK TABLE public.entities, public.profiles, public.accounts,
  public.journal_entries, public.journal_lines IN SHARE ROW EXCLUSIVE MODE;

CREATE UNIQUE INDEX IF NOT EXISTS entities_org_id_id_uidx
  ON public.entities (org_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS profiles_org_id_id_uidx
  ON public.profiles (org_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS accounts_org_id_id_uidx
  ON public.accounts (org_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS journal_entries_org_id_id_uidx
  ON public.journal_entries (org_id, id);

CREATE TABLE IF NOT EXISTS public.accounting_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  entity_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'OPEN',
  idempotency_key text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accounting_periods_date_order_check CHECK (period_start <= period_end),
  CONSTRAINT accounting_periods_status_check CHECK (status IN ('OPEN', 'SOFT_CLOSED', 'HARD_CLOSED')),
  CONSTRAINT accounting_periods_version_check CHECK (version > 0),
  CONSTRAINT accounting_periods_idempotency_key_check CHECK (btrim(idempotency_key) <> ''),
  CONSTRAINT accounting_periods_org_entity_fkey
    FOREIGN KEY (org_id, entity_id) REFERENCES public.entities(org_id, id),
  UNIQUE (org_id, entity_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS accounting_periods_lookup_idx
  ON public.accounting_periods (org_id, entity_id, period_start, period_end, status);

CREATE TABLE IF NOT EXISTS public.accounting_period_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accounting_period_id uuid NOT NULL REFERENCES public.accounting_periods(id),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  entity_id uuid NOT NULL,
  from_status text,
  to_status text NOT NULL,
  reason text NOT NULL,
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  period_version integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accounting_period_events_status_check
    CHECK (
      (from_status IS NULL OR from_status IN ('OPEN', 'SOFT_CLOSED', 'HARD_CLOSED'))
      AND to_status IN ('OPEN', 'SOFT_CLOSED', 'HARD_CLOSED')
    ),
  CONSTRAINT accounting_period_events_reason_check CHECK (btrim(reason) <> ''),
  CONSTRAINT accounting_period_events_version_check CHECK (period_version > 0),
  CONSTRAINT accounting_period_events_org_entity_fkey
    FOREIGN KEY (org_id, entity_id) REFERENCES public.entities(org_id, id),
  UNIQUE (accounting_period_id, period_version)
);

CREATE TABLE IF NOT EXISTS public.accounting_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  entity_id uuid NOT NULL,
  event_type text NOT NULL,
  source_type text NOT NULL,
  source_id uuid,
  idempotency_key text NOT NULL,
  payload_hash text NOT NULL,
  journal_entry_id uuid,
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accounting_events_type_check
    CHECK (event_type IN ('manual_journal_posted', 'journal_reversed', 'customer_invoice_posted')),
  CONSTRAINT accounting_events_source_type_check
    CHECK (source_type IN ('manual_journal', 'journal_reversal', 'customer_invoice')),
  CONSTRAINT accounting_events_idempotency_key_check CHECK (btrim(idempotency_key) <> ''),
  CONSTRAINT accounting_events_payload_hash_check CHECK (payload_hash ~ '^[0-9a-f]{32}$'),
  CONSTRAINT accounting_events_org_entity_fkey
    FOREIGN KEY (org_id, entity_id) REFERENCES public.entities(org_id, id),
  UNIQUE (org_id, source_type, idempotency_key),
  UNIQUE (journal_entry_id)
);

ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS source_module text NOT NULL DEFAULT 'gl',
  ADD COLUMN IF NOT EXISTS accounting_period_id uuid,
  ADD COLUMN IF NOT EXISTS accounting_event_id uuid,
  ADD COLUMN IF NOT EXISTS reversal_of_id uuid,
  ADD COLUMN IF NOT EXISTS reversed_by_id uuid;

ALTER TABLE public.journal_lines
  ADD COLUMN IF NOT EXISTS org_id uuid,
  ADD COLUMN IF NOT EXISTS entity_id uuid,
  ADD COLUMN IF NOT EXISTS line_number integer;

UPDATE public.journal_lines line
SET org_id = entry.org_id,
    entity_id = entry.entity_id
FROM public.journal_entries entry
WHERE entry.id = line.journal_entry_id
  AND (line.org_id IS NULL OR line.entity_id IS NULL);

WITH numbered AS (
  SELECT id,
         row_number() OVER (PARTITION BY journal_entry_id ORDER BY created_at, id)::integer AS line_number
  FROM public.journal_lines
  WHERE line_number IS NULL
)
UPDATE public.journal_lines line
SET line_number = numbered.line_number
FROM numbered
WHERE numbered.id = line.id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.journal_lines line
    JOIN public.journal_entries entry ON entry.id = line.journal_entry_id
    LEFT JOIN public.accounts account ON account.id = line.account_id
    WHERE line.org_id IS DISTINCT FROM entry.org_id
       OR line.entity_id IS DISTINCT FROM entry.entity_id
       OR account.id IS NULL
       OR account.org_id IS DISTINCT FROM entry.org_id
  ) THEN
    RAISE EXCEPTION 'journal recovery preflight: cross-tenant or dangling journal lineage';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.journal_lines
    WHERE debit::text IN ('NaN', 'Infinity', '-Infinity')
       OR credit::text IN ('NaN', 'Infinity', '-Infinity')
       OR debit < 0 OR credit < 0
       OR (debit = 0 AND credit = 0)
       OR (debit > 0 AND credit > 0)
  ) THEN
    RAISE EXCEPTION 'journal recovery preflight: invalid journal line amounts';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.journal_entries entry
    LEFT JOIN public.journal_lines line ON line.journal_entry_id = entry.id
    WHERE entry.status = 'posted'
    GROUP BY entry.id
    HAVING count(line.id) < 2 OR sum(line.debit) IS DISTINCT FROM sum(line.credit)
  ) THEN
    RAISE EXCEPTION 'journal recovery preflight: unbalanced posted journal history';
  END IF;
END;
$$;

ALTER TABLE public.journal_lines
  ALTER COLUMN org_id SET NOT NULL,
  ALTER COLUMN entity_id SET NOT NULL,
  ALTER COLUMN line_number SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS journal_lines_entry_line_uidx
  ON public.journal_lines (journal_entry_id, line_number);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_entries_org_entity_fkey') THEN
    ALTER TABLE public.journal_entries
      ADD CONSTRAINT journal_entries_org_entity_fkey
      FOREIGN KEY (org_id, entity_id) REFERENCES public.entities(org_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_entries_accounting_period_id_fkey') THEN
    ALTER TABLE public.journal_entries
      ADD CONSTRAINT journal_entries_accounting_period_id_fkey
      FOREIGN KEY (accounting_period_id) REFERENCES public.accounting_periods(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_entries_accounting_event_id_fkey') THEN
    ALTER TABLE public.journal_entries
      ADD CONSTRAINT journal_entries_accounting_event_id_fkey
      FOREIGN KEY (accounting_event_id) REFERENCES public.accounting_events(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_entries_reversal_of_id_fkey') THEN
    ALTER TABLE public.journal_entries
      ADD CONSTRAINT journal_entries_reversal_of_id_fkey
      FOREIGN KEY (reversal_of_id) REFERENCES public.journal_entries(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_entries_reversed_by_id_fkey') THEN
    ALTER TABLE public.journal_entries
      ADD CONSTRAINT journal_entries_reversed_by_id_fkey
      FOREIGN KEY (reversed_by_id) REFERENCES public.journal_entries(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accounting_events_journal_entry_id_fkey') THEN
    ALTER TABLE public.accounting_events
      ADD CONSTRAINT accounting_events_journal_entry_id_fkey
      FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_lines_org_entry_fkey') THEN
    ALTER TABLE public.journal_lines
      ADD CONSTRAINT journal_lines_org_entry_fkey
      FOREIGN KEY (org_id, journal_entry_id) REFERENCES public.journal_entries(org_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_lines_org_account_fkey') THEN
    ALTER TABLE public.journal_lines
      ADD CONSTRAINT journal_lines_org_account_fkey
      FOREIGN KEY (org_id, account_id) REFERENCES public.accounts(org_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_lines_amount_shape_check') THEN
    ALTER TABLE public.journal_lines
      ADD CONSTRAINT journal_lines_amount_shape_check CHECK (
        debit::text NOT IN ('NaN', 'Infinity', '-Infinity')
        AND credit::text NOT IN ('NaN', 'Infinity', '-Infinity')
        AND debit >= 0 AND credit >= 0
        AND ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0))
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_entries_reversal_shape_check') THEN
    ALTER TABLE public.journal_entries
      ADD CONSTRAINT journal_entries_reversal_shape_check CHECK (
        reversal_of_id IS NULL OR reversal_of_id <> id
      );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_accounting_actor(p_org_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL OR public.get_user_org_id() IS DISTINCT FROM p_org_id THEN
    RAISE EXCEPTION 'accounting actor is not authorized for this organization';
  END IF;
  IF NOT (
    public.has_role(v_actor, 'admin'::public.app_role)
    OR public.has_role(v_actor, 'moderator'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'accounting workflow requires admin or moderator';
  END IF;
  RETURN v_actor;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_accounting_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_setting('tapaano.accounting_write', true) IS DISTINCT FROM 'trusted' THEN
    RAISE EXCEPTION 'immutable: use a trusted accounting workflow';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_accounting_truncate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'immutable: accounting history cannot be truncated';
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_posted_journal()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_entry_id uuid;
  v_status public.journal_status;
  v_line_count integer;
  v_debit numeric;
  v_credit numeric;
BEGIN
  IF TG_TABLE_NAME = 'journal_entries' THEN
    IF TG_OP = 'DELETE' THEN v_entry_id := OLD.id; ELSE v_entry_id := NEW.id; END IF;
  ELSE
    IF TG_OP = 'DELETE' THEN v_entry_id := OLD.journal_entry_id; ELSE v_entry_id := NEW.journal_entry_id; END IF;
  END IF;
  SELECT status INTO v_status FROM public.journal_entries WHERE id = v_entry_id;
  IF v_status = 'posted' THEN
    SELECT count(*), COALESCE(sum(debit), 0), COALESCE(sum(credit), 0)
    INTO v_line_count, v_debit, v_credit
    FROM public.journal_lines WHERE journal_entry_id = v_entry_id;
    IF v_line_count < 2 OR v_debit IS DISTINCT FROM v_credit OR v_debit <= 0 THEN
      RAISE EXCEPTION 'posted journal must contain at least two balanced, positive lines';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS guard_journal_entries_write ON public.journal_entries;
CREATE TRIGGER guard_journal_entries_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.guard_accounting_write();
DROP TRIGGER IF EXISTS guard_journal_entries_truncate ON public.journal_entries;
CREATE TRIGGER guard_journal_entries_truncate
  BEFORE TRUNCATE ON public.journal_entries
  FOR EACH STATEMENT EXECUTE FUNCTION public.guard_accounting_truncate();

DROP TRIGGER IF EXISTS guard_journal_lines_write ON public.journal_lines;
CREATE TRIGGER guard_journal_lines_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.journal_lines
  FOR EACH ROW EXECUTE FUNCTION public.guard_accounting_write();
DROP TRIGGER IF EXISTS guard_journal_lines_truncate ON public.journal_lines;
CREATE TRIGGER guard_journal_lines_truncate
  BEFORE TRUNCATE ON public.journal_lines
  FOR EACH STATEMENT EXECUTE FUNCTION public.guard_accounting_truncate();

DROP TRIGGER IF EXISTS guard_accounting_periods_write ON public.accounting_periods;
CREATE TRIGGER guard_accounting_periods_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.accounting_periods
  FOR EACH ROW EXECUTE FUNCTION public.guard_accounting_write();
DROP TRIGGER IF EXISTS guard_accounting_periods_truncate ON public.accounting_periods;
CREATE TRIGGER guard_accounting_periods_truncate
  BEFORE TRUNCATE ON public.accounting_periods
  FOR EACH STATEMENT EXECUTE FUNCTION public.guard_accounting_truncate();

DROP TRIGGER IF EXISTS guard_accounting_period_events_write ON public.accounting_period_events;
CREATE TRIGGER guard_accounting_period_events_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.accounting_period_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_accounting_write();
DROP TRIGGER IF EXISTS guard_accounting_period_events_truncate ON public.accounting_period_events;
CREATE TRIGGER guard_accounting_period_events_truncate
  BEFORE TRUNCATE ON public.accounting_period_events
  FOR EACH STATEMENT EXECUTE FUNCTION public.guard_accounting_truncate();

DROP TRIGGER IF EXISTS guard_accounting_events_write ON public.accounting_events;
CREATE TRIGGER guard_accounting_events_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.accounting_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_accounting_write();
DROP TRIGGER IF EXISTS guard_accounting_events_truncate ON public.accounting_events;
CREATE TRIGGER guard_accounting_events_truncate
  BEFORE TRUNCATE ON public.accounting_events
  FOR EACH STATEMENT EXECUTE FUNCTION public.guard_accounting_truncate();

DROP TRIGGER IF EXISTS validate_journal_entry_deferred ON public.journal_entries;
CREATE CONSTRAINT TRIGGER validate_journal_entry_deferred
  AFTER INSERT OR UPDATE ON public.journal_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.validate_posted_journal();
DROP TRIGGER IF EXISTS validate_journal_line_deferred ON public.journal_lines;
CREATE CONSTRAINT TRIGGER validate_journal_line_deferred
  AFTER INSERT OR UPDATE OR DELETE ON public.journal_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.validate_posted_journal();

CREATE OR REPLACE FUNCTION public.create_accounting_period(
  p_entity_id uuid,
  p_period_start date,
  p_period_end date,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
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

  IF p_period_start IS NULL OR p_period_end IS NULL OR p_period_start > p_period_end THEN
    RAISE EXCEPTION 'invalid accounting period date range';
  END IF;
  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'accounting period idempotency key is required';
  END IF;

  PERFORM set_config('tapaano.accounting_write', 'trusted', true);
  LOCK TABLE public.accounting_periods IN SHARE ROW EXCLUSIVE MODE;

  SELECT id INTO v_period_id
  FROM public.accounting_periods
  WHERE org_id = v_org_id AND entity_id = p_entity_id AND idempotency_key = p_idempotency_key;
  IF v_period_id IS NOT NULL THEN RETURN v_period_id; END IF;

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

CREATE OR REPLACE FUNCTION public.transition_accounting_period(
  p_period_id uuid,
  p_to_status text,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_period public.accounting_periods%ROWTYPE;
  v_actor_org uuid;
  v_actor uuid;
  v_next_version integer;
BEGIN
  IF p_to_status NOT IN ('OPEN', 'SOFT_CLOSED', 'HARD_CLOSED') THEN
    RAISE EXCEPTION 'invalid accounting period status';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'accounting period transition reason is required';
  END IF;

  v_actor_org := public.get_user_org_id();
  IF v_actor_org IS NULL THEN RAISE EXCEPTION 'accounting actor identity is unavailable'; END IF;
  v_actor := public.assert_accounting_actor(v_actor_org);

  LOCK TABLE public.journal_entries IN SHARE ROW EXCLUSIVE MODE;
  SELECT * INTO v_period FROM public.accounting_periods
  WHERE id = p_period_id AND org_id = v_actor_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'accounting period not found or unavailable'; END IF;

  IF v_period.status = p_to_status THEN RETURN v_period.id; END IF;
  IF v_period.status = 'HARD_CLOSED' THEN
    RAISE EXCEPTION 'HARD_CLOSED is terminal';
  END IF;
  IF NOT (
    (v_period.status = 'OPEN' AND p_to_status IN ('SOFT_CLOSED', 'HARD_CLOSED'))
    OR (v_period.status = 'SOFT_CLOSED' AND p_to_status IN ('OPEN', 'HARD_CLOSED'))
  ) THEN
    RAISE EXCEPTION 'invalid accounting period transition';
  END IF;

  PERFORM set_config('tapaano.accounting_write', 'trusted', true);
  v_next_version := v_period.version + 1;
  UPDATE public.accounting_periods
  SET status = p_to_status, version = v_next_version, updated_by = v_actor, updated_at = now()
  WHERE id = v_period.id;
  INSERT INTO public.accounting_period_events (
    accounting_period_id, org_id, entity_id, from_status, to_status,
    reason, actor_id, period_version
  ) VALUES (
    v_period.id, v_period.org_id, v_period.entity_id, v_period.status, p_to_status,
    p_reason, v_actor, v_next_version
  );
  RETURN v_period.id;
END;
$$;

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
SET search_path = public, auth
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

  IF p_entry_number IS NULL OR btrim(p_entry_number) = '' OR p_entry_date IS NULL THEN
    RAISE EXCEPTION 'entry number and date are required';
  END IF;
  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'journal idempotency key is required';
  END IF;
  IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lines) < 2 THEN
    RAISE EXCEPTION 'journal requires at least two lines';
  END IF;

  v_payload_hash := md5(jsonb_build_object(
    'entity_id', p_entity_id, 'entry_number', btrim(p_entry_number),
    'entry_date', p_entry_date, 'memo', p_memo, 'lines', p_lines
  )::text);

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

  LOCK TABLE public.journal_entries IN SHARE ROW EXCLUSIVE MODE;
  SELECT id INTO v_period_id
  FROM public.accounting_periods
  WHERE org_id = v_org_id AND entity_id = p_entity_id
    AND p_entry_date BETWEEN period_start AND period_end
    AND status = 'OPEN'
  FOR UPDATE;
  IF v_period_id IS NULL THEN RAISE EXCEPTION 'an OPEN accounting period is required'; END IF;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    BEGIN
      v_account_id := (v_line->>'account_id')::uuid;
      v_debit := (v_line->>'debit')::numeric;
      v_credit := (v_line->>'credit')::numeric;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'invalid journal line';
    END;
    IF v_debit::text IN ('NaN', 'Infinity', '-Infinity')
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

CREATE OR REPLACE FUNCTION public.reverse_posted_journal(
  p_journal_entry_id uuid,
  p_reversal_date date,
  p_reason text,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_original public.journal_entries%ROWTYPE;
  v_actor_org uuid;
  v_actor uuid;
  v_period_id uuid;
  v_event_id uuid;
  v_reversal_id uuid;
  v_existing_hash text;
  v_payload_hash text;
BEGIN
  IF p_reversal_date IS NULL OR p_reason IS NULL OR btrim(p_reason) = ''
     OR p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'reversal date, reason, and idempotency key are required';
  END IF;

  v_actor_org := public.get_user_org_id();
  IF v_actor_org IS NULL THEN RAISE EXCEPTION 'accounting actor identity is unavailable'; END IF;
  v_actor := public.assert_accounting_actor(v_actor_org);
  SELECT * INTO v_original FROM public.journal_entries
  WHERE id = p_journal_entry_id AND org_id = v_actor_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'journal entry not found or unavailable'; END IF;
  v_payload_hash := md5(jsonb_build_object(
    'journal_entry_id', p_journal_entry_id, 'reversal_date', p_reversal_date,
    'reason', p_reason
  )::text);

  SELECT id, journal_entry_id, payload_hash
  INTO v_event_id, v_reversal_id, v_existing_hash
  FROM public.accounting_events
  WHERE org_id = v_original.org_id AND source_type = 'journal_reversal'
    AND idempotency_key = p_idempotency_key;
  IF v_event_id IS NOT NULL THEN
    IF v_reversal_id IS NULL OR v_existing_hash IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION 'reversal idempotency key conflicts with another payload';
    END IF;
    RETURN v_reversal_id;
  END IF;

  LOCK TABLE public.journal_entries IN SHARE ROW EXCLUSIVE MODE;
  SELECT * INTO v_original FROM public.journal_entries
  WHERE id = p_journal_entry_id AND org_id = v_actor_org FOR UPDATE;
  IF v_original.status <> 'posted' OR v_original.reversal_of_id IS NOT NULL THEN
    RAISE EXCEPTION 'only an original posted journal can be reversed';
  END IF;
  IF v_original.reversed_by_id IS NOT NULL THEN
    RAISE EXCEPTION 'journal already has a reversal';
  END IF;

  SELECT id INTO v_period_id
  FROM public.accounting_periods
  WHERE org_id = v_original.org_id AND entity_id = v_original.entity_id
    AND p_reversal_date BETWEEN period_start AND period_end AND status = 'OPEN'
  FOR UPDATE;
  IF v_period_id IS NULL THEN RAISE EXCEPTION 'an OPEN accounting period is required for reversal'; END IF;

  PERFORM set_config('tapaano.accounting_write', 'trusted', true);
  INSERT INTO public.accounting_events (
    org_id, entity_id, event_type, source_type, source_id, idempotency_key,
    payload_hash, actor_id
  ) VALUES (
    v_original.org_id, v_original.entity_id, 'journal_reversed', 'journal_reversal',
    v_original.id, p_idempotency_key, v_payload_hash, v_actor
  ) RETURNING id INTO v_event_id;

  INSERT INTO public.journal_entries (
    org_id, entity_id, entry_number, entry_date, memo, status, created_by,
    posted_at, source_module, accounting_period_id, accounting_event_id, reversal_of_id
  ) VALUES (
    v_original.org_id, v_original.entity_id,
    'REV-' || left(v_original.entry_number, 40) || '-' || left(md5(p_idempotency_key), 8),
    p_reversal_date, p_reason, 'posted', v_actor, now(), 'gl', v_period_id,
    v_event_id, v_original.id
  ) RETURNING id INTO v_reversal_id;

  INSERT INTO public.journal_lines (
    journal_entry_id, account_id, debit, credit, memo, org_id, entity_id, line_number
  )
  SELECT v_reversal_id, account_id, credit, debit,
         COALESCE(memo, 'Reversal'), org_id, entity_id, line_number
  FROM public.journal_lines
  WHERE journal_entry_id = v_original.id
  ORDER BY line_number;

  UPDATE public.accounting_events SET journal_entry_id = v_reversal_id WHERE id = v_event_id;
  UPDATE public.journal_entries SET reversed_by_id = v_reversal_id WHERE id = v_original.id;
  RETURN v_reversal_id;
END;
$$;

ALTER TABLE public.accounting_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_period_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS accounting_periods_tenant_read ON public.accounting_periods;
CREATE POLICY accounting_periods_tenant_read ON public.accounting_periods
  FOR SELECT TO authenticated USING (org_id = public.get_user_org_id());
DROP POLICY IF EXISTS accounting_period_events_tenant_read ON public.accounting_period_events;
CREATE POLICY accounting_period_events_tenant_read ON public.accounting_period_events
  FOR SELECT TO authenticated USING (org_id = public.get_user_org_id());
DROP POLICY IF EXISTS accounting_events_tenant_read ON public.accounting_events;
CREATE POLICY accounting_events_tenant_read ON public.accounting_events
  FOR SELECT TO authenticated USING (org_id = public.get_user_org_id());

REVOKE ALL ON public.accounting_periods, public.accounting_period_events,
  public.accounting_events, public.journal_entries, public.journal_lines
  FROM anon, authenticated, service_role;
GRANT SELECT ON public.accounting_periods, public.accounting_period_events,
  public.accounting_events, public.journal_entries, public.journal_lines
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.assert_accounting_actor(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_accounting_period(uuid, date, date, text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.transition_accounting_period(uuid, text, text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.post_manual_journal(uuid, text, date, text, jsonb, text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.reverse_posted_journal(uuid, date, text, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.create_accounting_period(uuid, date, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transition_accounting_period(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_manual_journal(uuid, text, date, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_posted_journal(uuid, date, text, text) TO authenticated;

COMMIT;
