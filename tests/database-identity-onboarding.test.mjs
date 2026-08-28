import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migrationUrls = [
  "../supabase/migrations/20260825080000_recovery_identity_authorization.sql",
  "../supabase/migrations/20260825180000_recovery_identity_role_administration.sql",
  "../supabase/migrations/20260825190000_recovery_identity_onboarding.sql",
].map((path) => new URL(path, import.meta.url));

const ids = {
  orgA: "00000000-0000-4000-8000-000000000001",
  orgB: "00000000-0000-4000-8000-000000000002",
  adminA: "10000000-0000-4000-8000-000000000001",
  userA: "10000000-0000-4000-8000-000000000002",
  adminB: "10000000-0000-4000-8000-000000000003",
  newcomer: "10000000-0000-4000-8000-000000000004",
  otherNewcomer: "10000000-0000-4000-8000-000000000005",
};

const fixture = `
  CREATE SCHEMA auth;
  CREATE SCHEMA extensions;
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
  CREATE OR REPLACE FUNCTION extensions.digest(value text, algorithm text)
  RETURNS bytea LANGUAGE sql IMMUTABLE AS $$
    SELECT decode(md5(value) || md5('tapaano:' || value), 'hex')
    WHERE algorithm = 'sha256'
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
    ('${ids.userA}','user-a@example.com'),
    ('${ids.adminB}','admin-b@example.com');
  INSERT INTO public.profiles(id,org_id,display_name,role) VALUES
    ('${ids.adminA}','${ids.orgA}','Admin A','admin'),
    ('${ids.userA}','${ids.orgA}','User A','user'),
    ('${ids.adminB}','${ids.orgB}','Admin B','admin');
  INSERT INTO public.user_roles(user_id,role) VALUES
    ('${ids.adminA}','admin'),('${ids.userA}','user'),('${ids.adminB}','admin');
`;

async function createDb() {
  const db = new PGlite();
  await db.exec(fixture);
  const migrations = await Promise.all(migrationUrls.map((url) => readFile(url, "utf8")));
  for (const migration of migrations) await db.exec(migration);
  return { db, onboardingMigration: migrations.at(-1) };
}

async function setActor(db, actorId) {
  await db.exec("RESET ROLE");
  await db.exec(`SELECT set_config('request.jwt.claim.sub','${actorId}',false)`);
}

function tokenHash(token) {
  return createHash("md5").update(token).digest("hex")
    + createHash("md5").update(`tapaano:${token}`).digest("hex");
}

async function createInvitation(db, {
  actorId = ids.adminA,
  email = "new.member@example.com",
  displayName = "New Member",
  role = "user",
  reason = "Approved team onboarding",
  idempotencyKey = "invite:new-member",
  token = "test-invitation-secret-with-enough-entropy",
} = {}) {
  const hash = tokenHash(token);
  await db.exec("RESET ROLE");
  await db.exec("SELECT set_config('request.jwt.claim.sub','',false)");
  await db.exec("SET ROLE service_role");
  try {
    return await db.query(
      "SELECT * FROM public.create_tenant_invitation($1,$2,$3,$4::public.app_role,$5,$6,$7)",
      [actorId, email, displayName, role, reason, idempotencyKey, hash],
    );
  } finally {
    await db.exec("RESET ROLE");
    await db.exec(`SELECT set_config('request.jwt.claim.sub','${actorId}',false)`);
    await db.exec("SET ROLE authenticated");
  }
}

