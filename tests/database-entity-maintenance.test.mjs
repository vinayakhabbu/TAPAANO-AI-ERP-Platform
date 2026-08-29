import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migrationUrls = [
  "../supabase/migrations/20260825070000_recovery_accounting_master_containment.sql",
  "../supabase/migrations/20260825220000_recovery_entity_maintenance.sql",
].map((path) => new URL(path, import.meta.url));

const ids = {
  orgA: "00000000-0000-4000-8000-000000000001",
  orgB: "00000000-0000-4000-8000-000000000002",
  adminA: "10000000-0000-4000-8000-000000000001",
  moderatorA: "10000000-0000-4000-8000-000000000002",
  adminB: "10000000-0000-4000-8000-000000000003",
  entityA: "20000000-0000-4000-8000-000000000001",
  entityB: "20000000-0000-4000-8000-000000000002",
};

const fixture = `
  CREATE SCHEMA auth;
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN;
  CREATE TYPE public.app_role AS ENUM ('admin','moderator','user','viewer');
  CREATE TYPE public.account_type AS ENUM ('asset','liability','equity','revenue','expense');
  CREATE TABLE auth.users(id uuid PRIMARY KEY);
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid
  $$;
  CREATE TABLE public.organizations(id uuid PRIMARY KEY,name text NOT NULL);
  CREATE TABLE public.profiles(
    id uuid PRIMARY KEY REFERENCES auth.users(id),org_id uuid NOT NULL,
    display_name text,role public.app_role NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(org_id,id),UNIQUE(org_id,id,role)
  );
  CREATE TABLE public.user_roles(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,org_id uuid NOT NULL,
    role public.app_role NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(org_id,user_id),UNIQUE(user_id,role),
    FOREIGN KEY(org_id,user_id,role) REFERENCES public.profiles(org_id,id,role)
  );
  CREATE OR REPLACE FUNCTION public.get_user_org_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,auth AS $$
    SELECT org_id FROM public.profiles WHERE id=auth.uid()
  $$;
  CREATE TABLE public.entities(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,name text NOT NULL,
    currency text NOT NULL DEFAULT 'USD',created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE public.accounts(
    id uuid PRIMARY KEY,org_id uuid NOT NULL,code text NOT NULL,name text NOT NULL,
    account_type public.account_type NOT NULL,parent_id uuid REFERENCES public.accounts(id),
    is_active boolean NOT NULL DEFAULT true,controlling_category text DEFAULT 'no_co',
    default_cost_center_id uuid,default_internal_order_id uuid,
    created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(org_id,code)
  );
  CREATE TABLE public.customers(id uuid PRIMARY KEY,org_id uuid NOT NULL,name text NOT NULL);
  CREATE TABLE public.vendors(id uuid PRIMARY KEY,org_id uuid NOT NULL,name text NOT NULL);
  CREATE TABLE public.accounting_periods(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,entity_id uuid NOT NULL);
  CREATE TABLE public.entity_invoice_account_controls(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,entity_id uuid NOT NULL);
  CREATE TABLE public.entity_customer_receipt_controls(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,entity_id uuid NOT NULL);
  CREATE TABLE public.entity_supplier_bill_account_controls(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,entity_id uuid NOT NULL);
  CREATE TABLE public.entity_supplier_payment_account_controls(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,entity_id uuid NOT NULL);

  INSERT INTO public.organizations VALUES('${ids.orgA}','A'),('${ids.orgB}','B');
  INSERT INTO auth.users VALUES('${ids.adminA}'),('${ids.moderatorA}'),('${ids.adminB}');
  INSERT INTO public.profiles(id,org_id,display_name,role) VALUES
    ('${ids.adminA}','${ids.orgA}','Admin A','admin'),
    ('${ids.moderatorA}','${ids.orgA}','Moderator A','moderator'),
    ('${ids.adminB}','${ids.orgB}','Admin B','admin');
  INSERT INTO public.user_roles(user_id,org_id,role) VALUES
    ('${ids.adminA}','${ids.orgA}','admin'),
    ('${ids.moderatorA}','${ids.orgA}','moderator'),
    ('${ids.adminB}','${ids.orgB}','admin');
  INSERT INTO public.entities(id,org_id,name,currency) VALUES
    ('${ids.entityA}','${ids.orgA}','Entity A','USD'),
    ('${ids.entityB}','${ids.orgB}','Entity B','EUR');
`;

