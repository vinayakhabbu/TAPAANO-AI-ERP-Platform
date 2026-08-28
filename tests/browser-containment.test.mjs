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

test("browser invokes only the controlled member-invitation Edge boundary", async () => {
  const allowedFile = path.join(root, "hooks/useIdentityAdministration.ts");
  for (const file of await sourceFiles(root)) {
    const source = await readFile(file, "utf8");
    if (file === allowedFile) {
      const invocations = [...source.matchAll(/functions\s*\.\s*invoke\s*\(\s*["']([^"']+)["']/g)];
      assert.deepEqual(invocations.map((match) => match[1]), ["invite-member"]);
      assert.doesNotMatch(source, /functions\s*\.\s*invoke\s*\(\s*(?!["']invite-member["'])/, file);
    } else {
      assert.doesNotMatch(source, /functions\s*\.\s*invoke\s*\(/, file);
    }
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

  for (const file of await sourceFiles(root)) {
    const source = await readFile(file, "utf8");
    const correctionWrite = /from\s*\(\s*["']customer_receipt_corrections["']\s*\)[^;]{0,500}?\.(?:insert|update|upsert|delete)\s*\(/;
    assert.doesNotMatch(source, correctionWrite, file);
  }
  const receiptCorrectionForm = await readFile(path.join(root, "components/forms/ReceiptCorrectionForm.tsx"), "utf8");
  assert.match(receiptCorrectionForm, /rpc\(\s*["']post_customer_receipt_correction["']/);
  for (const argument of ["p_receipt_id", "p_correction_number", "p_correction_date", "p_reason", "p_idempotency_key"]) {
    assert.match(receiptCorrectionForm, new RegExp(`${argument}:`));
  }
  assert.doesNotMatch(receiptCorrectionForm, /p_(?:amount|currency|account_id):/);
  const receiptCorrectionContract = /\n      customer_receipt_corrections: \{[\s\S]*?\n        Insert: never\n        Update: never/;
  assert.match(types, receiptCorrectionContract);

  for (const file of await sourceFiles(root)) {
    const source = await readFile(file, "utf8");
    const replacementWrite = /from\s*\(\s*["']customer_receipt_replacements["']\s*\)[^;]{0,500}?\.(?:insert|update|upsert|delete)\s*\(/;
    assert.doesNotMatch(source, replacementWrite, file);
  }
  const receiptReplacementForm = await readFile(path.join(root, "components/forms/ReceiptReplacementForm.tsx"), "utf8");
  assert.match(receiptReplacementForm, /rpc\(\s*["']post_customer_receipt_replacement["']/);
  for (const argument of ["p_correction_id", "p_replacement_number", "p_replacement_date", "p_reference", "p_idempotency_key"]) {
    assert.match(receiptReplacementForm, new RegExp(`${argument}:`));
  }
  assert.doesNotMatch(receiptReplacementForm, /p_(?:amount|currency|account_id):/);
  const receiptReplacementContract = /\n      customer_receipt_replacements: \{[\s\S]*?\n        Insert: never\n        Update: never/;
  assert.match(types, receiptReplacementContract);
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
  assert.match(hook, /queryKey:\s*\["posted-customer-receipt-correction-history",\s*user\?\.id,\s*orgId\]/);
  assert.match(hook, /from\("customer_receipt_corrections"\)[\s\S]{0,340}?\.eq\("org_id",\s*orgId\)/);
  assert.match(hook, /queryKey:\s*\["posted-customer-receipt-replacement-history",\s*user\?\.id,\s*orgId\]/);
  assert.match(hook, /from\("customer_receipt_replacements"\)[\s\S]{0,420}?\.eq\("org_id",\s*orgId\)/);

  const page = await readFile(path.join(root, "pages/Receivables.tsx"), "utf8");
  assert.match(page, /Full receipts recorded/);
  assert.match(page, /not bank-reconciled/i);
  assert.match(page, /Receipt correction posted/);
  assert.match(page, /Replacement receipt recorded/);
  assert.match(page, /not a refund/i);
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

test("browser identity is sign-in-only and cannot write identity tables directly", async () => {
  for (const file of await sourceFiles(root)) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /auth\s*\.\s*signUp\s*\(/, file);
    const identityWrite = /from\s*\(\s*["'](?:profiles|user_roles|identity_role_changes|identity_invitations)["']\s*\)[^;]{0,500}?\.(?:insert|update|upsert|delete)\s*\(/;
    assert.doesNotMatch(source, identityWrite, file);
  }

  const auth = await readFile(path.join(root, "pages/Auth.tsx"), "utf8");
  assert.match(auth, /Self-service registration is unavailable/);
  assert.doesNotMatch(auth, /Create Account|companyName|displayName/);

  const types = await readFile(path.join(root, "integrations/supabase/types.ts"), "utf8");
  for (const table of ["profiles", "user_roles", "identity_role_changes"]) {
    const contract = new RegExp(`\\n      ${table}: \\{[\\s\\S]*?\\n        Insert: never\\n        Update: never`);
    assert.match(types, contract, `${table} must expose no browser write contract`);
  }

  const administration = await readFile(path.join(root, "hooks/useIdentityAdministration.ts"), "utf8");
  assert.match(administration, /rpc\("list_tenant_members"\)/);
  assert.match(administration, /rpc\("change_tenant_member_role"/);
  assert.match(administration, /functions\.invoke\("invite-member"/);
  assert.match(administration, /rpc\("list_tenant_invitations"\)/);
  assert.match(administration, /rpc\("cancel_tenant_invitation"/);
  assert.match(administration, /\.from\("identity_role_changes"\)[\s\S]*?\.eq\("org_id", orgId\)/);
  assert.doesNotMatch(administration, /p_org_id|p_old_role|p_actor_id|p_token_hash|create_tenant_invitation/);
  assert.doesNotMatch(types, /token_hash|create_tenant_invitation/);

  const settings = await readFile(path.join(root, "pages/Settings.tsx"), "utf8");
  assert.match(settings, /RoleAdministrationSettings/);
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
  assert.match(page, /Bank execution[\s\S]{0,180}remain unavailable/);
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

  for (const file of await sourceFiles(root)) {
    const source = await readFile(file, "utf8");
    const supplierCreditWrite = /from\s*\(\s*["']supplier_bill_credit_note(?:s|_lines)["']\s*\)[^;]{0,500}?\.(?:insert|update|upsert|delete)\s*\(/;
    assert.doesNotMatch(source, supplierCreditWrite, file);
  }
  const creditForm = await readFile(path.join(root, "components/forms/SupplierBillCreditForm.tsx"), "utf8");
  assert.match(creditForm, /rpc\(\s*["']post_supplier_bill_credit["']/);
  for (const argument of ["p_bill_id", "p_credit_note_number", "p_credit_date", "p_reason", "p_idempotency_key"]) {
    assert.match(creditForm, new RegExp(`${argument}:`));
  }
  assert.doesNotMatch(creditForm, /p_(?:amount|total|lines|account_id):/);
  assert.match(hook, /queryKey:\s*\["posted-supplier-credit-history",\s*user\?\.id,\s*orgId\]/);
  assert.match(hook, /from\("supplier_bill_credit_notes"\)[\s\S]{0,320}?\.eq\("org_id",\s*orgId\)/);
  assert.match(page, /Full supplier credit posted/);
  for (const table of ["supplier_bill_credit_notes", "supplier_bill_credit_note_lines"]) {
    const contract = new RegExp(`\\n      ${table}: \\{[\\s\\S]*?\\n        Insert: never\\n        Update: never`);
    assert.match(types, contract, `${table} must expose a read-only browser contract`);
  }

  for (const file of await sourceFiles(root)) {
    const source = await readFile(file, "utf8");
    const supplierPaymentWrite = /from\s*\(\s*["'](?:supplier_payments|entity_supplier_payment_controls)["']\s*\)[^;]{0,500}?\.(?:insert|update|upsert|delete)\s*\(/;
    assert.doesNotMatch(source, supplierPaymentWrite, file);
  }
  const paymentForm = await readFile(path.join(root, "components/forms/SupplierPaymentForm.tsx"), "utf8");
  assert.match(paymentForm, /rpc\(\s*["']post_supplier_payment["']/);
  for (const argument of ["p_bill_id", "p_payment_number", "p_payment_date", "p_currency", "p_reference", "p_idempotency_key"]) {
    assert.match(paymentForm, new RegExp(`${argument}:`));
  }
  assert.doesNotMatch(paymentForm, /p_amount:/);
  assert.match(hook, /queryKey:\s*\["posted-supplier-payment-history",\s*user\?\.id,\s*orgId\]/);
  assert.match(hook, /from\("supplier_payments"\)[\s\S]{0,320}?\.eq\("org_id",\s*orgId\)/);
  assert.match(page, /Full supplier payment recorded/);
  assert.match(page, /not bank-reconciled/i);
  for (const table of ["supplier_payments", "entity_supplier_payment_controls"]) {
    const contract = new RegExp(`\\n      ${table}: \\{[\\s\\S]*?\\n        Insert: never\\n        Update: never`);
    assert.match(types, contract, `${table} must expose a read-only browser contract`);
  }

  for (const file of await sourceFiles(root)) {
    const source = await readFile(file, "utf8");
    const correctionWrite = /from\s*\(\s*["']supplier_payment_corrections["']\s*\)[^;]{0,500}?\.(?:insert|update|upsert|delete)\s*\(/;
    assert.doesNotMatch(source, correctionWrite, file);
  }
  const paymentCorrectionForm = await readFile(path.join(root, "components/forms/SupplierPaymentCorrectionForm.tsx"), "utf8");
  assert.match(paymentCorrectionForm, /rpc\(\s*["']post_supplier_payment_correction["']/);
  for (const argument of ["p_payment_id", "p_correction_number", "p_correction_date", "p_reason", "p_idempotency_key"]) {
    assert.match(paymentCorrectionForm, new RegExp(`${argument}:`));
  }
  assert.doesNotMatch(paymentCorrectionForm, /p_(?:amount|currency|account_id):/);
  assert.match(hook, /queryKey:\s*\["posted-supplier-payment-correction-history",\s*user\?\.id,\s*orgId\]/);
  assert.match(hook, /from\("supplier_payment_corrections"\)[\s\S]{0,340}?\.eq\("org_id",\s*orgId\)/);
  assert.match(page, /Supplier payment correction posted/);
  assert.match(page, /not a refund/i);
  const paymentCorrectionContract = /\n      supplier_payment_corrections: \{[\s\S]*?\n        Insert: never\n        Update: never/;
  assert.match(types, paymentCorrectionContract);

  for (const file of await sourceFiles(root)) {
    const source = await readFile(file, "utf8");
    const replacementWrite = /from\s*\(\s*["']supplier_payment_replacements["']\s*\)[^;]{0,500}?\.(?:insert|update|upsert|delete)\s*\(/;
    assert.doesNotMatch(source, replacementWrite, file);
  }
  const paymentReplacementForm = await readFile(path.join(root, "components/forms/SupplierPaymentReplacementForm.tsx"), "utf8");
  assert.match(paymentReplacementForm, /rpc\(\s*["']post_supplier_payment_replacement["']/);
  for (const argument of ["p_correction_id", "p_replacement_number", "p_replacement_date", "p_reference", "p_idempotency_key"]) {
    assert.match(paymentReplacementForm, new RegExp(`${argument}:`));
  }
  assert.doesNotMatch(paymentReplacementForm, /p_(?:amount|currency|account_id):/);
  assert.match(hook, /queryKey:\s*\["posted-supplier-payment-replacement-history",\s*user\?\.id,\s*orgId\]/);
  assert.match(hook, /from\("supplier_payment_replacements"\)[\s\S]{0,420}?\.eq\("org_id",\s*orgId\)/);
  assert.match(page, /Replacement supplier payment recorded/);
  const paymentReplacementContract = /\n      supplier_payment_replacements: \{[\s\S]*?\n        Insert: never\n        Update: never/;
  assert.match(types, paymentReplacementContract);
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
  assert.match(settings, /RoleAdministrationSettings/);
  assert.match(settings, /AccountMaintenanceSettings/);

  const help = await readFile(path.join(root, "pages/Help.tsx"), "utf8");
  assert.match(help, /Agent River,[\s\S]*?are unavailable or unverified/);
  assert.doesNotMatch(help, /Creating invoices|Recording payments|Bank statements can be imported/);
});

test("accounting masters remain physically read-only and accounts use only controlled RPCs", async () => {
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
  const maintenance = await readFile(path.join(root, "hooks/useAccountMaintenance.ts"), "utf8");
  for (const routine of [
    "create_tenant_account", "rename_tenant_account", "retire_tenant_account",
    "list_tenant_account_events",
  ]) {
    assert.match(maintenance, new RegExp(`rpc\\(\\"${routine}\\"`));
  }
  assert.match(maintenance, /\.from\("accounts"\)[\s\S]*?\.eq\("org_id", orgId\)/);
  assert.doesNotMatch(maintenance, /p_org_id|p_actor_id|\.from\("account_master_events"\)/);
  assert.doesNotMatch(types, /account_master_events:/);

  const component = await readFile(path.join(root, "components/settings/AccountMaintenanceSettings.tsx"), "utf8");
  assert.match(component, /Account code, type, and parent are immutable after creation/);
  assert.match(component, /Retirement is one-way/);
});
