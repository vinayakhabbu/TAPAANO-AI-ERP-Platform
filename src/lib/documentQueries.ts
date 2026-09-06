// Explicit relationships avoid ambiguity between legacy single-column foreign
// keys and the tenant-scoped constraints added by the recovery migrations.
export const POSTED_INVOICE_SELECT = "id, invoice_number, issue_date, due_date, total, currency, journal_entry_id, customers!invoices_customer_id_fkey(name)" as const;
export const POSTED_BILL_SELECT = "id, bill_number, issue_date, due_date, total, currency, journal_entry_id, vendors!bills_vendor_id_fkey(name)" as const;
export const LEGACY_BILL_SELECT = "id, bill_number, issue_date, due_date, total, currency, status, vendors!bills_vendor_id_fkey(name)" as const;
