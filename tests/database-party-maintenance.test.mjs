import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migrationUrls = [
  "../supabase/migrations/20260825070000_recovery_accounting_master_containment.sql",
  "../supabase/migrations/20260825210000_recovery_party_maintenance.sql",
].map((path) => new URL(path, import.meta.url));

const ids = {
  orgA: "00000000-0000-4000-8000-000000000001",
  orgB: "00000000-0000-4000-8000-000000000002",
  adminA: "10000000-0000-4000-8000-000000000001",
  moderatorA: "10000000-0000-4000-8000-000000000002",
  adminB: "10000000-0000-4000-8000-000000000003",
  customerA: "20000000-0000-4000-8000-000000000001",
  customerB: "20000000-0000-4000-8000-000000000002",
  vendorA: "30000000-0000-4000-8000-000000000001",
  vendorB: "30000000-0000-4000-8000-000000000002",
};

const fixture = `
  CREATE SCHEMA auth;
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN;
  CREATE TYPE public.app_role AS ENUM ('admin','moderator','user','viewer');
  CREATE TYPE public.account_type AS ENUM ('asset','liability','equity','revenue','expense');
  CREATE TABLE auth.users (id uuid PRIMARY KEY);
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  CREATE TABLE public.organizations (id uuid PRIMARY KEY, name text NOT NULL);
  CREATE TABLE public.profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id), org_id uuid NOT NULL,
    display_name text, role public.app_role NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(org_id,id), UNIQUE(org_id,id,role)
  );
  CREATE TABLE public.user_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
    org_id uuid NOT NULL, role public.app_role NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(org_id,user_id), UNIQUE(user_id,role),
    FOREIGN KEY (org_id,user_id,role) REFERENCES public.profiles(org_id,id,role)
  );
  CREATE OR REPLACE FUNCTION public.get_user_org_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,auth AS $$
    SELECT org_id FROM public.profiles WHERE id=auth.uid()
  $$;
  CREATE TABLE public.entities (
    id uuid PRIMARY KEY, org_id uuid NOT NULL, name text NOT NULL, currency text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE public.accounts (
    id uuid PRIMARY KEY, org_id uuid NOT NULL, code text NOT NULL, name text NOT NULL,
    account_type public.account_type NOT NULL, parent_id uuid REFERENCES public.accounts(id),
    is_active boolean NOT NULL DEFAULT true, controlling_category text DEFAULT 'no_co',
    default_cost_center_id uuid, default_internal_order_id uuid,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(org_id,code)
  );
  CREATE TABLE public.customers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL,
    name text NOT NULL, email text, phone text, address text,
    payment_terms integer DEFAULT 30, credit_limit numeric(15,2),
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE public.vendors (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL,
    name text NOT NULL, email text, phone text, address text,
    payment_terms integer DEFAULT 30,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE public.invoices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL,
    customer_id uuid NOT NULL, accounting_status text NOT NULL DEFAULT 'POSTED'
  );
  CREATE TABLE public.bills (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL,
    vendor_id uuid NOT NULL, accounting_status text NOT NULL DEFAULT 'POSTED'
  );

  INSERT INTO public.organizations VALUES ('${ids.orgA}','A'),('${ids.orgB}','B');
  INSERT INTO auth.users VALUES ('${ids.adminA}'),('${ids.moderatorA}'),('${ids.adminB}');
  INSERT INTO public.profiles(id,org_id,display_name,role) VALUES
    ('${ids.adminA}','${ids.orgA}','Admin A','admin'),
    ('${ids.moderatorA}','${ids.orgA}','Moderator A','moderator'),
    ('${ids.adminB}','${ids.orgB}','Admin B','admin');
  INSERT INTO public.user_roles(user_id,org_id,role) VALUES
    ('${ids.adminA}','${ids.orgA}','admin'),
    ('${ids.moderatorA}','${ids.orgA}','moderator'),
    ('${ids.adminB}','${ids.orgB}','admin');
  INSERT INTO public.customers(id,org_id,name,email,payment_terms,credit_limit) VALUES
    ('${ids.customerA}','${ids.orgA}','Customer A','billing@a.test',30,1000),
    ('${ids.customerB}','${ids.orgB}','Customer B','billing@b.test',30,1000);
  INSERT INTO public.vendors(id,org_id,name,email,payment_terms) VALUES
    ('${ids.vendorA}','${ids.orgA}','Vendor A','ap@a.test',30),
    ('${ids.vendorB}','${ids.orgB}','Vendor B','ap@b.test',30);
`;

