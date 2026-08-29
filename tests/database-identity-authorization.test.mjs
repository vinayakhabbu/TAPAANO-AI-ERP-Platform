import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migrationUrl = new URL(
  "../supabase/migrations/20260825080000_recovery_identity_authorization.sql",
  import.meta.url,
);

const ids = {
  orgA: "00000000-0000-4000-8000-000000000001",
  orgB: "00000000-0000-4000-8000-000000000002",
  adminA: "10000000-0000-4000-8000-000000000001",
  userA: "10000000-0000-4000-8000-000000000002",
  adminB: "10000000-0000-4000-8000-000000000003",
  newcomer: "10000000-0000-4000-8000-000000000004",
};

const fixture = `
  CREATE SCHEMA auth;
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN;
  CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user', 'viewer');
  CREATE TABLE auth.users (
    id uuid PRIMARY KEY,
    email text,
    raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb
  );
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  CREATE TABLE public.organizations (id uuid PRIMARY KEY, name text NOT NULL);
  CREATE TABLE public.profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
    display_name text,
    role text DEFAULT 'user',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE public.user_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role public.app_role NOT NULL DEFAULT 'user',
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
  );
  ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
  CREATE POLICY hostile_profile_all ON public.profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);
  CREATE POLICY hostile_role_all ON public.user_roles FOR ALL TO authenticated USING (true) WITH CHECK (true);
  GRANT ALL ON public.profiles, public.user_roles TO authenticated, service_role;
  GRANT UPDATE (org_id, role) ON public.profiles TO authenticated;
  GRANT UPDATE (role) ON public.user_roles TO authenticated;
  CREATE PUBLICATION supabase_realtime FOR TABLE public.profiles, public.user_roles;

  CREATE OR REPLACE FUNCTION public.get_user_org_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
    SELECT org_id FROM public.profiles WHERE id=auth.uid()
  $$;
  CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
    SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role)
  $$;
  CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
  RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
    SELECT role::text FROM public.user_roles WHERE user_id=_user_id LIMIT 1
  $$;
  CREATE OR REPLACE FUNCTION public.assert_accounting_actor(p_org_id uuid)
  RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,auth AS $$
  BEGIN RETURN auth.uid(); END;
  $$;
  CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
  BEGIN RETURN NEW; END;
  $$;
  CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

  INSERT INTO public.organizations VALUES ('${ids.orgA}','Org A'),('${ids.orgB}','Org B');
  INSERT INTO auth.users(id,email) VALUES
    ('${ids.adminA}','admin-a@example.com'),
    ('${ids.userA}','user-a@example.com'),
    ('${ids.adminB}','admin-b@example.com');
  INSERT INTO public.profiles(id,org_id,display_name,role) VALUES
    ('${ids.adminA}','${ids.orgA}','Admin A','admin'),
    ('${ids.userA}','${ids.orgA}','User A','user'),
    ('${ids.adminB}','${ids.orgB}','Admin B','admin');
  INSERT INTO public.user_roles(user_id,role) VALUES
    ('${ids.adminA}','admin'),('${ids.userA}','user'),('${ids.adminB}','admin');
`;

async function createDb({ migrate = true } = {}) {
  const db = new PGlite();
  await db.exec(fixture);
  const migration = await readFile(migrationUrl, "utf8");
  if (migrate) await db.exec(migration);
  return { db, migration };
}

test("legacy identity policies permit organization hopping before containment", async () => {
  const { db } = await createDb({ migrate: false });
  await db.exec(`SELECT set_config('request.jwt.claim.sub','${ids.adminA}',false); SET ROLE authenticated`);
  await db.exec(`UPDATE public.profiles SET org_id='${ids.orgB}' WHERE id='${ids.adminA}'`);
  const profile = await db.query(`SELECT org_id FROM public.profiles WHERE id='${ids.adminA}'`);
  assert.equal(profile.rows[0].org_id, ids.orgB);
  await db.close();
});

test("identity migration replays and removes hostile table and column grants", async () => {
  const { db, migration } = await createDb();
  await db.exec(`
    GRANT INSERT,UPDATE,DELETE ON public.profiles,public.user_roles TO authenticated,service_role;
    GRANT UPDATE (org_id,role) ON public.profiles TO authenticated;
    GRANT UPDATE (org_id,role) ON public.user_roles TO service_role;
    CREATE POLICY hostile_profile_replay ON public.profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);
    CREATE FUNCTION public.has_role(uuid,text) RETURNS boolean
      LANGUAGE sql SECURITY DEFINER AS 'SELECT true';
    GRANT EXECUTE ON FUNCTION public.has_role(uuid,text) TO authenticated;
  `);
  await db.exec(migration);

  const privileges = await db.query(`
    SELECT has_table_privilege('authenticated','public.profiles','SELECT') AS profile_read,
      has_table_privilege('authenticated','public.profiles','INSERT') AS profile_insert,
      has_column_privilege('authenticated','public.profiles','display_name','UPDATE') AS display_update,
      has_column_privilege('authenticated','public.profiles','org_id','UPDATE') AS org_update,
      has_table_privilege('authenticated','public.user_roles','SELECT') AS role_read,
      has_table_privilege('authenticated','public.user_roles','UPDATE') AS role_update,
      has_column_privilege('service_role','public.user_roles','role','UPDATE') AS service_role_update
  `);
  assert.deepEqual(privileges.rows[0], {
    profile_read: true,
    profile_insert: false,
    display_update: true,
    org_update: false,
    role_read: true,
    role_update: false,
    service_role_update: false,
  });
  for (const table of ["profiles", "user_roles"]) {
    const policies = await db.query(`SELECT count(*)::int AS count FROM pg_policies WHERE schemaname='public' AND tablename='${table}'`);
    assert.equal(policies.rows[0].count, table === "profiles" ? 2 : 1, table);
    const realtime = await db.query(`SELECT count(*)::int AS count FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='${table}'`);
    assert.equal(realtime.rows[0].count, 0, table);
  }
  const overloads = await db.query(`
    SELECT count(*)::int AS count FROM pg_proc procedure_info
    JOIN pg_namespace namespace ON namespace.oid=procedure_info.pronamespace
    WHERE namespace.nspname='public' AND procedure_info.proname='has_role'
      AND oidvectortypes(procedure_info.proargtypes) <> 'uuid, app_role'
  `);
  assert.equal(overloads.rows[0].count, 0);
  await db.close();
});

