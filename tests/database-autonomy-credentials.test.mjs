import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migrationUrl = new URL(
  "../supabase/migrations/20260825030000_recovery_autonomy_credentials.sql",
  import.meta.url,
);

const orgId = "00000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000001";

const fixture = `
  CREATE SCHEMA auth;
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN;
  CREATE TABLE auth.users (id uuid PRIMARY KEY);
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  CREATE TABLE public.organizations (
    id uuid PRIMARY KEY, name text NOT NULL, openai_api_key text,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE public.profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id), org_id uuid REFERENCES public.organizations(id)
  );
  CREATE OR REPLACE FUNCTION public.get_user_org_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT org_id FROM public.profiles WHERE id = auth.uid()
  $$;
  CREATE TABLE public.auto_approval_configs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES public.organizations(id),
    decision_type text NOT NULL, enabled boolean NOT NULL DEFAULT false,
    max_auto_approval_amount numeric NOT NULL DEFAULT 0
  );
  ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.auto_approval_configs ENABLE ROW LEVEL SECURITY;
  CREATE POLICY organizations_hostile_all ON public.organizations FOR ALL TO authenticated
    USING (true) WITH CHECK (true);
  CREATE POLICY auto_configs_hostile_all ON public.auto_approval_configs FOR ALL TO authenticated
    USING (true) WITH CHECK (true);
  GRANT ALL ON public.organizations, public.auto_approval_configs TO authenticated, service_role;
  GRANT SELECT (openai_api_key), UPDATE (openai_api_key) ON public.organizations TO anon;
  INSERT INTO auth.users VALUES ('${userId}');
  INSERT INTO public.organizations (id, name, openai_api_key)
    VALUES ('${orgId}', 'Org A', 'legacy-secret-preserved');
  INSERT INTO public.profiles VALUES ('${userId}', '${orgId}');
  INSERT INTO public.auto_approval_configs (org_id, decision_type, enabled)
    VALUES ('${orgId}', 'payment_approval', true);
`;

async function createDb() {
  const db = new PGlite();
  await db.exec(fixture);
  const migration = await readFile(migrationUrl, "utf8");
  await db.exec(migration);
  return { db, migration };
}

test("credential/autonomy migration replays and removes hostile table and column grants", async () => {
  const { db, migration } = await createDb();
  await db.exec(`
    GRANT ALL ON public.auto_approval_configs TO authenticated, service_role;
    GRANT SELECT (openai_api_key), UPDATE (openai_api_key) ON public.organizations TO anon, authenticated, service_role;
  `);
  await db.exec(migration);
  const privileges = await db.query(`
    SELECT
      has_column_privilege('authenticated', 'public.organizations', 'name', 'SELECT') AS auth_name_read,
      has_column_privilege('authenticated', 'public.organizations', 'openai_api_key', 'SELECT') AS auth_secret_read,
      has_column_privilege('service_role', 'public.organizations', 'openai_api_key', 'SELECT') AS service_secret_read,
      has_column_privilege('anon', 'public.organizations', 'openai_api_key', 'UPDATE') AS anon_secret_update,
      has_table_privilege('authenticated', 'public.auto_approval_configs', 'SELECT') AS auto_read,
      has_table_privilege('service_role', 'public.auto_approval_configs', 'UPDATE') AS auto_service_update
  `);
  assert.deepEqual(privileges.rows[0], {
    auth_name_read: true,
    auth_secret_read: false,
    service_secret_read: false,
    anon_secret_update: false,
    auto_read: false,
    auto_service_update: false,
  });
  const policies = await db.query(`
    SELECT count(*)::int AS count FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'auto_approval_configs'
  `);
  assert.equal(policies.rows[0].count, 0);
  await db.close();
});

test("legacy secret remains present but is owner-immutable", async () => {
  const { db } = await createDb();
  const before = await db.query(`SELECT openai_api_key FROM public.organizations WHERE id = '${orgId}'`);
  assert.equal(before.rows[0].openai_api_key, "legacy-secret-preserved");
  await assert.rejects(
    db.exec(`UPDATE public.organizations SET openai_api_key = 'replacement' WHERE id = '${orgId}'`),
    /legacy OpenAI credentials are preserved but immutable/,
  );
  await db.exec(`UPDATE public.organizations SET name = 'Renamed by owner' WHERE id = '${orgId}'`);
  await db.close();
});

test("autonomous approval configuration is immutable even to the table owner", async () => {
  const { db } = await createDb();
  await assert.rejects(
    db.exec(`UPDATE public.auto_approval_configs SET enabled = false`),
    /autonomous approval configuration is unavailable and immutable/,
  );
  await assert.rejects(
    db.exec(`DELETE FROM public.auto_approval_configs`),
    /autonomous approval configuration is unavailable and immutable/,
  );
  await assert.rejects(
    db.exec(`TRUNCATE public.auto_approval_configs`),
    /autonomous approval configuration is unavailable and immutable/,
  );
  await db.close();
});

test("authenticated tenant can read safe organization metadata but not the secret", async () => {
  const { db } = await createDb();
  await db.exec(`SELECT set_config('request.jwt.claim.sub', '${userId}', false); SET ROLE authenticated;`);
  const safe = await db.query(`SELECT id, name FROM public.organizations`);
  assert.equal(safe.rows.length, 1);
  await assert.rejects(
    db.query(`SELECT openai_api_key FROM public.organizations`),
    /permission denied/,
  );
  await db.close();
});
