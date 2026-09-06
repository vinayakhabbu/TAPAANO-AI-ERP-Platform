BEGIN;

CREATE INDEX IF NOT EXISTS journal_entries_trial_balance_idx
  ON public.journal_entries(org_id,entity_id,entry_date,id) WHERE status='posted';

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
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_entity_trial_balance(uuid,date,date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_entity_trial_balance(uuid,date,date) TO authenticated;

COMMIT;