test("identity and role rows are tenant-bound and immutable across API and owner paths", async () => {
  const { db } = await createDb();
  const shape = await db.query(`
    SELECT p.role::text AS profile_role, ur.role::text AS assigned_role, ur.org_id
    FROM public.profiles p JOIN public.user_roles ur ON ur.user_id=p.id
    WHERE p.id='${ids.adminA}'
  `);
  assert.deepEqual(shape.rows[0], { profile_role: "admin", assigned_role: "admin", org_id: ids.orgA });

  await db.exec(`SELECT set_config('request.jwt.claim.sub','${ids.adminA}',false); SET ROLE authenticated`);
  await db.exec(`UPDATE public.profiles SET display_name='Admin A Renamed' WHERE id='${ids.adminA}'`);
  await assert.rejects(
    db.exec(`UPDATE public.profiles SET org_id='${ids.orgB}' WHERE id='${ids.adminA}'`),
    /permission denied|identity membership is immutable/,
  );
  await db.exec(`RESET ROLE`);
  for (const sql of [
    `UPDATE public.profiles SET role='viewer' WHERE id='${ids.adminA}'`,
    `DELETE FROM public.user_roles WHERE user_id='${ids.adminA}'`,
    `TRUNCATE public.user_roles`,
  ]) await assert.rejects(db.exec(sql), /identity membership is immutable/);

  await db.exec(`ALTER TABLE public.user_roles DISABLE TRIGGER guard_identity_role_write`);
  await assert.rejects(
    db.exec(`UPDATE public.user_roles SET org_id='${ids.orgB}' WHERE user_id='${ids.adminA}'`),
    /foreign key constraint/,
  );
  await db.close();
});

test("identity reads and authorization helpers cannot cross tenant or user boundaries", async () => {
  const { db } = await createDb();
  await db.exec(`SELECT set_config('request.jwt.claim.sub','${ids.adminA}',false); SET ROLE authenticated`);
  const profiles = await db.query(`SELECT id FROM public.profiles ORDER BY id`);
  const roles = await db.query(`SELECT user_id FROM public.user_roles ORDER BY user_id`);
  assert.deepEqual(profiles.rows, [{ id: ids.adminA }]);
  assert.deepEqual(roles.rows, [{ user_id: ids.adminA }]);

  const helpers = await db.query(`
    SELECT public.has_role('${ids.adminA}','admin') AS own_admin,
      public.has_role('${ids.adminB}','admin') AS other_admin,
      public.get_user_role('${ids.adminB}')::text AS other_role
  `);
  assert.deepEqual(helpers.rows[0], { own_admin: true, other_admin: false, other_role: null });
  await db.exec(`RESET ROLE`);
  const actor = await db.query(`SELECT public.assert_accounting_actor('${ids.orgA}') AS id`);
  assert.equal(actor.rows[0].id, ids.adminA);
  await assert.rejects(db.query(`SELECT public.assert_accounting_actor('${ids.orgB}')`), /not authorized/);

  await db.exec(`SELECT set_config('request.jwt.claim.sub','${ids.userA}',false)`);
  await assert.rejects(db.query(`SELECT public.assert_accounting_actor('${ids.orgA}')`), /admin or moderator/);
  await db.close();
});

test("self-service registration fails closed until controlled onboarding exists", async () => {
  const { db } = await createDb();
  await assert.rejects(
    db.exec(`INSERT INTO auth.users(id,email) VALUES ('${ids.newcomer}','new@example.com')`),
    /self-service registration is unavailable/,
  );
  const created = await db.query(`SELECT count(*)::int AS count FROM auth.users WHERE id='${ids.newcomer}'`);
  assert.equal(created.rows[0].count, 0);
  await db.close();
});

test("ambiguous, orphaned, or mismatched legacy identity state aborts atomically", async () => {
  const corruptions = [
    `INSERT INTO public.user_roles(user_id,role) VALUES ('${ids.adminA}','moderator')`,
    `UPDATE public.profiles SET role='viewer' WHERE id='${ids.adminA}'`,
    `DELETE FROM public.user_roles WHERE user_id='${ids.userA}'`,
    `UPDATE public.profiles SET org_id=NULL WHERE id='${ids.userA}'`,
  ];
  for (const corruption of corruptions) {
    const { db, migration } = await createDb({ migrate: false });
    await db.exec(corruption);
    await assert.rejects(db.exec(migration), /identity authorization preflight/);
    await db.exec(`ROLLBACK`);
    const column = await db.query(`
      SELECT count(*)::int AS count FROM information_schema.columns
      WHERE table_schema='public' AND table_name='user_roles' AND column_name='org_id'
    `);
    assert.equal(column.rows[0].count, 0);
    await db.close();
  }
});