async function insertInvitedUser(db, {
  id = ids.newcomer,
  email = "new.member@example.com",
  invitationId,
  token = "test-invitation-secret-with-enough-entropy",
} = {}) {
  await db.exec("RESET ROLE");
  await db.exec("SELECT set_config('request.jwt.claim.sub','',false)");
  return db.query(
    `INSERT INTO auth.users(id,email,raw_user_meta_data)
     VALUES ($1,$2,jsonb_build_object(
       'tapaano_invitation_id',$3::text,
       'tapaano_invitation_token',$4::text,
       'org_id','${ids.orgB}',
       'role','admin'
     )) RETURNING id`,
    [id, email, invitationId, token],
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

test("onboarding migration replays and removes hostile grants, policies, and overloads", async () => {
  const { db, onboardingMigration } = await createDb();
  await db.exec(`
    GRANT ALL ON public.identity_invitations TO authenticated,service_role;
    CREATE POLICY hostile_invitation_all ON public.identity_invitations
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
    CREATE FUNCTION public.create_tenant_invitation(text,text)
      RETURNS uuid LANGUAGE sql SECURITY DEFINER AS 'SELECT gen_random_uuid()';
    GRANT EXECUTE ON FUNCTION public.create_tenant_invitation(text,text) TO authenticated;
  `);
  await db.exec(onboardingMigration);

  const privileges = await db.query(`
    SELECT has_table_privilege('authenticated','public.identity_invitations','SELECT') AS auth_read,
      has_table_privilege('authenticated','public.identity_invitations','INSERT') AS auth_insert,
      has_table_privilege('service_role','public.identity_invitations','UPDATE') AS service_update
  `);
  assert.deepEqual(privileges.rows[0], { auth_read: false, auth_insert: false, service_update: false });
  const policies = await db.query(`
    SELECT count(*)::int AS count FROM pg_policies
    WHERE schemaname='public' AND tablename='identity_invitations'
  `);
  assert.equal(policies.rows[0].count, 0);
  const overloads = await db.query(`
    SELECT count(*)::int AS count FROM pg_proc procedure_info
    JOIN pg_namespace namespace ON namespace.oid=procedure_info.pronamespace
    WHERE namespace.nspname='public' AND (
      (procedure_info.proname='create_tenant_invitation'
        AND oidvectortypes(procedure_info.proargtypes) <> 'uuid, text, text, app_role, text, text, text')
      OR (procedure_info.proname='cancel_tenant_invitation'
        AND oidvectortypes(procedure_info.proargtypes) <> 'uuid, text')
      OR (procedure_info.proname='list_tenant_invitations'
        AND oidvectortypes(procedure_info.proargtypes) <> '')
    )
  `);
  assert.equal(overloads.rows[0].count, 0);
  const functionPrivileges = await db.query(`
    SELECT
      has_function_privilege('authenticated',
        'public.create_tenant_invitation(uuid,text,text,public.app_role,text,text,text)',
        'EXECUTE') AS authenticated_create,
      has_function_privilege('service_role',
        'public.create_tenant_invitation(uuid,text,text,public.app_role,text,text,text)',
        'EXECUTE') AS service_create
  `);
  assert.deepEqual(functionPrivileges.rows[0], {
    authenticated_create: false,
    service_create: true,
  });
  await db.close();
});

test("tenant admin creates a safe non-admin invitation and lists no token evidence", async () => {
  const { db } = await createDb();
  await setActor(db, ids.adminA);
  await db.exec("SET ROLE authenticated");
  const created = await createInvitation(db);
  assert.equal(created.rows[0].email, "new.member@example.com");
  assert.equal(created.rows[0].display_name, "New Member");
  assert.equal(created.rows[0].role, "user");
  assert.equal(created.rows[0].status, "PENDING");
  assert.deepEqual(Object.keys(created.rows[0]).sort(), [
    "display_name", "email", "expires_at", "invitation_id", "role", "status",
  ]);

  const listed = await db.query("SELECT * FROM public.list_tenant_invitations()");
  assert.equal(listed.rows.length, 1);
  assert.deepEqual(Object.keys(listed.rows[0]).sort(), [
    "cancel_reason", "created_at", "created_by", "display_name", "email",
    "expires_at", "invitation_id", "resolved_at", "role", "status",
  ]);
  assert.equal("token_hash" in listed.rows[0], false);

  await db.exec("RESET ROLE");
  const stored = await db.query("SELECT octet_length(token_hash)::int AS bytes FROM public.identity_invitations");
  assert.equal(stored.rows[0].bytes, 32);
  await db.close();
});

test("invitation creation is idempotent and rejects conflicting or unauthorized payloads", async () => {
  const { db } = await createDb();
  await setActor(db, ids.adminA);
  await db.exec("SET ROLE authenticated");
  const first = await createInvitation(db);
  const retry = await createInvitation(db);
  assert.equal(retry.rows[0].invitation_id, first.rows[0].invitation_id);
  await assert.rejects(
    createInvitation(db, { displayName: "Different Member" }),
    /idempotency key conflict/,
  );
  await assert.rejects(createInvitation(db, { role: "admin", idempotencyKey: "invite:admin" }), /non-admin/);
  await assert.rejects(createInvitation(db, { email: "invalid", idempotencyKey: "invite:invalid" }), /email/);

  await assert.rejects(createInvitation(db, {
    actorId: ids.userA,
    idempotencyKey: "invite:unauthorized",
  }), /tenant admin/);
  await db.exec("RESET ROLE");
  await db.exec("SET ROLE authenticated");
  await assert.rejects(
    db.query(
      "SELECT * FROM public.create_tenant_invitation($1,$2,$3,$4::public.app_role,$5,$6,$7)",
      [ids.adminA, "blocked@example.com", "Blocked", "user", "Blocked", "blocked", tokenHash("blocked-secret-with-enough-entropy")],
    ),
    /permission denied/,
  );
  await db.close();
});

test("valid invitation derives immutable tenant and role while ignoring forged metadata", async () => {
  const { db } = await createDb();
  await setActor(db, ids.adminA);
  await db.exec("SET ROLE authenticated");
  const invitation = await createInvitation(db, { role: "moderator" });
  await insertInvitedUser(db, { invitationId: invitation.rows[0].invitation_id });

  const membership = await db.query(`
    SELECT profile.org_id,profile.display_name,profile.role::text AS profile_role,
      assigned_role.role::text AS assigned_role
    FROM public.profiles profile
    JOIN public.user_roles assigned_role ON assigned_role.user_id=profile.id
    WHERE profile.id='${ids.newcomer}'
  `);
  assert.deepEqual(membership.rows[0], {
    org_id: ids.orgA,
    display_name: "New Member",
    profile_role: "moderator",
    assigned_role: "moderator",
  });
  const consumed = await db.query(`
    SELECT status,consumed_by,consumed_at IS NOT NULL AS consumed
    FROM public.identity_invitations WHERE id='${invitation.rows[0].invitation_id}'
  `);
  assert.deepEqual(consumed.rows[0], {
    status: "CONSUMED",
    consumed_by: ids.newcomer,
    consumed: true,
  });
  await db.close();
});

test("wrong token, email, missing invitation, and expiry fail with identical atomic errors", async () => {
  const errors = [];
  for (const variant of ["token", "email", "missing", "expired"]) {
    const { db } = await createDb();
    await setActor(db, ids.adminA);
    await db.exec("SET ROLE authenticated");
    const invitation = await createInvitation(db);
    const invitationId = variant === "missing"
      ? "20000000-0000-4000-8000-000000000099"
      : invitation.rows[0].invitation_id;
    if (variant === "expired") {
      await db.exec("RESET ROLE");
      await db.exec("ALTER TABLE public.identity_invitations DISABLE TRIGGER guard_identity_invitation_write");
      await db.exec(`
        UPDATE public.identity_invitations
        SET expires_at=created_at + interval '1 millisecond'
        WHERE id='${invitation.rows[0].invitation_id}'
      `);
      await db.exec("ALTER TABLE public.identity_invitations ENABLE TRIGGER guard_identity_invitation_write");
    }
    errors.push(await rejectionMessage(() => insertInvitedUser(db, {
      invitationId,
      token: variant === "token" ? "wrong-secret" : "test-invitation-secret-with-enough-entropy",
      email: variant === "email" ? "other@example.com" : "new.member@example.com",
    })));
    const residue = await db.query(`
      SELECT
        (SELECT count(*)::int FROM auth.users WHERE id='${ids.newcomer}') AS auth_users,
        (SELECT count(*)::int FROM public.profiles WHERE id='${ids.newcomer}') AS profiles,
        (SELECT count(*)::int FROM public.user_roles WHERE user_id='${ids.newcomer}') AS roles
    `);
    assert.deepEqual(residue.rows[0], { auth_users: 0, profiles: 0, roles: 0 });
    await db.close();
  }
  assert.ok(errors.every((message) => message === errors[0]));
  assert.match(errors[0], /controlled invitation is invalid or unavailable/);
});

test("cancelled invitation cannot onboard and invitation audit is tenant scoped", async () => {
  const { db } = await createDb();
  await setActor(db, ids.adminA);
  await db.exec("SET ROLE authenticated");
  const invitation = await createInvitation(db);
  const cancelled = await db.query(
    "SELECT public.cancel_tenant_invitation($1,$2) AS id",
    [invitation.rows[0].invitation_id, "Hiring plan changed"],
  );
  assert.equal(cancelled.rows[0].id, invitation.rows[0].invitation_id);
  await assert.rejects(
    insertInvitedUser(db, { invitationId: invitation.rows[0].invitation_id }),
    /controlled invitation is invalid or unavailable/,
  );

  await setActor(db, ids.adminB);
  await db.exec("SET ROLE authenticated");
  const otherTenant = await db.query("SELECT * FROM public.list_tenant_invitations()");
  assert.deepEqual(otherTenant.rows, []);
  await db.close();
});

test("invitation and onboarding rows remain immutable outside controlled routines", async () => {
  const { db } = await createDb();
  await setActor(db, ids.adminA);
  await db.exec("SET ROLE authenticated");
  const invitation = await createInvitation(db);
  await db.exec("RESET ROLE");
  for (const sql of [
    `UPDATE public.identity_invitations SET email='changed@example.com' WHERE id='${invitation.rows[0].invitation_id}'`,
    `DELETE FROM public.identity_invitations WHERE id='${invitation.rows[0].invitation_id}'`,
    "TRUNCATE public.identity_invitations",
    `INSERT INTO public.profiles(id,org_id,display_name,role)
      VALUES ('${ids.otherNewcomer}','${ids.orgA}','Bypass','user')`,
  ]) {
    await assert.rejects(db.exec(sql), /invitation audit is immutable|identity membership is immutable|foreign key/);
  }
  await db.close();
});
