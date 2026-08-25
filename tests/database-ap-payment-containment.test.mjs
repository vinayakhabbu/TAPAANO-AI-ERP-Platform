import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migrationUrl = new URL(
  "../supabase/migrations/20260825040000_recovery_ap_payment_containment.sql",
  import.meta.url,
);

const ids = {
  orgA: "00000000-0000-4000-8000-000000000001",
  orgB: "00000000-0000-4000-8000-000000000002",
  entityA: "10000000-0000-4000-8000-000000000001",
  entityB: "10000000-0000-4000-8000-000000000002",
  vendorA: "20000000-0000-4000-8000-000000000001",
  vendorB: "20000000-0000-4000-8000-000000000002",
  bankA: "30000000-0000-4000-8000-000000000001",
  billA: "40000000-0000-4000-8000-000000000001",
  billB: "40000000-0000-4000-8000-000000000002",
  runA: "50000000-0000-4000-8000-000000000001",
  itemA: "60000000-0000-4000-8000-000000000001",
  userA: "70000000-0000-4000-8000-000000000001",
};

const fixture = `
  CREATE SCHEMA auth;
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN;
  CREATE TABLE auth.users (id uuid PRIMARY KEY);
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  CREATE TABLE public.organizations (id uuid PRIMARY KEY, name text NOT NULL);
  CREATE TABLE public.entities (
    id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES public.organizations(id), name text NOT NULL
  );
  CREATE TABLE public.profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id), org_id uuid REFERENCES public.organizations(id)
  );
  CREATE OR REPLACE FUNCTION public.get_user_org_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT org_id FROM public.profiles WHERE id = auth.uid()
  $$;
  CREATE TABLE public.vendors (
    id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES public.organizations(id), name text NOT NULL
  );
  CREATE TABLE public.bank_accounts (
    id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES public.organizations(id),
    entity_id uuid NOT NULL REFERENCES public.entities(id), name text NOT NULL
  );
  CREATE TABLE public.bills (
    id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES public.organizations(id),
    entity_id uuid NOT NULL REFERENCES public.entities(id), vendor_id uuid NOT NULL REFERENCES public.vendors(id),
    bill_number text NOT NULL, issue_date date NOT NULL, due_date date NOT NULL,
    subtotal numeric NOT NULL, tax numeric NOT NULL, total numeric NOT NULL,
    amount_paid numeric NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'draft'
  );
  CREATE TABLE public.payment_runs (
    id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES public.organizations(id),
    entity_id uuid NOT NULL REFERENCES public.entities(id), bank_account_id uuid REFERENCES public.bank_accounts(id),
    run_number text NOT NULL, run_date date NOT NULL, total_amount numeric NOT NULL, status text NOT NULL DEFAULT 'draft'
  );
  CREATE TABLE public.payment_run_items (
    id uuid PRIMARY KEY, payment_run_id uuid NOT NULL REFERENCES public.payment_runs(id),
    bill_id uuid NOT NULL REFERENCES public.bills(id), amount numeric NOT NULL
  );
  ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.payment_runs ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.payment_run_items ENABLE ROW LEVEL SECURITY;
  CREATE POLICY bills_hostile_all ON public.bills FOR ALL TO authenticated USING (true) WITH CHECK (true);
  CREATE POLICY runs_hostile_all ON public.payment_runs FOR ALL TO authenticated USING (true) WITH CHECK (true);
  CREATE POLICY items_hostile_all ON public.payment_run_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
  GRANT ALL ON public.bills, public.payment_runs, public.payment_run_items TO authenticated, service_role;
  INSERT INTO public.organizations VALUES ('${ids.orgA}', 'Org A'), ('${ids.orgB}', 'Org B');
  INSERT INTO public.entities VALUES ('${ids.entityA}', '${ids.orgA}', 'Entity A'), ('${ids.entityB}', '${ids.orgB}', 'Entity B');
  INSERT INTO auth.users VALUES ('${ids.userA}');
  INSERT INTO public.profiles VALUES ('${ids.userA}', '${ids.orgA}');
  INSERT INTO public.vendors VALUES ('${ids.vendorA}', '${ids.orgA}', 'Vendor A'), ('${ids.vendorB}', '${ids.orgB}', 'Vendor B');
  INSERT INTO public.bank_accounts VALUES ('${ids.bankA}', '${ids.orgA}', '${ids.entityA}', 'Bank A');
  INSERT INTO public.bills VALUES
    ('${ids.billA}', '${ids.orgA}', '${ids.entityA}', '${ids.vendorA}', 'B-A', '2026-08-01', '2026-08-31', 100, 0, 100, 0, 'draft'),
    ('${ids.billB}', '${ids.orgB}', '${ids.entityB}', '${ids.vendorB}', 'B-B', '2026-08-01', '2026-08-31', 50, 0, 50, 0, 'draft');
  INSERT INTO public.payment_runs VALUES
    ('${ids.runA}', '${ids.orgA}', '${ids.entityA}', '${ids.bankA}', 'RUN-A', '2026-08-25', 100, 'draft');
  INSERT INTO public.payment_run_items VALUES ('${ids.itemA}', '${ids.runA}', '${ids.billA}', 100);
`;

