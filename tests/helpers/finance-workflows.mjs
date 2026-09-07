import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { ids, fixture } from "./subledger-fixture.mjs";

const names = ["20260825010000_recovery_journal_periods", "20260825020000_recovery_customer_invoice", "20260825040000_recovery_ap_payment_containment",
  "20260825090000_recovery_customer_credit_note", "20260825100000_recovery_customer_receipt", "20260825110000_recovery_supplier_bill",
  "20260825120000_recovery_supplier_bill_credit", "20260825130000_recovery_supplier_payment", "20260825140000_recovery_customer_receipt_correction",
  "20260825150000_recovery_supplier_payment_correction", "20260825160000_recovery_customer_receipt_replacement", "20260825170000_recovery_supplier_payment_replacement",
  "20260906030000_recovery_deferred_validation_privileges", "20260906040000_recovery_posting_source_modules", "20260906050000_recovery_trial_balance", "20260906060000_finance_account_ledger",
  "20260906080000_finance_manual_journal", "20260906090000_finance_subledger_aging", "20260907010000_partial_settlements", "20260907020000_cash_reconciliation", "20260907030000_finance_approvals", "20260907040000_contract_billing_revenue", "20260907050000_finance_integrations"];
const migrations = await Promise.all(names.map(name => readFile(new URL(`../../supabase/migrations/${name}.sql`, import.meta.url), "utf8")));
export async function financeDatabase() {
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
  await db.exec("RESET ROLE; INSERT INTO auth.users VALUES ('20000000-0000-4000-8000-000000000004'); INSERT INTO public.profiles VALUES ('20000000-0000-4000-8000-000000000004','"+ids.orgA+"','admin'); INSERT INTO public.user_roles(user_id,role) VALUES('20000000-0000-4000-8000-000000000004','admin'); SET ROLE authenticated");
  return db;
}
export { ids };
export const reviewer = "20000000-0000-4000-8000-000000000004";
export const actor = (db,id) => db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[id]);
export const call = (db,name,...args) => db.query(`SELECT public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) AS result`,args).then(r=>r.rows[0].result);
export const journal = (db,key,date,amount,entity=ids.entityA) => call(db,"post_manual_journal",entity,key,date,"Synthetic cash movement",JSON.stringify([
 {account_id:ids.cashA,debit:amount.startsWith('-')?'0.00':amount,credit:amount.startsWith('-')?amount.slice(1):'0.00'},
 {account_id:ids.revenueA,debit:amount.startsWith('-')?amount.slice(1):'0.00',credit:amount.startsWith('-')?'0.00':amount}
]),key);