async function createDb() {
  const db = new PGlite();
  await db.exec(fixture);
  const migrations = await Promise.all(migrationUrls.map((url) => readFile(url, "utf8")));
  for (const migration of migrations) await db.exec(migration);
  return { db, maintenanceMigration: migrations.at(-1) };
}

async function setActor(db, actorId) {
  await db.exec("RESET ROLE");
  await db.exec(`SELECT set_config('request.jwt.claim.sub','${actorId}',false)`);
  await db.exec("SET ROLE authenticated");
}

test("party-maintenance migration replays and restores exact grants, policies, and overloads", async () => {
  const { db, maintenanceMigration } = await createDb();
  await db.exec(`
    GRANT ALL ON public.party_master_events TO authenticated,service_role;
    GRANT UPDATE(name),INSERT(email) ON public.customers TO authenticated,service_role;
    CREATE POLICY hostile_events ON public.party_master_events FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
    CREATE FUNCTION public.create_tenant_customer(text,text) RETURNS uuid
      LANGUAGE sql SECURITY DEFINER AS 'SELECT gen_random_uuid()';
    GRANT EXECUTE ON FUNCTION public.create_tenant_customer(text,text) TO authenticated;
  `);
  await db.exec(maintenanceMigration);
  const grants = await db.query(`
    SELECT has_table_privilege('authenticated','public.customers','SELECT') AS customer_read,
      has_table_privilege('authenticated','public.customers','UPDATE') AS customer_update,
      has_table_privilege('authenticated','public.party_master_events','SELECT') AS event_read,
      has_table_privilege('service_role','public.party_master_events','INSERT') AS service_insert,
      has_column_privilege('authenticated','public.customers','name','UPDATE') AS customer_name_update,
      has_column_privilege('service_role','public.customers','email','INSERT') AS customer_email_insert
  `);
  assert.deepEqual(grants.rows[0], {
    customer_read: true, customer_update: false, event_read: false, service_insert: false,
    customer_name_update: false, customer_email_insert: false,
  });
  const routineGrants = await db.query(`SELECT
    has_function_privilege('authenticated','public.create_tenant_customer(text,text,text,text,integer,numeric,text,text)','EXECUTE') AS browser_execute,
    has_function_privilege('service_role','public.create_tenant_customer(text,text,text,text,integer,numeric,text,text)','EXECUTE') AS service_execute,
    has_function_privilege('authenticated','public.maintain_tenant_party(text,text,uuid,text,text,text,text,integer,numeric,text,text)','EXECUTE') AS helper_execute`);
  assert.deepEqual(routineGrants.rows[0], { browser_execute: true, service_execute: false, helper_execute: false });
  const policies = await db.query(`SELECT count(*)::int AS count FROM pg_policies
    WHERE schemaname='public' AND tablename='party_master_events'`);
  assert.equal(policies.rows[0].count, 0);
  const overloads = await db.query(`SELECT count(*)::int AS count FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='create_tenant_customer'
      AND oidvectortypes(p.proargtypes)='text, text'`);
  assert.equal(overloads.rows[0].count, 0);
  await db.close();
});

