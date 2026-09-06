BEGIN;

-- The original source-module constraint predates the recovered AR/AP flows.
-- Preserve its legacy values and admit the exact values emitted and validated
-- by the supported posting RPCs. Write grants and graph validators are unchanged.
ALTER TABLE public.journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_source_module_check;
ALTER TABLE public.journal_entries
  ADD CONSTRAINT journal_entries_source_module_check CHECK (source_module IN (
    'gl', 'banking', 'ar', 'ap', 'payroll', 'other',
    'ar_credit', 'ar_receipt', 'ar_receipt_correction', 'ar_receipt_replacement',
    'ap_credit', 'ap_payment', 'ap_payment_correction', 'ap_payment_replacement'
  ));

COMMIT;
