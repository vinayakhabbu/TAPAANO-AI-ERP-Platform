BEGIN;

-- The report reads one MVCC snapshot under the caller's tenant policies. Amounts
-- come from immutable source postings, never the legacy amount_paid header.
CREATE OR REPLACE FUNCTION public.get_subledger_aging(
  p_entity_id uuid, p_kind text, p_as_of date, p_offset integer DEFAULT 0,
  p_page_size integer DEFAULT 100, p_expected_revision text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE
  v_org uuid:=public.get_user_org_id(); v_trial jsonb; v_control uuid; v_account uuid;
  v_account_code text; v_account_name text; v_drafts bigint; v_count bigint;
  v_rows jsonb; v_result jsonb; v_invalid boolean; v_open_count bigint;
  v_ledger numeric; v_outstanding numeric; v_totals jsonb; v_revision text;
BEGIN
  v_trial:=public.get_entity_trial_balance(p_entity_id,p_as_of,p_as_of);
  IF p_kind IS NULL OR p_kind NOT IN ('ar','ap') THEN RAISE EXCEPTION 'invalid subledger'; END IF;
  IF p_offset IS NULL OR p_offset<0 OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'invalid aging page';
  END IF;
  IF p_offset>0 AND p_expected_revision IS NULL THEN RAISE EXCEPTION 'a report revision is required for subsequent pages'; END IF;
  IF p_kind='ar' THEN
    SELECT c.id,a.id,a.code,a.name INTO v_control,v_account,v_account_code,v_account_name
    FROM public.entity_invoice_account_controls c JOIN public.accounts a ON a.id=c.ar_account_id AND a.org_id=v_org AND a.account_type='asset'
    WHERE c.org_id=v_org AND c.entity_id=p_entity_id;
    IF EXISTS(SELECT 1 FROM public.invoices WHERE org_id=v_org AND entity_id=p_entity_id AND issue_date<=p_as_of
      AND accounting_status<>'POSTED' AND status<>'draft') THEN RAISE EXCEPTION 'unverified invoice history prevents aging'; END IF;
    SELECT count(*) INTO v_drafts FROM public.invoices WHERE org_id=v_org AND entity_id=p_entity_id AND issue_date<=p_as_of AND accounting_status<>'POSTED';
  ELSE
    SELECT c.id,a.id,a.code,a.name INTO v_control,v_account,v_account_code,v_account_name
    FROM public.entity_supplier_bill_account_controls c JOIN public.accounts a ON a.id=c.ap_account_id AND a.org_id=v_org AND a.account_type='liability'
    WHERE c.org_id=v_org AND c.entity_id=p_entity_id;
    IF EXISTS(SELECT 1 FROM public.bills WHERE org_id=v_org AND entity_id=p_entity_id AND issue_date<=p_as_of
      AND accounting_status<>'POSTED' AND status<>'draft') THEN RAISE EXCEPTION 'unverified bill history prevents aging'; END IF;
    SELECT count(*) INTO v_drafts FROM public.bills WHERE org_id=v_org AND entity_id=p_entity_id AND issue_date<=p_as_of AND accounting_status<>'POSTED';
  END IF;
  IF v_control IS NULL THEN RAISE EXCEPTION 'subledger posting accounts are not configured'; END IF;
  SELECT (value->>'closingDebit')::numeric-(value->>'closingCredit')::numeric INTO v_ledger
    FROM jsonb_array_elements(v_trial->'rows') WHERE value->>'accountId'=v_account::text;
  v_ledger:=COALESCE(v_ledger,0)*CASE WHEN p_kind='ar' THEN 1 ELSE -1 END;

  WITH documents AS (
    SELECT i.id,i.customer_id AS party_id,c.name AS party_name,i.invoice_number AS number,
      i.issue_date,i.due_date,i.currency,i.total,i.account_control_id,i.accounting_event_id,i.journal_entry_id,
      'customer_invoice'::text AS source_type
    FROM public.invoices i LEFT JOIN public.customers c ON c.id=i.customer_id AND c.org_id=v_org
    WHERE p_kind='ar' AND i.org_id=v_org AND i.entity_id=p_entity_id AND i.accounting_status='POSTED' AND i.issue_date<=p_as_of
    UNION ALL
    SELECT b.id,b.vendor_id,c.name,b.bill_number,b.issue_date,b.due_date,b.currency,b.total,b.account_control_id,b.accounting_event_id,b.journal_entry_id,'supplier_bill'
    FROM public.bills b LEFT JOIN public.vendors c ON c.id=b.vendor_id AND c.org_id=v_org
    WHERE p_kind='ap' AND b.org_id=v_org AND b.entity_id=p_entity_id AND b.accounting_status='POSTED' AND b.issue_date<=p_as_of
  ), movements AS (
    SELECT d.id,d.id AS document_id,d.party_id,d.source_type,d.issue_date AS effective_date,d.total AS delta,d.currency,d.accounting_event_id,d.journal_entry_id FROM documents d
    UNION ALL
    SELECT id,original_invoice_id,customer_id,'customer_credit_note',issue_date,-total,currency,accounting_event_id,journal_entry_id
    FROM public.customer_credit_notes WHERE p_kind='ar' AND org_id=v_org AND entity_id=p_entity_id AND issue_date<=p_as_of
    UNION ALL
    SELECT id,invoice_id,customer_id,'customer_receipt',receipt_date,-amount,currency,accounting_event_id,journal_entry_id
    FROM public.customer_receipts WHERE p_kind='ar' AND org_id=v_org AND entity_id=p_entity_id AND receipt_date<=p_as_of
    UNION ALL
    SELECT c.id,r.invoice_id,c.customer_id,'customer_receipt_correction',c.correction_date,c.amount,c.currency,c.accounting_event_id,c.journal_entry_id
    FROM public.customer_receipt_corrections c LEFT JOIN public.customer_receipts r ON r.id=c.original_receipt_id AND r.org_id=v_org AND r.entity_id=p_entity_id
    WHERE p_kind='ar' AND c.org_id=v_org AND c.entity_id=p_entity_id AND c.correction_date<=p_as_of
    UNION ALL
    SELECT id,invoice_id,customer_id,'customer_receipt_replacement',replacement_date,-amount,currency,accounting_event_id,journal_entry_id
    FROM public.customer_receipt_replacements WHERE p_kind='ar' AND org_id=v_org AND entity_id=p_entity_id AND replacement_date<=p_as_of
    UNION ALL
    SELECT id,original_bill_id,vendor_id,'supplier_bill_credit',issue_date,-total,currency,accounting_event_id,journal_entry_id
    FROM public.supplier_bill_credit_notes WHERE p_kind='ap' AND org_id=v_org AND entity_id=p_entity_id AND issue_date<=p_as_of
    UNION ALL
    SELECT id,bill_id,vendor_id,'supplier_payment',payment_date,-amount,currency,accounting_event_id,journal_entry_id
    FROM public.supplier_payments WHERE p_kind='ap' AND org_id=v_org AND entity_id=p_entity_id AND payment_date<=p_as_of
    UNION ALL
    SELECT c.id,r.bill_id,c.vendor_id,'supplier_payment_correction',c.correction_date,c.amount,c.currency,c.accounting_event_id,c.journal_entry_id
    FROM public.supplier_payment_corrections c LEFT JOIN public.supplier_payments r ON r.id=c.original_payment_id AND r.org_id=v_org AND r.entity_id=p_entity_id
    WHERE p_kind='ap' AND c.org_id=v_org AND c.entity_id=p_entity_id AND c.correction_date<=p_as_of
    UNION ALL
    SELECT id,bill_id,vendor_id,'supplier_payment_replacement',replacement_date,-amount,currency,accounting_event_id,journal_entry_id
    FROM public.supplier_payment_replacements WHERE p_kind='ap' AND org_id=v_org AND entity_id=p_entity_id AND replacement_date<=p_as_of
  ), verified AS (
    SELECT m.*,
      d.id IS NULL OR d.party_id IS DISTINCT FROM m.party_id OR m.currency IS DISTINCT FROM d.currency
      OR m.effective_date<d.issue_date OR abs(m.delta) IS DISTINCT FROM d.total
      OR ev.id IS NULL OR j.id IS NULL OR control_net.amount IS DISTINCT FROM m.delta AS invalid
    FROM movements m LEFT JOIN documents d ON d.id=m.document_id
    LEFT JOIN public.accounting_events ev ON ev.id=m.accounting_event_id AND ev.org_id=v_org AND ev.entity_id=p_entity_id
      AND ev.source_type=m.source_type AND ev.source_id=m.id AND ev.journal_entry_id=m.journal_entry_id
    LEFT JOIN public.journal_entries j ON j.id=m.journal_entry_id AND j.org_id=v_org AND j.entity_id=p_entity_id
      AND j.status='posted' AND j.accounting_event_id=m.accounting_event_id AND j.entry_date=m.effective_date
    LEFT JOIN LATERAL (SELECT sum(l.debit-l.credit)*CASE WHEN p_kind='ar' THEN 1 ELSE -1 END AS amount
      FROM public.journal_lines l WHERE l.journal_entry_id=m.journal_entry_id AND l.account_id=v_account) control_net ON true
  ), document_totals AS (
    SELECT document_id,sum(delta) AS outstanding FROM verified GROUP BY document_id
  ), balances AS (
    SELECT d.*,COALESCE(m.outstanding,0) AS outstanding
    FROM documents d LEFT JOIN document_totals m ON m.document_id=d.id
  ), aged AS (
    SELECT *,greatest(p_as_of-due_date,0) AS days_past_due,
      CASE WHEN due_date>=p_as_of THEN 'current' WHEN p_as_of-due_date<=30 THEN 'days1to30'
        WHEN p_as_of-due_date<=60 THEN 'days31to60' WHEN p_as_of-due_date<=90 THEN 'days61to90' ELSE 'days91plus' END AS bucket
    FROM balances
  ) SELECT
    (SELECT count(*) FROM documents),
    COALESCE((SELECT bool_or(invalid) FROM verified),false) OR COALESCE((SELECT bool_or(
      total IS NULL OR total<=0 OR total::text IN ('NaN','Infinity','-Infinity')
      OR outstanding<0 OR outstanding>total OR party_name IS NULL OR btrim(party_name)=''
      OR currency IS DISTINCT FROM v_trial->>'currency' OR account_control_id IS DISTINCT FROM v_control
      OR issue_date<DATE '0001-01-01' OR due_date<issue_date OR due_date>DATE '9999-12-31'
    ) FROM balances),false),
    COALESCE(jsonb_agg(jsonb_build_object('documentId',id,'documentNumber',number,'partyId',party_id,'partyName',party_name,
      'issueDate',to_char(issue_date,'YYYY-MM-DD'),'dueDate',to_char(due_date,'YYYY-MM-DD'),'daysPastDue',days_past_due,'bucket',bucket,
      'original',total::numeric(38,2)::text,'settled',(total-outstanding)::numeric(38,2)::text,'outstanding',outstanding::numeric(38,2)::text
    ) ORDER BY due_date,id) FILTER(WHERE outstanding>0),'[]'::jsonb)
  INTO v_count,v_invalid,v_rows FROM aged;
  IF v_invalid THEN RAISE EXCEPTION 'invalid or unverified subledger accounting history prevents aging'; END IF;
  v_open_count:=jsonb_array_length(v_rows);
  IF (v_open_count>0 AND p_offset>=v_open_count) OR (v_open_count=0 AND p_offset<>0) THEN RAISE EXCEPTION 'aging page is outside the selected history'; END IF;
  SELECT COALESCE(sum((value->>'outstanding')::numeric),0),jsonb_build_object(
    'current',COALESCE(sum((value->>'outstanding')::numeric) FILTER(WHERE value->>'bucket'='current'),0)::numeric(38,2)::text,
    'days1to30',COALESCE(sum((value->>'outstanding')::numeric) FILTER(WHERE value->>'bucket'='days1to30'),0)::numeric(38,2)::text,
    'days31to60',COALESCE(sum((value->>'outstanding')::numeric) FILTER(WHERE value->>'bucket'='days31to60'),0)::numeric(38,2)::text,
    'days61to90',COALESCE(sum((value->>'outstanding')::numeric) FILTER(WHERE value->>'bucket'='days61to90'),0)::numeric(38,2)::text,
    'days91plus',COALESCE(sum((value->>'outstanding')::numeric) FILTER(WHERE value->>'bucket'='days91plus'),0)::numeric(38,2)::text
  ) INTO v_outstanding,v_totals FROM jsonb_array_elements(v_rows);
  v_result:=jsonb_build_object('entityId',p_entity_id,'entityName',v_trial->>'entityName','currency',v_trial->>'currency',
    'kind',p_kind,'asOf',to_char(p_as_of,'YYYY-MM-DD'),'accountId',v_account,'accountCode',v_account_code,'accountName',v_account_name,
    'documentCount',v_count,'openCount',v_open_count,'excludedDraftCount',v_drafts,'buckets',v_totals,
    'outstanding',v_outstanding::numeric(38,2)::text,'ledgerBalance',v_ledger::numeric(38,2)::text,
    'variance',(v_ledger-v_outstanding)::numeric(38,2)::text,'reconciled',v_ledger=v_outstanding);
  v_revision:=md5(v_result::text || v_rows::text || (v_trial->>'revision'));
  IF p_expected_revision IS NOT NULL AND p_expected_revision IS DISTINCT FROM v_revision THEN
    RAISE EXCEPTION 'aging history changed; regenerate the report' USING ERRCODE='40001';
  END IF;
  RETURN v_result || jsonb_build_object('revision',v_revision,'generatedAt',statement_timestamp(),'offset',p_offset,'pageSize',p_page_size,
    'rows',(SELECT COALESCE(jsonb_agg(value ORDER BY position),'[]'::jsonb) FROM jsonb_array_elements(v_rows) WITH ORDINALITY AS r(value,position)
      WHERE position>p_offset AND position<=p_offset+p_page_size));
END;
$$;
REVOKE ALL ON FUNCTION public.get_subledger_aging(uuid,text,date,integer,integer,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_subledger_aging(uuid,text,date,integer,integer,text) TO authenticated;

CREATE INDEX IF NOT EXISTS invoices_aging_idx ON public.invoices(org_id,entity_id,issue_date,id);
CREATE INDEX IF NOT EXISTS bills_aging_idx ON public.bills(org_id,entity_id,issue_date,id);

COMMIT;
