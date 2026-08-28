import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migrationUrls = [
  "../supabase/migrations/20260825070000_recovery_accounting_master_containment.sql",
  "../supabase/migrations/20260825200000_recovery_account_maintenance.sql",
].map((path) => new URL(path, import.meta.url));

const ids = {
  orgA: "00000000-0000-4000-8000-000000000001",
  orgB: "00000000-0000-4000-8000-000000000002",
  adminA: "10000000-0000-4000-8000-000000000001",
  moderatorA: "10000000-0000-4000-8000-000000000002",
  adminB: "10000000-0000-4000-8000-000000000003",
  rootA: "20000000-0000-4000-8000-000000000001",
  childA: "20000000-0000-4000-8000-000000000002",
  controlA: "20000000-0000-4000-8000-000000000003",
  rootB: "20000000-0000-4000-8000-000000000004",
  entityA: "30000000-0000-4000-8000-000000000001",
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
  CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid,_role public.app_role)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,auth AS $$
    SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role)
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
  CREATE TABLE public.customers (id uuid PRIMARY KEY, org_id uuid NOT NULL, name text NOT NULL);
  CREATE TABLE public.vendors (id uuid PRIMARY KEY, org_id uuid NOT NULL, name text NOT NULL);
  CREATE TABLE public.entity_invoice_account_controls (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, entity_id uuid NOT NULL,
    ar_account_id uuid NOT NULL, revenue_account_id uuid NOT NULL
  );
  CREATE TABLE public.entity_customer_receipt_controls (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, entity_id uuid NOT NULL,
    cash_account_id uuid NOT NULL
  );
  CREATE TABLE public.entity_supplier_bill_account_controls (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, entity_id uuid NOT NULL,
    ap_account_id uuid NOT NULL, expense_account_id uuid NOT NULL
  );
  CREATE TABLE public.entity_supplier_payment_account_controls (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, entity_id uuid NOT NULL,
    cash_account_id uuid NOT NULL
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
  INSERT INTO public.entities(id,org_id,name,currency) VALUES
    ('${ids.entityA}','${ids.orgA}','Entity A','USD'),
    (gen_random_uuid(),'${ids.orgB}','Entity B','EUR');
  INSERT INTO public.accounts(id,org_id,code,name,account_type,parent_id) VALUES
    ('${ids.rootA}','${ids.orgA}','1000','Assets','asset',NULL),
    ('${ids.childA}','${ids.orgA}','1010','Cash','asset','${ids.rootA}'),
    ('${ids.controlA}','${ids.orgA}','1100','AR control','asset','${ids.rootA}'),
    ('${ids.rootB}','${ids.orgB}','1000','Assets B','asset',NULL);
  INSERT INTO public.customers VALUES (gen_random_uuid(),'${ids.orgA}','Customer A');
  INSERT INTO public.vendors VALUES (gen_random_uuid(),'${ids.orgA}','Vendor A');
  INSERT INTO public.entity_invoice_account_controls(org_id,entity_id,ar_account_id,revenue_account_id)
    VALUES ('${ids.orgA}','${ids.entityA}','${ids.controlA}','${ids.controlA}');
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

async function createAccount(db, {
  code = "1200", name = "New cash", type = "asset", parentId = ids.rootA,
  reason = "Approved chart extension", key = "account:create:1200",
} = {}) {
  return db.query(
    "SELECT public.create_tenant_account($1,$2,$3::public.account_type,$4,$5,$6) AS id",
    [code, name, type, parentId, reason, key],
  );
}

async function errorMessage(operation) {
  try { await operation(); } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  assert.fail("operation unexpectedly succeeded");
}

test("account-maintenance migration replays and restores exact grants, policies, and overloads", async () => {
  const { db, maintenanceMigration } = await createDb();
  await db.exec(`
    GRANT ALL ON public.account_master_events TO authenticated,service_role;
    GRANT UPDATE(code),INSERT(name) ON public.accounts TO authenticated,service_role;
    CREATE POLICY hostile_events ON public.account_master_events FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
    CREATE FUNCTION public.create_tenant_account(text,text) RETURNS uuid
      LANGUAGE sql SECURITY DEFINER AS 'SELECT gen_random_uuid()';
    GRANT EXECUTE ON FUNCTION public.create_tenant_account(text,text) TO authenticated;
  `);
  await db.exec(maintenanceMigration);
  const grants = await db.query(`
    SELECT has_table_privilege('authenticated','public.accounts','SELECT') AS account_read,
      has_table_privilege('authenticated','public.accounts','UPDATE') AS account_update,
      has_table_privilege('authenticated','public.account_master_events','SELECT') AS event_read,
      has_table_privilege('service_role','public.account_master_events','INSERT') AS service_insert,
      has_column_privilege('authenticated','public.accounts','code','UPDATE') AS account_code_update,
      has_column_privilege('service_role','public.accounts','name','INSERT') AS account_name_insert
  `);
  assert.deepEqual(grants.rows[0], {
    account_read: true, account_update: false, event_read: false, service_insert: false,
    account_code_update: false, account_name_insert: false,
  });
  const policies = await db.query(`SELECT count(*)::int AS count FROM pg_policies
    WHERE schemaname='public' AND tablename='account_master_events'`);
  assert.equal(policies.rows[0].count, 0);
  const overloads = await db.query(`
    SELECT count(*)::int AS count FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN
      ('create_tenant_account','rename_tenant_account','retire_tenant_account','list_tenant_account_events')
      AND NOT (
        (p.proname='create_tenant_account' AND oidvectortypes(p.proargtypes)='text, text, account_type, uuid, text, text')
        OR (p.proname='rename_tenant_account' AND oidvectortypes(p.proargtypes)='uuid, text, text, text')
        OR (p.proname='retire_tenant_account' AND oidvectortypes(p.proargtypes)='uuid, text, text')
        OR (p.proname='list_tenant_account_events' AND oidvectortypes(p.proargtypes)='')
      )
  `);
  assert.equal(overloads.rows[0].count, 0);
  await db.close();
});

test("tenant admin creates an exact account with immutable audit evidence and safe retry", async () => {
  const { db } = await createDb();
  await setActor(db, ids.adminA);
  const first = await createAccount(db);
  const retry = await createAccount(db);
  assert.equal(retry.rows[0].id, first.rows[0].id);
  const account = await db.query(`SELECT org_id,code,name,account_type::text,parent_id,is_active
    FROM public.accounts WHERE id='${first.rows[0].id}'`);
  assert.deepEqual(account.rows[0], {
    org_id: ids.orgA, code: "1200", name: "New cash", account_type: "asset",
    parent_id: ids.rootA, is_active: true,
  });
  const events = await db.query("SELECT * FROM public.list_tenant_account_events()");
  const created = events.rows.find((event) => event.account_id === first.rows[0].id);
  assert.equal(created.event_type, "CREATE");
  assert.equal(created.actor_id, ids.adminA);
  assert.equal(created.reason, "Approved chart extension");
  assert.equal(created.old_snapshot, null);
  assert.equal(created.new_snapshot.code, "1200");
  await assert.rejects(createAccount(db, { name: "Conflict" }), /idempotency key conflict/);
  await db.close();
});

test("account creation enforces admin, tenant, hierarchy type, and normalized identity", async () => {
  const { db } = await createDb();
  await setActor(db, ids.adminA);
  await assert.rejects(createAccount(db, { parentId: ids.rootB, key: "foreign" }), /parent account is unavailable/);
  await assert.rejects(createAccount(db, { type: "expense", key: "wrong-type" }), /parent account is unavailable/);
  await assert.rejects(createAccount(db, { code: " 1200", key: "bad-code" }), /code/);
  await setActor(db, ids.moderatorA);
  await assert.rejects(createAccount(db, { key: "unauthorized" }), /tenant admin/);
  await assert.rejects(db.query("SELECT * FROM public.list_tenant_account_events()"), /tenant admin/);
  await db.close();
});

test("account rename is audited, idempotent, tenant hidden, and cannot alter structural fields", async () => {
  const { db } = await createDb();
  await setActor(db, ids.adminA);
  const renamed = await db.query(
    "SELECT public.rename_tenant_account($1,$2,$3,$4) AS id",
    [ids.childA, "Operating cash", "Approved label correction", "account:rename:cash"],
  );
  const retry = await db.query(
    "SELECT public.rename_tenant_account($1,$2,$3,$4) AS id",
    [ids.childA, "Operating cash", "Approved label correction", "account:rename:cash"],
  );
  assert.equal(retry.rows[0].id, renamed.rows[0].id);
  const account = await db.query(`SELECT code,name,account_type::text,parent_id,is_active
    FROM public.accounts WHERE id='${ids.childA}'`);
  assert.deepEqual(account.rows[0], {
    code: "1010", name: "Operating cash", account_type: "asset",
    parent_id: ids.rootA, is_active: true,
  });
  const events = await db.query("SELECT * FROM public.list_tenant_account_events()");
  const event = events.rows.find((candidate) => candidate.event_id === renamed.rows[0].id);
  assert.equal(event.old_snapshot.name, "Cash");
  assert.equal(event.new_snapshot.name, "Operating cash");

  await setActor(db, ids.adminB);
  const foreign = await errorMessage(() => db.query(
    "SELECT public.rename_tenant_account($1,$2,$3,$4)",
    [ids.childA, "Hidden", "Approved", "foreign-rename"],
  ));
  const missing = await errorMessage(() => db.query(
    "SELECT public.rename_tenant_account($1,$2,$3,$4)",
    ["20000000-0000-4000-8000-000000000099", "Hidden", "Approved", "missing-rename"],
  ));
  assert.equal(foreign, missing);
  assert.match(foreign, /account is unavailable/);
  await db.close();
});

test("one-way retirement rejects active parents and immutable accounting controls", async () => {
  const { db } = await createDb();
  await setActor(db, ids.adminA);
  await assert.rejects(
    db.query("SELECT public.retire_tenant_account($1,$2,$3)", [ids.rootA, "Retire", "retire-parent"]),
    /active child/,
  );
  await assert.rejects(
    db.query("SELECT public.retire_tenant_account($1,$2,$3)", [ids.controlA, "Retire", "retire-control"]),
    /accounting control/,
  );
  const retired = await db.query(
    "SELECT public.retire_tenant_account($1,$2,$3) AS id",
    [ids.childA, "Account superseded", "retire-child"],
  );
  const retry = await db.query(
    "SELECT public.retire_tenant_account($1,$2,$3) AS id",
    [ids.childA, "Account superseded", "retire-child"],
  );
  assert.equal(retry.rows[0].id, retired.rows[0].id);
  const state = await db.query(`SELECT is_active FROM public.accounts WHERE id='${ids.childA}'`);
  assert.equal(state.rows[0].is_active, false);
  await assert.rejects(
    db.query("SELECT public.rename_tenant_account($1,$2,$3,$4)",
      [ids.childA, "Reactivated label", "No", "rename-retired"]),
    /account is unavailable/,
  );
  await db.close();
});

test("physical account and audit rows remain immutable outside exact maintenance RPCs", async () => {
  const { db } = await createDb();
  await setActor(db, ids.adminA);
  const created = await createAccount(db);
  await db.exec("RESET ROLE");
  for (const sql of [
    `UPDATE public.accounts SET account_type='expense' WHERE id='${created.rows[0].id}'`,
    `UPDATE public.accounts SET parent_id=NULL WHERE id='${created.rows[0].id}'`,
    `UPDATE public.accounts SET is_active=false WHERE id='${created.rows[0].id}'`,
    `DELETE FROM public.accounts WHERE id='${created.rows[0].id}'`,
    "TRUNCATE public.accounts",
    "UPDATE public.account_master_events SET reason='rewritten'",
    "DELETE FROM public.account_master_events",
    "TRUNCATE public.account_master_events",
  ]) {
    await assert.rejects(
      db.exec(sql),
      /controlled account maintenance|account master audit is immutable|foreign key constraint/,
    );
  }
  await db.close();
});
