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
  "20260906080000_finance_manual_journal", "20260906090000_finance_subledger_aging", "20260907010000_partial_settlements"];
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

const allocate = (db, kind, doc, key, amount, date="2026-09-07") => db.query(
  `SELECT public.post_${kind === "ar" ? "customer_receipt" : "supplier_payment"}_amount($1,$2,$3,'USD','Synthetic allocation',$2,$4) AS id`,
  [doc,key,date,amount]).then(r=>r.rows[0].id);
const counts = db => db.query("SELECT (SELECT count(*) FROM public.accounting_events)::text AS events,(SELECT count(*) FROM public.journal_entries)::text AS journals").then(r=>r.rows[0]);

test("partial AR/AP allocations preserve exact balances, retries and full-settlement compatibility", async () => {
 const db=await database();
 try { for (const kind of ["ar","ap"]) {
   const source=kind==="ar"?"customer_receipt":"supplier_payment";
   const doc=await post(db,kind,kind+"-doc","36500.00");
   const first=await allocate(db,kind,doc,kind+"-first","15000.00");
   assert.equal(await allocate(db,kind,doc,kind+"-first","15000"),first);
   const before=await counts(db);
   await assert.rejects(allocate(db,kind,doc,kind+"-first","15000.01"),/idempotency/);
   await assert.rejects(db.query(`SELECT public.post_${source}($1,$2,'2026-09-07','USD','Synthetic allocation',$2)`,[doc,kind+"-first"]),/idempotency/);
   await assert.rejects(db.query(`SELECT public.post_${source}($1,$2,'2026-09-07','USD','Synthetic',$2)`,[doc,kind+"-full"]),/already/);
   await assert.rejects(allocate(db,kind,doc,kind+"-too-much","21500.01"),/settlements exceed/);
   assert.deepEqual(await counts(db),before);
   let r=await report(db,kind,"2026-09-07");
   assert.equal(r.outstanding,"21500.00");assert.equal(r.ledgerBalance,"21500.00");assert.equal(r.rows[0].settled,"15000.00");
   await allocate(db,kind,doc,kind+"-final","21500.00","2026-09-20");
   assert.equal((await report(db,kind,"2026-09-19")).outstanding,"21500.00");
   r=await report(db,kind,"2026-09-20");assert.equal(r.outstanding,"0.00");assert.equal(r.reconciled,true);
   await assert.rejects(allocate(db,kind,doc,kind+"-extra","0.01","2026-09-21"),/settlements exceed/);
   const fullDoc=await post(db,kind,kind+"-legacy-full");
   await db.query(`SELECT public.post_${source}($1,$2,'2026-09-07','USD','Synthetic',$2)`,[fullDoc,kind+"-old-full"]);
   await assert.rejects(allocate(db,kind,fullDoc,kind+"-after-full","1.00"),/settlements exceed/);
 }} finally {await db.close();}
});

test("corrections and replacements preserve capacity at every effective date, including backdated allocations",async()=>{
 const db=await database();
 try {for(const kind of ["ar","ap"]) {
   const source=kind==="ar"?"customer_receipt":"supplier_payment";
   const doc=await post(db,kind,kind+"-history");
   const first=await allocate(db,kind,doc,kind+"-60","60.00");
   await allocate(db,kind,doc,kind+"-40","40.00","2026-09-08");
   const correction=(await db.query(`SELECT public.post_${source}_correction($1,$2,'2026-09-10','Synthetic correction',$2) AS id`,[first,kind+"-correction"])).rows[0].id;
   assert.equal((await report(db,kind,"2026-09-09")).outstanding,"0.00");
   assert.equal((await report(db,kind,"2026-09-10")).outstanding,"60.00");
   const before=await counts(db);
   await assert.rejects(allocate(db,kind,doc,kind+"-backdated","60.00","2026-09-09"),/settlements exceed/);
   assert.deepEqual(await counts(db),before);
   const second=await allocate(db,kind,doc,kind+"-new60","60.00","2026-09-11");
   await assert.rejects(db.query(`SELECT public.post_${source}_replacement($1,$2,'2026-09-12','Synthetic replacement',$2)`,[correction,kind+"-replacement"]),/settlements exceed/);
   await db.query(`SELECT public.post_${source}_correction($1,$2,'2026-09-12','Synthetic correction',$2)`,[second,kind+"-new-correction"]);
   await db.query(`SELECT public.post_${source}_replacement($1,$2,'2026-09-12','Synthetic replacement',$2)`,[correction,kind+"-replacement"]);
   const r=await report(db,kind,"2026-09-12");assert.equal(r.outstanding,"0.00");assert.equal(r.reconciled,true);
   const credit=kind==="ar"?"post_customer_credit_note":"post_supplier_bill_credit";
   await assert.rejects(db.query(`SELECT public.${credit}($1,$2,'2026-09-12','Synthetic credit',$2)`,[doc,kind+"-credit"]),/receipt|payment|settle/i);
 }} finally {await db.close();}
});

