import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migrationUrl = new URL(
  "../supabase/migrations/20260825060000_recovery_residual_financial_lockdown.sql",
  import.meta.url,
);

const protectedTables = [
  "purchase_orders", "tax_rates", "inventory_stock", "production_orders",
  "budgets", "payroll_runs", "cash_flow_predictions",
];

const fixture = `
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
  CREATE TABLE public.customers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text);
  CREATE FUNCTION public.update_inventory_on_shipment() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN RETURN NEW; END $$;
  CREATE FUNCTION public.calculate_tax(numeric) RETURNS numeric LANGUAGE sql AS $$ SELECT $1 $$;
  CREATE FUNCTION public.calculate_tax(numeric, uuid) RETURNS numeric LANGUAGE sql AS $$ SELECT $1 $$;
  CREATE FUNCTION public.get_org_openai_key(uuid) RETURNS text LANGUAGE sql AS $$ SELECT 'legacy'::text $$;
  ${protectedTables.map((table) => `
    CREATE TABLE public.${table} (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid, value numeric DEFAULT 1);
    ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;
    CREATE POLICY hostile_all ON public.${table} FOR ALL TO authenticated USING (true) WITH CHECK (true);
    GRANT ALL ON public.${table} TO authenticated, service_role;
    INSERT INTO public.${table} (org_id, value) VALUES (gen_random_uuid(), 1);
  `).join("\n")}
  CREATE TRIGGER unsafe_inventory_effect BEFORE UPDATE ON public.inventory_stock
    FOR EACH ROW EXECUTE FUNCTION public.update_inventory_on_shipment();
  CREATE PUBLICATION supabase_realtime FOR TABLE public.inventory_stock, public.payroll_runs;
`;

async function createDb() {
  const db = new PGlite();
  await db.exec(fixture);
  const migration = await readFile(migrationUrl, "utf8");
  await db.exec(migration);
  return { db, migration };
}

test("residual lockdown replays and removes table/column privileges and policies", async () => {
  const { db, migration } = await createDb();
  await db.exec(`
    GRANT ALL ON public.tax_rates TO authenticated, service_role;
    GRANT SELECT (value), UPDATE (value) ON public.inventory_stock TO anon, authenticated, service_role;
  `);
  await db.exec(migration);
  for (const table of protectedTables) {
    const privilege = await db.query(`
      SELECT has_table_privilege('authenticated','public.${table}','SELECT') AS auth_read,
        has_table_privilege('authenticated','public.${table}','UPDATE') AS auth_update,
        has_table_privilege('service_role','public.${table}','INSERT') AS service_insert,
        has_column_privilege('anon','public.${table}','value','SELECT') AS anon_column
    `);
    assert.deepEqual(privilege.rows[0], {
      auth_read: false, auth_update: false, service_insert: false, anon_column: false,
    }, table);
    const policies = await db.query(`SELECT count(*)::int AS count FROM pg_policies WHERE schemaname='public' AND tablename='${table}'`);
    assert.equal(policies.rows[0].count, 0, table);
  }
  await db.close();
});

test("every present residual table is owner-immutable for row and truncate operations", async () => {
  const { db } = await createDb();
  for (const table of protectedTables) {
    await assert.rejects(db.exec(`UPDATE public.${table} SET value=2`), /residual financial workflow is contained and immutable/, table);
    await assert.rejects(db.exec(`TRUNCATE public.${table}`), /residual financial workflow is contained and immutable/, table);
  }
  await db.close();
});

test("legacy side-effect triggers and dangerous routine overloads are removed", async () => {
  const { db } = await createDb();
  const triggers = await db.query(`
    SELECT tgname FROM pg_trigger trigger
    JOIN pg_class relation ON relation.oid=trigger.tgrelid
    WHERE relation.relname='inventory_stock' AND NOT trigger.tgisinternal ORDER BY tgname
  `);
  assert.deepEqual(triggers.rows, [
    { tgname: "guard_residual_truncate" },
    { tgname: "guard_residual_write" },
  ]);
  const functions = await db.query(`
    SELECT proname FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname IN ('calculate_tax','get_org_openai_key','update_inventory_on_shipment')
  `);
  assert.deepEqual(functions.rows, []);
  const realtime = await db.query(`
    SELECT tablename FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND tablename IN ('inventory_stock','payroll_runs')
  `);
  assert.deepEqual(realtime.rows, []);
  await db.close();
});

test("unlisted operational master data is not mutated by the residual lockdown", async () => {
  const { db } = await createDb();
  await db.exec(`INSERT INTO public.customers (name) VALUES ('still available')`);
  const rows = await db.query(`SELECT name FROM public.customers`);
  assert.deepEqual(rows.rows, [{ name: "still available" }]);
  await db.close();
});
