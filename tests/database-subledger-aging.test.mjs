import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { ids, fixture } from "./helpers/subledger-fixture.mjs";

const names = ["20260825010000_recovery_journal_periods", "20260825020000_recovery_customer_invoice", "20260825040000_recovery_ap_payment_containment",
  "20260825090000_recovery_customer_credit_note", "20260825100000_recovery_customer_receipt", "20260825110000_recovery_supplier_bill",
  "20260825120000_recovery_supplier_bill_credit", "20260825130000_recovery_supplier_payment", "20260825140000_recovery_customer_receipt_correction",
  "20260825150000_recovery_supplier_payment_correction", "20260825160000_recovery_customer_receipt_replacement", "20260825170000_recovery_supplier_payment_replacement",
  "20260906030000_recovery_deferred_validation_privileges", "20260906040000_recovery_posting_source_modules", "20260906060000_finance_account_ledger",
  "20260906080000_finance_manual_journal", "20260906090000_finance_subledger_aging"];
const migrations = await Promise.all(names.map(name => readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), "utf8")));
async function database() {
  const db = new PGlite(); await db.exec(fixture);
  for (const migration of migrations) await db.exec(migration);
  await db.exec(migrations.at(-1));
  await db.exec("GRANT USAGE ON SCHEMA public,auth TO authenticated,anon,service_role;");
  for (const table of ["accounts", "entities", "customers", "vendors"]) await db.exec(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tenant ON public.${table} FOR SELECT TO authenticated USING(org_id=public.get_user_org_id()); GRANT SELECT ON public.${table} TO authenticated;`);
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [ids.adminA]); await db.exec("SET ROLE authenticated");
  await db.query("SELECT public.create_accounting_period($1,'2026-01-01','2026-12-31','year')", [ids.entityA]);
  await db.query("SELECT public.configure_entity_invoice_accounts($1,$2,$3,'ar')", [ids.entityA, ids.arA, ids.revenueA]);
  await db.query("SELECT public.configure_entity_customer_receipt_accounts($1,$2,'receipt')", [ids.entityA, ids.cashA]);
  await db.query("SELECT public.configure_entity_supplier_bill_accounts($1,$2,$3,'ap')", [ids.entityA, ids.apA, ids.expenseA]);
  await db.query("SELECT public.configure_entity_supplier_payment_accounts($1,$2,'payment')", [ids.entityA, ids.cashA]);
  return db;
}
const report = (db, kind, date, offset = 0, revision = null, size = 200, entity = ids.entityA) => db.query(
  "SELECT public.get_subledger_aging($1,$2,$3,$4,$5,$6) AS report", [entity, kind, date, offset, size, revision]).then(r => r.rows[0].report);
const post = (db, kind, key, amount = "100.00", due = "2026-09-20", date = "2026-09-06") => db.query(
  `SELECT public.${kind === "ar" ? "post_customer_invoice" : "post_supplier_bill"}($1,$2,$3,$4,$5,'USD',0,NULL,$6,$3) AS id`,
  [ids.entityA, kind === "ar" ? ids.customerA : ids.vendorA, key, date, due, JSON.stringify([{ description: "Synthetic service", quantity: "1", unit_price: amount }])]).then(r => r.rows[0].id);

test("AR and AP aging follow historical settlements, corrections, replacements and credits", async () => {
  const db = await database();
  try {
    for (const kind of ["ar", "ap"]) {
      const source = kind === "ar" ? "customer_receipt" : "supplier_payment";
      const doc = await post(db, kind, kind + "-document");
      const settlement = (await db.query(`SELECT public.post_${source}($1,$2,'2026-09-07','USD','Synthetic',$2) AS id`, [doc, kind + "-settlement"])).rows[0].id;
      const correction = (await db.query(`SELECT public.post_${source}_correction($1,$2,'2026-09-08','Synthetic correction',$2) AS id`, [settlement, kind + "-correction"])).rows[0].id;
      await db.query(`SELECT public.post_${source}_replacement($1,$2,'2026-09-09','Synthetic replacement',$2)`, [correction, kind + "-replacement"]);
      for (const [day, total, count] of [[5,"0.00",0],[6,"100.00",1],[7,"0.00",0],[8,"100.00",1],[9,"0.00",0]]) {
        const r = await report(db, kind, "2026-09-0" + day);
        assert.equal(r.outstanding, total); assert.equal(r.ledgerBalance, total); assert.equal(r.reconciled, true); assert.equal(r.rows.length, count);
        if (count) { assert.equal(r.rows[0].documentId, doc); assert.equal(r.rows[0].bucket, "current"); }
      }
      const credited = await post(db, kind, kind + "-credited", "25.10");
      const creditRpc = kind === "ar" ? "post_customer_credit_note" : "post_supplier_bill_credit";
      await db.query(`SELECT public.${creditRpc}($1,$2,'2026-09-25','Synthetic credit',$2)`, [credited, kind + "-credit"]);
      assert.equal((await report(db, kind, "2026-09-24")).outstanding, "25.10");
      assert.equal((await report(db, kind, "2026-09-25")).outstanding, "0.00");
    }
  } finally { await db.close(); }
});

test("aging pages all documents, calculates exact bucket boundaries and rejects changed history", async () => {
  const db = await database();
  try {
    const dueDates = ["2026-10-01", "2026-09-30", "2026-09-29", "2026-08-31", "2026-08-30", "2026-08-01", "2026-07-31", "2026-07-02", "2026-07-01"];
    for (const kind of ["ar", "ap"]) {
      for (let i = 0; i < dueDates.length; i++) await post(db, kind, kind + "-bucket-" + i, "0.01", dueDates[i], "2026-01-01");
      assert.deepEqual((await report(db, kind, "2026-09-30")).buckets,
        { current: "0.02", days1to30: "0.02", days31to60: "0.02", days61to90: "0.02", days91plus: "0.01" });
    }
    await post(db, "ar", "large", "9999999999999.99", "2026-09-30");
    await db.exec("BEGIN"); for (let i = 0; i < 995; i++) await post(db, "ar", "small-" + i, "0.01", "2026-09-30"); await db.exec("COMMIT");
    const initial = await report(db, "ar", "2026-09-30");
    assert.equal(initial.openCount, 1005); assert.equal(initial.outstanding, "10000000000010.03");
    assert.equal(initial.reconciled, true); assert.equal((await report(db, "ar", "2026-09-30")).revision, initial.revision);
    const seen = new Set();
    for (let offset = 0; offset < 1005; offset += 200) {
      const page = await report(db, "ar", "2026-09-30", offset, initial.revision);
      assert.equal(page.rows.length, Math.min(200, 1005-offset));
      for (const row of page.rows) { assert.ok(!seen.has(row.documentId)); seen.add(row.documentId); }
    }
    assert.equal(seen.size, 1005);
    await assert.rejects(report(db, "ar", "2026-09-30", 1005, initial.revision), /outside/);
    await assert.rejects(report(db, "ar", "2026-09-30", 200), /revision is required/);
    await post(db, "ar", "backdated", "1.00");
    await assert.rejects(report(db, "ar", "2026-09-30", 200, initial.revision), /history changed/);
  } finally { await db.close(); }
});

test("manual control-account adjustments remain visible as variances and unverified history cannot report", async () => {
  const db = await database();
  try {
    await post(db, "ar", "invoice");
    await db.query("SELECT public.post_manual_journal($1,'adjust','2026-09-06','Adjustment',$2,'adjust')", [ids.entityA, JSON.stringify([
      { account_id: ids.arA, debit: "5.00", credit: "0.00" }, { account_id: ids.revenueA, debit: "0.00", credit: "5.00" }])]);
    const r = await report(db, "ar", "2026-09-30"); assert.equal(r.outstanding, "100.00"); assert.equal(r.ledgerBalance, "105.00"); assert.equal(r.variance, "5.00"); assert.equal(r.reconciled, false);
    await db.exec("RESET ROLE; ALTER TABLE public.invoices DISABLE TRIGGER USER;");
    await db.query("INSERT INTO public.invoices(org_id,entity_id,customer_id,invoice_number,issue_date,due_date,total,status) VALUES($1,$2,$3,'legacy','2026-09-01','2026-09-30',50,'draft')", [ids.orgA, ids.entityA, ids.customerA]);
    await db.exec("ALTER TABLE public.invoices ENABLE TRIGGER USER; SET ROLE authenticated;");
    assert.equal((await report(db, "ar", "2026-09-30")).excludedDraftCount, 1);
    await db.exec("RESET ROLE; ALTER TABLE public.invoices DISABLE TRIGGER USER; UPDATE public.invoices SET status='sent' WHERE invoice_number='legacy'; ALTER TABLE public.invoices ENABLE TRIGGER USER; SET ROLE authenticated;");
    await assert.rejects(report(db, "ar", "2026-09-30"), /unverified invoice history/);
    // Simulate damaged imported evidence in the disposable fixture. The ledger is
    // still balanced, but its control amount no longer matches the source invoice.
    await db.exec("RESET ROLE; ALTER TABLE public.invoices DISABLE TRIGGER USER; UPDATE public.invoices SET status='draft' WHERE invoice_number='legacy'; ALTER TABLE public.invoices ENABLE TRIGGER USER;");
    await db.exec("ALTER TABLE public.journal_lines DISABLE TRIGGER USER; UPDATE public.journal_lines SET debit=debit*2,credit=credit*2 WHERE journal_entry_id=(SELECT journal_entry_id FROM public.invoices WHERE invoice_number='invoice'); ALTER TABLE public.journal_lines ENABLE TRIGGER USER; SET ROLE authenticated;");
    await assert.rejects(report(db, "ar", "2026-09-30"), /invalid or unverified subledger/);
  } finally { await db.close(); }
});

test("aging requires tenant membership, valid scope and revision, with read-only access for finance viewers", async () => {
  const db = await database();
  try {
    await post(db, "ap", "bill");
    await assert.rejects(report(db, "ar", "2026-09-30", 0, null, 201), /invalid aging page/);
    await assert.rejects(report(db, "bank", "2026-09-30"), /invalid subledger/);
    await assert.rejects(report(db, "ar", "infinity"), /invalid report date/);
    await assert.rejects(report(db, "ar", "2026-09-30", 0, null, 100, ids.entityB), /entity not found/);
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [ids.userA]);
    assert.equal((await report(db, "ap", "2026-09-30")).outstanding, "100.00");
    await assert.rejects(post(db, "ap", "forbidden"), /role|admin|moderator/i);
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [ids.adminB]);
    await assert.rejects(report(db, "ap", "2026-09-30"), /entity not found/);
    await db.query("SELECT set_config('request.jwt.claim.sub','',false)"); await assert.rejects(report(db, "ar", "2026-09-30"), /membership/);
    for (const role of ["anon", "service_role"]) { await db.exec("RESET ROLE; SET ROLE " + role); await assert.rejects(report(db, "ar", "2026-09-30"), /permission denied/); }
  } finally { await db.close(); }
});
