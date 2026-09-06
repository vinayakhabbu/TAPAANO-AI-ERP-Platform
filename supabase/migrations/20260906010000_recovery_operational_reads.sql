BEGIN;

-- One statement snapshot; aggregate before PostgREST's row limit. Amounts are
-- decimal strings grouped by currency, never a sum of incompatible currencies.
CREATE OR REPLACE FUNCTION public.get_tenant_operational_summary()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE v_org uuid := public.get_user_org_id(); v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_org IS NULL THEN
    RAISE EXCEPTION 'tenant membership is unavailable' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.invoices WHERE org_id=v_org
    AND accounting_status='POSTED' AND journal_entry_id IS NOT NULL
    AND (currency IS NULL OR currency !~ '^[A-Z]{3}$')) THEN
    RAISE EXCEPTION 'posted invoice currency is invalid';
  END IF;
  SELECT jsonb_build_object(
    'customerCount', (SELECT count(id) FROM public.customers WHERE org_id=v_org),
    'invoiceCount', (SELECT count(id) FROM public.invoices WHERE org_id=v_org AND accounting_status='POSTED' AND journal_entry_id IS NOT NULL),
    'postedInvoiceTotals', COALESCE((SELECT jsonb_agg(jsonb_build_object('currency', currency, 'total', total) ORDER BY currency)
      FROM (SELECT currency, sum(total)::numeric(38,2)::text AS total FROM public.invoices
        WHERE org_id=v_org AND accounting_status='POSTED' AND journal_entry_id IS NOT NULL GROUP BY currency) totals), '[]'::jsonb),
    'fullCreditCount', (SELECT count(id) FROM public.customer_credit_notes WHERE org_id=v_org AND journal_entry_id IS NOT NULL),
    'fullReceiptCount', (SELECT count(id) FROM public.customer_receipts WHERE org_id=v_org AND journal_entry_id IS NOT NULL),
    'receiptCorrectionCount', (SELECT count(id) FROM public.customer_receipt_corrections WHERE org_id=v_org AND journal_entry_id IS NOT NULL),
    'receiptReplacementCount', (SELECT count(id) FROM public.customer_receipt_replacements WHERE org_id=v_org AND journal_entry_id IS NOT NULL),
    'vendorCount', (SELECT count(id) FROM public.vendors WHERE org_id=v_org),
    'billHeaderCount', (SELECT count(id) FROM public.bills WHERE org_id=v_org AND accounting_status='UNVERIFIED_LEGACY'),
    'postedBillCount', (SELECT count(id) FROM public.bills WHERE org_id=v_org AND accounting_status='POSTED' AND journal_entry_id IS NOT NULL),
    'postedCreditCount', (SELECT count(id) FROM public.supplier_bill_credit_notes WHERE org_id=v_org AND journal_entry_id IS NOT NULL),
    'postedPaymentCount', (SELECT count(id) FROM public.supplier_payments WHERE org_id=v_org AND journal_entry_id IS NOT NULL),
    'paymentCorrectionCount', (SELECT count(id) FROM public.supplier_payment_corrections WHERE org_id=v_org AND journal_entry_id IS NOT NULL),
    'paymentReplacementCount', (SELECT count(id) FROM public.supplier_payment_replacements WHERE org_id=v_org AND journal_entry_id IS NOT NULL),
    'paymentRunHistoryCount', (SELECT count(id) FROM public.payment_runs WHERE org_id=v_org),
    'bankAccountCount', (SELECT count(id) FROM public.bank_accounts WHERE org_id=v_org),
    'openPeriodCount', (SELECT count(id) FROM public.accounting_periods WHERE org_id=v_org AND status='OPEN')
  ) INTO v_result;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_tenant_operational_summary() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_tenant_operational_summary() TO authenticated;

COMMIT;
