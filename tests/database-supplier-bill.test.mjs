import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const journalMigrationUrl = new URL("../supabase/migrations/20260825010000_recovery_journal_periods.sql", import.meta.url);
const containmentMigrationUrl = new URL("../supabase/migrations/20260825040000_recovery_ap_payment_containment.sql", import.meta.url);
const supplierBillMigrationUrl = new URL("../supabase/migrations/20260825110000_recovery_supplier_bill.sql", import.meta.url);

const ids = {
  orgA: "00000000-0000-4000-8000-000000000001", orgB: "00000000-0000-4000-8000-000000000002",
  entityA: "10000000-0000-4000-8000-000000000001", entityB: "10000000-0000-4000-8000-000000000002",
  adminA: "20000000-0000-4000-8000-000000000001", userA: "20000000-0000-4000-8000-000000000002",
  adminB: "20000000-0000-4000-8000-000000000003",
  apA: "30000000-0000-4000-8000-000000000001", expenseA: "30000000-0000-4000-8000-000000000002",
  assetA: "30000000-0000-4000-8000-000000000003", apB: "30000000-0000-4000-8000-000000000004",
  expenseB: "30000000-0000-4000-8000-000000000005",
  vendorA: "40000000-0000-4000-8000-000000000001", vendorB: "40000000-0000-4000-8000-000000000002",
  legacyBillA: "50000000-0000-4000-8000-000000000001",
};

