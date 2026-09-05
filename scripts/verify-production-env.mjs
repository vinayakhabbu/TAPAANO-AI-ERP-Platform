import { pathToFileURL } from "node:url";

const PLACEHOLDER = /(change[-_ ]?me|example|placeholder|your[-_ ])/i;

function jwtRole(value) {
  const parts = value.split(".");
  if (parts.length !== 3) return undefined;

  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return typeof payload.role === "string" ? payload.role : undefined;
  } catch {
    return undefined;
  }
}

export function validateProductionEnvironment(environment) {
  const errors = [];
  const supabaseUrl = String(environment.VITE_SUPABASE_URL ?? "").trim();
  const supabasePublishableKey = String(environment.VITE_SUPABASE_PUBLISHABLE_KEY ?? "").trim();

  try {
    const parsed = new URL(supabaseUrl);
    if (
      parsed.protocol !== "https:"
      || parsed.username
      || parsed.password
      || parsed.pathname !== "/"
      || parsed.search
      || parsed.hash
      || PLACEHOLDER.test(supabaseUrl)
    ) {
      errors.push("VITE_SUPABASE_URL must be a non-placeholder HTTPS origin without credentials, path, query, or fragment.");
    }
  } catch {
    errors.push("VITE_SUPABASE_URL must be a valid HTTPS URL.");
  }

  const exposedSecret = /service[-_ ]?role|secret/i.test(supabasePublishableKey)
    || jwtRole(supabasePublishableKey) === "service_role";
  if (
    supabasePublishableKey.length < 20
    || PLACEHOLDER.test(supabasePublishableKey)
    || exposedSecret
  ) {
    errors.push("VITE_SUPABASE_PUBLISHABLE_KEY must contain only a non-secret Supabase publishable/anon key.");
  }

  return errors;
}

export function assertProductionEnvironment(environment) {
  const errors = validateProductionEnvironment(environment);
  if (errors.length > 0) {
    throw new Error(`Production environment validation failed:\n- ${errors.join("\n- ")}`);
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;
if (invokedPath === import.meta.url) {
  try {
    assertProductionEnvironment(process.env);
    process.stdout.write("Production public environment is valid.\n");
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "Production environment validation failed."}\n`);
    process.exitCode = 1;
  }
}
