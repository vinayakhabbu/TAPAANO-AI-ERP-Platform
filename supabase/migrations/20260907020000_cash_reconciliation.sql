BEGIN;

-- New verified records deliberately do not reuse frozen legacy bank history.
CREATE TABLE IF NOT EXISTS public.cash_registers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL,
  entity_id uuid NOT NULL, account_id uuid NOT NULL, name text NOT NULL,
  currency text NOT NULL, created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id,id), UNIQUE(entity_id,account_id), UNIQUE(org_id,entity_id,name),
  FOREIGN KEY(org_id,entity_id) REFERENCES public.entities(org_id,id),
  FOREIGN KEY(org_id,account_id) REFERENCES public.accounts(org_id,id),
  CHECK(length(name) BETWEEN 1 AND 100)
);
CREATE TABLE IF NOT EXISTS public.cash_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL,
  register_id uuid NOT NULL, reference text NOT NULL, starts_on date NOT NULL, ends_on date NOT NULL,
  opening numeric(15,2) NOT NULL, closing numeric(15,2) NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','SUBMITTED','APPROVED','VOID')),
  imported_by uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(),
  request_key text NOT NULL, payload jsonb NOT NULL, UNIQUE(org_id,id), UNIQUE(org_id,request_key),
  FOREIGN KEY(org_id,register_id) REFERENCES public.cash_registers(org_id,id),
  CHECK(starts_on BETWEEN DATE '0001-01-02' AND DATE '9999-12-31' AND ends_on BETWEEN starts_on AND DATE '9999-12-31'),
  CHECK(opening::text NOT IN ('NaN','Infinity','-Infinity') AND closing::text NOT IN ('NaN','Infinity','-Infinity'))
);
CREATE TABLE IF NOT EXISTS public.cash_statement_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL,
  statement_id uuid NOT NULL, external_id text NOT NULL, booked_on date NOT NULL,
  description text NOT NULL, reference text NOT NULL, amount numeric(15,2) NOT NULL,
  UNIQUE(org_id,id), UNIQUE(statement_id,external_id),
  FOREIGN KEY(org_id,statement_id) REFERENCES public.cash_statements(org_id,id),
  CHECK(amount <> 0 AND amount::text NOT IN ('NaN','Infinity','-Infinity'))
);
CREATE TABLE IF NOT EXISTS public.cash_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL,
  statement_id uuid NOT NULL, statement_line_ids uuid[] NOT NULL, journal_line_ids uuid[] NOT NULL,
  reason text NOT NULL, created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(), removed_by uuid REFERENCES auth.users(id),
  removed_at timestamptz, removal_reason text, UNIQUE(org_id,id),
  FOREIGN KEY(org_id,statement_id) REFERENCES public.cash_statements(org_id,id),
  CHECK(cardinality(statement_line_ids) BETWEEN 1 AND 200 AND cardinality(journal_line_ids) BETWEEN 1 AND 200)
);
CREATE TABLE IF NOT EXISTS public.cash_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, statement_id uuid NOT NULL,
  action text NOT NULL CHECK(action IN ('CLOSE','REOPEN','VOID')),
  requested_by uuid NOT NULL REFERENCES auth.users(id), requested_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL, snapshot jsonb NOT NULL,
  decision text CHECK(decision IN ('APPROVE','REJECT')), decided_by uuid REFERENCES auth.users(id),
  decided_at timestamptz, decision_reason text, UNIQUE(org_id,id),
  FOREIGN KEY(org_id,statement_id) REFERENCES public.cash_statements(org_id,id),
  CHECK(decided_by IS NULL OR decided_by <> requested_by)
);
CREATE UNIQUE INDEX IF NOT EXISTS cash_review_pending ON public.cash_reviews(statement_id) WHERE decision IS NULL;
CREATE INDEX IF NOT EXISTS cash_statement_register ON public.cash_statements(register_id,ends_on);
CREATE INDEX IF NOT EXISTS cash_line_statement ON public.cash_statement_lines(statement_id,booked_on);
CREATE INDEX IF NOT EXISTS cash_match_statement ON public.cash_matches(statement_id) WHERE removed_at IS NULL;

