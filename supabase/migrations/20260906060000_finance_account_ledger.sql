BEGIN;

CREATE INDEX IF NOT EXISTS journal_entries_trial_balance_idx
  ON public.journal_entries(org_id,entity_id,entry_date,id) WHERE status='posted';

-- Reports expose a content revision for consistent account drilldown and pagination.
-- One statement snapshot, one entity's functional currency, exact decimals.
-- Reads inherit the caller's RLS and never promote legacy records into evidence.
CREATE OR REPLACE FUNCTION public.get_entity_trial_balance(
  p_entity_id uuid, p_from_date date, p_to_date date
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = ''
AS $$
DECLARE v_org uuid:=public.get_user_org_id(); v_entity public.entities%ROWTYPE; v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_org IS NULL THEN
    RAISE EXCEPTION 'tenant membership is unavailable' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_entity FROM public.entities WHERE id=p_entity_id AND org_id=v_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'entity not found or unavailable' USING ERRCODE='42501'; END IF;
  IF p_from_date IS NULL OR p_to_date IS NULL OR p_from_date>p_to_date
    OR p_from_date<DATE '0001-01-01' OR p_to_date>DATE '9999-12-31' THEN
    RAISE EXCEPTION 'invalid report date range';
  END IF;
  IF v_entity.currency IS NULL OR v_entity.currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'entity currency is unavailable';
  END IF;

  -- Recovered reversals retain the original POSTED journal and add an offset.
  -- A legacy REVERSED status has no reliable inclusion rule and needs review.
  IF EXISTS (SELECT 1 FROM public.journal_entries e WHERE e.org_id=v_org
    AND e.entity_id=p_entity_id AND e.entry_date<=p_to_date AND e.status='reversed') THEN
    RAISE EXCEPTION 'unverified reversed journal history prevents reporting';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.journal_entries e
    LEFT JOIN public.accounting_events ev ON ev.id=e.accounting_event_id
      AND ev.org_id=e.org_id AND ev.entity_id=e.entity_id AND ev.journal_entry_id=e.id
    LEFT JOIN public.accounting_periods p ON p.id=e.accounting_period_id
      AND p.org_id=e.org_id AND p.entity_id=e.entity_id
      AND e.entry_date BETWEEN p.period_start AND p.period_end
    WHERE e.org_id=v_org AND e.entity_id=p_entity_id AND e.status='posted'
      AND e.entry_date<=p_to_date AND (ev.id IS NULL OR p.id IS NULL)
  ) THEN RAISE EXCEPTION 'unverified posted journal history prevents reporting'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.journal_entries e
    LEFT JOIN public.journal_lines l ON l.journal_entry_id=e.id
    LEFT JOIN public.accounts a ON a.id=l.account_id AND a.org_id=e.org_id
    WHERE e.org_id=v_org AND e.entity_id=p_entity_id AND e.status='posted' AND e.entry_date<=p_to_date
    GROUP BY e.id
    HAVING count(l.id)<2 OR sum(l.debit) IS DISTINCT FROM sum(l.credit) OR sum(l.debit)<=0
      OR bool_or(a.id IS NULL OR l.org_id IS DISTINCT FROM e.org_id OR l.entity_id IS DISTINCT FROM e.entity_id
        OR l.debit IS NULL OR l.credit IS NULL OR l.debit<0 OR l.credit<0
        OR l.debit::text IN ('NaN','Infinity','-Infinity') OR l.credit::text IN ('NaN','Infinity','-Infinity')
        OR (l.debit=0 AND l.credit=0) OR (l.debit>0 AND l.credit>0))
  ) THEN RAISE EXCEPTION 'invalid or unbalanced journal history prevents reporting'; END IF;

  WITH activity AS (
    SELECT a.id,a.code,a.name,a.account_type,
      COALESCE(sum(l.debit-l.credit) FILTER (WHERE e.entry_date<p_from_date),0) AS opening,
      COALESCE(sum(l.debit) FILTER (WHERE e.entry_date>=p_from_date),0) AS period_debit,
      COALESCE(sum(l.credit) FILTER (WHERE e.entry_date>=p_from_date),0) AS period_credit,
      sum(l.debit-l.credit) AS closing
    FROM public.journal_entries e JOIN public.journal_lines l ON l.journal_entry_id=e.id
      JOIN public.accounts a ON a.id=l.account_id AND a.org_id=e.org_id
    WHERE e.org_id=v_org AND e.entity_id=p_entity_id AND e.status='posted' AND e.entry_date<=p_to_date
    GROUP BY a.id,a.code,a.name,a.account_type
  ), balances AS (
    SELECT *,GREATEST(opening,0) AS opening_debit,GREATEST(-opening,0) AS opening_credit,
      GREATEST(closing,0) AS closing_debit,GREATEST(-closing,0) AS closing_credit FROM activity
  )
  SELECT jsonb_build_object(
    'entityId',v_entity.id,'entityName',v_entity.name,'currency',v_entity.currency,
    'fromDate',to_char(p_from_date,'YYYY-MM-DD'),'toDate',to_char(p_to_date,'YYYY-MM-DD'),
    'generatedAt',statement_timestamp(),
    'journalCount',(SELECT count(*) FROM public.journal_entries WHERE org_id=v_org AND entity_id=p_entity_id AND status='posted' AND entry_date<=p_to_date),
    'periodJournalCount',(SELECT count(*) FROM public.journal_entries WHERE org_id=v_org AND entity_id=p_entity_id AND status='posted' AND entry_date BETWEEN p_from_date AND p_to_date),
    'draftJournalCount',(SELECT count(*) FROM public.journal_entries WHERE org_id=v_org AND entity_id=p_entity_id AND status='draft' AND entry_date<=p_to_date),
    'rows',COALESCE(jsonb_agg(jsonb_build_object(
      'accountId',id,'code',code,'name',name,'accountType',account_type,
      'openingDebit',opening_debit::numeric(38,2)::text,'openingCredit',opening_credit::numeric(38,2)::text,
      'periodDebit',period_debit::numeric(38,2)::text,'periodCredit',period_credit::numeric(38,2)::text,
      'closingDebit',closing_debit::numeric(38,2)::text,'closingCredit',closing_credit::numeric(38,2)::text
    ) ORDER BY code,id),'[]'::jsonb),
    'totals',jsonb_build_object(
      'openingDebit',COALESCE(sum(opening_debit),0)::numeric(38,2)::text,
      'openingCredit',COALESCE(sum(opening_credit),0)::numeric(38,2)::text,
      'periodDebit',COALESCE(sum(period_debit),0)::numeric(38,2)::text,
      'periodCredit',COALESCE(sum(period_credit),0)::numeric(38,2)::text,
      'closingDebit',COALESCE(sum(closing_debit),0)::numeric(38,2)::text,
      'closingCredit',COALESCE(sum(closing_credit),0)::numeric(38,2)::text
    )
  ) INTO v_result FROM balances;
  RETURN v_result || jsonb_build_object('revision',md5((v_result-'generatedAt')::text));
