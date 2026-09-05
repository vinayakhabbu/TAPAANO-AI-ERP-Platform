import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validateProductionEnvironment } from "../scripts/verify-production-env.mjs";
import { renderProductionHeaders } from "../scripts/write-production-headers.mjs";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const publishableKey = `sb_publishable_${"a".repeat(32)}`;

test("release environment accepts only HTTPS and a public Supabase key", () => {
  assert.deepEqual(validateProductionEnvironment({
    VITE_SUPABASE_URL: "https://acme-company.supabase.co",
    VITE_SUPABASE_PUBLISHABLE_KEY: publishableKey,
  }), []);

  assert.equal(validateProductionEnvironment({
    VITE_SUPABASE_URL: "http://acme-company.supabase.co",
    VITE_SUPABASE_PUBLISHABLE_KEY: publishableKey,
  }).length, 1);

  assert.equal(validateProductionEnvironment({
    VITE_SUPABASE_URL: "https://acme-company.supabase.co/rest/v1?debug=true",
    VITE_SUPABASE_PUBLISHABLE_KEY: publishableKey,
  }).length, 1);
});

test("release headers pin network access to the configured Supabase origin", () => {
  const headers = renderProductionHeaders("https://acme-company.supabase.co");
  assert.match(headers, /connect-src 'self' https:\/\/acme-company\.supabase\.co wss:\/\/acme-company\.supabase\.co;/);
  assert.doesNotMatch(headers, /\*\.supabase\.co|sb_publishable_|service.role/i);
});

test("release environment rejects placeholders and service-role JWTs without echoing secrets", () => {
  const servicePayload = Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url");
  const serviceKey = `header.${servicePayload}.signature`;
  const errors = validateProductionEnvironment({
    VITE_SUPABASE_URL: "https://your-project-id.supabase.co",
    VITE_SUPABASE_PUBLISHABLE_KEY: serviceKey,
  });

  assert.equal(errors.length, 2);
  assert.doesNotMatch(errors.join("\n"), new RegExp(serviceKey, "u"));
});

test("browser startup fails closed and deployment files enforce a safe static boundary", async () => {
  const [main, client, publicConfig, headers, redirects, robots, html, css, gitignore, packageJson] = await Promise.all([
    read("src/main.tsx"),
    read("src/integrations/supabase/client.ts"),
    read("src/config/publicEnvironment.ts"),
    read("public/_headers"),
    read("public/_redirects"),
    read("public/robots.txt"),
    read("index.html"),
    read("src/index.css"),
    read(".gitignore"),
    read("package.json"),
  ]);

  assert.match(main, /if \(!publicEnvironment\.ok\)/);
  assert.match(main, /void import\("\.\/App\.tsx"\)/);
  assert.match(client, /if \(!publicEnvironment\.ok\)/);
  assert.doesNotMatch(client, /SERVICE_ROLE/);
  assert.match(publicConfig, /parsed\.pathname !== "\/"/);
  assert.match(publicConfig, /parsed\.search/);
  assert.match(publicConfig, /parsed\.hash/);
  assert.match(headers, /Content-Security-Policy:/);
  assert.match(headers, /connect-src 'self';/);
  assert.doesNotMatch(headers, /\*\.supabase\.co/);
  assert.match(headers, /frame-ancestors 'none'/);
  assert.match(headers, /Strict-Transport-Security:/);
  assert.match(redirects, /^\/\*\s+\/index\.html\s+200/m);
  assert.match(robots, /User-agent: \*\s+Disallow: \//);
  assert.match(html, /name="robots" content="noindex, nofollow, noarchive"/);
  assert.doesNotMatch(html, /FinanceAI|finance-ai\.app|lovable\.dev|bank reconciliation|AI-first/i);
  assert.doesNotMatch(css, /fonts\.googleapis\.com/);
  assert.match(gitignore, /^\.env\.\*$/m);
  const manifest = JSON.parse(packageJson);
  assert.match(manifest.scripts["build:release"], /verify-production-env\.mjs/);
  assert.match(manifest.scripts["build:release"], /write-production-headers\.mjs/);
  assert.match(manifest.scripts["verify:release"], /npm run build:release/);
  assert.equal(manifest.dependencies["react-router-dom"], "^7.18.3");
  assert.equal(manifest.devDependencies.vite, "^8.2.2");
  assert.equal(manifest.devDependencies["@vitejs/plugin-react"], "^6.1.1");
  assert.equal(manifest.devDependencies["@vitejs/plugin-react-swc"], undefined);
});