async function createDb() {
  const db=new PGlite();
  await db.exec(fixture);
  const migrations=await Promise.all(migrationUrls.map((url)=>readFile(url,"utf8")));
  for(const migration of migrations) await db.exec(migration);
  return {db,maintenanceMigration:migrations.at(-1)};
}

async function setActor(db,actorId){
  await db.exec("RESET ROLE");
  await db.exec(`SELECT set_config('request.jwt.claim.sub','${actorId}',false)`);
  await db.exec("SET ROLE authenticated");
}

async function errorMessage(operation){
  try{await operation();}catch(error){return error instanceof Error?error.message:String(error);}
  assert.fail("operation unexpectedly succeeded");
}

test("entity-maintenance migration replays and restores exact grants, policies, and overloads",async()=>{
  const {db,maintenanceMigration}=await createDb();
  await db.exec(`
    GRANT ALL ON public.entity_master_events TO authenticated,service_role;
    GRANT UPDATE(currency),INSERT(name) ON public.entities TO authenticated,service_role;
    CREATE POLICY hostile_entity_events ON public.entity_master_events FOR ALL TO authenticated USING(true) WITH CHECK(true);
    CREATE FUNCTION public.create_tenant_entity(text,text) RETURNS uuid LANGUAGE sql SECURITY DEFINER AS 'SELECT gen_random_uuid()';
    GRANT EXECUTE ON FUNCTION public.create_tenant_entity(text,text) TO authenticated;
  `);
  await db.exec(maintenanceMigration);
  const grants=await db.query(`SELECT
    has_table_privilege('authenticated','public.entities','SELECT') AS entity_read,
    has_table_privilege('authenticated','public.entities','UPDATE') AS entity_update,
    has_table_privilege('authenticated','public.entity_master_events','SELECT') AS event_read,
    has_table_privilege('service_role','public.entity_master_events','INSERT') AS service_insert,
    has_column_privilege('authenticated','public.entities','currency','UPDATE') AS currency_update,
    has_function_privilege('authenticated','public.create_tenant_entity(text,text,text,text)','EXECUTE') AS browser_execute,
    has_function_privilege('service_role','public.create_tenant_entity(text,text,text,text)','EXECUTE') AS service_execute`);
  assert.deepEqual(grants.rows[0],{entity_read:true,entity_update:false,event_read:false,
    service_insert:false,currency_update:false,browser_execute:true,service_execute:false});
  const hostile=await db.query(`SELECT
    (SELECT count(*)::int FROM pg_policies WHERE schemaname='public' AND tablename='entity_master_events') AS policies,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='create_tenant_entity' AND oidvectortypes(p.proargtypes)='text, text') AS overloads`);
  assert.deepEqual(hostile.rows[0],{policies:0,overloads:0});
  await db.close();
});

test("tenant admin creates an exact entity with immutable evidence and safe retry",async()=>{
  const {db}=await createDb();await setActor(db,ids.adminA);
  const args=["Singapore Operations","SGD","Approved legal entity","entity:create:sg"];
  const first=await db.query("SELECT public.create_tenant_entity($1,$2,$3,$4) AS id",args);
  const retry=await db.query("SELECT public.create_tenant_entity($1,$2,$3,$4) AS id",args);
  assert.equal(retry.rows[0].id,first.rows[0].id);
  const row=await db.query("SELECT org_id,name,currency FROM public.entities WHERE id=$1",[first.rows[0].id]);
  assert.deepEqual(row.rows[0],{org_id:ids.orgA,name:"Singapore Operations",currency:"SGD"});
  const events=await db.query("SELECT * FROM public.list_tenant_entity_events()");
  assert.deepEqual(events.rows.map(({event_type,old_name,new_name,currency})=>({event_type,old_name,new_name,currency})),
    [{event_type:"CREATE",old_name:null,new_name:"Singapore Operations",currency:"SGD"}]);
  await assert.rejects(db.query("SELECT public.create_tenant_entity('Conflict','USD','Approved','entity:create:sg')"),/idempotency key conflict/);
  await db.close();
});

