import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const identityMigrationUrl = new URL(
  "../supabase/migrations/20260825080000_recovery_identity_authorization.sql",
  import.meta.url,
);
const roleAdministrationMigrationUrl = new URL(
  "../supabase/migrations/20260825180000_recovery_identity_role_administration.sql",
  import.meta.url,
);

const ids = {
  orgA: "00000000-0000-4000-8000-000000000001",
  orgB: "00000000-0000-4000-8000-000000000002",
  adminA: "10000000-0000-4000-8000-000000000001",
  moderatorA: "10000000-0000-4000-8000-000000000002",
  userA: "10000000-0000-4000-8000-000000000003",
  adminB: "10000000-0000-4000-8000-000000000004",
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
  CREATE OR REPLACE FUNCTION public.get_user_org_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,auth AS $$
    SELECT org_id FROM public.profiles WHERE id=auth.uid()
  $$;
  CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,auth AS $$
    SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role)
  $$;
  CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
  RETURNS public.app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,auth AS $$
    SELECT role FROM public.user_roles WHERE user_id=_user_id LIMIT 1
  $$;
  CREATE OR REPLACE FUNCTION public.assert_accounting_actor(p_org_id uuid)
  RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,auth AS $$
  BEGIN RETURN auth.uid(); END;
  $$;
  CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
  BEGIN RETURN NEW; END;
  $$;
  CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

  INSERT INTO public.organizations VALUES ('${ids.orgA}','Org A'),('${ids.orgB}','Org B');
  INSERT INTO auth.users(id,email) VALUES
    ('${ids.adminA}','admin-a@example.com'),
    ('${ids.moderatorA}','moderator-a@example.com'),
    ('${ids.userA}','user-a@example.com'),
    ('${ids.adminB}','admin-b@example.com');
  INSERT INTO public.profiles(id,org_id,display_name,role) VALUES
    ('${ids.adminA}','${ids.orgA}','Admin A','admin'),
    ('${ids.moderatorA}','${ids.orgA}','Moderator A','moderator'),
    ('${ids.userA}','${ids.orgA}','User A','user'),
    ('${ids.adminB}','${ids.orgB}','Admin B','admin');
  INSERT INTO public.user_roles(user_id,role) VALUES
    ('${ids.adminA}','admin'),
    ('${ids.moderatorA}','moderator'),
    ('${ids.userA}','user'),
    ('${ids.adminB}','admin');