test("tenant admin creates exact customer and vendor rows with immutable audit evidence and safe retry", async () => {
  const { db } = await createDb();
  await setActor(db, ids.adminA);
  const customerArgs = ["Customer New", "new@customer.test", "+1 555 0100", "1 Main Street", 45, 5000, "Approved customer", "customer:create:new"];
  const vendorArgs = ["Vendor New", "new@vendor.test", "+1 555 0200", "2 Main Street", 60, "Approved vendor", "vendor:create:new"];
  const firstCustomer = await db.query("SELECT public.create_tenant_customer($1,$2,$3,$4,$5,$6,$7,$8) AS id", customerArgs);
  const retryCustomer = await db.query("SELECT public.create_tenant_customer($1,$2,$3,$4,$5,$6,$7,$8) AS id", customerArgs);
  const firstVendor = await db.query("SELECT public.create_tenant_vendor($1,$2,$3,$4,$5,$6,$7) AS id", vendorArgs);
  const retryVendor = await db.query("SELECT public.create_tenant_vendor($1,$2,$3,$4,$5,$6,$7) AS id", vendorArgs);
  assert.equal(retryCustomer.rows[0].id, firstCustomer.rows[0].id);
  assert.equal(retryVendor.rows[0].id, firstVendor.rows[0].id);
  const parties = await db.query("SELECT * FROM public.list_tenant_party_events() ORDER BY occurred_at,event_id");
  assert.equal(parties.rows.length, 2);
  assert.deepEqual(parties.rows.map(({ party_type, event_type, old_name, new_name }) => ({ party_type, event_type, old_name, new_name })), [
    { party_type: "customer", event_type: "CREATE", old_name: null, new_name: "Customer New" },
    { party_type: "vendor", event_type: "CREATE", old_name: null, new_name: "Vendor New" },
  ]);
  await assert.rejects(
    db.query("SELECT public.create_tenant_customer($1,$2,$3,$4,$5,$6,$7,$8)", [...customerArgs.slice(0, 1), "conflict@test", ...customerArgs.slice(2)]),
    /idempotency key conflict/,
  );
  await db.close();
});

test("party creation enforces admin authorization and normalized bounded fields", async () => {
  const { db } = await createDb();
  await setActor(db, ids.moderatorA);
  await assert.rejects(db.query(
    "SELECT public.create_tenant_vendor('Vendor','v@test',NULL,NULL,30,'Reason','key')",
  ), /tenant admin/);
  await setActor(db, ids.adminA);
  await assert.rejects(db.query(
    "SELECT public.create_tenant_customer(' Customer','c@test',NULL,NULL,30,10,'Reason','bad-name')",
  ), /customer name/);
  await assert.rejects(db.query(
    "SELECT public.create_tenant_customer('Customer','c@test',NULL,NULL,-1,10,'Reason','bad-terms')",
  ), /payment terms/);
  await assert.rejects(db.query(
    "SELECT public.create_tenant_customer('Customer','c@test',NULL,NULL,30,-1,'Reason','bad-limit')",
  ), /credit limit/);
  await db.close();
});

test("party updates are exact, audited, idempotent, structurally immutable, and tenant hidden", async () => {
  const { db } = await createDb();
  await setActor(db, ids.adminA);
  const args = [ids.customerA, "Customer A renamed", "new-billing@a.test", "+1 555 0111", "10 New Street", 45, 2500, "Approved profile update", "customer:update:a"];
  const first = await db.query("SELECT public.update_tenant_customer($1,$2,$3,$4,$5,$6,$7,$8,$9) AS id", args);
  const retry = await db.query("SELECT public.update_tenant_customer($1,$2,$3,$4,$5,$6,$7,$8,$9) AS id", args);
  assert.equal(first.rows[0].id, ids.customerA);
  assert.equal(retry.rows[0].id, ids.customerA);
  const row = await db.query(`SELECT name,email,phone,address,payment_terms,credit_limit,is_active
    FROM public.customers WHERE id='${ids.customerA}'`);
  assert.deepEqual(row.rows[0], {
    name: "Customer A renamed", email: "new-billing@a.test", phone: "+1 555 0111",
    address: "10 New Street", payment_terms: 45, credit_limit: "2500.00", is_active: true,
  });
  await assert.rejects(db.query(
    `SELECT public.update_tenant_customer('${ids.customerB}','No leak',NULL,NULL,NULL,30,0,'Reason','foreign')`,
  ), /party not found or unavailable/);
  await db.exec("RESET ROLE");
  await assert.rejects(db.exec(`UPDATE public.customers SET org_id='${ids.orgB}' WHERE id='${ids.customerA}'`), /immutable/);
  await db.close();
});

