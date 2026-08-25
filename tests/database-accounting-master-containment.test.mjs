import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migrationUrl = new URL(
  "../supabase/migrations/20260825070000_recovery_accounting_master_containment.sql",
  import.meta.url,
);
const orgA = "00000000-0000-4000-8000-000000000001";
const orgB = "00000000-0000-4000-8000-000000000002";
const userA = "10000000-0000-4000-8000-000000000001";
const rootA = "20000000-0000-4000-8000-000000000001";
const childA = "20000000-0000-4000-8000-000000000002";
const rootB = "20000000-0000-4000-8000-000000000003";

const fixture = `
  CREATE SCHEMA auth;
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
  CREATE TABLE auth.users (id uuid PRIMARY KEY);
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  CREATE TABLE public.organizations (id uuid PRIMARY KEY, name text);
  CREATE TABLE public.profiles (id uuid PRIMARY KEY, org_id uuid);
  CREATE OR REPLACE FUNCTION public.get_user_org_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
    SELECT org_id FROM public.profiles WHERE id=auth.uid()
  $$;
  CREATE TABLE public.entities (
    id uuid PRIMARY KEY, org_id uuid NOT NULL, name text NOT NULL, currency text NOT NULL
  );
  CREATE TABLE public.accounts (
    id uuid PRIMARY KEY, org_id uuid NOT NULL, code text NOT NULL, name text NOT NULL,
    parent_id uuid REFERENCES public.accounts(id), account_type text NOT NULL, is_active boolean DEFAULT true
  );
  CREATE TABLE public.customers (id uuid PRIMARY KEY, org_id uuid NOT NULL, name text NOT NULL);
  CREATE TABLE public.vendors (id uuid PRIMARY KEY, org_id uuid NOT NULL, name text NOT NULL);
  DO $$ DECLARE t text; BEGIN
    FOREACH t IN ARRAY ARRAY['entities','accounts','customers','vendors'] LOOP
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
      EXECUTE format('CREATE POLICY hostile_all ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',t);
      EXECUTE format('GRANT ALL ON public.%I TO authenticated,service_role',t);
    END LOOP;
  END $$;
  CREATE PUBLICATION supabase_realtime FOR TABLE public.accounts, public.customers;
  INSERT INTO public.organizations VALUES ('${orgA}','A'),('${orgB}','B');
  INSERT INTO auth.users VALUES ('${userA}'); INSERT INTO public.profiles VALUES ('${userA}','${orgA}');
  INSERT INTO public.entities VALUES
    (gen_random_uuid(),'${orgA}','Entity A','USD'),(gen_random_uuid(),'${orgB}','Entity B','EUR');
  INSERT INTO public.accounts VALUES
    ('${rootA}','${orgA}','1000','Cash',NULL,'asset',true),
    ('${childA}','${orgA}','1010','Operating cash','${rootA}','asset',true),
    ('${rootB}','${orgB}','1000','Cash B',NULL,'asset',true);
  INSERT INTO public.customers VALUES (gen_random_uuid(),'${orgA}','Customer A'),(gen_random_uuid(),'${orgB}','Customer B');
  INSERT INTO public.vendors VALUES (gen_random_uuid(),'${orgA}','Vendor A'),(gen_random_uuid(),'${orgB}','Vendor B');
`;

async function createDb({ migrate = true } = {}) {
  const db = new PGlite();
  await db.exec(fixture);
  const migration = await readFile(migrationUrl, "utf8");
  if (migrate) await db.exec(migration);
  return { db, migration };
}

test("accounting-master migration replays and rebuilds exact read-only grants/policies", async () => {
  const { db, migration } = await createDb();
  await db.exec(`GRANT INSERT,UPDATE,DELETE ON public.accounts,public.entities,public.customers,public.vendors TO authenticated,service_role`);
  await db.exec(migration);
  for (const table of ["accounts", "entities", "customers", "vendors"]) {
    const grants = await db.query(`
      SELECT has_table_privilege('authenticated','public.${table}','SELECT') AS auth_read,
        has_table_privilege('authenticated','public.${table}','UPDATE') AS auth_update,
        has_table_privilege('service_role','public.${table}','INSERT') AS service_insert
    `);
    assert.deepEqual(grants.rows[0], { auth_read: true, auth_update: false, service_insert: false }, table);
    const policies = await db.query(`SELECT count(*)::int AS count FROM pg_policies WHERE schemaname='public' AND tablename='${table}'`);
    assert.equal(policies.rows[0].count, 1, table);
  }
  await db.close();
});

test("accounting master rows are immutable even to the table owner", async () => {
  const { db } = await createDb();
  for (const sql of [
    `UPDATE public.accounts SET account_type='revenue' WHERE id='${rootA}'`,
    `DELETE FROM public.customers`,
    `TRUNCATE public.vendors`,
  ]) await assert.rejects(db.exec(sql), /accounting master data is immutable/);
  await db.close();
});

test("authenticated reads are tenant scoped across all accounting masters", async () => {
  const { db } = await createDb();
  await db.exec(`SELECT set_config('request.jwt.claim.sub','${userA}',false); SET ROLE authenticated`);
  for (const table of ["accounts", "entities", "customers", "vendors"]) {
    const rows = await db.query(`SELECT org_id FROM public.${table}`);
    assert.ok(rows.rows.length > 0, table);
    assert.ok(rows.rows.every((row) => row.org_id === orgA), table);
  }
  await db.close();
});

test("persistent hierarchy constraint rejects a cross-tenant parent", async () => {
  const { db } = await createDb();
  await db.exec(`ALTER TABLE public.accounts DISABLE TRIGGER guard_master_write`);
  await assert.rejects(db.exec(`UPDATE public.accounts SET parent_id='${rootB}' WHERE id='${childA}'`), /foreign key constraint/);
  await db.close();
});

test("cross-tenant or cyclic legacy account hierarchies abort atomically", async () => {
  for (const corruption of [
    `UPDATE public.accounts SET parent_id='${rootB}' WHERE id='${childA}'`,
    `UPDATE public.accounts SET parent_id='${childA}' WHERE id='${rootA}'`,
  ]) {
    const { db, migration } = await createDb({ migrate: false });
    await db.exec(corruption);
    await assert.rejects(db.exec(migration), /invalid account identity or hierarchy|account hierarchy cycle/);
    await db.exec(`ROLLBACK`);
    const trigger = await db.query(`SELECT count(*)::int AS count FROM pg_trigger WHERE tgname='guard_master_write'`);
    assert.equal(trigger.rows[0].count, 0);
    await db.close();
  }
});
