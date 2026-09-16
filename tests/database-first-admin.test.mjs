import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { emptyIdentityFixture } from "./helpers/empty-identity-fixture.mjs";
import { nativeFinanceDatabase } from "./helpers/native-finance-database.mjs";

const names = ["20260825080000_recovery_identity_authorization", "20260825180000_recovery_identity_role_administration", "20260825190000_recovery_identity_onboarding", "20260916023331_identity_first_admin"];
const migrations = await Promise.all(names.map(name => readFile(new URL("../supabase/migrations/" + name + ".sql", import.meta.url), "utf8")));
const token = "synthetic-first-admin-token-at-least-32-characters";
const hash = createHash("md5").update(token).digest("hex") + createHash("md5").update("tapaano:" + token).digest("hex");
async function fixture() { const db = process.env.TAPAANO_TEST_DATABASE_URL ? await nativeFinanceDatabase(emptyIdentityFixture) : new PGlite(); if (!process.env.TAPAANO_TEST_DATABASE_URL) await db.exec(emptyIdentityFixture); for (const sql of migrations) await db.exec(sql); return db; }
const prepare = (db, overrides = {}) => db.query("SELECT * FROM public.prepare_first_admin_invitation($1,$2,$3,$4,$5)", Object.values({company:"Synthetic company",email:"first@example.com",name:"First administrator",key:"first-1",hash,...overrides}));
const consume = (db, invitation, email = "first@example.com", suppliedToken = token) => db.query(`INSERT INTO auth.users(id,email,raw_user_meta_data)
  VALUES($1,$2,jsonb_build_object('tapaano_invitation_id',$3::text,'tapaano_invitation_token',$4::text,'role','viewer','org_id',$5::text)) RETURNING id`, [randomUUID(), email, invitation, suppliedToken, randomUUID()]);

test("only the owner can prepare the first admin; safe retries preserve recipient and secret", async () => {
  const db = await fixture();
  try {
    for (const role of ["anon","authenticated","service_role"]) {
      await db.exec("SET ROLE " + role);
      await assert.rejects(prepare(db), /permission denied/);
      await db.exec("RESET ROLE");
    }
    const { rows: [a] } = await prepare(db);
    assert.deepEqual((await prepare(db)).rows, [a]);
    await assert.rejects(prepare(db,{email:"other@example.com"}), /conflicts/);
    await assert.rejects(prepare(db,{hash:"a".repeat(64)}), /conflicts/);
    await assert.rejects(prepare(db,{key:"different-request"}), /already pending/);
    assert.equal((await db.query("SELECT count(*)::int n FROM public.organizations")).rows[0].n,1);
    assert.equal((await db.query("SELECT count(*)::int n FROM auth.users")).rows[0].n,0);
    for (const sql of ["UPDATE public.identity_invitations SET provisioned_by=NULL", "DELETE FROM public.identity_invitations", "TRUNCATE public.identity_invitations"]) await assert.rejects(db.exec(sql), /immutable/);
  } finally { await db.close(); }
});

test("first admin requires the exact token and email, reconciles both roles, and closes permanently", async () => {
  const db = await fixture();
  try {
    const { rows: [i] } = await prepare(db);
    await assert.rejects(consume(db,i.invitation_id,"other@example.com"), /invalid or unavailable/);
    await assert.rejects(consume(db,i.invitation_id,"first@example.com","wrong-"+token), /invalid or unavailable/);
    assert.equal((await db.query("SELECT count(*)::int n FROM auth.users")).rows[0].n,0);
    const {rows:[user]} = await consume(db,i.invitation_id);
    const {rows:[membership]} = await db.query("SELECT p.role::text AS profile, r.role::text AS membership FROM public.profiles p JOIN public.user_roles r ON r.user_id=p.id AND r.org_id=p.org_id WHERE p.id=$1",[user.id]);
    assert.deepEqual(membership,{profile:"admin",membership:"admin"});
    assert.equal((await prepare(db)).rows[0].status,"CONSUMED");
    await assert.rejects(consume(db,i.invitation_id), /invalid or unavailable/);
    await assert.rejects(prepare(db,{key:"second-admin"}), /closed/);
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[user.id]);
    await db.exec("SET ROLE authenticated");
    const history = await db.query("SELECT * FROM public.list_tenant_invitations()");
    assert.equal(history.rows[0].role,"admin");
    assert.equal(history.rows[0].created_by,null);
    await assert.rejects(db.query("SELECT token_hash FROM public.identity_invitations"), /permission denied/);
  } finally { await db.close(); }
});

test("nonempty projects and malformed owner requests cannot create initial identities", async () => {
  const db = await fixture();
  try {
    for (const overrides of [{company:" "},{email:"First@example.com"},{name:"Name\n"},{hash:null},{hash:"a"},{key:""}]) await assert.rejects(prepare(db,overrides), /invalid/);
    await db.query("INSERT INTO public.organizations(id,name) VALUES($1,'Existing')",[randomUUID()]);
    await assert.rejects(prepare(db), /empty project/);
    assert.equal((await db.query("SELECT count(*)::int n FROM public.identity_invitations")).rows[0].n,0);
  } finally { await db.close(); }
});

test("expired first-admin tokens cannot create a user and owner reissue retains the reserved identity", async () => {
  const db = await fixture();
  try {
    // Shorten only the new request's TTL in this isolated fixture to exercise
    // real expiry and audit transitions without changing immutable history.
    await db.exec(migrations.at(-1).match(/CREATE FUNCTION public.prepare_first_admin_invitation[\s\S]*?\n\$\$;/)[0].replace("CREATE FUNCTION","CREATE OR REPLACE FUNCTION").replaceAll("interval '24 hours'","interval '1 millisecond'"));
    const {rows:[expired]} = await prepare(db);
    await new Promise(resolve=>setTimeout(resolve,10));
    await assert.rejects(consume(db,expired.invitation_id), /invalid or unavailable/);
    await assert.rejects(prepare(db), /expired/);
    await db.exec(migrations.at(-1).match(/CREATE FUNCTION public.prepare_first_admin_invitation[\s\S]*?\n\$\$;/)[0].replace("CREATE FUNCTION","CREATE OR REPLACE FUNCTION"));
    await assert.rejects(prepare(db,{key:"reissued",email:"different@example.com"}), /reserved/);
    const {rows:[replacement]} = await prepare(db,{key:"reissued"});
    assert.equal(replacement.org_id,expired.org_id);
    assert.equal((await db.query("SELECT status FROM public.identity_invitations WHERE id=$1",[expired.invitation_id])).rows[0].status,"EXPIRED");
    await consume(db,replacement.invitation_id);
  } finally { await db.close(); }
});