const fixture = `
  CREATE SCHEMA auth;
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
  CREATE TYPE public.app_role AS ENUM ('admin','moderator','user','viewer');
  CREATE TYPE public.account_type AS ENUM ('asset','liability','equity','revenue','expense');
  CREATE TYPE public.journal_status AS ENUM ('draft','posted','reversed');
  CREATE TYPE public.bill_status AS ENUM ('draft','pending','paid','overdue','cancelled');
  CREATE TABLE auth.users (id uuid PRIMARY KEY);
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  CREATE TABLE public.organizations (id uuid PRIMARY KEY, name text NOT NULL);
  CREATE TABLE public.entities (id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES public.organizations(id), name text NOT NULL, currency text NOT NULL DEFAULT 'USD');
  CREATE TABLE public.profiles (id uuid PRIMARY KEY REFERENCES auth.users(id), org_id uuid REFERENCES public.organizations(id), role text);
  CREATE TABLE public.user_roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id), role public.app_role NOT NULL, UNIQUE(user_id,role));
  CREATE TABLE public.accounts (id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES public.organizations(id), code text NOT NULL, name text NOT NULL, account_type public.account_type NOT NULL, is_active boolean NOT NULL DEFAULT true, UNIQUE(org_id,code));
  CREATE TABLE public.vendors (id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES public.organizations(id), name text NOT NULL, payment_terms integer DEFAULT 30);
  CREATE TABLE public.bills (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES public.organizations(id),
    entity_id uuid NOT NULL REFERENCES public.entities(id), vendor_id uuid NOT NULL REFERENCES public.vendors(id),
    bill_number text NOT NULL, issue_date date NOT NULL, due_date date NOT NULL,
    subtotal numeric(15,2) NOT NULL DEFAULT 0, tax numeric(15,2) NOT NULL DEFAULT 0,
    total numeric(15,2) NOT NULL DEFAULT 0, amount_paid numeric(15,2) NOT NULL DEFAULT 0,
    status public.bill_status NOT NULL DEFAULT 'draft', notes text, currency varchar(3) DEFAULT 'USD',
    exchange_rate numeric(18,8) DEFAULT 1, functional_total numeric(18,4),
    purchase_order_id uuid, goods_receipt_id uuid, match_status text DEFAULT 'unmatched', tax_code_id uuid,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(org_id,bill_number)
  );
  CREATE TABLE public.bank_accounts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, entity_id uuid NOT NULL, name text NOT NULL);
  CREATE TABLE public.payment_runs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, entity_id uuid NOT NULL, bank_account_id uuid, run_number text NOT NULL, run_date date NOT NULL, total_amount numeric NOT NULL, status text NOT NULL DEFAULT 'draft');
  CREATE TABLE public.payment_run_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payment_run_id uuid NOT NULL, bill_id uuid NOT NULL, amount numeric NOT NULL);
  CREATE TABLE public.journal_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES public.organizations(id), entity_id uuid NOT NULL REFERENCES public.entities(id),
    entry_number text NOT NULL, entry_date date NOT NULL, memo text, status public.journal_status NOT NULL DEFAULT 'draft',
    created_by uuid REFERENCES auth.users(id), posted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(org_id,entry_number)
  );
  CREATE TABLE public.journal_lines (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), journal_entry_id uuid NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
    account_id uuid NOT NULL REFERENCES public.accounts(id), debit numeric(15,2) NOT NULL DEFAULT 0, credit numeric(15,2) NOT NULL DEFAULT 0, memo text, created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE OR REPLACE FUNCTION public.get_user_org_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT org_id FROM public.profiles WHERE id=auth.uid() $$;
  CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid,_role public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role) $$;
  INSERT INTO public.organizations VALUES ('${ids.orgA}','Org A'),('${ids.orgB}','Org B');
  INSERT INTO public.entities VALUES ('${ids.entityA}','${ids.orgA}','Entity A','USD'),('${ids.entityB}','${ids.orgB}','Entity B','USD');
  INSERT INTO auth.users VALUES ('${ids.adminA}'),('${ids.userA}'),('${ids.adminB}');
  INSERT INTO public.profiles VALUES ('${ids.adminA}','${ids.orgA}','admin'),('${ids.userA}','${ids.orgA}','user'),('${ids.adminB}','${ids.orgB}','admin');
  INSERT INTO public.user_roles(user_id,role) VALUES ('${ids.adminA}','admin'),('${ids.userA}','user'),('${ids.adminB}','admin');
  INSERT INTO public.accounts VALUES
    ('${ids.apA}','${ids.orgA}','2100','Accounts Payable','liability',true),('${ids.expenseA}','${ids.orgA}','5000','Operating Expense','expense',true),
    ('${ids.assetA}','${ids.orgA}','1000','Asset','asset',true),('${ids.apB}','${ids.orgB}','2100','Accounts Payable','liability',true),
    ('${ids.expenseB}','${ids.orgB}','5000','Operating Expense','expense',true);
  INSERT INTO public.vendors VALUES ('${ids.vendorA}','${ids.orgA}','Vendor A',30),('${ids.vendorB}','${ids.orgB}','Vendor B',30);
  INSERT INTO public.bills(id,org_id,entity_id,vendor_id,bill_number,issue_date,due_date,subtotal,tax,total,amount_paid,status,currency,exchange_rate,functional_total)
    VALUES ('${ids.legacyBillA}','${ids.orgA}','${ids.entityA}','${ids.vendorA}','LEGACY-BILL','2026-08-01','2026-08-31',50,0,50,0,'draft','USD',1,50);
`;

async function createDb({ supplierBill = true } = {}) {
  const db = new PGlite();
  await db.exec(fixture);
  await db.exec(await readFile(journalMigrationUrl,"utf8"));
  await db.exec(await readFile(containmentMigrationUrl,"utf8"));
  const supplierBillMigration = await readFile(supplierBillMigrationUrl,"utf8");
  if (supplierBill) await db.exec(supplierBillMigration);
  await db.exec(`SELECT set_config('request.jwt.claim.sub','${ids.adminA}',false)`);
  return { db, supplierBillMigration };
}

const billLines = JSON.stringify([
  { description:"Hosting", quantity:"2.0000", unit_price:"40.1250" },
  { description:"Support", quantity:"1.0000", unit_price:"19.7500" },
]);

async function prepare(db, entityId=ids.entityA, apId=ids.apA, expenseId=ids.expenseA, key="ap-control-v1") {
  await db.exec(`SELECT public.create_accounting_period('${entityId}','2026-08-01','2026-08-31','period:${entityId}')`);
  await db.exec(`SELECT public.configure_entity_supplier_bill_accounts('${entityId}','${apId}','${expenseId}','${key}')`);
}