async function createDb({ migrate = true } = {}) {
  const db = new PGlite();
  await db.exec(fixture);
  const migration = await readFile(migrationUrl, "utf8");
  if (migrate) await db.exec(migration);
  return { db, migration };
}

test("AP/payment migration replays and removes hostile policies and grants", async () => {
  const { db, migration } = await createDb();
  await db.exec(`GRANT INSERT, UPDATE, DELETE ON public.bills, public.payment_runs, public.payment_run_items TO authenticated, service_role;`);
  await db.exec(migration);
  const privileges = await db.query(`
    SELECT has_table_privilege('authenticated', 'public.bills', 'INSERT') AS bill_insert,
           has_table_privilege('service_role', 'public.payment_runs', 'UPDATE') AS run_update,
           has_table_privilege('authenticated', 'public.payment_run_items', 'DELETE') AS item_delete,
           has_table_privilege('authenticated', 'public.bills', 'SELECT') AS bill_read
  `);
  assert.deepEqual(privileges.rows[0], {
    bill_insert: false, run_update: false, item_delete: false, bill_read: true,
  });
  const policies = await db.query(`
    SELECT tablename, count(*)::int AS count FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN ('bills', 'payment_runs', 'payment_run_items')
    GROUP BY tablename ORDER BY tablename
  `);
  assert.deepEqual(policies.rows, [
    { tablename: "bills", count: 1 },
    { tablename: "payment_run_items", count: 1 },
    { tablename: "payment_runs", count: 1 },
  ]);
  await db.close();
});

test("legacy AP and payment history is immutable even to the table owner", async () => {
  const { db } = await createDb();
  for (const sql of [
    `UPDATE public.bills SET status = 'paid' WHERE id = '${ids.billA}'`,
    `DELETE FROM public.payment_runs WHERE id = '${ids.runA}'`,
    `TRUNCATE public.payment_run_items CASCADE`,
  ]) {
    await assert.rejects(db.exec(sql), /legacy AP\/payment history is immutable/);
  }
  await db.close();
});

test("materialized payment-item lineage and persistent constraints are tenant/entity safe", async () => {
  const { db } = await createDb();
  const lineage = await db.query(`SELECT org_id, entity_id FROM public.payment_run_items WHERE id = '${ids.itemA}'`);
  assert.deepEqual(lineage.rows[0], { org_id: ids.orgA, entity_id: ids.entityA });

  await db.exec(`ALTER TABLE public.payment_run_items DISABLE TRIGGER guard_payment_run_items_write`);
  await assert.rejects(
    db.exec(`INSERT INTO public.payment_run_items (id, payment_run_id, bill_id, amount, org_id, entity_id)
      VALUES (gen_random_uuid(), '${ids.runA}', '${ids.billB}', 50, '${ids.orgA}', '${ids.entityA}')`),
    /foreign key constraint/,
  );
  await db.close();
});

test("corrupt cross-tenant legacy payment lineage aborts the migration atomically", async () => {
  const { db, migration } = await createDb({ migrate: false });
  await db.exec(`UPDATE public.payment_run_items SET bill_id = '${ids.billB}' WHERE id = '${ids.itemA}'`);
  await assert.rejects(db.exec(migration), /invalid payment item lineage or value/);
  await db.exec(`ROLLBACK`);
  const columns = await db.query(`
    SELECT count(*)::int AS count FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payment_run_items' AND column_name = 'org_id'
  `);
  assert.equal(columns.rows[0].count, 0);
  await db.close();
});

test("authenticated reads are tenant scoped", async () => {
  const { db } = await createDb();
  await db.exec(`SELECT set_config('request.jwt.claim.sub', '${ids.userA}', false); SET ROLE authenticated;`);
  const bills = await db.query(`SELECT id FROM public.bills ORDER BY id`);
  assert.deepEqual(bills.rows, [{ id: ids.billA }]);
  const items = await db.query(`SELECT id FROM public.payment_run_items`);
  assert.deepEqual(items.rows, [{ id: ids.itemA }]);
  await db.close();
});
