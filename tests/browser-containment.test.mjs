import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const resolved = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(resolved);
    if (resolved.endsWith(path.join("integrations", "supabase", "types.ts"))) return [];
    return /\.(ts|tsx)$/.test(entry.name) ? [resolved] : [];
  }));
  return nested.flat();
}

test("browser source contains no Edge invocation path", async () => {
  for (const file of await sourceFiles(root)) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /functions\s*\.\s*invoke\s*\(/, file);
    assert.doesNotMatch(source, /functions\s*\[\s*["']invoke["']\s*\]\s*\(/, file);
  }
});

test("browser source cannot mutate generic Decision Ledger or precedent controls", async () => {
  for (const file of await sourceFiles(root)) {
    const source = await readFile(file, "utf8");
    const ledgerWrite = /from\s*\(\s*["']decision_(?:traces|entities)["']\s*\)[\s\S]{0,160}?\.(?:insert|update|upsert|delete)\s*\(/;
    assert.doesNotMatch(source, ledgerWrite, file);
    assert.doesNotMatch(source, /search_precedents_by_text|insert_decision_trace/, file);
  }
});

test("disabled surfaces describe an unavailable state", async () => {
  const files = [
    "components/ai/AIChatBar.tsx",
    "components/decisions/AutonomousApprover.tsx",
    "components/decisions/AnomalyDetector.tsx",
    "components/decisions/PrecedentExplorer.tsx",
    "components/reports/ScheduledReportsManager.tsx",
  ];
  for (const relative of files) {
    const source = await readFile(path.join(root, relative), "utf8");
    assert.match(source, /unavailable|disabled/i, relative);
  }
});

test("browser cannot write physical journal or period tables", async () => {
  for (const file of await sourceFiles(root)) {
    const source = await readFile(file, "utf8");
    const directWrite = /from\s*\(\s*["'](?:journal_entries|journal_lines|accounting_periods|accounting_period_events|accounting_events)["']\s*\)[\s\S]{0,320}?\.(?:insert|update|upsert|delete)\s*\(/;
    assert.doesNotMatch(source, directWrite, file);
  }
});

test("ledger and period reads are scoped by live user and organization", async () => {
  const ledger = await readFile(path.join(root, "hooks/useGeneralLedger.ts"), "utf8");
  const periods = await readFile(path.join(root, "hooks/usePeriodClose.ts"), "utf8");
  for (const [name, source] of [["ledger", ledger], ["periods", periods]]) {
    assert.match(source, /user\?\.id/,
      `${name} query keys and readiness must include the current user`);
    assert.match(source, /profile\?\.org_id/,
      `${name} query keys and readiness must include the current organization`);
    assert.match(source, /\.eq\(\s*["']org_id["']\s*,\s*profile\.org_id\s*\)/,
      `${name} query must filter the current organization`);
  }
});

test("physical journal and period types expose no browser write contract", async () => {
  const types = await readFile(path.join(root, "integrations/supabase/types.ts"), "utf8");
  for (const table of ["journal_entries", "journal_lines", "accounting_periods", "accounting_period_events", "accounting_events"]) {
    const contract = new RegExp(`\\n      ${table}: \\{[\\s\\S]*?\\n        Insert: never\\n        Update: never`);
    assert.match(types, contract, `${table} must expose read-only physical types`);
  }
});

test("customer invoices can only be posted through the supported atomic RPC", async () => {
  for (const file of await sourceFiles(root)) {
    const source = await readFile(file, "utf8");
    const invoiceWrite = /from\s*\(\s*["']invoices["']\s*\)[\s\S]{0,320}?\.(?:insert|update|upsert|delete)\s*\(/;
    assert.doesNotMatch(source, invoiceWrite, file);
  }

  const form = await readFile(path.join(root, "components/forms/InvoiceForm.tsx"), "utf8");
  assert.match(form, /rpc\(\s*["']post_customer_invoice["']/);
  assert.match(form, /p_tax:\s*0/);
  assert.match(form, /p_currency:\s*selectedEntity\.currency/);
  assert.match(form, /p_idempotency_key:\s*idempotencyKey/);

  const types = await readFile(path.join(root, "integrations/supabase/types.ts"), "utf8");
  for (const table of ["entity_invoice_account_controls", "invoice_lines", "invoices"]) {
    const contract = new RegExp(`\\n      ${table}: \\{[\\s\\S]*?\\n        Insert: never\\n        Update: never`);
    assert.match(types, contract, `${table} must expose a read-only browser contract`);
  }

  for (const file of await sourceFiles(root)) {
    const source = await readFile(file, "utf8");
    const creditWrite = /from\s*\(\s*["']customer_credit_note(?:s|_lines)["']\s*\)[^;]{0,500}?\.(?:insert|update|upsert|delete)\s*\(/;
    assert.doesNotMatch(source, creditWrite, file);
  }
  const creditForm = await readFile(path.join(root, "components/forms/CreditNoteForm.tsx"), "utf8");
  assert.match(creditForm, /rpc\(\s*["']post_customer_credit_note["']/);
  for (const argument of ["p_invoice_id", "p_credit_note_number", "p_credit_date", "p_reason", "p_idempotency_key"]) {
    assert.match(creditForm, new RegExp(`${argument}:`));
  }
  for (const table of ["customer_credit_notes", "customer_credit_note_lines"]) {
    const contract = new RegExp(`\\n      ${table}: \\{[\\s\\S]*?\\n        Insert: never\\n        Update: never`);
    assert.match(types, contract, `${table} must expose a read-only browser contract`);
  }

  for (const file of await sourceFiles(root)) {
    const source = await readFile(file, "utf8");
    const receiptWrite = /from\s*\(\s*["'](?:customer_receipts|entity_customer_receipt_controls)["']\s*\)[^;]{0,500}?\.(?:insert|update|upsert|delete)\s*\(/;
    assert.doesNotMatch(source, receiptWrite, file);
  }
  const receiptForm = await readFile(path.join(root, "components/forms/ReceiptForm.tsx"), "utf8");
  assert.match(receiptForm, /rpc\(\s*["']post_customer_receipt["']/);
  for (const argument of ["p_invoice_id", "p_receipt_number", "p_receipt_date", "p_currency", "p_reference", "p_idempotency_key"]) {
    assert.match(receiptForm, new RegExp(`${argument}:`));
  }
  assert.doesNotMatch(receiptForm, /p_amount:/);
  for (const table of ["customer_receipts", "entity_customer_receipt_controls"]) {
    const contract = new RegExp(`\\n      ${table}: \\{[\\s\\S]*?\\n        Insert: never\\n        Update: never`);
    assert.match(types, contract, `${table} must expose a read-only browser contract`);
  }
});

test("receivables reads only tenant-scoped journal-linked posted invoices", async () => {
  const hook = await readFile(path.join(root, "hooks/useReceivables.ts"), "utf8");
  assert.match(hook, /queryKey:\s*\["posted-invoice-history",\s*user\?\.id,\s*orgId\]/);
  assert.match(hook, /\.eq\(\s*["']org_id["']\s*,\s*orgId\s*\)/);
  assert.match(hook, /\.eq\(\s*["']accounting_status["']\s*,\s*["']POSTED["']\s*\)/);
  assert.match(hook, /\.not\(\s*["']journal_entry_id["']\s*,\s*["']is["']\s*,\s*null\s*\)/);
  assert.doesNotMatch(hook, /differenceInDays|totalAR|overdueAR|amount_paid/);
  assert.match(hook, /queryKey:\s*\["posted-credit-note-history",\s*user\?\.id,\s*orgId\]/);
  assert.match(hook, /from\("customer_credit_notes"\)[\s\S]{0,300}?\.eq\("org_id",\s*orgId\)/);
  assert.match(hook, /queryKey:\s*\["posted-customer-receipt-history",\s*user\?\.id,\s*orgId\]/);
  assert.match(hook, /from\("customer_receipts"\)[\s\S]{0,300}?\.eq\("org_id",\s*orgId\)/);

  const page = await readFile(path.join(root, "pages/Receivables.tsx"), "utf8");
  assert.match(page, /Full receipts recorded/);
  assert.match(page, /not bank-reconciled/i);
  assert.match(page, /Not an outstanding receivable or aging balance/);
  assert.match(page, /Full credit notes/);
  assert.doesNotMatch(page, />Total AR<|>Overdue</);

  const dashboard = await readFile(path.join(root, "pages/Index.tsx"), "utf8");
  assert.doesNotMatch(dashboard, /ARAgingChart|RevenueChart|Total Receivables|Total AR/);
});

test("authentication changes isolate cached tenant data and guard private routes", async () => {
  const auth = await readFile(path.join(root, "hooks/useAuth.tsx"), "utf8");
  assert.match(auth, /setSigningOut\(true\)[\s\S]*?setUser\(null\)[\s\S]*?setProfile\(null\)[\s\S]*?cancelQueries\(\)[\s\S]*?auth\.signOut\(\)[\s\S]*?cancelQueries\(\)[\s\S]*?queryClient\.clear\(\)/);
  assert.match(auth, /identityEpoch\.current === epoch && currentUserId\.current === userId/);
  assert.match(auth, /signingOutRef\.current \|\| identityEpoch\.current !== initialEpoch/);

  const app = await readFile(path.join(root, "App.tsx"), "utf8");
  assert.match(app, /function AuthenticatedRoute\(\)/);
  assert.match(app, /if \(!user \|\| !profile\?\.org_id\)/);
  assert.match(app, /<Route element=\{<AuthenticatedRoute \/>\}>/);
});

test("browser identity is sign-in-only and cannot mutate tenant membership or roles", async () => {
  for (const file of await sourceFiles(root)) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /auth\s*\.\s*signUp\s*\(/, file);
    const identityWrite = /from\s*\(\s*["'](?:profiles|user_roles)["']\s*\)[^;]{0,500}?\.(?:insert|update|upsert|delete)\s*\(/;
    assert.doesNotMatch(source, identityWrite, file);
  }

  const auth = await readFile(path.join(root, "pages/Auth.tsx"), "utf8");
  assert.match(auth, /Self-service registration is unavailable/);
  assert.doesNotMatch(auth, /Create Account|companyName|displayName/);

  const types = await readFile(path.join(root, "integrations/supabase/types.ts"), "utf8");
  for (const table of ["profiles", "user_roles"]) {
    const contract = new RegExp(`\\n      ${table}: \\{[\\s\\S]*?\\n        Insert: never\\n        Update: never`);
    assert.match(types, contract, `${table} must expose no browser write contract`);
  }
});

test("browser cannot read or mutate legacy AI credentials or autonomy configuration", async () => {
  for (const file of await sourceFiles(root)) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /openai_api_key/, file);
    const autoWrite = /from\s*\(\s*["']auto_approval_configs["']\s*\)[\s\S]{0,320}?\.(?:insert|update|upsert|delete)\s*\(/;
    assert.doesNotMatch(source, autoWrite, file);
  }

  for (const relative of [
    "components/settings/APIKeysSettings.tsx",
    "components/settings/AutoApprovalSettings.tsx",
  ]) {
    const source = await readFile(path.join(root, relative), "utf8");
    assert.match(source, /unavailable|disabled/i, relative);
  }

  const types = await readFile(path.join(root, "integrations/supabase/types.ts"), "utf8");
  assert.doesNotMatch(types, /openai_api_key/);
  for (const table of ["organizations", "auto_approval_configs"]) {
    const contract = new RegExp(`\\n      ${table}: \\{[\\s\\S]*?\\n        Insert: never\\n        Update: never`);
    assert.match(types, contract, `${table} must expose no browser write contract`);
  }
});

test("legacy AP/payment tables are read-only and cannot produce accounting assurances", async () => {
  for (const file of await sourceFiles(root)) {
    const source = await readFile(file, "utf8");
    const apWrite = /from\s*\(\s*["'](?:bills|payment_runs|payment_run_items)["']\s*\)[\s\S]{0,500}?\.(?:insert|update|upsert|delete)\s*\(/;
    assert.doesNotMatch(source, apWrite, file);
  }

  const hook = await readFile(path.join(root, "hooks/usePayables.ts"), "utf8");
  for (const key of ["legacy-bill-history", "legacy-payment-run-history"]) {
    assert.match(hook, new RegExp(`queryKey: \\["${key}", user\\?\\.id, orgId\\]`));
  }
  assert.match(hook, /\.eq\(\s*["']org_id["']\s*,\s*orgId\s*\)/);
  assert.doesNotMatch(hook, /totalAP|dueThisWeek|overdue|amount_paid/);

  const page = await readFile(path.join(root, "pages/Payables.tsx"), "utf8");
  assert.match(page, /Supplier-bill posting boundary/);
  assert.match(page, /Payment execution remains unavailable/);
  assert.doesNotMatch(page, /Total AP|Due This Week|3-Way Matched|Process Payment/);

  const billForm = await readFile(path.join(root, "components/forms/BillForm.tsx"), "utf8");
  assert.match(billForm, /rpc\(\s*["']post_supplier_bill["']/);
  assert.match(billForm, /p_tax:\s*0/);
  assert.match(billForm, /p_currency:\s*selectedEntity\.currency/);
  for (const argument of ["p_entity_id", "p_vendor_id", "p_bill_number", "p_issue_date", "p_due_date", "p_lines", "p_idempotency_key"]) {
    assert.match(billForm, new RegExp(`${argument}:`));
  }

  assert.match(hook, /queryKey:\s*\["posted-supplier-bill-history",\s*user\?\.id,\s*orgId\]/);
  assert.match(hook, /from\("bills"\)[\s\S]{0,420}?\.eq\("org_id",\s*orgId\)[\s\S]{0,180}?\.eq\("accounting_status",\s*"POSTED"\)/);
  assert.match(hook, /\.not\("journal_entry_id",\s*"is",\s*null\)/);

  const dashboard = await readFile(path.join(root, "pages/Index.tsx"), "utf8");
  assert.doesNotMatch(dashboard, /Total Payables|Total AP|Due Soon/);

  const types = await readFile(path.join(root, "integrations/supabase/types.ts"), "utf8");
  for (const table of ["bills", "bill_lines", "entity_supplier_bill_account_controls", "payment_run_items", "payment_runs"]) {
    const contract = new RegExp(`\\n      ${table}: \\{[\\s\\S]*?\\n        Insert: never\\n        Update: never`);
    assert.match(types, contract, `${table} must expose a read-only browser contract`);
  }
});

test("banking exposes only tenant-scoped non-secret metadata and no execution path", async () => {
  const bankTables = [
    "bank_accounts", "bank_transactions", "matching_rules", "bank_statement_imports",
    "positive_pay_checks", "bank_feed_connections", "bank_connections",
  ];
  for (const file of await sourceFiles(root)) {
    const source = await readFile(file, "utf8");
    const bankingWrite = new RegExp(`from\\s*\\(\\s*["'](?:${bankTables.join("|")})["']\\s*\\)[\\s\\S]{0,500}?\\.(?:insert|update|upsert|delete)\\s*\\(`);
    assert.doesNotMatch(source, bankingWrite, file);
    assert.doesNotMatch(source, /apply_matching_rules/, file);
  }

  const hook = await readFile(path.join(root, "hooks/useBanking.ts"), "utf8");
  for (const key of ["bank-account-metadata", "bank-transaction-metadata"]) {
    assert.match(hook, new RegExp(`queryKey: \\["${key}", user\\?\\.id, orgId\\]`));
  }
  assert.match(hook, /\.eq\(\s*["']org_id["']\s*,\s*orgId\s*\)/);
  assert.doesNotMatch(hook, /current_balance|account_number|routing_number|\bamount\b|matched_invoice|matched_bill/);

  const page = await readFile(path.join(root, "pages/Banking.tsx"), "utf8");
  assert.match(page, /Reconciliation and bank execution are unavailable/);
  assert.match(page, /No credentials, account numbers, routing numbers, or balances are exposed/);
  assert.doesNotMatch(page, /Auto-Match|Import Statement|Positive Pay|Total Cash Balance|Sync Transactions/);

  const prediction = await readFile(path.join(root, "components/analytics/PredictiveAnalytics.tsx"), "utf8");
  assert.match(prediction, /Financial predictions unavailable/);

  const types = await readFile(path.join(root, "integrations/supabase/types.ts"), "utf8");
  for (const table of ["bank_accounts", "bank_transactions"]) {
    const contract = new RegExp(`\\n      ${table}: \\{[\\s\\S]*?\\n        Insert: never\\n        Update: never`);
    assert.match(types, contract, `${table} must expose no browser write contract`);
  }
  for (const table of ["bank_connections", "bank_feed_connections", "bank_statement_imports", "matching_rules", "positive_pay_checks"]) {
    const hidden = new RegExp(`\\n      ${table}: \\{\\n        Row: never\\n        Insert: never\\n        Update: never`);
    assert.match(types, hidden, `${table} must be hidden from the browser contract`);
  }
});

test("unverified modules are unreachable from active routes and dashboard claims", async () => {
  const app = await readFile(path.join(root, "App.tsx"), "utf8");
  for (const route of ["crm", "inventory", "reports", "production", "controlling", "service", "currency", "tax", "hr", "metrics"]) {
    assert.match(app, new RegExp(`path="/${route}" element=\\{<ContainedModule`), route);
  }
  for (const page of ["CRM", "Inventory", "FinancialReports", "Production", "Controlling", "ServiceManagement", "Currency", "TaxManagement", "HRPayroll", "InvestorMetrics"]) {
    assert.doesNotMatch(app, new RegExp(`import ${page} from`), page);
  }

  const dashboard = await readFile(path.join(root, "pages/Index.tsx"), "utf8");
  assert.match(dashboard, /TAPAANO is not production-ready/);
  assert.doesNotMatch(dashboard, /useDashboardStats|Total Receivables|Total Payables|Bank Balance|RevenueChart|ARAgingChart/);

  const settings = await readFile(path.join(root, "pages/Settings.tsx"), "utf8");
  assert.doesNotMatch(settings, /TeamSettings|SecuritySettings|SOXControls|NextDayMigration|DecisionDeskTabsSettings/);

  const help = await readFile(path.join(root, "pages/Help.tsx"), "utf8");
  assert.match(help, /Agent River,[\s\S]*?are unavailable or unverified/);
  assert.doesNotMatch(help, /Creating invoices|Recording payments|Bank statements can be imported/);
});

test("accounting master data is read-only in browser code and generated contracts", async () => {
  for (const file of await sourceFiles(root)) {
    const source = await readFile(file, "utf8");
    const masterWrite = /from\s*\(\s*["'](?:accounts|entities|customers|vendors)["']\s*\)[\s\S]{0,500}?\.(?:insert|update|upsert|delete)\s*\(/;
    assert.doesNotMatch(source, masterWrite, file);
  }
  const types = await readFile(path.join(root, "integrations/supabase/types.ts"), "utf8");
  for (const table of ["accounts", "entities", "customers", "vendors"]) {
    const contract = new RegExp(`\\n      ${table}: \\{[\\s\\S]*?\\n        Insert: never\\n        Update: never`);
    assert.match(types, contract, `${table} must expose a read-only browser contract`);
  }
  for (const relative of ["components/forms/CustomerForm.tsx", "components/forms/VendorForm.tsx"]) {
    const source = await readFile(path.join(root, relative), "utf8");
    assert.match(source, /maintenance unavailable/);
  }
});