async function postBill(db, number, key, overrides={}) {
  const entityId=overrides.entityId ?? ids.entityA;
  const vendorId=overrides.vendorId ?? ids.vendorA;
  const currency=overrides.currency ?? "USD";
  const tax=overrides.tax ?? 0;
  const result=await db.query(`SELECT public.post_supplier_bill('${entityId}','${vendorId}','${number}','2026-08-25','2026-09-24','${currency}',${tax},null,'${billLines}'::jsonb,'${key}') AS id`);
  return result.rows[0].id;
}

test("supplier-bill migration replays and removes hostile grants, policies, and overloads", async()=>{
  const {db,supplierBillMigration}=await createDb();
  await db.exec(`GRANT INSERT,UPDATE,DELETE ON public.bills,public.bill_lines,public.entity_supplier_bill_account_controls TO authenticated,service_role; CREATE POLICY hostile_bill_all ON public.bill_lines FOR ALL TO authenticated USING(true) WITH CHECK(true); CREATE FUNCTION public.post_supplier_bill(uuid,text) RETURNS uuid LANGUAGE sql SECURITY DEFINER AS 'SELECT $1';`);
  await db.exec(supplierBillMigration);
  for(const table of ["bills","bill_lines","entity_supplier_bill_account_controls"]){
    const grants=await db.query(`SELECT has_table_privilege('authenticated','public.${table}','SELECT') AS auth_read,has_table_privilege('authenticated','public.${table}','UPDATE') AS auth_update,has_table_privilege('service_role','public.${table}','INSERT') AS service_insert`);
    assert.deepEqual(grants.rows[0],{auth_read:true,auth_update:false,service_insert:false},table);
  }
  const overloads=await db.query(`SELECT count(*)::int AS count FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='post_supplier_bill' AND (p.prokind<>'f' OR oidvectortypes(p.proargtypes)<>'uuid, uuid, text, date, date, text, numeric, text, jsonb, text')`);
  assert.equal(overloads.rows[0].count,0);
  await db.close();
});

test("supplier bill atomically creates exact immutable bill-line-event-journal evidence",async()=>{
  const {db,supplierBillMigration}=await createDb(); await prepare(db);
  const billId=await postBill(db,"BILL-1001","bill:1001");
  const graph=await db.query(`SELECT bill.accounting_status,bill.subtotal::text,bill.tax::text,bill.total::text,bill.amount_paid::text,bill.status::text,bill.currency,event.source_type,event.source_id=bill.id AS event_source_matches,journal.status::text AS journal_status,journal.source_module,(SELECT count(*)::int FROM public.bill_lines line WHERE line.bill_id=bill.id) AS line_count,(SELECT sum(line.debit)::text FROM public.journal_lines line WHERE line.journal_entry_id=journal.id) AS debit,(SELECT sum(line.credit)::text FROM public.journal_lines line WHERE line.journal_entry_id=journal.id) AS credit FROM public.bills bill JOIN public.accounting_events event ON event.id=bill.accounting_event_id JOIN public.journal_entries journal ON journal.id=bill.journal_entry_id WHERE bill.id='${billId}'`);
  assert.deepEqual(graph.rows[0],{accounting_status:"POSTED",subtotal:"100.00",tax:"0.00",total:"100.00",amount_paid:"0.00",status:"pending",currency:"USD",source_type:"supplier_bill",event_source_matches:true,journal_status:"posted",source_module:"ap",line_count:2,debit:"100.00",credit:"100.00"});
  const legacy=await db.query(`SELECT accounting_status,accounting_event_id,journal_entry_id FROM public.bills WHERE id='${ids.legacyBillA}'`);
  assert.deepEqual(legacy.rows[0],{accounting_status:"UNVERIFIED_LEGACY",accounting_event_id:null,journal_entry_id:null});
  await db.exec(supplierBillMigration); await db.query(`SELECT public.validate_supplier_bill_graph('${billId}')`);
  for(const sql of [`UPDATE public.bills SET total=1 WHERE id='${billId}'`,`DELETE FROM public.bill_lines WHERE bill_id='${billId}'`,`TRUNCATE public.entity_supplier_bill_account_controls CASCADE`]) await assert.rejects(db.exec(sql),/supplier bill|immutable|trusted/i);
  await db.close();
});