test("one-way retirement rejects new posted documents while preserving existing history", async () => {
  const { db } = await createDb();
  await db.exec(`INSERT INTO public.invoices(org_id,customer_id) VALUES('${ids.orgA}','${ids.customerA}');
    INSERT INTO public.bills(org_id,vendor_id) VALUES('${ids.orgA}','${ids.vendorA}')`);
  await setActor(db, ids.adminA);
  const customer = await db.query(`SELECT public.retire_tenant_customer('${ids.customerA}','Relationship ended','customer:retire:a') AS id`);
  const customerRetry = await db.query(`SELECT public.retire_tenant_customer('${ids.customerA}','Relationship ended','customer:retire:a') AS id`);
  const vendor = await db.query(`SELECT public.retire_tenant_vendor('${ids.vendorA}','Relationship ended','vendor:retire:a') AS id`);
  assert.equal(customer.rows[0].id, ids.customerA);
  assert.equal(customerRetry.rows[0].id, ids.customerA);
  assert.equal(vendor.rows[0].id, ids.vendorA);
  await assert.rejects(
    db.query(`SELECT public.retire_tenant_customer('${ids.customerA}','Second attempt','customer:retire:a:again')`),
    /party not found or unavailable/,
  );
  await db.exec("RESET ROLE");
  await assert.rejects(
    db.exec(`INSERT INTO public.invoices(org_id,customer_id) VALUES('${ids.orgA}','${ids.customerA}')`),
    /customer not found or unavailable/,
  );
  await assert.rejects(
    db.exec(`INSERT INTO public.bills(org_id,vendor_id) VALUES('${ids.orgA}','${ids.vendorA}')`),
    /vendor not found or unavailable/,
  );
  const history = await db.query("SELECT (SELECT count(*) FROM public.invoices)::int AS invoices, (SELECT count(*) FROM public.bills)::int AS bills");
  assert.deepEqual(history.rows[0], { invoices: 1, bills: 1 });
  await db.close();
});

test("physical party and audit rows reject owner mutation, deletion, and truncation", async () => {
  const { db } = await createDb();
  await setActor(db, ids.adminA);
  await db.query("SELECT public.create_tenant_vendor('Audit Vendor',NULL,NULL,NULL,30,'Approved','vendor:audit')");
  await db.exec("RESET ROLE");
  for (const sql of [
    `INSERT INTO public.customers(org_id,name,payment_terms,is_active) VALUES('${ids.orgA}','Forged',30,true)`,
    `UPDATE public.vendors SET name='Forged' WHERE id='${ids.vendorA}'`,
    `DELETE FROM public.customers WHERE id='${ids.customerA}'`,
    "TRUNCATE public.vendors",
    "UPDATE public.party_master_events SET reason='rewritten'",
    `INSERT INTO public.party_master_events(org_id,party_type,party_id,actor_id,event_type,reason,idempotency_key,new_snapshot)
      VALUES('${ids.orgA}','vendor','${ids.vendorA}','${ids.adminA}','CREATE','Forged','forged','{}'::jsonb)`,
    "DELETE FROM public.party_master_events",
    "TRUNCATE public.party_master_events",
  ]) await assert.rejects(db.exec(sql), /immutable/);
  await db.close();
});
