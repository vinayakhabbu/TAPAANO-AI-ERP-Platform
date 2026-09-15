import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { assertProductionEnvironment } from "./verify-production-env.mjs";
import { renderProductionHeaders } from "./write-production-headers.mjs";

export function renderRailwayConfig(environment) {
  assertProductionEnvironment(environment);
  // Use the same policy as the release artifact. Caddy does not interpret the
  // Netlify-style _headers file, so translate the global block explicitly.
  const headers = renderProductionHeaders(environment.VITE_SUPABASE_URL.trim())
    .split("\n\n")[0].split("\n").slice(1).map((line) => {
      const separator = line.indexOf(":");
      return `    ${line.slice(0, separator).trim()} ${JSON.stringify(line.slice(separator + 1).trim())}`;
    }).join("\n");
  return `{
  admin off
  auto_https off
  persist_config off
}

:{$PORT:8080} {
  root * /srv
  encode zstd gzip
  header {
${headers}
    Cache-Control "no-store"
    -Server
  }

  @unsupported not method GET HEAD
  respond @unsupported 405
  @internal path /_headers /_redirects /Caddyfile /.* /assets/*.map
  respond @internal 404

  handle /healthz {
    respond "ok" 200
  }
  handle /assets/* {
    @existing file {path}
    header @existing Cache-Control "public, max-age=31536000, immutable"
    file_server
  }
  handle {
    header Cache-Control "no-cache, no-store, must-revalidate"
    try_files {path} /index.html
    file_server
  }
}
`;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await writeFile(process.argv[2] ?? "Caddyfile", renderRailwayConfig(process.env), "utf8");
}