CREATE OR REPLACE FUNCTION public.cash_amount(p_value text)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
BEGIN
  IF p_value IS NULL OR p_value !~ '^-?[0-9]{1,13}(\.[0-9]{1,2})?$' THEN
    RAISE EXCEPTION 'amount must be an exact decimal with at most two places';
  END IF;
  RETURN round(p_value::numeric,2);
END; $$;

CREATE OR REPLACE FUNCTION public.create_cash_register(p_entity_id uuid,p_account_id uuid,p_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid:=public.get_user_org_id(); v_actor uuid; v_currency text; v_id uuid;
BEGIN
  v_actor:=public.assert_accounting_actor(v_org);
  SELECT currency INTO v_currency FROM public.entities WHERE id=p_entity_id AND org_id=v_org;
  IF v_currency IS NULL OR NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=p_account_id AND org_id=v_org AND is_active AND account_type='asset')
    THEN RAISE EXCEPTION 'entity or active cash asset account unavailable'; END IF;
  IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'register name required'; END IF;
  LOCK TABLE public.journal_entries IN SHARE ROW EXCLUSIVE MODE;
  SELECT id INTO v_id FROM public.cash_registers WHERE entity_id=p_entity_id AND account_id=p_account_id;
  IF v_id IS NOT NULL THEN
    IF NOT EXISTS(SELECT 1 FROM public.cash_registers WHERE id=v_id AND name=btrim(p_name)) THEN RAISE EXCEPTION 'cash account is already mapped'; END IF;
    RETURN v_id;
  END IF;
  PERFORM set_config('tapaano.accounting_write','trusted',true);
  INSERT INTO public.cash_registers(org_id,entity_id,account_id,name,currency,created_by)
    VALUES(v_org,p_entity_id,p_account_id,btrim(p_name),v_currency,v_actor) RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.import_cash_statement(p_register_id uuid,p_statement jsonb,p_key text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid:=public.get_user_org_id(); v_actor uuid; v_r public.cash_registers%ROWTYPE;
  v_s public.cash_statements%ROWTYPE; v_id uuid; v_from date; v_to date; v_open numeric; v_close numeric;
  v_total numeric:=0; v_line jsonb; v_amount numeric; v_date date; v_seen text[]:='{}';
BEGIN
  v_actor:=public.assert_accounting_actor(v_org);
  SELECT * INTO v_r FROM public.cash_registers WHERE id=p_register_id AND org_id=v_org;
  IF v_r.id IS NULL THEN RAISE EXCEPTION 'cash register unavailable'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.entities WHERE id=v_r.entity_id AND org_id=v_org AND currency=v_r.currency) THEN RAISE EXCEPTION 'cash register currency no longer agrees with its entity'; END IF;
  IF p_key IS NULL OR length(btrim(p_key)) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'import retry key required'; END IF;
  IF jsonb_typeof(p_statement) IS DISTINCT FROM 'object' OR
    (p_statement-ARRAY['reference','starts_on','ends_on','opening','closing','lines'])<>'{}'::jsonb OR
    jsonb_typeof(p_statement->'lines') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid statement fields'; END IF;
  IF length(p_statement->>'reference') NOT BETWEEN 1 AND 100 OR p_statement->>'reference' IS NULL OR
     jsonb_array_length(p_statement->'lines')>5000 THEN RAISE EXCEPTION 'statement requires a reference and at most 5000 lines'; END IF;
  IF jsonb_typeof(p_statement->'opening') IS DISTINCT FROM 'string' OR jsonb_typeof(p_statement->'closing') IS DISTINCT FROM 'string' OR
     coalesce(p_statement->>'starts_on','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR coalesce(p_statement->>'ends_on','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'use ISO dates and exact decimal strings'; END IF;
  v_from:=(p_statement->>'starts_on')::date; v_to:=(p_statement->>'ends_on')::date;
  IF v_from IS NULL OR v_to IS NULL OR v_from<DATE '0001-01-02' OR v_to>DATE '9999-12-31' OR v_to<v_from THEN RAISE EXCEPTION 'invalid statement dates'; END IF;
  v_open:=public.cash_amount(p_statement->>'opening'); v_close:=public.cash_amount(p_statement->>'closing');
  LOCK TABLE public.journal_entries IN SHARE ROW EXCLUSIVE MODE;
  SELECT * INTO v_s FROM public.cash_statements WHERE org_id=v_org AND request_key=p_key;
  IF v_s.id IS NOT NULL THEN
    IF v_s.register_id<>p_register_id OR v_s.payload<>p_statement THEN RAISE EXCEPTION 'import idempotency conflict'; END IF;
    RETURN v_s.id;
  END IF;
  IF EXISTS(SELECT 1 FROM public.cash_statements WHERE register_id=p_register_id AND status IN ('OPEN','SUBMITTED')) THEN
    RAISE EXCEPTION 'finish or void the existing open statement first'; END IF;
  SELECT * INTO v_s FROM public.cash_statements WHERE register_id=p_register_id AND status='APPROVED' ORDER BY ends_on DESC LIMIT 1;
  IF v_s.id IS NOT NULL AND (v_from<>v_s.ends_on+1 OR v_open<>v_s.closing) THEN RAISE EXCEPTION 'statement must continue the approved date and balance chain'; END IF;
  IF EXISTS(SELECT 1 FROM public.cash_statements WHERE register_id=p_register_id AND status<>'VOID' AND starts_on<=v_to AND ends_on>=v_from) THEN RAISE EXCEPTION 'statement dates overlap'; END IF;
  PERFORM set_config('tapaano.accounting_write','trusted',true);
  INSERT INTO public.cash_statements(org_id,register_id,reference,starts_on,ends_on,opening,closing,imported_by,request_key,payload)
    VALUES(v_org,p_register_id,p_statement->>'reference',v_from,v_to,v_open,v_close,v_actor,p_key,p_statement) RETURNING id INTO v_id;
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_statement->'lines') LOOP
    IF jsonb_typeof(v_line) IS DISTINCT FROM 'object' OR
      (v_line-ARRAY['external_id','booked_on','description','reference','amount'])<>'{}'::jsonb OR
      v_line->>'external_id' IS NULL OR length(v_line->>'external_id') NOT BETWEEN 1 AND 150 OR
      v_line->>'description' IS NULL OR length(v_line->>'description')>500 OR
      v_line->>'reference' IS NULL OR length(v_line->>'reference')>200 THEN RAISE EXCEPTION 'invalid statement row'; END IF;
    IF jsonb_typeof(v_line->'amount') IS DISTINCT FROM 'string' OR jsonb_typeof(v_line->'external_id') IS DISTINCT FROM 'string' OR
       coalesce(v_line->>'booked_on','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'use ISO dates, text transaction identifiers and exact decimal strings'; END IF;
    v_date:=(v_line->>'booked_on')::date; v_amount:=public.cash_amount(v_line->>'amount');
    IF v_date IS NULL OR v_date NOT BETWEEN v_from AND v_to OR v_amount=0 THEN RAISE EXCEPTION 'statement row date or amount invalid'; END IF;
    IF v_line->>'external_id'=ANY(v_seen) OR EXISTS(
      SELECT 1 FROM public.cash_statement_lines l JOIN public.cash_statements s ON s.id=l.statement_id
      WHERE s.register_id=p_register_id AND s.status<>'VOID' AND l.external_id=v_line->>'external_id') THEN RAISE EXCEPTION 'duplicate bank transaction identifier'; END IF;
    v_seen:=array_append(v_seen,v_line->>'external_id'); v_total:=v_total+v_amount;
    INSERT INTO public.cash_statement_lines(org_id,statement_id,external_id,booked_on,description,reference,amount)
      VALUES(v_org,v_id,v_line->>'external_id',v_date,v_line->>'description',v_line->>'reference',v_amount);
  END LOOP;
  IF v_open+v_total<>v_close THEN RAISE EXCEPTION 'statement control totals do not reconcile'; END IF;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.validate_cash_matches(p_register_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_r public.cash_registers%ROWTYPE; v_m record; v_bank numeric; v_book numeric; v_count bigint;
BEGIN
  SELECT * INTO v_r FROM public.cash_registers WHERE id=p_register_id;
  FOR v_m IN SELECT m.*,s.ends_on FROM public.cash_matches m JOIN public.cash_statements s ON s.id=m.statement_id WHERE s.register_id=v_r.id LOOP
    SELECT count(*),sum(amount) INTO v_count,v_bank FROM public.cash_statement_lines WHERE statement_id=v_m.statement_id AND org_id=v_r.org_id AND id=ANY(v_m.statement_line_ids);
    IF v_count<>cardinality(v_m.statement_line_ids) OR v_count=0 THEN RAISE EXCEPTION 'invalid bank match lineage'; END IF;
    SELECT count(*),sum(l.debit-l.credit) INTO v_count,v_book FROM public.journal_lines l JOIN public.journal_entries j ON j.id=l.journal_entry_id
      WHERE l.id=ANY(v_m.journal_line_ids) AND l.account_id=v_r.account_id AND j.org_id=v_r.org_id AND j.entity_id=v_r.entity_id AND j.status='posted' AND j.entry_date<=v_m.ends_on;
    IF v_count<>cardinality(v_m.journal_line_ids) OR v_bank=0 OR v_bank IS DISTINCT FROM v_book THEN RAISE EXCEPTION 'invalid cash match lineage or control totals'; END IF;
  END LOOP;
  IF EXISTS(SELECT line FROM public.cash_matches m JOIN public.cash_statements s ON s.id=m.statement_id CROSS JOIN LATERAL unnest(m.journal_line_ids) line
    WHERE s.register_id=v_r.id AND s.status<>'VOID' AND m.removed_at IS NULL GROUP BY line HAVING count(*)>1) OR
     EXISTS(SELECT line FROM public.cash_matches m JOIN public.cash_statements s ON s.id=m.statement_id CROSS JOIN LATERAL unnest(m.statement_line_ids) line
    WHERE s.register_id=v_r.id AND s.status<>'VOID' AND m.removed_at IS NULL GROUP BY line HAVING count(*)>1) THEN RAISE EXCEPTION 'duplicate active cash match'; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.get_cash_reconciliation(p_statement_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid:=public.get_user_org_id(); v_s public.cash_statements%ROWTYPE; v_r public.cash_registers%ROWTYPE;
  v_first date; v_open numeric; v_book numeric; v_outstanding numeric; v_unmatched bigint; v_report jsonb;
BEGIN
  SELECT * INTO v_s FROM public.cash_statements WHERE id=p_statement_id AND org_id=v_org;
  IF v_s.id IS NULL THEN RAISE EXCEPTION 'statement unavailable'; END IF;
  SELECT * INTO v_r FROM public.cash_registers WHERE id=v_s.register_id AND org_id=v_org;
  PERFORM public.validate_cash_matches(v_r.id);
  IF NOT EXISTS(SELECT 1 FROM public.entities WHERE id=v_r.entity_id AND org_id=v_org AND currency=v_r.currency) THEN RAISE EXCEPTION 'cash register currency no longer agrees with its entity'; END IF;
  SELECT min(starts_on) INTO v_first FROM public.cash_statements WHERE register_id=v_r.id AND status<>'VOID';
  v_first:=coalesce(v_first,v_s.starts_on);
  -- A verified trial balance checks journal/event/period lineage and balance before reconciliation.
  PERFORM public.get_entity_trial_balance(v_r.entity_id,DATE '0001-01-01',v_s.ends_on);
  SELECT coalesce(sum(l.debit-l.credit) FILTER(WHERE j.entry_date<v_first),0),coalesce(sum(l.debit-l.credit),0)
    INTO v_open,v_book FROM public.journal_lines l JOIN public.journal_entries j ON j.id=l.journal_entry_id
    WHERE j.org_id=v_org AND j.entity_id=v_r.entity_id AND j.status='posted' AND j.entry_date<=v_s.ends_on AND l.account_id=v_r.account_id;
  IF (SELECT count(*) FROM public.journal_lines l JOIN public.journal_entries j ON j.id=l.journal_entry_id
    WHERE j.entity_id=v_r.entity_id AND l.account_id=v_r.account_id AND j.status='posted' AND j.entry_date BETWEEN v_first AND v_s.ends_on)>10000
    THEN RAISE EXCEPTION 'reconciliation exceeds 10000 cash lines; use a dedicated paged export before continuing'; END IF;
  SELECT coalesce(sum(l.debit-l.credit),0) INTO v_outstanding FROM public.journal_lines l JOIN public.journal_entries j ON j.id=l.journal_entry_id
    WHERE j.org_id=v_org AND j.entity_id=v_r.entity_id AND j.status='posted' AND l.account_id=v_r.account_id AND j.entry_date BETWEEN v_first AND v_s.ends_on
    AND NOT EXISTS(SELECT 1 FROM public.cash_matches m JOIN public.cash_statements s ON s.id=m.statement_id
      WHERE l.id=ANY(m.journal_line_ids) AND m.removed_at IS NULL AND s.status<>'VOID' AND s.ends_on<=v_s.ends_on);
  SELECT count(*) INTO v_unmatched FROM public.cash_statement_lines l WHERE l.statement_id=v_s.id
    AND NOT EXISTS(SELECT 1 FROM public.cash_matches m WHERE m.statement_id=v_s.id AND m.removed_at IS NULL AND l.id=ANY(m.statement_line_ids));
  SELECT jsonb_build_object('id',v_s.id,'registerId',v_r.id,'entityId',v_r.entity_id,'accountId',v_r.account_id,'currency',v_r.currency,
    'reference',v_s.reference,'startsOn',v_s.starts_on,'endsOn',v_s.ends_on,'status',v_s.status,
    'opening',v_s.opening::text,'closing',v_s.closing::text,'bookClosing',round(v_book,2)::text,
    'outstanding',round(v_outstanding,2)::text,'adjustedBank',round(v_s.closing+v_outstanding,2)::text,
    'variance',round(v_book-v_s.closing-v_outstanding,2)::text,'unmatchedCount',v_unmatched,
    'openingVariance',round(v_open-coalesce((SELECT opening FROM public.cash_statements WHERE register_id=v_r.id AND status<>'VOID' ORDER BY starts_on LIMIT 1),v_s.opening),2)::text,
    'lines',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'externalId',external_id,'date',booked_on,'description',description,'reference',reference,'amount',amount::text) ORDER BY booked_on,external_id)
      FROM public.cash_statement_lines WHERE statement_id=v_s.id),'[]'::jsonb),
    'bookLines',coalesce((SELECT jsonb_agg(jsonb_build_object('id',l.id,'journalId',j.id,'number',j.entry_number,'date',j.entry_date,'memo',l.memo,'amount',round(l.debit-l.credit,2)::text,
      'matched',EXISTS(SELECT 1 FROM public.cash_matches m JOIN public.cash_statements s ON s.id=m.statement_id WHERE l.id=ANY(m.journal_line_ids) AND m.removed_at IS NULL AND s.status<>'VOID' AND s.ends_on<=v_s.ends_on)) ORDER BY j.entry_date,j.entry_number,l.line_number)
      FROM public.journal_lines l JOIN public.journal_entries j ON j.id=l.journal_entry_id WHERE j.org_id=v_org AND j.entity_id=v_r.entity_id AND j.status='posted' AND l.account_id=v_r.account_id AND j.entry_date BETWEEN v_first AND v_s.ends_on),'[]'::jsonb),
    'matches',coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY created_at,id) FROM public.cash_matches m WHERE statement_id=v_s.id),'[]'::jsonb)) INTO v_report;
  RETURN v_report||jsonb_build_object('revision',md5(v_report::text));
