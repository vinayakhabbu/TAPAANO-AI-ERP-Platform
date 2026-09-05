import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { assertProductionEnvironment } from "./verify-production-env.mjs";

export function renderProductionHeaders(supabaseUrl) {
  const httpsOrigin = new URL(supabaseUrl).origin;
  const websocketUrl = new URL(httpsOrigin);
  websocketUrl.protocol = "wss:";

  return `/*
  Content-Security-Policy: default-src 'self'; base-uri 'self'; connect-src 'self' ${httpsOrigin} ${websocketUrl.origin}; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data: blob:; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; upgrade-insecure-requests
  Cross-Origin-Resource-Policy: same-origin
  Permissions-Policy: camera=(), geolocation=(), microphone=(), payment=(), usb=()
  Referrer-Policy: strict-origin-when-cross-origin
  Strict-Transport-Security: max-age=63072000
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/index.html
  Cache-Control: no-cache, no-store, must-revalidate
`;
}

export async function writeProductionHeaders(environment, outputDirectory = "dist") {
  assertProductionEnvironment(environment);
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    new URL("_headers", pathToFileURL(`${outputDirectory}/`)),
    renderProductionHeaders(String(environment.VITE_SUPABASE_URL).trim()),
    "utf8",
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;
if (invokedPath === import.meta.url) {
  try {
    await writeProductionHeaders(process.env);
    process.stdout.write("Production headers are pinned to the configured Supabase origin.\n");
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "Production header generation failed."}\n`);
    process.exitCode = 1;
  }
}