test("partial settlement rejects invalid amounts, dates, access and direct mutations without orphan journals",async()=>{
 const db=await database();
 try {for(const kind of ["ar","ap"]) {
   const doc=await post(db,kind,kind+"-secure");
   const before=await counts(db);
   for(const amount of [null,"0","-1","0.001","NaN","Infinity","10000000000000"]) await assert.rejects(allocate(db,kind,doc,kind+"-bad",amount),/invalid settlement/);
   for(const date of ["infinity","-infinity","2026-09-05","2027-01-01"]) await assert.rejects(allocate(db,kind,doc,kind+"-bad","1.00",date),/date|period/i);
   for(const actor of [ids.userA,ids.adminB]) {
     await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[actor]);
     await assert.rejects(allocate(db,kind,doc,kind+"-bad","1.00"),/actor|role|admin|moderator|not found|unavailable/i);
   }
   await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[ids.adminA]);
   await assert.rejects(db.query("SELECT public.validate_settlement_capacity($1,$2)",[kind,doc]),/permission denied/);
   assert.deepEqual(await counts(db),before);
   const id=await allocate(db,kind,doc,kind+"-good","1.00");
   const table=kind==="ar"?"customer_receipts":"supplier_payments";
   await assert.rejects(db.query(`UPDATE public.${table} SET amount=2 WHERE id=$1`,[id]),/permission denied|immutable|trusted/i);
   for(const role of ["anon","service_role"]) {
     await db.exec("RESET ROLE; SET ROLE "+role);
     await assert.rejects(allocate(db,kind,doc,kind+"-bad","1.00"),/permission denied/);
   }
   await db.exec("RESET ROLE; SET ROLE authenticated");
 }} finally {await db.close();}
});

test("partial settlement retains account and period gates, exact large amounts, and safe retry after close",async()=>{
 const db=await database();
 try {
   const documents={};const receipts={};
   for(const kind of ["ar","ap"]) {
     documents[kind]=await post(db,kind,kind+"-large","9999999999999.99");
     receipts[kind]=await allocate(db,kind,documents[kind],kind+"-large-first","9999999999999.98");
     assert.equal((await report(db,kind,"2026-09-07")).outstanding,"0.01");
   }
   await db.exec("RESET ROLE; UPDATE public.accounts SET is_active=false WHERE id='"+ids.cashA+"'; SET ROLE authenticated");
   for(const kind of ["ar","ap"]) await assert.rejects(allocate(db,kind,documents[kind],kind+"-inactive","0.01"),/inactive|invalid/);
   await db.exec("RESET ROLE; UPDATE public.accounts SET is_active=true WHERE id='"+ids.cashA+"'; SET ROLE authenticated");
   const period=(await db.query("SELECT id FROM public.accounting_periods WHERE entity_id=$1",[ids.entityA])).rows[0].id;
   await db.query("SELECT public.transition_accounting_period($1,'HARD_CLOSED','Synthetic final close')",[period]);
   for(const kind of ["ar","ap"]) {
     await assert.rejects(allocate(db,kind,documents[kind],kind+"-closed","0.01"),/OPEN accounting period/);
     assert.equal(await allocate(db,kind,documents[kind],kind+"-large-first","9999999999999.98"),receipts[kind]);
   }
   // Replay validates populated immutable history without rewriting it.
   await db.exec("RESET ROLE");await db.exec(migrations.at(-1));await db.exec("SET ROLE authenticated");
   for(const kind of ["ar","ap"]) assert.equal((await report(db,kind,"2026-09-07")).reconciled,true);
 } finally {await db.close();}
});
