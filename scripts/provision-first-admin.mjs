import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

export function readBootstrapConfig(env) {
  const required = name => {
    if (!env[name]?.trim()) throw new Error("Missing required configuration: " + name);
    return env[name].trim();
  };
  const url = new URL(required("SUPABASE_URL"));
  const callback = new URL(required("TAPAANO_ACCOUNT_SETUP_URL"));
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("SUPABASE_URL must be an HTTPS origin.");
  const project = url.hostname.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1];
  const database = new URL(required("TAPAANO_OWNER_DATABASE_URL"));
  if (!project || !["postgres:","postgresql:"].includes(database.protocol)
    || database.pathname !== "/postgres" || database.searchParams.get("sslmode") !== "verify-full"
    || !((database.hostname === "db." + project + ".supabase.co" && database.username === "postgres")
      || (database.hostname.endsWith(".pooler.supabase.com") && database.username === "postgres." + project))) {
    throw new Error("Use a verified TLS owner connection for the same managed Supabase project.");
  }
  if (callback.protocol !== "https:" || callback.username || callback.password || callback.pathname !== "/auth/setup" || callback.search || callback.hash) throw new Error("Use the exact HTTPS /auth/setup callback.");
  const token = required("TAPAANO_BOOTSTRAP_TOKEN");
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("Use a securely generated 32-byte hexadecimal bootstrap token.");
  const email = required("TAPAANO_ADMIN_EMAIL");
  if (email !== email.toLowerCase() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Use a normalized admin email.");
  if (required("TAPAANO_AUTH_DELIVERY_READY") !== "yes") throw new Error("Verify the Auth callback allowlist and email delivery before provisioning.");
  return {
    url: url.origin, callback: callback.href, token, email,
    databaseUrl: database.href,
    serviceKey: required("SUPABASE_SERVICE_ROLE_KEY"),
    company: required("TAPAANO_COMPANY_NAME"),
    name: required("TAPAANO_ADMIN_NAME"),
    requestKey: required("TAPAANO_BOOTSTRAP_REQUEST_KEY"),
  };
}

// This operator-only command is never imported into the frontend or a public
// function. Keep the same token/request key for retries; never log either.
export async function provisionFirstAdmin(config, db, auth) {
  const { rows: [invitation] } = await db.query(
    "SELECT * FROM public.prepare_first_admin_invitation($1,$2,$3,$4,$5)",
    [config.company, config.email, config.name, config.requestKey, createHash("sha256").update(config.token).digest("hex")],
  );
  if (invitation.status === "CONSUMED") {
    return { status: "account_already_created", emailSentThisRun: false };
  }
  const { error } = await auth.admin.inviteUserByEmail(config.email, {
    data: { tapaano_invitation_id: invitation.invitation_id, tapaano_invitation_token: config.token },
    redirectTo: config.callback,
  });
  if (error) throw new Error("Auth invitation failed. Check Auth delivery logs, then retry the same request. No password or secret should be shared.");
  const { rows: [verified] } = await db.query(`SELECT i.status, p.role::text AS profile_role, r.role::text AS membership_role,
    u.email = i.email AS email_matches FROM public.identity_invitations i
    JOIN public.profiles p ON p.id=i.consumed_by AND p.org_id=i.org_id
    JOIN public.user_roles r ON r.user_id=p.id AND r.org_id=p.org_id
    JOIN auth.users u ON u.id=p.id WHERE i.id=$1`, [invitation.invitation_id]);
  if (!verified || verified.status !== "CONSUMED" || verified.profile_role !== "admin" || verified.membership_role !== "admin" || !verified.email_matches) throw new Error("Invitation sent, but administrator verification failed. Stop and inspect the identity audit.");
  return { status: "invitation_accepted_by_auth", emailSentThisRun: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let db;
  try {
    const config = readBootstrapConfig(process.env);
    db = new pg.Client({ connectionString: config.databaseUrl, connectionTimeoutMillis: 15000 });
    await db.connect();
    const client = createClient(config.url, config.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    console.log(JSON.stringify(await provisionFirstAdmin(config, db, client.auth)));
  } catch {
    // Provider/SQL errors can embed credentials or token-bearing payloads.
    console.error("First-admin provisioning did not complete. Check the operator configuration and sanitized Auth logs; retain the same request key/token for a retry.");
    process.exitCode = 1;
  } finally {
    await db?.end();
  }
}