test("supplier bill retry remains safe after close and account retirement",async()=>{
  const {db}=await createDb(); await prepare(db); const first=await postBill(db,"BILL-RETRY","bill:retry");
  const period=await db.query(`SELECT id FROM public.accounting_periods WHERE entity_id='${ids.entityA}'`);
  await db.exec(`SELECT public.transition_accounting_period('${period.rows[0].id}','HARD_CLOSED','closed after bill')`);
  await db.exec(`UPDATE public.accounts SET is_active=false WHERE id IN ('${ids.apA}','${ids.expenseA}')`);
  assert.equal(first,await postBill(db,"BILL-RETRY","bill:retry")); await db.close();
});

test("supplier bill controls enforce tenant, account purpose, and actor authorization",async()=>{
  const {db}=await createDb();
  await assert.rejects(db.query(`SELECT public.configure_entity_supplier_bill_accounts('${ids.entityA}','${ids.apB}','${ids.expenseA}','cross')`),/payable|organization|tenant/i);
  await assert.rejects(db.query(`SELECT public.configure_entity_supplier_bill_accounts('${ids.entityA}','${ids.assetA}','${ids.expenseA}','wrong-ap')`),/liability|payable/i);
  await db.exec(`SELECT set_config('request.jwt.claim.sub','${ids.userA}',false)`);
  await assert.rejects(db.query(`SELECT public.configure_entity_supplier_bill_accounts('${ids.entityA}','${ids.apA}','${ids.expenseA}','user')`),/admin|moderator|authorized/i);
  await db.close();
});

test("tax, FX, foreign vendor, and general reversal fail atomically",async()=>{
  const {db}=await createDb(); await prepare(db);
  await assert.rejects(postBill(db,"BILL-TAX","bill:tax",{tax:1}),/zero.tax|tax/i);
  await assert.rejects(postBill(db,"BILL-FX","bill:fx",{currency:"EUR"}),/functional currency|cross.currency/i);
  await assert.rejects(postBill(db,"BILL-CROSS","bill:cross",{vendorId:ids.vendorB}),/vendor|organization|tenant/i);
  const billId=await postBill(db,"BILL-GUARD","bill:guard"); const journal=await db.query(`SELECT journal_entry_id FROM public.bills WHERE id='${billId}'`);
  await assert.rejects(db.query(`SELECT public.reverse_posted_journal('${journal.rows[0].journal_entry_id}','2026-08-26','Bypass','reverse:bill')`),/supplier bill|vendor credit|bill reversal/i);
  const residue=await db.query(`SELECT count(*)::int AS count FROM public.bills WHERE accounting_status='POSTED'`); assert.equal(residue.rows[0].count,1); await db.close();
});

test("supplier-bill RPCs hide foreign targets and protect event/journal links",async()=>{
  const {db}=await createDb(); await prepare(db); const billId=await postBill(db,"BILL-HIDE","bill:hide");
  const links=await db.query(`SELECT accounting_event_id,journal_entry_id FROM public.bills WHERE id='${billId}'`);
  for(const sql of [`UPDATE public.accounting_events SET source_id=NULL WHERE id='${links.rows[0].accounting_event_id}'`,`UPDATE public.journal_entries SET accounting_event_id=NULL WHERE id='${links.rows[0].journal_entry_id}'`]) await assert.rejects(db.exec(sql),/supplier bill|immutable|trusted/i);
  const missing="ffffffff-ffff-4fff-8fff-ffffffffffff";
  for(const entityId of [ids.entityB,missing]){
    await assert.rejects(db.query(`SELECT public.configure_entity_supplier_bill_accounts('${entityId}','${ids.apA}','${ids.expenseA}','hidden:${entityId}')`),/entity not found or unavailable/);
    await assert.rejects(postBill(db,"BILL-HIDDEN",`bill:hidden:${entityId}`,{entityId}),/entity not found or unavailable/);
  }
  await db.close();
});
