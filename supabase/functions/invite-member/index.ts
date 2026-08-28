import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

type AssignableRole = "moderator" | "user" | "viewer";

interface InvitationRequest {
  email?: unknown;
  display_name?: unknown;
  role?: unknown;
  reason?: unknown;
  idempotency_key?: unknown;
}

interface InvitationRecord {
  invitation_id: string;
  email: string;
  display_name: string;
  role: AssignableRole;
  status: "PENDING" | "CONSUMED" | "CANCELLED" | "EXPIRED";
  expires_at: string;
}

const encoder = new TextEncoder();

function requiredEnvironment(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error("invitation service is not configured");
  return value;
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function hex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function deriveInvitationToken(secret: string, canonicalPayload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(canonicalPayload));
  return base64Url(new Uint8Array(signature));
}

async function sha256(value: string) {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

function responseHeaders(allowedOrigin: string) {
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Vary": "Origin",
  };
}

function jsonResponse(body: Record<string, unknown>, status: number, allowedOrigin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(allowedOrigin),
  });
}

function normalizedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

serve(async (request) => {
  const allowedOrigin = Deno.env.get("APP_ORIGIN");
  if (!allowedOrigin) {
    return new Response(JSON.stringify({ error: "invitation_service_failed" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
  const requestOrigin = request.headers.get("origin");
  if (requestOrigin !== allowedOrigin) {
    return jsonResponse({ error: "origin_not_allowed" }, 403, allowedOrigin);
  }
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: responseHeaders(allowedOrigin) });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405, allowedOrigin);
  }

  try {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return jsonResponse({ error: "authentication_required" }, 401, allowedOrigin);
    }

    const supabaseUrl = requiredEnvironment("SUPABASE_URL");
    const anonKey = requiredEnvironment("SUPABASE_ANON_KEY");
    const serviceRoleKey = requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY");
    const signingSecret = requiredEnvironment("IDENTITY_INVITATION_SIGNING_SECRET");
    const redirectTo = requiredEnvironment("IDENTITY_INVITATION_REDIRECT_URL");

    const body = await request.json() as InvitationRequest;
    const email = normalizedString(body.email).toLowerCase();
    const displayName = normalizedString(body.display_name);
    const role = normalizedString(body.role) as AssignableRole;
    const reason = normalizedString(body.reason);
    const idempotencyKey = normalizedString(body.idempotency_key);
    if (
      email !== body.email
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      || email.length > 320
      || displayName !== body.display_name
      || !displayName || displayName.length > 200
      || !(["moderator", "user", "viewer"] as string[]).includes(role)
      || reason !== body.reason || !reason || reason.length > 500
      || idempotencyKey !== body.idempotency_key
      || !idempotencyKey || idempotencyKey.length > 200
    ) {
      return jsonResponse({ error: "invalid_invitation_request" }, 400, allowedOrigin);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authorization } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return jsonResponse({ error: "authentication_required" }, 401, allowedOrigin);
    }

    const canonicalPayload = JSON.stringify([
      userData.user.id,
      email,
      displayName,
      role,
      reason,
      idempotencyKey,
    ]);
    const invitationToken = await deriveInvitationToken(signingSecret, canonicalPayload);
    const invitationTokenHash = await sha256(invitationToken);
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: invitationRows, error: invitationError } = await adminClient.rpc(
      "create_tenant_invitation",
      {
        p_actor_id: userData.user.id,
        p_email: email,
        p_display_name: displayName,
        p_role: role,
        p_reason: reason,
        p_idempotency_key: idempotencyKey,
        p_token_hash: invitationTokenHash,
      },
    );
    if (invitationError || !invitationRows?.[0]) {
      return jsonResponse({ error: "invitation_request_rejected" }, 400, allowedOrigin);
    }
    const invitation = invitationRows[0] as InvitationRecord;
    if (invitation.status === "CONSUMED") {
      return jsonResponse({
        invitation_id: invitation.invitation_id,
        email: invitation.email,
        role: invitation.role,
        status: "delivered",
        expires_at: invitation.expires_at,
      }, 200, allowedOrigin);
    }
    if (invitation.status !== "PENDING") {
      return jsonResponse({ error: "invitation_not_deliverable" }, 409, allowedOrigin);
    }

    const { error: deliveryError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: {
        tapaano_invitation_id: invitation.invitation_id,
        tapaano_invitation_token: invitationToken,
      },
      redirectTo,
    });
    if (deliveryError) {
      return jsonResponse({ error: "invitation_delivery_failed" }, 502, allowedOrigin);
    }

    const { data: safeInvitations, error: verificationError } = await userClient.rpc(
      "list_tenant_invitations",
    );
    const verified = (safeInvitations as InvitationRecord[] | null)?.find(
      (candidate) => candidate.invitation_id === invitation.invitation_id,
    );
    if (verificationError || verified?.status !== "CONSUMED") {
      return jsonResponse({ error: "invitation_verification_failed" }, 502, allowedOrigin);
    }

    return jsonResponse({
      invitation_id: invitation.invitation_id,
      email: invitation.email,
      role: invitation.role,
      status: "delivered",
      expires_at: invitation.expires_at,
    }, 201, allowedOrigin);
  } catch {
    return jsonResponse({ error: "invitation_service_failed" }, 500, allowedOrigin);
  }
});
