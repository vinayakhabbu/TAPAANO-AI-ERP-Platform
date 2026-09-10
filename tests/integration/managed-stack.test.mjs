import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import pg from "pg";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { loadTypescript } from "../helpers/load-typescript.mjs";
import { qualifySubscriptionLifecycle } from "./subscription-lifecycle-workflow.mjs";
import { qualifyCustomerAdjustments } from "./customer-adjustment-workflow.mjs";
import { qualifyContractWorkflow } from "./contract-workflow.mjs";
import { qualifyProviderWorkflow } from "./provider-workflow.mjs";
import { qualifyCloseWorkflow } from "./close-workflow.mjs";
import { qualifyStatementWorkflow } from "./statement-workflow.mjs";
import { qualifyGroupWorkflow } from "./group-workflow.mjs";
import { qualifyCashWorkflow } from "./cash-workflow.mjs";
import { rehearsePopulatedRecovery } from "../helpers/populated-recovery.mjs";

const { JOURNAL_HISTORY_SELECT } = await loadTypescript("../../src/lib/journalQuery.ts");
const { POSTED_INVOICE_SELECT, POSTED_BILL_SELECT, LEGACY_BILL_SELECT } = await loadTypescript("../../src/lib/documentQueries.ts");
const { readAllRows } = await loadTypescript("../../src/lib/readAllRows.ts");
const { parseTrialBalance } = await loadTypescript("../../src/lib/trialBalance.ts");
const { parseAccountLedger, accountLedgerCsv, deriveLedgerStatements, parsePostedJournals } = await loadTypescript("../../src/lib/financeReports.ts");
const { parseAgingReport, agingCsv } = await loadTypescript("../../src/lib/subledgerAging.ts");

function requireLoopback(value) {
  const url = new URL(value);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname), "Integration tests require a disposable loopback stack");
  return value;
}

async function rpc(client, name, args) {
  const { data, error } = await client.rpc(name, args);
  assert.equal(error, null, name + ": " + (error?.message ?? ""));
  return data;
}