`;

async function createDb() {
  const db = new PGlite();
  await db.exec(fixture);
  const identityMigration = await readFile(identityMigrationUrl, "utf8");
  const roleAdministrationMigration = await readFile(roleAdministrationMigrationUrl, "utf8");
  await db.exec(identityMigration);
  await db.exec(roleAdministrationMigration);
  return { db, roleAdministrationMigration };
}

async function setActor(db, actorId) {
  await db.exec("RESET ROLE");
  await db.exec(`SELECT set_config('request.jwt.claim.sub','${actorId}',false)`);
}

async function changeRole(
  db,
  targetId,
  newRole,
  reason = "Approved responsibility change",
  idempotencyKey = `role:${targetId}:${newRole}`,
) {
  return db.query(
    `SELECT public.change_tenant_member_role($1,$2::public.app_role,$3,$4) AS id`,
    [targetId, newRole, reason, idempotencyKey],
  );
}

async function rejectionMessage(operation) {
  try {
    await operation();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  assert.fail("operation unexpectedly succeeded");
}

test("role administration migration replays and removes hostile grants, policies, and overloads", async () => {
  const { db, roleAdministrationMigration } = await createDb();
  await db.exec(`
    GRANT INSERT,UPDATE,DELETE ON public.identity_role_changes TO authenticated,service_role;
    CREATE POLICY hostile_role_change_all ON public.identity_role_changes
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
    CREATE FUNCTION public.change_tenant_member_role(uuid,text)
      RETURNS uuid LANGUAGE sql SECURITY DEFINER AS 'SELECT $1';
    GRANT EXECUTE ON FUNCTION public.change_tenant_member_role(uuid,text) TO authenticated;
  `);
  await db.exec(roleAdministrationMigration);

  const grants = await db.query(`
    SELECT has_table_privilege('authenticated','public.identity_role_changes','SELECT') AS auth_read,
      has_table_privilege('authenticated','public.identity_role_changes','INSERT') AS auth_insert,
      has_table_privilege('service_role','public.identity_role_changes','UPDATE') AS service_update
  `);
  assert.deepEqual(grants.rows[0], { auth_read: true, auth_insert: false, service_update: false });
  const policies = await db.query(`
    SELECT policyname,cmd FROM pg_policies
    WHERE schemaname='public' AND tablename='identity_role_changes'
  `);
  assert.deepEqual(policies.rows, [{ policyname: "identity_role_changes_admin_read", cmd: "SELECT" }]);
  const overloads = await db.query(`
    SELECT count(*)::int AS count FROM pg_proc procedure_info
    JOIN pg_namespace namespace ON namespace.oid=procedure_info.pronamespace
    WHERE namespace.nspname='public'
      AND procedure_info.proname='change_tenant_member_role'
      AND oidvectortypes(procedure_info.proargtypes) <> 'uuid, app_role, text, text'
  `);
  assert.equal(overloads.rows[0].count, 0);
  await db.close();
});

test("tenant admin lists only same-tenant members while non-admin listing fails closed", async () => {
  const { db } = await createDb();
  await setActor(db, ids.adminA);
  await db.exec("SET ROLE authenticated");
  const members = await db.query(`SELECT * FROM public.list_tenant_members()`);
  assert.deepEqual(
    members.rows.map((row) => ({ id: row.user_id, role: row.role })),
    [
      { id: ids.adminA, role: "admin" },
      { id: ids.moderatorA, role: "moderator" },
      { id: ids.userA, role: "user" },
    ],
  );
  await setActor(db, ids.moderatorA);
  await db.exec("SET ROLE authenticated");
  await assert.rejects(db.query(`SELECT * FROM public.list_tenant_members()`), /tenant admin/);
  await db.close();
});

test("admin role change updates both membership rows and writes one immutable audit record", async () => {
  const { db } = await createDb();
  await setActor(db, ids.adminA);
  await db.exec("SET ROLE authenticated");
  const first = await changeRole(db, ids.userA, "viewer");
  const retry = await changeRole(db, ids.userA, "viewer");
  assert.equal(retry.rows[0].id, first.rows[0].id);

  await db.exec("RESET ROLE");
  const membership = await db.query(`
    SELECT profile.role::text AS profile_role, assigned_role.role::text AS assigned_role
    FROM public.profiles profile
    JOIN public.user_roles assigned_role ON assigned_role.user_id=profile.id
    WHERE profile.id='${ids.userA}'
  `);
  assert.deepEqual(membership.rows[0], { profile_role: "viewer", assigned_role: "viewer" });
  const audit = await db.query(`
    SELECT org_id,actor_id,target_user_id,old_role::text,new_role::text,reason,idempotency_key
    FROM public.identity_role_changes WHERE id='${first.rows[0].id}'
  `);
  assert.deepEqual(audit.rows[0], {
    org_id: ids.orgA,
    actor_id: ids.adminA,
    target_user_id: ids.userA,
    old_role: "user",
    new_role: "viewer",
    reason: "Approved responsibility change",
    idempotency_key: `role:${ids.userA}:viewer`,
  });
  await setActor(db, ids.adminB);
  await db.exec("SET ROLE authenticated");
  const otherTenantAudit = await db.query(`SELECT id FROM public.identity_role_changes`);
  assert.deepEqual(otherTenantAudit.rows, []);
  await db.close();
});

test("role administration rejects self, admin, cross-tenant, and unauthorized targets atomically", async () => {
  const { db } = await createDb();
  await setActor(db, ids.adminA);
  await db.exec("SET ROLE authenticated");
  await assert.rejects(changeRole(db, ids.adminA, "viewer"), /another non-admin member/);
  await assert.rejects(changeRole(db, ids.userA, "admin"), /non-admin role/);
  const crossTenantError = await rejectionMessage(() => changeRole(db, ids.adminB, "viewer"));
  const missingError = await rejectionMessage(() =>
    changeRole(db, "10000000-0000-4000-8000-000000000099", "viewer"));
  assert.equal(crossTenantError, missingError);
  assert.match(crossTenantError, /member is unavailable/);
  await setActor(db, ids.moderatorA);
  await db.exec("SET ROLE authenticated");
  await assert.rejects(changeRole(db, ids.userA, "viewer"), /tenant admin/);

  await db.exec("RESET ROLE");
  const state = await db.query(`
    SELECT profile.role::text AS profile_role, assigned_role.role::text AS assigned_role
    FROM public.profiles profile JOIN public.user_roles assigned_role ON assigned_role.user_id=profile.id
    WHERE profile.id='${ids.userA}'
  `);
  assert.deepEqual(state.rows[0], { profile_role: "user", assigned_role: "user" });
  const audit = await db.query(`SELECT count(*)::int AS count FROM public.identity_role_changes`);
  assert.equal(audit.rows[0].count, 0);
  await db.close();
});

test("idempotency conflicts and invalid role-change evidence fail closed", async () => {
  const { db } = await createDb();
  await setActor(db, ids.adminA);
  await db.exec("SET ROLE authenticated");
  await changeRole(db, ids.userA, "viewer", "Approved responsibility change", "role:stable");
  await assert.rejects(
    changeRole(db, ids.moderatorA, "user", "Different target", "role:stable"),
    /idempotency key conflict/,
  );
  for (const [reason, key] of [
    [" ", "role:blank-reason"],
    ["contains\ncontrol", "role:control-reason"],
    ["Valid reason", " "],
  ]) {
    await assert.rejects(changeRole(db, ids.moderatorA, "user", reason, key), /reason|idempotency key/);
  }
  await db.close();
});

test("identity rows and role-change audit stay immutable outside the exact RPC", async () => {
  const { db } = await createDb();
  await setActor(db, ids.adminA);
  await db.exec("SET ROLE authenticated");
  const change = await changeRole(db, ids.userA, "viewer");
  await db.exec("RESET ROLE");

  for (const sql of [
    `UPDATE public.profiles SET role='user' WHERE id='${ids.userA}'`,
    `UPDATE public.user_roles SET role='user' WHERE user_id='${ids.userA}'`,
    `UPDATE public.identity_role_changes SET reason='rewritten' WHERE id='${change.rows[0].id}'`,
    `DELETE FROM public.identity_role_changes WHERE id='${change.rows[0].id}'`,
    `TRUNCATE public.profiles`,
    `TRUNCATE public.user_roles`,
    `TRUNCATE public.identity_role_changes`,
  ]) {
    await assert.rejects(
      db.exec(sql),
      /identity membership is immutable|role-change audit is immutable|foreign key constraint/,
    );
  }
  await db.close();
});