END; $$;

CREATE OR REPLACE FUNCTION public.match_cash_statement(p_statement_id uuid,p_bank_lines uuid[],p_book_lines uuid[],p_reason text,p_revision text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid:=public.get_user_org_id(); v_actor uuid; v_s public.cash_statements%ROWTYPE;
 v_r public.cash_registers%ROWTYPE; v_bank numeric; v_book numeric; v_count bigint; v_id uuid; v_first date;
BEGIN
  v_actor:=public.assert_accounting_actor(v_org);
  LOCK TABLE public.journal_entries IN SHARE ROW EXCLUSIVE MODE;
  SELECT * INTO v_s FROM public.cash_statements WHERE id=p_statement_id AND org_id=v_org;
  IF v_s.id IS NULL OR v_s.status<>'OPEN' THEN RAISE EXCEPTION 'open statement required'; END IF;
  SELECT * INTO v_r FROM public.cash_registers WHERE id=v_s.register_id;
  IF cardinality(p_bank_lines) IS NULL OR cardinality(p_bank_lines) NOT BETWEEN 1 AND 200 OR
    cardinality(p_book_lines) IS NULL OR cardinality(p_book_lines) NOT BETWEEN 1 AND 200 OR
    p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'match lines and explanation required'; END IF;
  -- Lost-response retries return the original match without reusing any line.
  SELECT id INTO v_id FROM public.cash_matches WHERE statement_id=v_s.id AND removed_at IS NULL
    AND statement_line_ids @> p_bank_lines AND statement_line_ids <@ p_bank_lines
    AND journal_line_ids @> p_book_lines AND journal_line_ids <@ p_book_lines AND reason=p_reason;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  IF (public.get_cash_reconciliation(v_s.id)->>'revision') IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'reconciliation changed; refresh before matching'; END IF;
  SELECT count(*),sum(amount) INTO v_count,v_bank FROM public.cash_statement_lines WHERE statement_id=v_s.id AND id=ANY(p_bank_lines);
  IF v_count<>cardinality(p_bank_lines) OR v_bank=0 THEN RAISE EXCEPTION 'invalid or duplicate statement selection'; END IF;
  SELECT min(starts_on) INTO v_first FROM public.cash_statements WHERE register_id=v_r.id AND status<>'VOID';
  SELECT count(*),sum(l.debit-l.credit) INTO v_count,v_book FROM public.journal_lines l JOIN public.journal_entries j ON j.id=l.journal_entry_id
    WHERE l.id=ANY(p_book_lines) AND l.account_id=v_r.account_id AND j.org_id=v_org AND j.entity_id=v_r.entity_id AND j.status='posted' AND j.entry_date BETWEEN v_first AND v_s.ends_on;
  IF v_count<>cardinality(p_book_lines) OR v_bank IS DISTINCT FROM v_book THEN RAISE EXCEPTION 'selected bank and cash ledger amounts do not match'; END IF;
  IF EXISTS(SELECT 1 FROM public.cash_statement_lines WHERE id=ANY(p_bank_lines) AND sign(amount)<>sign(v_bank)) OR
     EXISTS(SELECT 1 FROM public.journal_lines WHERE id=ANY(p_book_lines) AND sign(debit-credit)<>sign(v_bank)) THEN RAISE EXCEPTION 'opposite directions require separate matches'; END IF;
  IF EXISTS(SELECT 1 FROM public.cash_matches m JOIN public.cash_statements s ON s.id=m.statement_id
    WHERE s.register_id=v_r.id AND s.status<>'VOID' AND m.removed_at IS NULL AND (m.statement_line_ids && p_bank_lines OR m.journal_line_ids && p_book_lines)) THEN RAISE EXCEPTION 'a selected line is already matched'; END IF;
  PERFORM set_config('tapaano.accounting_write','trusted',true);
  INSERT INTO public.cash_matches(org_id,statement_id,statement_line_ids,journal_line_ids,reason,created_by)
    VALUES(v_org,v_s.id,p_bank_lines,p_book_lines,p_reason,v_actor) RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.remove_cash_match(p_match_id uuid,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid:=public.get_user_org_id(); v_actor uuid; v_m public.cash_matches%ROWTYPE;
BEGIN
  v_actor:=public.assert_accounting_actor(v_org);
  LOCK TABLE public.journal_entries IN SHARE ROW EXCLUSIVE MODE;
  SELECT * INTO v_m FROM public.cash_matches WHERE id=p_match_id AND org_id=v_org;
  IF v_m.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.cash_statements WHERE id=v_m.statement_id AND status='OPEN') THEN RAISE EXCEPTION 'open statement match required'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'removal reason required'; END IF;
  IF v_m.removed_at IS NOT NULL THEN RETURN; END IF;
  PERFORM set_config('tapaano.accounting_write','trusted',true);
  UPDATE public.cash_matches SET removed_at=now(),removed_by=v_actor,removal_reason=p_reason WHERE id=v_m.id;
END; $$;

CREATE OR REPLACE FUNCTION public.request_cash_review(p_statement_id uuid,p_action text,p_reason text,p_revision text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid:=public.get_user_org_id(); v_actor uuid; v_s public.cash_statements%ROWTYPE; v_report jsonb; v_id uuid;
BEGIN
  v_actor:=public.assert_accounting_actor(v_org);
  LOCK TABLE public.journal_entries IN SHARE ROW EXCLUSIVE MODE;
  SELECT * INTO v_s FROM public.cash_statements WHERE id=p_statement_id AND org_id=v_org;
  IF v_s.id IS NULL THEN RAISE EXCEPTION 'statement unavailable'; END IF;
  IF p_action IS NULL OR p_action NOT IN ('CLOSE','REOPEN','VOID') OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'review action and reason required'; END IF;
  SELECT id INTO v_id FROM public.cash_reviews WHERE statement_id=v_s.id AND decision IS NULL AND requested_by=v_actor AND action=p_action AND reason=p_reason;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  IF (p_action IN ('CLOSE','VOID') AND v_s.status<>'OPEN') OR (p_action='REOPEN' AND v_s.status<>'APPROVED') THEN RAISE EXCEPTION 'statement status does not permit this action'; END IF;
  IF EXISTS(SELECT 1 FROM public.cash_statements WHERE register_id=v_s.register_id AND status<>'VOID' AND starts_on>v_s.ends_on) THEN RAISE EXCEPTION 'later statement must be resolved first'; END IF;
  v_report:=public.get_cash_reconciliation(v_s.id);
  IF v_report->>'revision' IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'reconciliation changed; refresh before review'; END IF;
  IF p_action='CLOSE' AND ((v_report->>'unmatchedCount')::int<>0 OR (v_report->>'variance')::numeric<>0 OR (v_report->>'openingVariance')::numeric<>0) THEN RAISE EXCEPTION 'resolve unmatched lines and reconciliation variances before close'; END IF;
  PERFORM set_config('tapaano.accounting_write','trusted',true);
  INSERT INTO public.cash_reviews(org_id,statement_id,action,requested_by,reason,snapshot)
    VALUES(v_org,v_s.id,p_action,v_actor,p_reason,v_report) RETURNING id INTO v_id;
  IF p_action IN ('CLOSE','VOID') THEN UPDATE public.cash_statements SET status='SUBMITTED' WHERE id=v_s.id; END IF;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.decide_cash_review(p_review_id uuid,p_decision text,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid:=public.get_user_org_id(); v_actor uuid; v_review public.cash_reviews%ROWTYPE; v_s public.cash_statements%ROWTYPE; v_report jsonb;
BEGIN
  v_actor:=public.assert_accounting_actor(v_org);
  LOCK TABLE public.journal_entries IN SHARE ROW EXCLUSIVE MODE;
  SELECT * INTO v_review FROM public.cash_reviews WHERE id=p_review_id AND org_id=v_org;
  IF v_review.id IS NULL THEN RAISE EXCEPTION 'review unavailable'; END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('APPROVE','REJECT') OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'decision and reason required'; END IF;
  IF v_review.requested_by=v_actor THEN RAISE EXCEPTION 'an independent reviewer is required'; END IF;
  IF v_review.decision IS NOT NULL THEN
    IF v_review.decision=p_decision AND v_review.decided_by=v_actor AND v_review.decision_reason=p_reason THEN RETURN; END IF;
    RAISE EXCEPTION 'review already decided';
  END IF;
  SELECT * INTO v_s FROM public.cash_statements WHERE id=v_review.statement_id;
  IF p_decision='APPROVE' AND (v_s.imported_by=v_actor OR EXISTS(SELECT 1 FROM public.cash_matches WHERE statement_id=v_s.id AND (created_by=v_actor OR removed_by=v_actor))) THEN RAISE EXCEPTION 'importer or matcher cannot approve their reconciliation'; END IF;
  IF p_decision='APPROVE' THEN
    IF EXISTS(SELECT 1 FROM public.cash_statements WHERE register_id=v_s.register_id AND status<>'VOID' AND starts_on>v_s.ends_on) THEN RAISE EXCEPTION 'later statement must be resolved first'; END IF;
    v_report:=public.get_cash_reconciliation(v_s.id);
    IF (v_report-ARRAY['status','revision']) IS DISTINCT FROM (v_review.snapshot-ARRAY['status','revision']) THEN RAISE EXCEPTION 'ledger changed after submission; reject and resubmit'; END IF;
  END IF;
  PERFORM set_config('tapaano.accounting_write','trusted',true);
  UPDATE public.cash_reviews SET decision=p_decision,decided_by=v_actor,decided_at=now(),decision_reason=p_reason WHERE id=v_review.id;
  UPDATE public.cash_statements SET status=CASE
    WHEN p_decision='REJECT' AND v_review.action='REOPEN' THEN 'APPROVED'
    WHEN p_decision='REJECT' THEN 'OPEN'
    WHEN v_review.action='CLOSE' THEN 'APPROVED'
    WHEN v_review.action='VOID' THEN 'VOID' ELSE 'OPEN' END WHERE id=v_s.id;
END; $$;

CREATE OR REPLACE FUNCTION public.guard_reconciled_cash_cutoff()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_date date;
BEGIN
  SELECT entry_date INTO v_date FROM public.journal_entries WHERE id=NEW.journal_entry_id;
  IF EXISTS(SELECT 1 FROM public.cash_registers r JOIN public.cash_statements s ON s.register_id=r.id
    WHERE r.entity_id=NEW.entity_id AND r.account_id=NEW.account_id AND s.status='APPROVED' AND v_date<=s.ends_on) THEN
    RAISE EXCEPTION 'cash reconciliation is closed; obtain an approved reopen before backdated posting';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS reconciled_cash_cutoff ON public.journal_lines;
CREATE TRIGGER reconciled_cash_cutoff BEFORE INSERT ON public.journal_lines FOR EACH ROW EXECUTE FUNCTION public.guard_reconciled_cash_cutoff();

DO $$ DECLARE t text; f record;
BEGIN
  FOREACH t IN ARRAY ARRAY['cash_registers','cash_statements','cash_statement_lines','cash_matches','cash_reviews'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_read ON public.%I',t);
    EXECUTE format('CREATE POLICY tenant_read ON public.%I FOR SELECT TO authenticated USING(org_id=public.get_user_org_id())',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
    EXECUTE format('DROP TRIGGER IF EXISTS accounting_write ON public.%I',t);
    EXECUTE format('CREATE TRIGGER accounting_write BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_accounting_write()',t);
    EXECUTE format('DROP TRIGGER IF EXISTS accounting_truncate ON public.%I',t);
    EXECUTE format('CREATE TRIGGER accounting_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.guard_accounting_truncate()',t);
  END LOOP;
  FOR f IN SELECT oid::regprocedure AS signature,proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN
    ('cash_amount','validate_cash_matches','create_cash_register','import_cash_statement','get_cash_reconciliation','match_cash_statement','remove_cash_match','request_cash_review','decide_cash_review','guard_reconciled_cash_cutoff') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
    IF f.proname NOT IN ('cash_amount','validate_cash_matches','guard_reconciled_cash_cutoff') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature); END IF;
  END LOOP;
END; $$;
COMMIT;