// Never accepts remote URLs or credentials from environment variables. Bootstrap
// creates synthetic identities only in the CLI's disposable local database.
// Normal application calls below run with actual authenticated JWTs and guards.
test("full migration stack supports authenticated finance reads and the browser", { timeout: 480000 }, async (t) => {
  const status = JSON.parse(execFileSync("supabase", ["status", "--output", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  const api = requireLoopback(status.API_URL);
  const dbUrl = requireLoopback(status.DB_URL);
  assert.ok(status.ANON_KEY, "Local anon key is required");
  let db = new pg.Client({ connectionString: dbUrl });
  await db.connect();
  let browser, server;
  const ids = Object.fromEntries(["orgA", "orgB", "adminA", "adminB", "reviewer", "usd", "eur", "ar", "revenue", "cash", "ap", "expense", "customer", "vendor"].map((key) => [key, randomUUID()]));
  const emailA = "integration-a@tapaano.test", emailB = "integration-b@tapaano.test", emailReviewer = "integration-reviewer@tapaano.test";
  const password = "Synthetic-local-test-" + randomUUID();
  try {
    assert.equal((await db.query("SELECT count(*)::int AS count FROM public.organizations")).rows[0].count, 0,
      "Integration fixture requires an empty disposable stack");
    await db.query("BEGIN");
    // Local test bootstrap only: public tenant provisioning is intentionally closed.
    await db.query("SET LOCAL session_replication_role = replica");
    await db.query("INSERT INTO public.organizations(id,name) VALUES($1,'Synthetic A'),($2,'Synthetic B')", [ids.orgA, ids.orgB]);
    for (const [id, org, email] of [[ids.adminA, ids.orgA, emailA], [ids.adminB, ids.orgB, emailB], [ids.reviewer,ids.orgA,emailReviewer]]) {
      await db.query(`INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
        raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change_token_new,email_change)
        VALUES('00000000-0000-0000-0000-000000000000',$1,'authenticated','authenticated',$2,
          extensions.crypt($3,extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','')`, [id, email, password]);
      await db.query(`INSERT INTO auth.identities(id,provider_id,user_id,identity_data,provider,created_at,updated_at)
        VALUES($1,$2::text,$2::uuid,jsonb_build_object('sub',$2::text,'email',$3::text),'email',now(),now())`, [randomUUID(), id, email]);
      await db.query("INSERT INTO public.profiles(id,org_id,display_name,role) VALUES($1,$2,'Synthetic administrator','admin')", [id, org]);
      await db.query("INSERT INTO public.user_roles(user_id,org_id,role) VALUES($1,$2,'admin')", [id, org]);
    }
    await db.query("INSERT INTO public.entities(id,org_id,name,currency) VALUES($1,$3,'USD entity','USD'),($2,$3,'EUR entity','EUR')", [ids.usd, ids.eur, ids.orgA]);
    await db.query("INSERT INTO public.accounts(id,org_id,code,name,account_type) VALUES($1,$3,'1100','AR','asset'),($2,$3,'4000','Revenue','revenue')", [ids.ar, ids.revenue, ids.orgA]);
    await db.query("INSERT INTO public.accounts(id,org_id,code,name,account_type) VALUES($1,$4,'1000','Cash','asset'),($2,$4,'2000','AP','liability'),($3,$4,'5000','Expense','expense')", [ids.cash, ids.ap, ids.expense, ids.orgA]);
    await db.query("INSERT INTO public.customers(id,org_id,name) VALUES($1,$2,'Synthetic buyer')", [ids.customer, ids.orgA]);
    await db.query("INSERT INTO public.vendors(id,org_id,name) VALUES($1,$2,'Synthetic supplier')", [ids.vendor, ids.orgA]);
    await db.query("INSERT INTO public.customers(org_id,name) SELECT $1,'Synthetic customer ' || i FROM generate_series(1,1005) i", [ids.orgA]);
    await db.query("INSERT INTO public.customers(org_id,name) VALUES($1,'Other tenant buyer')", [ids.orgB]);
    await db.query("COMMIT");
    await db.query("NOTIFY pgrst, 'reload schema'");
    await delay(1500);
    const options = { auth: { persistSession: false, autoRefreshToken: false } };
    const clientA = createClient(api, status.ANON_KEY, options);
    const clientB = createClient(api, status.ANON_KEY, options);
    const clientReviewer = createClient(api,status.ANON_KEY,options);
    for (const [client, email] of [[clientA, emailA], [clientB, emailB], [clientReviewer,emailReviewer]]) {
      const { error } = await client.auth.signInWithPassword({ email, password });
      assert.equal(error, null, "Local Auth login must succeed: " + (error?.message ?? ""));
    }
    for (const entity of [ids.usd, ids.eur]) {
      await rpc(clientA, "create_accounting_period", { p_entity_id: entity, p_period_start: "2026-09-01", p_period_end: "2026-09-30", p_idempotency_key: "period-" + entity });
      await rpc(clientA, "configure_entity_invoice_accounts", { p_entity_id: entity, p_ar_account_id: ids.ar, p_revenue_account_id: ids.revenue, p_idempotency_key: "controls-" + entity });
    }
    const invoice = (entity, currency, number) => ({ p_entity_id: entity, p_customer_id: ids.customer,
      p_invoice_number: number, p_issue_date: "2026-09-06", p_due_date: "2026-09-20", p_currency: currency,
      p_tax: 0, p_notes: null, p_lines: [{ description: "Synthetic service", quantity: "1", unit_price: "100" }], p_idempotency_key: number });
    const usdPayload = invoice(ids.usd, "USD", "INTEGRATION-USD");
    let usdInvoice;
    await t.test("concurrent independent API requests create one idempotent invoice", async () => {
      const secondSession = createClient(api, status.ANON_KEY, options);
      const { error } = await secondSession.auth.signInWithPassword({ email: emailA, password });
      assert.equal(error, null);
      const posted = await Promise.all([rpc(clientA, "post_customer_invoice", usdPayload), rpc(secondSession, "post_customer_invoice", usdPayload)]);
      assert.equal(posted[0], posted[1]);
      usdInvoice = posted[0];
      const { rows: [row] } = await db.query(`SELECT count(DISTINCT i.id)::int AS invoices, sum(l.debit)::text AS debit, sum(l.credit)::text AS credit
        FROM public.invoices i JOIN public.journal_lines l ON l.journal_entry_id=i.journal_entry_id WHERE i.invoice_number=$1`, [usdPayload.p_invoice_number]);
      assert.equal(row.invoices, 1); assert.equal(row.debit, "100.00"); assert.equal(row.credit, "100.00");
    });
    const eurInvoice = await rpc(clientA, "post_customer_invoice", invoice(ids.eur, "EUR", "INTEGRATION-EUR"));
    await t.test("the exact browser ledger projection succeeds with contained-table grants", async () => {
      const { data, error } = await clientA.from("journal_entries").select(JOURNAL_HISTORY_SELECT).eq("org_id", ids.orgA).limit(20);
      assert.equal(error, null, error?.message); assert.equal(data.length, 2);
      const blocked = await clientA.from("cost_centers").select("id");
      assert.ok(blocked.error, "Cost-center permissions must remain contained");
    });
    await t.test("API histories exceed the row cap and summary amounts remain separated", async () => {
      const customers = await readAllRows((from, to) => clientA.from("customers").select("id", { count: "exact" }).eq("org_id", ids.orgA).order("id").range(from, to));
      assert.equal(customers.length, 1006);
      const summary = await rpc(clientA, "get_tenant_operational_summary");
      assert.equal(summary.customerCount, 1006); assert.equal(summary.invoiceCount, 2);
      assert.deepEqual(summary.postedInvoiceTotals, [{ currency: "EUR", total: "100.00" }, { currency: "USD", total: "100.00" }]);
    });
    await t.test("real JWTs enforce cross-tenant reads and writes", async () => {
      const { data, error } = await clientB.from("invoices").select("id").eq("org_id", ids.orgA);
      assert.equal(error, null); assert.deepEqual(data, []);
      assert.ok((await clientB.rpc("post_customer_invoice", usdPayload)).error);
      assert.equal((await rpc(clientB, "get_tenant_operational_summary")).invoiceCount, 0);
      await rpc(clientA, "record_client_diagnostic", { p_event_code: "render_failed", p_release_sha: "unversioned" });
      assert.equal((await clientB.from("client_diagnostic_buckets").select("event_code")).data.length, 0);
    });
    await t.test("authenticated commits validate AR/AP receipts, credits, corrections, and replacements", async () => {
      await rpc(clientA, "configure_entity_customer_receipt_accounts", { p_entity_id: ids.usd, p_cash_account_id: ids.cash, p_idempotency_key: "receipt-controls" });
      const receipt = await rpc(clientA, "post_customer_receipt", { p_invoice_id: usdInvoice, p_receipt_number: "RECEIPT-USD", p_receipt_date: "2026-09-07", p_currency: "USD", p_reference: "Synthetic reference", p_idempotency_key: "receipt-usd" });
      const receiptCorrection = await rpc(clientA, "post_customer_receipt_correction", { p_receipt_id: receipt, p_correction_number: "RECEIPT-CORRECTION", p_correction_date: "2026-09-08", p_reason: "Synthetic correction", p_idempotency_key: "receipt-correction" });
      await rpc(clientA, "post_customer_receipt_replacement", { p_correction_id: receiptCorrection, p_replacement_number: "RECEIPT-REPLACEMENT", p_replacement_date: "2026-09-09", p_reference: "Synthetic reference", p_idempotency_key: "receipt-replacement" });
      await rpc(clientA, "post_customer_credit_note", { p_invoice_id: eurInvoice, p_credit_note_number: "CREDIT-EUR", p_credit_date: "2026-09-07", p_reason: "Synthetic credit", p_idempotency_key: "credit-eur" });

      await rpc(clientA, "configure_entity_supplier_bill_accounts", { p_entity_id: ids.usd, p_ap_account_id: ids.ap, p_expense_account_id: ids.expense, p_idempotency_key: "bill-controls" });
      await rpc(clientA, "configure_entity_supplier_payment_accounts", { p_entity_id: ids.usd, p_cash_account_id: ids.cash, p_idempotency_key: "payment-controls" });
      const billPayload = (number) => ({ p_entity_id: ids.usd, p_vendor_id: ids.vendor, p_bill_number: number, p_issue_date: "2026-09-06", p_due_date: "2026-09-20", p_currency: "USD", p_tax: 0, p_notes: null, p_lines: [{ description: "Synthetic purchase", quantity: "1", unit_price: "100" }], p_idempotency_key: number });
      const bill = await rpc(clientA, "post_supplier_bill", billPayload("BILL-USD"));
      const payment = await rpc(clientA, "post_supplier_payment", { p_bill_id: bill, p_payment_number: "PAYMENT-USD", p_payment_date: "2026-09-07", p_currency: "USD", p_reference: "Synthetic reference", p_idempotency_key: "payment-usd" });
      const paymentCorrection = await rpc(clientA, "post_supplier_payment_correction", { p_payment_id: payment, p_correction_number: "PAYMENT-CORRECTION", p_correction_date: "2026-09-08", p_reason: "Synthetic correction", p_idempotency_key: "payment-correction" });
      await rpc(clientA, "post_supplier_payment_replacement", { p_correction_id: paymentCorrection, p_replacement_number: "PAYMENT-REPLACEMENT", p_replacement_date: "2026-09-09", p_reference: "Synthetic reference", p_idempotency_key: "payment-replacement" });
      const creditedBill = await rpc(clientA, "post_supplier_bill", billPayload("BILL-CREDIT"));
      await rpc(clientA, "post_supplier_bill_credit", { p_bill_id: creditedBill, p_credit_note_number: "SUPPLIER-CREDIT", p_credit_date: "2026-09-07", p_reason: "Synthetic credit", p_idempotency_key: "supplier-credit" });
      const { rows } = await db.query(`SELECT e.id FROM public.journal_entries e LEFT JOIN public.journal_lines l ON l.journal_entry_id=e.id
        WHERE e.org_id=$1 AND e.status='posted' GROUP BY e.id HAVING count(l.id)<2 OR sum(l.debit)<>sum(l.credit)`, [ids.orgA]);
      assert.deepEqual(rows, [], "Every committed document must have a balanced journal");
      const summary = await rpc(clientA, "get_tenant_operational_summary");
      assert.equal(summary.invoiceCount, 2); assert.equal(summary.postedBillCount, 2);
      for (const key of ["fullReceiptCount", "receiptCorrectionCount", "receiptReplacementCount", "fullCreditCount", "postedPaymentCount", "paymentCorrectionCount", "paymentReplacementCount", "postedCreditCount"]) {
        assert.equal(summary[key], 1, key + " must reflect the committed document");
      }
      assert.deepEqual(summary.postedInvoiceTotals, [{ currency: "EUR", total: "100.00" }, { currency: "USD", total: "100.00" }]);
    });
    await t.test("the browser invoice and bill projections resolve their customer/vendor joins", async () => {
      for (const [table, projection, party, name] of [["invoices", POSTED_INVOICE_SELECT, "customers", "Synthetic buyer"], ["bills", POSTED_BILL_SELECT, "vendors", "Synthetic supplier"], ["bills", LEGACY_BILL_SELECT, "vendors", "Synthetic supplier"]]) {
        const { data, error } = await clientA.from(table).select(projection).eq("org_id", ids.orgA);
        assert.equal(error, null, table + ": " + (error?.message ?? ""));
        assert.equal(data.length, 2);
        assert.ok(data.every(row => row[party]?.name === name));
      }
    });
    await t.test("trial balance reconciles real AR/AP postings, offsets, date boundaries, and tenant isolation", async () => {
      const args = { p_entity_id: ids.usd, p_from_date: "2026-09-01", p_to_date: "2026-09-30" };
      const report = parseTrialBalance(await rpc(clientA, "get_entity_trial_balance", args), { entityId: ids.usd, fromDate: args.p_from_date, toDate: args.p_to_date });
      assert.equal(report.journalCount, 10);
      assert.deepEqual(report.totals, { openingDebit: "0.00", openingCredit: "0.00", periodDebit: "1000.00", periodCredit: "1000.00", closingDebit: "100.00", closingCredit: "100.00" });
      const later = await rpc(clientA, "get_entity_trial_balance", { ...args, p_from_date: "2026-09-07" });
      assert.equal(later.totals.openingDebit, "300.00"); assert.equal(later.totals.periodDebit, "700.00"); assert.equal(later.totals.closingDebit, "100.00");
      const eur = await rpc(clientA, "get_entity_trial_balance", { ...args, p_entity_id: ids.eur });
      assert.equal(eur.currency, "EUR"); assert.equal(eur.journalCount, 2); assert.equal(eur.totals.closingDebit, "0.00");
      assert.deepEqual((await rpc(clientA, "get_entity_trial_balance", { ...args, p_to_date: "2026-09-05" })).rows, []);
      const denied = await clientB.rpc("get_entity_trial_balance", args);
      assert.ok(denied.error); assert.equal(denied.error.code, "42501");
    });
    await t.test("AR/AP aging reconciles dated source history through the real tenant API", async () => {
      for (const kind of ["ar", "ap"]) {
        for (const [day, total] of [[6, kind === "ar" ? "100.00" : "200.00"], [7, "0.00"], [8, "100.00"], [9, "0.00"]]) {
          const request = { entityId: ids.usd, kind, asOf: "2026-09-0" + day, offset: 0, pageSize: 100 };
          const data = await rpc(clientA, "get_subledger_aging", { p_entity_id: ids.usd, p_kind: kind, p_as_of: request.asOf });
          const report = parseAgingReport(data, request);
          assert.equal(report.outstanding, total); assert.equal(report.ledgerBalance, total); assert.equal(report.reconciled, true);
          assert.ok(agingCsv([report]).includes('"TOTAL OUTSTANDING","' + total + '"'));
        }
      }
      const foreign = await clientB.rpc("get_subledger_aging", { p_entity_id: ids.usd, p_kind: "ar", p_as_of: "2026-09-08" });
      assert.equal(foreign.error?.code, "42501");
    });
    await t.test("account drilldown and ledger statements reconcile real posted journals across pages", async () => {
      const scope = { entityId: ids.usd, fromDate: "2026-09-01", toDate: "2026-09-30" };
      const report = parseTrialBalance(await rpc(clientA, "get_entity_trial_balance", { p_entity_id: scope.entityId, p_from_date: scope.fromDate, p_to_date: scope.toDate }), scope);
      const statements = deriveLedgerStatements(report);
      assert.equal(statements.revenue.total, "100.00"); assert.equal(statements.expenses.total, "100.00"); assert.equal(statements.netIncome, "0.00");
      assert.equal(statements.assets.total, "0.00"); assert.equal(statements.liabilitiesAndEquity, "0.00");
      const pages = [];
      for (let offset = 0; offset < 6; offset += 2) {
        const request = { ...scope, accountId: ids.cash, revision: report.revision, pageSize: 2, offset };
        const data = await rpc(clientA, "get_account_ledger", { p_entity_id: ids.usd, p_account_id: ids.cash, p_from_date: scope.fromDate, p_to_date: scope.toDate, p_page_size: 2, p_offset: offset, p_expected_revision: report.revision });
        const page = parseAccountLedger(data, request); assert.equal(page.lineCount, 6); pages.push(page);
      }
      assert.ok(accountLedgerCsv(pages).includes('"TOTAL","","","","","300.00","300.00","0.00"'));
      const foreign = await clientB.rpc("get_account_ledger", { p_entity_id: ids.usd, p_account_id: ids.cash, p_from_date: scope.fromDate, p_to_date: scope.toDate });
      assert.equal(foreign.error?.code, "42501");
      const recent = parsePostedJournals(await rpc(clientA, "get_recent_posted_journals"));
      assert.equal(recent.length, 12); assert.deepEqual(new Set(recent.map(entry => entry.currency)), new Set(["USD", "EUR"]));
      assert.deepEqual(await rpc(clientB, "get_recent_posted_journals"), []);
    });
    await t.test("independent API sessions retry journals and period changes safely, including a posting-close race", async () => {
      const second = createClient(api, status.ANON_KEY, options);
      assert.equal((await second.auth.signInWithPassword({ email: emailA, password })).error, null);
      const period = await rpc(clientA, "create_accounting_period", { p_entity_id: ids.usd, p_period_start: "2026-10-01", p_period_end: "2026-10-31", p_idempotency_key: "october" });
      const journal = { p_entity_id: ids.usd, p_entry_number: "MANUAL-RETRY", p_entry_date: "2026-10-05", p_memo: "Manual concurrency fixture", p_lines: [{ account_id: ids.cash, debit: "20.25", credit: "0.00" }, { account_id: ids.revenue, debit: "0.00", credit: "20.25" }], p_idempotency_key: "manual-concurrent" };
      const journals = await Promise.all([rpc(clientA, "post_manual_journal", journal), rpc(second, "post_manual_journal", journal)]);
      assert.equal(journals[0], journals[1]);
      const transition = { p_period_id: period, p_expected_version: 1, p_to_status: "SOFT_CLOSED", p_reason: "Reviewed October", p_idempotency_key: "soft-october" };
      const transitions = await Promise.all([rpc(clientA, "change_accounting_period", transition), rpc(second, "change_accounting_period", transition)]);
      assert.equal(transitions[0], transitions[1]);
      assert.equal((await clientA.rpc("change_accounting_period", { ...transition, p_to_status: "OPEN", p_idempotency_key: "stale" })).error?.code, "40001");
      assert.equal((await clientB.rpc("change_accounting_period", transition)).error?.code, "42501");
      assert.equal((await clientA.rpc("transition_accounting_period", { p_period_id: period, p_to_status: "OPEN", p_reason: "Bypass version" })).error?.code, "42501");
      await rpc(clientA, "change_accounting_period", { ...transition, p_expected_version: 2, p_to_status: "OPEN", p_idempotency_key: "reopen-october" });
      const raceJournal = { ...journal, p_entry_number: "POST-CLOSE-RACE", p_idempotency_key: "post-close-race" };
      const [posting, closing] = await Promise.all([clientA.rpc("post_manual_journal", raceJournal), second.rpc("change_accounting_period", { ...transition, p_expected_version: 3, p_idempotency_key: "race-close" })]);
      assert.equal(closing.error, null);
      if (posting.error) assert.match(posting.error.message, /OPEN accounting period/);
      const count = (await db.query("SELECT count(*)::int AS n FROM public.journal_entries WHERE entry_number='POST-CLOSE-RACE'")).rows[0].n;
      assert.equal(count, posting.error ? 0 : 1);
      const hard = { ...transition, p_expected_version: 4, p_to_status: "HARD_CLOSED", p_idempotency_key: "hard-october" };
      assert.equal(await rpc(clientA, "change_accounting_period", hard), period); assert.equal(await rpc(second, "change_accounting_period", hard), period);
      assert.equal((await db.query("SELECT count(*)::int AS n FROM public.accounting_period_events WHERE accounting_period_id=$1", [period])).rows[0].n, 5);
      assert.ok((await clientA.rpc("post_manual_journal", { ...journal, p_entry_number: "CLOSED-BLOCKED", p_idempotency_key: "closed-blocked" })).error);
      assert.equal(await rpc(clientA, "post_manual_journal", journal), journals[0], "original request remains safely retryable after close");
    });
    await t.test("browser loads finance histories, statement drilldown, journal entry and period controls", async () => {
      server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "4173", "--strictPort"], {
        env: { ...process.env, VITE_SUPABASE_URL: api, VITE_SUPABASE_PUBLISHABLE_KEY: status.ANON_KEY }, stdio: "ignore",
      });
      const origin = "http://127.0.0.1:4173";
      let ready = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        if (server.exitCode !== null) throw new Error("Test app exited before startup");
        try { if ((await fetch(origin)).ok) { ready = true; break; } } catch { /* starting */ }
        await delay(200);
      }
      assert.ok(ready, "Local browser app must start");
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      const failures = [];
      page.on("pageerror", (error) => failures.push(error.message));
      await page.goto(origin + "/auth");
      await page.getByLabel("Email", { exact: true }).fill(emailA);
      await page.getByLabel("Password", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Sign In", exact: true }).click();
      await page.getByText("Journal-linked posted invoices", { exact: true }).waitFor();
      await page.goto(origin + "/gl");
      await page.getByRole("tab", { name: /Journal Entries/ }).click();
      await page.getByText("INTEGRATION-USD", { exact: false }).first().waitFor();
      assert.equal(await page.getByText("Journal history is unavailable", { exact: false }).count(), 0);
      await page.goto(origin + "/ap");
      await page.getByText("BILL-USD", { exact: true }).waitFor();
      await page.getByText("BILL-CREDIT", { exact: true }).waitFor();
      await page.goto(origin + "/ar");
      await page.getByText("INTEGRATION-USD", { exact: true }).waitFor();
      await page.getByText("INTEGRATION-EUR", { exact: true }).waitFor();
      await page.getByText("USD 100.00", { exact: true }).waitFor();
      await page.getByText("EUR 100.00", { exact: true }).waitFor();
      await page.route("**/rest/v1/rpc/get_tenant_operational_summary", (route) => route.fulfill({
        status: 503, contentType: "application/json", body: JSON.stringify({ message: "Synthetic read failure" }),
      }));
      await page.reload();
      await page.getByText("Receivables summary unavailable", { exact: true }).waitFor();
      assert.equal(await page.getByText("USD 100.00", { exact: true }).count(), 0);
      let captured = false;
      for (let attempt = 0; attempt < 30; attempt++) {
        captured = (await db.query("SELECT count(*)::int AS count FROM public.client_diagnostic_buckets WHERE event_code='read_failed' AND org_id=$1", [ids.orgA])).rows[0].count > 0;
        if (captured) break;
        await delay(100);
      }
      assert.ok(captured, "Failed browser reads must produce a sanitized operational event");
      await page.goto(origin + "/reports");
      await page.getByLabel("Legal entity", { exact: true }).selectOption(ids.usd);
      await page.getByLabel("From date", { exact: true }).fill("2026-09-01");
      await page.getByLabel("Through date", { exact: true }).fill("2026-09-30");
      await page.getByRole("button", { name: "Generate report", exact: true }).click();
      await page.getByRole("region", { name: "Financial report result", exact: true }).waitFor();
      assert.equal(await page.getByTestId("trial-total-closingDebit").textContent(), "USD 100.00");
      assert.equal(await page.getByTestId("trial-total-periodDebit").textContent(), "USD 1,000.00");
      const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download CSV", exact: true }).click()]);
      assert.match(download.suggestedFilename(), /^trial-balance-.*-2026-09-01-2026-09-30\.csv$/);
      const stream = await download.createReadStream();
      const chunks = []; for await (const chunk of stream) chunks.push(chunk);
      const csv = Buffer.concat(chunks).toString("utf8");
      assert.ok(csv.includes('"Currency","USD","From","2026-09-01","Through","2026-09-30"'));
      assert.ok(csv.includes('"","TOTAL","","0.00","0.00","1000.00","1000.00","100.00","100.00"'));
      await page.getByLabel("Report view", { exact: true }).selectOption("income");
      assert.equal(await page.getByTestId("statement-net-income").textContent(), "USD 0.00");
      assert.equal(await page.getByTestId("statement-revenue").textContent(), "USD 100.00");
      await page.getByRole("button", { name: "Revenue", exact: true }).click();
      await page.getByRole("region", { name: "Account ledger", exact: true }).waitFor();
      await page.getByRole("button", { name: "Download account CSV", exact: true }).waitFor();
      const [ledgerDownload] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download account CSV", exact: true }).click()]);
      assert.match(ledgerDownload.suggestedFilename(), /^account-ledger-/);
      const ledgerStream = await ledgerDownload.createReadStream(); const ledgerChunks = []; for await (const chunk of ledgerStream) ledgerChunks.push(chunk);
      assert.ok(Buffer.concat(ledgerChunks).toString("utf8").includes('"TOTAL","","","","","0.00","100.00","-100.00"'));
      await page.getByRole("button", { name: "Back to report", exact: true }).click();
      await page.getByLabel("Report view", { exact: true }).selectOption("balance");
      assert.equal(await page.getByTestId("statement-liabilities-and-equity").textContent(), "USD 0.00");
      await page.route("**/rest/v1/rpc/get_account_ledger", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Synthetic ledger failure" }) }));
      await page.getByRole("button", { name: "Cash", exact: true }).click();
      await page.getByText("Account ledger unavailable", { exact: true }).waitFor();
      assert.equal(await page.getByRole("button", { name: "Download account CSV", exact: true }).count(), 0);
      await page.getByRole("button", { name: "Back to report", exact: true }).click();
      await page.unroute("**/rest/v1/rpc/get_account_ledger");
      await page.getByLabel("Report view", { exact: true }).selectOption("trial");
      await page.getByLabel("Legal entity", { exact: true }).selectOption(ids.eur);
      await page.getByRole("region", { name: "Financial report result", exact: true }).waitFor({ state: "hidden" });
      assert.equal(await page.getByRole("button", { name: "Download CSV", exact: true }).count(), 0);
      await page.getByRole("button", { name: "Generate report", exact: true }).click();
      await page.getByRole("region", { name: "Financial report result", exact: true }).waitFor();
      assert.equal(await page.getByTestId("trial-total-closingDebit").textContent(), "EUR 0.00");
      await page.route("**/rest/v1/rpc/get_entity_trial_balance", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Synthetic report failure" }) }));
      await page.getByRole("button", { name: "Generate report", exact: true }).click();
      await page.getByText("Trial balance unavailable", { exact: true }).waitFor();
      assert.equal(await page.getByRole("region", { name: "Financial report result", exact: true }).count(), 0);
      assert.equal(await page.getByRole("button", { name: "Download CSV", exact: true }).count(), 0);
      await page.unroute("**/rest/v1/rpc/get_entity_trial_balance");
      await page.unroute("**/rest/v1/rpc/get_tenant_operational_summary");
      await page.goto(origin + "/close");
      await page.getByLabel("Period entity", { exact: true }).selectOption(ids.usd);
      await page.getByLabel("Period start", { exact: true }).fill("2026-11-01");
      await page.getByLabel("Period end", { exact: true }).fill("2026-11-30");
      await page.getByRole("button", { name: "Create period", exact: true }).click();
      await page.getByText("Accounting period created.", { exact: true }).waitFor();
      await page.goto(origin + "/gl");
      await page.getByRole("tab", { name: "New journal", exact: true }).click();
      await page.getByLabel("Journal entity", { exact: true }).selectOption(ids.usd);
      await page.getByLabel("Journal reference", { exact: true }).fill("BROWSER-ADJUSTMENT");
      await page.getByLabel("Journal date", { exact: true }).fill("2026-11-05");
      await page.getByLabel("Account line 1", { exact: true }).selectOption(ids.cash);
      await page.getByLabel("Debit line 1", { exact: true }).fill("45.67");
      await page.getByLabel("Account line 2", { exact: true }).selectOption(ids.revenue);
      await page.getByLabel("Credit line 2", { exact: true }).fill("45.67");
      await page.getByRole("button", { name: "Post balanced journal", exact: true }).click();
      await page.getByText("Journal BROWSER-ADJUSTMENT posted.", { exact: true }).waitFor();
      await page.goto(origin + "/close");
      const november = page.getByRole("row").filter({ hasText: "Nov 1, 2026" });
      await november.getByRole("button", { name: "Period details", exact: true }).click();
      await page.getByLabel("Reason for change", { exact: true }).fill("November close review complete");
      await page.getByRole("button", { name: "Apply period change", exact: true }).click();
      await page.getByRole("region", { name: "Manage accounting period", exact: true }).waitFor({ state: "hidden" });
      await november.getByText("SOFT CLOSED", { exact: true }).waitFor();
      await november.getByRole("button", { name: "Period details", exact: true }).click();
      await page.getByLabel("New status", { exact: true }).selectOption("HARD_CLOSED");
      await page.getByLabel("Reason for change", { exact: true }).fill("Final November close approved");
      assert.equal(await page.getByRole("button", { name: "Apply period change", exact: true }).isEnabled(), false);
      await page.getByRole("checkbox", { name: /completed the required close reviews/ }).check();
      await page.getByRole("button", { name: "Apply period change", exact: true }).click();
      await page.getByRole("region", { name: "Manage accounting period", exact: true }).waitFor({ state: "hidden" });
      await november.getByText("HARD CLOSED", { exact: true }).waitFor();

      for (const kind of ["ar", "ap"]) {
        await page.goto(origin + "/" + kind);
        const region = page.getByRole("region", { name: kind === "ar" ? "Receivables aging" : "Payables aging", exact: true });
        await region.getByLabel("Aging entity", { exact: true }).selectOption(ids.usd);
        await region.getByLabel("Aging as of", { exact: true }).fill("2026-09-08");
        await region.getByRole("button", { name: "Generate aging", exact: true }).click();
        await region.getByText("Subledger agrees with the ledger", { exact: true }).waitFor();
        await region.getByRole("cell", { name: kind === "ar" ? /INTEGRATION-USD/ : /BILL-USD/ }).waitFor();
        const [download] = await Promise.all([page.waitForEvent("download"), region.getByRole("button", { name: "Download aging CSV", exact: true }).click()]);
        assert.match(download.suggestedFilename(), new RegExp("^" + kind + "-aging-.*-2026-09-08\\.csv$"));
        const stream = await download.createReadStream(); const chunks = []; for await (const chunk of stream) chunks.push(chunk);
        const csv = Buffer.concat(chunks).toString("utf8");
        assert.ok(csv.includes('"As of","2026-09-08","Currency","USD"'));
        assert.ok(csv.includes('"TOTAL OUTSTANDING","100.00"'));
        await page.route("**/rest/v1/rpc/get_subledger_aging", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Synthetic aging failure" }) }));
        await region.getByRole("button", { name: "Generate aging", exact: true }).click();
        await region.getByText("Aging unavailable", { exact: true }).waitFor();
        assert.equal(await region.getByRole("button", { name: "Download aging CSV", exact: true }).count(), 0);
        await page.unroute("**/rest/v1/rpc/get_subledger_aging");
        await region.getByLabel("Aging entity", { exact: true }).selectOption(ids.eur);
        assert.equal(await region.getByLabel("Aging result", { exact: true }).count(), 0);
      }

      await page.goto(origin + "/settings");
      await page.getByLabel("New entity name", { exact: true }).fill("Browser setup entity");
      await page.getByLabel("Audit reason", { exact: true }).first().fill("Synthetic posting setup acceptance");
      await page.getByRole("button", { name: "Create entity", exact: true }).click();
      await page.getByText("Browser setup entity", { exact: true }).first().waitFor();
      const setupEntity = (await db.query("SELECT id FROM public.entities WHERE org_id=$1 AND name='Browser setup entity'", [ids.orgA])).rows[0].id;
      await page.getByRole("tab", { name: "Posting accounts", exact: true }).click();
      await page.getByLabel("Posting entity", { exact: true }).selectOption(setupEntity);
      const invoiceSetup = page.getByRole("region", { name: "Invoice posting accounts", exact: true });
      await invoiceSetup.getByLabel("AR control account", { exact: true }).selectOption(ids.ar);
      await invoiceSetup.getByLabel("Invoice revenue account", { exact: true }).selectOption(ids.revenue);
      assert.equal(await invoiceSetup.getByRole("button", { name: "Save posting accounts", exact: true }).isEnabled(), false);
      await invoiceSetup.getByRole("checkbox").check();
      const attempts = [];
      await page.route("**/rest/v1/rpc/configure_entity_invoice_accounts", async route => {
        attempts.push(route.request().postDataJSON());
        if (attempts.length === 1) {
          const committed = await route.fetch(); assert.equal(committed.ok(), true);
          await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Synthetic lost response after commit" }) });
        } else await route.continue();
      });
      await invoiceSetup.getByRole("button", { name: "Save posting accounts", exact: true }).click();
      await invoiceSetup.getByText("Account setup not confirmed", { exact: true }).waitFor();
      await invoiceSetup.getByRole("button", { name: "Retry account setup", exact: true }).click();
      await invoiceSetup.getByText(/These mappings are immutable/).waitFor();
      assert.equal(attempts.length, 2); assert.deepEqual(attempts[0], attempts[1]);
      await page.unroute("**/rest/v1/rpc/configure_entity_invoice_accounts");
      for (const [title, selections] of [
        ["Customer receipt account", [["Customer receipt cash clearing", ids.cash]]],
        ["Bill posting accounts", [["AP control account", ids.ap], ["Bill expense account", ids.expense]]],
        ["Supplier payment account", [["Supplier payment cash clearing", ids.cash]]],
      ]) {
        const region = page.getByRole("region", { name: title, exact: true });
        for (const [label, id] of selections) await region.getByLabel(label, { exact: true }).selectOption(id);
        await region.getByRole("checkbox").check();
        await region.getByRole("button", { name: "Save posting accounts", exact: true }).click();
        await region.getByText(/These mappings are immutable/).waitFor();
      }
      for (const table of ["entity_invoice_account_controls", "entity_customer_receipt_controls", "entity_supplier_bill_account_controls", "entity_supplier_payment_controls"]) {
        const { rows } = await db.query(`SELECT org_id,configured_by FROM public.${table} WHERE entity_id=$1`, [setupEntity]);
        assert.deepEqual(rows, [{ org_id: ids.orgA, configured_by: ids.adminA }]);
      }
      assert.equal(await page.getByRole("button", { name: "Save posting accounts", exact: true }).count(), 0);
      assert.deepEqual(failures, []);
    });
    await t.test("partial AR/AP browser retries and concurrent final allocations preserve balances and every settlement action", async () => {
      await rpc(clientA,"create_accounting_period",{p_entity_id:ids.usd,p_period_start:"2026-12-01",p_period_end:"2026-12-31",p_idempotency_key:"partial-december"});
      const secondSession=createClient(api,status.ANON_KEY,options);
      assert.equal((await secondSession.auth.signInWithPassword({email:emailA,password})).error,null);
      const page=await browser.newPage();const failures=[];page.on("pageerror",error=>failures.push(error.message));
      await page.goto("http://127.0.0.1:4173/auth");
      await page.getByLabel("Email",{exact:true}).fill(emailA);await page.getByLabel("Password",{exact:true}).fill(password);
      await page.getByRole("button",{name:"Sign In",exact:true}).click();
      await page.getByText("Journal-linked posted invoices",{exact:true}).waitFor();
      for(const kind of ["ar","ap"]) {
        const number="PARTIAL-"+kind.toUpperCase(),source=kind==="ar"?"customer_receipt":"supplier_payment";
        const docArgs=kind==="ar"?{p_customer_id:ids.customer,p_invoice_number:number}:{p_vendor_id:ids.vendor,p_bill_number:number};
        const doc=await rpc(clientA,kind==="ar"?"post_customer_invoice":"post_supplier_bill",{...docArgs,p_entity_id:ids.usd,p_issue_date:"2026-12-06",p_due_date:"2026-12-20",p_currency:"USD",p_tax:0,p_notes:null,p_lines:[{description:"Synthetic posted receivable/payable; not deferred revenue",quantity:"1",unit_price:"36500.00"}],p_idempotency_key:number});
        await page.goto("http://127.0.0.1:4173/"+kind);
        const region=page.getByRole("region",{name:kind==="ar"?"Receivables aging":"Payables aging",exact:true});
        await region.getByLabel("Aging entity",{exact:true}).selectOption(ids.usd);
        await region.getByLabel("Aging as of",{exact:true}).fill("2026-12-07");
        await region.getByRole("button",{name:"Generate aging",exact:true}).click();
        const row=region.getByRole("row").filter({hasText:number});
        await row.getByRole("button",{name:kind==="ar"?"Record receipt":"Record payment",exact:true}).click();
        const dialog=page.getByRole("dialog");
        await dialog.getByLabel("Settlement number",{exact:true}).fill(number+"-FIRST");
        await dialog.getByLabel("Settlement date",{exact:true}).fill("2026-12-07");
        await dialog.getByLabel("Settlement amount (USD)",{exact:true}).fill("15000.00");
        await dialog.getByLabel("Settlement reference",{exact:true}).fill("Synthetic partial settlement");
        const attempts=[];const endpoint="**/rest/v1/rpc/post_"+source+"_amount";
        await page.route(endpoint,async route=>{
          attempts.push(route.request().postDataJSON());
          if(attempts.length===1){const committed=await route.fetch();assert.equal(committed.ok(),true);await route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({message:"Synthetic lost settlement confirmation"})});}
          else await route.continue();
        });
        await dialog.getByRole("button",{name:kind==="ar"?"Post receipt and journal":"Post payment and journal",exact:true}).click();
        await dialog.getByText("Settlement posting not confirmed",{exact:true}).waitFor();
        assert.equal(await dialog.getByLabel("Settlement amount (USD)",{exact:true}).isDisabled(),true);
        await dialog.getByRole("button",{name:"Retry same settlement",exact:true}).click();
        await dialog.waitFor({state:"hidden"});
        assert.equal(attempts.length,2);assert.deepEqual(attempts[0],attempts[1]);assert.equal(attempts[0].p_amount,"15000.00");
        await page.unroute(endpoint);
        await row.getByRole("cell",{name:"USD 21,500.00",exact:true}).waitFor();
        const final={...attempts[0],p_amount:"21500.00",p_idempotency_key:number+"-FINAL"};
        final[kind==="ar"?"p_receipt_number":"p_payment_number"]=number+"-FINAL";
        final[kind==="ar"?"p_receipt_date":"p_payment_date"]="2026-12-20";
        const competing={...final,p_idempotency_key:number+"-COMPETING"};competing[kind==="ar"?"p_receipt_number":"p_payment_number"]=number+"-COMPETING";
        const result=await Promise.all([clientA.rpc("post_"+source+"_amount",final),secondSession.rpc("post_"+source+"_amount",competing)]);
        assert.equal(result.filter(item=>!item.error).length,1);assert.match(result.find(item=>item.error).error.message,/settlements exceed/);
        const winner=result[0].error?competing:final;
        assert.equal(await rpc(clientA,"post_"+source+"_amount",winner),result.find(item=>!item.error).data);
        assert.ok((await clientB.rpc("post_"+source+"_amount",winner)).error);
        const table=kind==="ar"?"customer_receipts":"supplier_payments",column=kind==="ar"?"invoice_id":"bill_id";
        const {rows:[totals]}=await db.query(`SELECT count(*)::int AS count,sum(amount)::text AS total FROM public.${table} WHERE ${column}=$1`,[doc]);
        assert.deepEqual(totals,{count:2,total:"36500.00"});
        const loser=result[0].error?final:competing;
        assert.equal((await db.query("SELECT count(*)::int AS count FROM public.accounting_events WHERE org_id=$1 AND idempotency_key=$2",[ids.orgA,loser.p_idempotency_key])).rows[0].count,0);
        for(const [day,expected] of [["2026-12-07","21500.00"],["2026-12-20","0.00"]]) {
          const aging=await rpc(clientA,"get_subledger_aging",{p_entity_id:ids.usd,p_kind:kind,p_as_of:day,p_offset:0,p_page_size:100});
          assert.equal(aging.outstanding,expected);assert.equal(aging.reconciled,true);
        }
        await page.reload();
        const history=page.getByRole("row").filter({has:page.getByRole("cell",{name:number,exact:true})});
        await history.getByText(new RegExp(number+"-FIRST")).waitFor();
        assert.equal(await history.getByRole("button",{name:kind==="ar"?"Correct receipt":"Correct payment",exact:true}).count(),2);
      }
      assert.deepEqual(failures,[]);await page.close();
    });

    let cashEvidence;
    await t.test("bank import, matching and independent reconciliation survive browser retries and tenant API boundaries",async()=>{
      cashEvidence=await qualifyCashWorkflow({rpc,clientA,clientB,clientReviewer,browser,ids,email:emailA,password});
    });
    let contractEvidence;
    await t.test("approved browser contracts, subscription billing, usage and revenue reconcile through independent API sessions",async()=>{
      contractEvidence=await qualifyContractWorkflow({rpc,clientA,clientB,clientReviewer,browser,ids,email:emailA,password,emailReviewer});
    });
    let providerEvidence;
    await t.test("signed Edge provider events require independent browser mapping and preserve replay and correction history",async()=>{
      providerEvidence=await qualifyProviderWorkflow({rpc,clientA,clientB,clientReviewer,browser,ids,email:emailA,password,api});
    });
    let closeEvidence;
    await t.test("browser schedules and independently approved fiscal close preserve income and reviewed posting cutoffs",async()=>{
      closeEvidence=await qualifyCloseWorkflow({rpc,clientA,clientB,clientReviewer,browser,ids,email:emailA,password});
    });
    let groupEvidence;
    await t.test("browser intercompany and currency consolidation retain independent approvals, elimination evidence and exact retries",async()=>{
      groupEvidence=await qualifyGroupWorkflow({rpc,clientA,clientB,clientReviewer,browser,ids,email:emailA,password});
    });
    let statementEvidence;
    await t.test("browser statement policies and cash allocations preserve mapped group reports through independent review", async()=>{
      statementEvidence=await qualifyStatementWorkflow({rpc,clientA,clientB,clientReviewer,browser,ids,email:emailA,password});
    });
    let customerAdjustmentEvidence;
    await t.test("customer credits, confirmed refunds and applications reconcile through browser approvals and corrections",async()=>{
      customerAdjustmentEvidence=await qualifyCustomerAdjustments({rpc,clientA,clientB,clientReviewer,browser,ids,email:emailA,password});
    });
    let subscriptionEvidence;
    await t.test("subscription changes and finite renewals preserve earned service, exact proration and atomic child approvals",async()=>{
      subscriptionEvidence=await qualifySubscriptionLifecycle({rpc,clientA,clientB,clientReviewer,browser,ids,email:emailA,password});
    });
    await t.test("populated backup restores financial evidence, login, isolation and retry behavior after a fresh database reset", async () => {
      await browser?.close(); browser=null;
      server?.kill("SIGTERM"); server=null;
      const normalized = value => JSON.parse(JSON.stringify(value, (key,item) => key === "generatedAt" ? undefined : item));
      const reportRequests = [
        ["get_entity_trial_balance",{p_entity_id:ids.usd,p_from_date:"2026-01-01",p_to_date:"2026-12-31"}],
        ["get_entity_trial_balance",{p_entity_id:ids.eur,p_from_date:"2026-01-01",p_to_date:"2026-12-31"}],
        ...["ar","ap"].flatMap(kind => ["2026-09-08","2026-12-07","2026-12-20"].map(day => ["get_subledger_aging",{p_entity_id:ids.usd,p_kind:kind,p_as_of:day,p_offset:0,p_page_size:100}])),
      ];
      for(const contract of contractEvidence.contracts) reportRequests.push(["get_contract_finance",{p_contract_id:contract,p_as_of:"2026-02-01"}]);
      reportRequests.push(["get_finance_integration_report",{p_entity:providerEvidence.entity,p_as_of:"2026-01-31"}]);
      for(const schedule of closeEvidence.schedules)for(const date of ['2025-12-31','2026-01-01'])reportRequests.push(['get_finance_schedule',{p_schedule:schedule,p_as_of:date}]);
      reportRequests.push(['get_finance_close_check',{p_entity:closeEvidence.entity,p_from:'2025-01-01',p_through:'2025-12-31'}]);
      for(const entity of groupEvidence.entities)reportRequests.push(['get_intercompany_report',{p_entity:entity,p_as_of:'2025-12-31'}]);
      for(const id of groupEvidence.reports)reportRequests.push(['get_approved_consolidation',{p_consolidation:id}]);
      for(const entity of statementEvidence.entities)reportRequests.push(['get_entity_financial_statements',{p_entity:entity,p_from:'2025-01-01',p_through:'2025-12-31'}]);
      reportRequests.push(['get_approved_consolidation',{p_consolidation:statementEvidence.report}]);
      reportRequests.push(['get_customer_adjustments',{p_entity:customerAdjustmentEvidence.entity,p_as_of:'2026-01-31'}]);
      reportRequests.push(['get_subledger_aging',{p_entity_id:customerAdjustmentEvidence.entity,p_kind:'ar',p_as_of:'2026-01-31'}]);
      for(const contract of subscriptionEvidence.contracts){reportRequests.push(['get_subscription_history',{p_contract:contract}]);reportRequests.push(['get_contract_finance',{p_contract_id:contract,p_as_of:'2026-01-31'}]);}
      reportRequests.push(['get_customer_adjustments',{p_entity:subscriptionEvidence.entity,p_as_of:'2026-01-31'}]);
      const before=[];for(const [name,args] of reportRequests) before.push(normalized(await rpc(clientA,name,args)));
      const retries=[];
      for(const [source,column,number,date,reference] of [
        ["customer_receipt","invoice_id","receipt_number","receipt_date","receipt_reference"],
        ["supplier_payment","bill_id","payment_number","payment_date","payment_reference"],
      ]) {
        const {rows:[row]}=await db.query(`SELECT id,${column} AS document,${number} AS number,${date}::text AS date,${reference} AS reference,currency,amount::text,idempotency_key FROM public.${source}s WHERE ${number} LIKE 'PARTIAL-%-FIRST'`);
        assert.ok(row,"Recovery fixture must include an amount-entry settlement");
        retries.push(["post_"+source+"_amount",{["p_"+column]:row.document,["p_"+number]:row.number,["p_"+date]:row.date,p_currency:row.currency,p_reference:row.reference,p_amount:row.amount,p_idempotency_key:row.idempotency_key},row.id]);
      }
      // The reset disconnects existing database clients. Close the fixture owner
      // first so an expected disconnect cannot hide a recovery-test failure.
      await db.end();db=null;
      const evidence=await rehearsePopulatedRecovery({status,expectedOrganizations:[ids.orgA,ids.orgB],expectedUsers:[ids.adminA,ids.adminB,ids.reviewer],verifyApplication:async restoredDb=>{
        const restoredA=createClient(api,status.ANON_KEY,options),restoredB=createClient(api,status.ANON_KEY,options),restoredReviewer=createClient(api,status.ANON_KEY,options);
        for(const [client,email] of [[restoredA,emailA],[restoredB,emailB],[restoredReviewer,emailReviewer]]) {
          const result=await client.auth.signInWithPassword({email,password});assert.equal(result.error,null,"Restored identities must support a fresh login");
        }
        assert.deepEqual(await rpc(restoredReviewer,"decide_finance_action",subscriptionEvidence.decision),subscriptionEvidence.result,"Subscription parent retry must retain the same children after restore");
        assert.deepEqual(await rpc(restoredReviewer,"decide_finance_action",customerAdjustmentEvidence.decision),customerAdjustmentEvidence.result,"Customer credit approval must survive recovery without duplicate balances");
        assert.deepEqual(await rpc(restoredReviewer,"decide_finance_action",contractEvidence.billingDecision),contractEvidence.billingResult,"Approved billing retry must survive recovery without new posting");
        assert.deepEqual(await rpc(restoredReviewer,"decide_finance_action",providerEvidence.decision),providerEvidence.result,"Provider approval retry must survive recovery without duplicate receipt");
        assert.deepEqual(await rpc(restoredReviewer,"decide_finance_action",closeEvidence.decision),closeEvidence.result,"Fiscal close approval must survive recovery without duplicate closing entries");
        assert.deepEqual(await rpc(restoredReviewer,"decide_finance_action",statementEvidence.decision),statementEvidence.result,"Cash classification approval must survive recovery exactly");
        assert.deepEqual(await rpc(restoredReviewer,"decide_finance_action",groupEvidence.decision),groupEvidence.result,"Consolidation approval and retained snapshot must survive recovery exactly");
        assert.equal((await rpc(restoredA,"get_cash_reconciliation",{p_statement_id:cashEvidence.statement})).revision,cashEvidence.revision,"Approved cash reconciliation must survive restore exactly");
        const after=[];for(const [name,args] of reportRequests) after.push(normalized(await rpc(restoredA,name,args)));
        assert.deepEqual(after,before,"Restored trial balances and historical aging must exactly reconcile");
        assert.equal(await rpc(restoredA,"post_customer_invoice",usdPayload),usdInvoice);
        for(const [name,args,id] of retries) assert.equal(await rpc(restoredA,name,args),id,"Restored idempotency evidence must prevent duplicate settlement");
        assert.deepEqual(await rpc(restoredB,"get_recent_posted_journals"),[]);
        assert.ok((await restoredB.rpc("get_entity_trial_balance",reportRequests[0][1])).error);
        assert.ok((await restoredB.rpc("post_customer_invoice",usdPayload)).error);
        const anonymous=createClient(api,status.ANON_KEY,options);
        assert.ok((await anonymous.rpc("get_entity_trial_balance",reportRequests[0][1])).error);
        assert.ok((await restoredA.from("journal_entries").update({memo:"Forbidden after restore"}).eq("org_id",ids.orgA)).error);
        assert.ok((await restoredA.rpc("post_manual_journal",{p_entity_id:ids.usd,p_entry_number:"RECOVERY-CLOSED",p_entry_date:"2026-11-05",p_memo:"Synthetic closed-period rejection",p_lines:[{account_id:ids.cash,debit:"1.00",credit:"0.00"},{account_id:ids.revenue,debit:"0.00",credit:"1.00"}],p_idempotency_key:"recovery-closed"})).error);
        const health=(await restoredDb.query("SELECT count(*)::int AS count FROM public.journal_entries WHERE entry_number='RECOVERY-CLOSED'")).rows[0];assert.equal(health.count,0);
      }});
      assert.equal(evidence.result,"pass");assert.equal(evidence.financialGraphs,89);assert.ok(evidence.rows>1000);
    });

  } finally {
    await browser?.close();
    server?.kill("SIGTERM");
    await db?.end();
  }
});