END;
$$;

REVOKE ALL ON FUNCTION public.get_entity_trial_balance(uuid,date,date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_entity_trial_balance(uuid,date,date) TO authenticated;

CREATE INDEX IF NOT EXISTS journal_lines_account_activity_idx
  ON public.journal_lines(org_id,entity_id,account_id,journal_entry_id,line_number,id);

-- A changed report revision stops paging rather than mixing two ledger states.
-- The revision is a consistency token, never an authorization credential.
CREATE OR REPLACE FUNCTION public.get_account_ledger(
  p_entity_id uuid, p_account_id uuid, p_from_date date, p_to_date date,
  p_offset integer DEFAULT 0, p_page_size integer DEFAULT 100,
  p_expected_revision text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=''
AS $$
DECLARE
  v_org uuid:=public.get_user_org_id(); v_account public.accounts%ROWTYPE;
  v_trial jsonb; v_balance jsonb; v_opening numeric; v_result jsonb; v_count bigint;
BEGIN
  -- Inherits the same date, tenant, event, period and journal-integrity checks.
  v_trial:=public.get_entity_trial_balance(p_entity_id,p_from_date,p_to_date);
  SELECT * INTO v_account FROM public.accounts WHERE id=p_account_id AND org_id=v_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'account not found or unavailable' USING ERRCODE='42501'; END IF;
  IF p_offset IS NULL OR p_offset<0 OR p_page_size IS NULL OR p_page_size<1 OR p_page_size>200 THEN
    RAISE EXCEPTION 'invalid ledger page';
  END IF;
  IF p_offset>0 AND p_expected_revision IS NULL THEN RAISE EXCEPTION 'a report revision is required for subsequent pages'; END IF;
  IF p_expected_revision IS NOT NULL AND p_expected_revision IS DISTINCT FROM v_trial->>'revision' THEN
    RAISE EXCEPTION 'ledger changed; regenerate the report' USING ERRCODE='40001';
  END IF;
  SELECT value INTO v_balance FROM jsonb_array_elements(v_trial->'rows') WHERE value->>'accountId'=p_account_id::text;
  v_balance:=COALESCE(v_balance,jsonb_build_object(
    'openingDebit','0.00','openingCredit','0.00','periodDebit','0.00','periodCredit','0.00','closingDebit','0.00','closingCredit','0.00'));
  v_opening:=(v_balance->>'openingDebit')::numeric-(v_balance->>'openingCredit')::numeric;
  SELECT count(*) INTO v_count FROM public.journal_entries e JOIN public.journal_lines l ON l.journal_entry_id=e.id
    WHERE e.org_id=v_org AND e.entity_id=p_entity_id AND e.status='posted'
      AND e.entry_date BETWEEN p_from_date AND p_to_date AND l.account_id=p_account_id;
  IF (v_count>0 AND p_offset>=v_count) OR (v_count=0 AND p_offset<>0) THEN
    RAISE EXCEPTION 'ledger page is outside the selected history';
  END IF;

  WITH ordered AS (
    SELECT l.id,l.line_number,l.debit,l.credit,COALESCE(l.memo,e.memo,'') AS memo,
      e.id AS entry_id,e.entry_number,e.entry_date,ev.source_type,ev.source_id,
      row_number() OVER w AS position,
      v_opening+sum(l.debit-l.credit) OVER w AS running
    FROM public.journal_entries e JOIN public.journal_lines l ON l.journal_entry_id=e.id
      JOIN public.accounting_events ev ON ev.id=e.accounting_event_id
    WHERE e.org_id=v_org AND e.entity_id=p_entity_id AND e.status='posted'
      AND e.entry_date BETWEEN p_from_date AND p_to_date AND l.account_id=p_account_id
    WINDOW w AS (ORDER BY e.entry_date,e.id,l.line_number,l.id ROWS UNBOUNDED PRECEDING)
  ), page AS (SELECT * FROM ordered ORDER BY position OFFSET p_offset LIMIT p_page_size)
  SELECT jsonb_build_object(
    'entityId',p_entity_id,'entityName',v_trial->>'entityName','currency',v_trial->>'currency',
    'fromDate',v_trial->>'fromDate','toDate',v_trial->>'toDate','generatedAt',v_trial->>'generatedAt',
    'revision',v_trial->>'revision','accountId',p_account_id,'accountCode',v_account.code,
    'accountName',v_account.name,'accountType',v_account.account_type,
    'offset',p_offset,'pageSize',p_page_size,'lineCount',v_count,'totals',v_balance,
    'pageOpening',(COALESCE((SELECT running-debit+credit FROM page ORDER BY position LIMIT 1),v_opening))::numeric(38,2)::text,
    'rows',COALESCE(jsonb_agg(jsonb_build_object(
      'lineId',id,'lineNumber',line_number,'entryId',entry_id,'entryNumber',entry_number,
      'entryDate',to_char(entry_date,'YYYY-MM-DD'),'memo',memo,'sourceType',source_type,'sourceId',source_id,
      'debit',debit::numeric(38,2)::text,'credit',credit::numeric(38,2)::text,'balance',running::numeric(38,2)::text
    ) ORDER BY position),'[]'::jsonb)
  ) INTO v_result FROM page;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_account_ledger(uuid,uuid,date,date,integer,integer,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_account_ledger(uuid,uuid,date,date,integer,integer,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_recent_posted_journals()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE v_org uuid:=public.get_user_org_id(); v_scope record; v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_org IS NULL THEN RAISE EXCEPTION 'tenant membership is unavailable' USING ERRCODE='42501'; END IF;
  FOR v_scope IN SELECT entity_id,max(entry_date) AS through_date FROM (
    SELECT entity_id,entry_date FROM public.journal_entries WHERE org_id=v_org AND status='posted'
      ORDER BY entry_date DESC,id LIMIT 20
  ) recent GROUP BY entity_id LOOP
    PERFORM public.get_entity_trial_balance(v_scope.entity_id,v_scope.through_date,v_scope.through_date);
  END LOOP;
  WITH recent AS (
    SELECT * FROM public.journal_entries WHERE org_id=v_org AND status='posted' ORDER BY entry_date DESC,id LIMIT 20
  ), totals AS (
    SELECT e.id,e.entry_number,e.entry_date,e.memo,e.entity_id,n.name AS entity_name,n.currency,
      sum(l.debit)::numeric(38,2)::text AS debit,sum(l.credit)::numeric(38,2)::text AS credit
    FROM recent e JOIN public.entities n ON n.id=e.entity_id AND n.org_id=v_org
      JOIN public.journal_lines l ON l.journal_entry_id=e.id
    GROUP BY e.id,e.entry_number,e.entry_date,e.memo,e.entity_id,n.name,n.currency
  ) SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'entryNumber',entry_number,'entryDate',to_char(entry_date,'YYYY-MM-DD'),
    'memo',COALESCE(memo,''),'entityId',entity_id,'entityName',entity_name,'currency',currency,'debit',debit,'credit',credit)
    ORDER BY entry_date DESC,id),'[]'::jsonb) INTO v_result FROM totals;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_recent_posted_journals() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_recent_posted_journals() TO authenticated;

COMMIT;
