type PublicEnvironment = {
  supabaseUrl: string;
  supabasePublishableKey: string;
};

type PublicEnvironmentResult =
  | { ok: true; value: PublicEnvironment }
  | { ok: false; missingOrInvalid: string[] };

const PLACEHOLDER = /(change[-_ ]?me|example|placeholder|your[-_ ])/i;

function jwtRole(value: string) {
  const parts = value.split(".");
  if (parts.length !== 3) return undefined;

  try {
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload.padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const decoded = JSON.parse(atob(padded)) as { role?: unknown };
    return typeof decoded.role === "string" ? decoded.role : undefined;
  } catch {
    return undefined;
  }
}

export function readPublicEnvironment(
  environment: Record<string, unknown>,
  production: boolean,
): PublicEnvironmentResult {
  const supabaseUrl = typeof environment.VITE_SUPABASE_URL === "string"
    ? environment.VITE_SUPABASE_URL.trim()
    : "";
  const supabasePublishableKey = typeof environment.VITE_SUPABASE_PUBLISHABLE_KEY === "string"
    ? environment.VITE_SUPABASE_PUBLISHABLE_KEY.trim()
    : "";
  const missingOrInvalid: string[] = [];

  try {
    const parsed = new URL(supabaseUrl);
    const localDevelopment = !production
      && parsed.protocol === "http:"
      && ["localhost", "127.0.0.1"].includes(parsed.hostname);
    if (
      (parsed.protocol !== "https:" && !localDevelopment)
      || parsed.username
      || parsed.password
      || parsed.pathname !== "/"
      || parsed.search
      || parsed.hash
      || PLACEHOLDER.test(supabaseUrl)
    ) {
      missingOrInvalid.push("VITE_SUPABASE_URL");
    }
  } catch {
    missingOrInvalid.push("VITE_SUPABASE_URL");
  }

  const exposedSecret = /service[-_ ]?role|secret/i.test(supabasePublishableKey)
    || jwtRole(supabasePublishableKey) === "service_role";
  if (
    supabasePublishableKey.length < 20
    || PLACEHOLDER.test(supabasePublishableKey)
    || exposedSecret
  ) {
    missingOrInvalid.push("VITE_SUPABASE_PUBLISHABLE_KEY");
  }

  if (missingOrInvalid.length > 0) {
    return { ok: false, missingOrInvalid: [...new Set(missingOrInvalid)] };
  }

  return {
    ok: true,
    value: { supabaseUrl, supabasePublishableKey },
  };
}

export const publicEnvironment = readPublicEnvironment(import.meta.env, import.meta.env.PROD);