test("entity creation enforces tenant admin and normalized immutable currency",async()=>{
  const {db}=await createDb();await setActor(db,ids.adminA);
  await assert.rejects(db.query("SELECT public.create_tenant_entity(' Entity','USD','Reason','bad-name')"),/entity name/);
  await assert.rejects(db.query("SELECT public.create_tenant_entity('Entity','usd','Reason','bad-currency')"),/currency/);
  await assert.rejects(db.query("SELECT public.create_tenant_entity('Entity','USDX','Reason','long-currency')"),/currency/);
  await setActor(db,ids.moderatorA);
  await assert.rejects(db.query("SELECT public.create_tenant_entity('Entity','USD','Reason','unauthorized')"),/tenant admin/);
  await assert.rejects(db.query("SELECT * FROM public.list_tenant_entity_events()"),/tenant admin/);
  await db.close();
});

test("entity rename is audited, idempotent, tenant hidden, and preserves currency",async()=>{
  const {db}=await createDb();await setActor(db,ids.adminA);
  const args=[ids.entityA,"Entity A Holdings","Approved legal-name update","entity:rename:a"];
  const first=await db.query("SELECT public.rename_tenant_entity($1,$2,$3,$4) AS id",args);
  const retry=await db.query("SELECT public.rename_tenant_entity($1,$2,$3,$4) AS id",args);
  assert.equal(first.rows[0].id,ids.entityA);assert.equal(retry.rows[0].id,ids.entityA);
  const row=await db.query(`SELECT name,currency FROM public.entities WHERE id='${ids.entityA}'`);
  assert.deepEqual(row.rows[0],{name:"Entity A Holdings",currency:"USD"});
  await setActor(db,ids.adminB);
  const foreign=await errorMessage(()=>db.query("SELECT public.rename_tenant_entity($1,$2,$3,$4)",[ids.entityA,"Hidden","Reason","foreign"]));
  const missing=await errorMessage(()=>db.query("SELECT public.rename_tenant_entity($1,$2,$3,$4)",["20000000-0000-4000-8000-000000000099","Hidden","Reason","missing"]));
  assert.equal(foreign,missing);assert.match(foreign,/entity not found or unavailable/);
  await db.close();
});

test("new entity creation invents no period or accounting-control configuration",async()=>{
  const {db}=await createDb();await setActor(db,ids.adminA);
  const created=await db.query("SELECT public.create_tenant_entity('Unconfigured Entity','GBP','Approved','entity:create:unconfigured') AS id");
  const id=created.rows[0].id;
  await db.exec("RESET ROLE");
  const counts=await db.query(`SELECT
    (SELECT count(*)::int FROM public.accounting_periods WHERE entity_id='${id}') AS periods,
    (SELECT count(*)::int FROM public.entity_invoice_account_controls WHERE entity_id='${id}') AS invoice_controls,
    (SELECT count(*)::int FROM public.entity_customer_receipt_controls WHERE entity_id='${id}') AS receipt_controls,
    (SELECT count(*)::int FROM public.entity_supplier_bill_account_controls WHERE entity_id='${id}') AS bill_controls,
    (SELECT count(*)::int FROM public.entity_supplier_payment_account_controls WHERE entity_id='${id}') AS payment_controls`);
  assert.deepEqual(counts.rows[0],{periods:0,invoice_controls:0,receipt_controls:0,bill_controls:0,payment_controls:0});
  await db.close();
});

test("physical entity and audit rows reject owner mutation, deletion, and truncation",async()=>{
  const {db}=await createDb();await setActor(db,ids.adminA);
  await db.query("SELECT public.create_tenant_entity('Audit Entity','CAD','Approved','entity:create:audit')");
  await db.exec("RESET ROLE");
  for(const sql of [
    `INSERT INTO public.entities(org_id,name,currency) VALUES('${ids.orgA}','Forged','USD')`,
    `UPDATE public.entities SET currency='EUR' WHERE id='${ids.entityA}'`,
    `UPDATE public.entities SET org_id='${ids.orgB}' WHERE id='${ids.entityA}'`,
    `DELETE FROM public.entities WHERE id='${ids.entityA}'`,"TRUNCATE public.entities",
    "UPDATE public.entity_master_events SET reason='rewritten'",
    `INSERT INTO public.entity_master_events(org_id,entity_id,actor_id,event_type,reason,idempotency_key,new_snapshot)
      VALUES('${ids.orgA}','${ids.entityA}','${ids.adminA}','CREATE','Forged','forged','{}'::jsonb)`,
    "DELETE FROM public.entity_master_events","TRUNCATE public.entity_master_events",
  ]) await assert.rejects(db.exec(sql),/immutable|controlled entity maintenance|foreign key constraint/);
  await db.close();
});
