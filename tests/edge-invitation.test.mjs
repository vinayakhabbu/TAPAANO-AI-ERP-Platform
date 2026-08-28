import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("invite-member is the only JWT-protected privileged delivery boundary", async () => {
  const config = await read("supabase/config.toml");
  const sections = [...config.matchAll(/\[functions\.invite-member\]/g)];
  assert.equal(sections.length, 1);
  const end = config.indexOf("\n[", sections[0].index + 1);
  const block = config.slice(sections[0].index, end === -1 ? config.length : end);
  assert.match(block, /verify_jwt\s*=\s*true/);
});

test("invite-member validates actor, origin, payload, and exact database evidence", async () => {
  const source = await read("supabase/functions/invite-member/index.ts");
  assert.match(source, /requestOrigin !== allowedOrigin/);
  assert.match(source, /auth\.getUser\(\)/);
  assert.match(source, /rpc\(\s*"create_tenant_invitation"/);
  assert.match(source, /p_actor_id:\s*userData\.user\.id/);
  assert.match(source, /rpc\(\s*"list_tenant_invitations"/);
  assert.match(source, /verified\?\.status !== "CONSUMED"/);
  assert.match(source, /\["moderator", "user", "viewer"\]/);
  assert.doesNotMatch(source, /\.from\s*\(/);
  assert.doesNotMatch(source, /p_org_id|p_created_by|p_admin_role/);
});

test("invitation secret is deterministic, hashed at the database boundary, and never returned", async () => {
  const source = await read("supabase/functions/invite-member/index.ts");
  assert.match(source, /IDENTITY_INVITATION_SIGNING_SECRET/);
  assert.match(source, /name:\s*"HMAC",\s*hash:\s*"SHA-256"/);
  assert.match(source, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(source, /p_token_hash:\s*invitationTokenHash/);
  assert.match(source, /tapaano_invitation_token:\s*invitationToken/);
  assert.match(source, /auth\.admin\.inviteUserByEmail/);
  assert.match(source, /IDENTITY_INVITATION_REDIRECT_URL/);
  assert.doesNotMatch(source, /console\.|JSON\.stringify\(\s*invitationToken/);

  for (const response of source.matchAll(/return jsonResponse\(\{([\s\S]*?)\},\s*\d+/g)) {
    assert.doesNotMatch(response[1], /invitationToken|token_hash/);
  }
});

test("delivery failures are generic and do not expose Auth or database error details", async () => {
  const source = await read("supabase/functions/invite-member/index.ts");
  assert.match(source, /invitation_request_rejected/);
  assert.match(source, /invitation_delivery_failed/);
  assert.match(source, /invitation_verification_failed/);
  assert.doesNotMatch(source, /userError\.message|invitationError\.message|deliveryError\.message|verificationError\.message/);
  assert.match(source, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(source, /serviceRoleKey[\s\S]{0,80}(?:JSON\.stringify|Response|console)/);
});
