import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";

const docker = (...args) => execFileSync("docker", args, { encoding: "utf8", timeout: 600000, maxBuffer: 20 * 1024 * 1024 }).trim();

test("Railway container serves the release securely on its assigned port", { timeout: 660000 }, async (t) => {
  const name = "tapaano-hosting-" + randomUUID();
  const key = "sb_publishable_" + "a".repeat(32);
  let running = false;
  try {
    docker("build", "--tag", name,
      "--build-arg", "VITE_SUPABASE_URL=https://ci-release-validation.supabase.co",
      "--build-arg", "VITE_SUPABASE_PUBLISHABLE_KEY=" + key,
      "--build-arg", "RAILWAY_GIT_COMMIT_SHA=0123456789abcdef0123456789abcdef01234567", ".");
    assert.equal(docker("image", "inspect", name, "--format", "{{.Config.User}}"), "10001:10001");
    docker("run", "--detach", "--name", name, "--read-only", "--tmpfs", "/tmp", "--cap-drop", "ALL",
      "--security-opt", "no-new-privileges", "--env", "PORT=9090", "--publish", "127.0.0.1::9090", name);
    running = true;
    const port = docker("port", name, "9090/tcp").split(":").at(-1);
    const base = "http://127.0.0.1:" + port;
    const request = (path, options) => fetch(base + path, { ...options, signal: AbortSignal.timeout(5000) });
    let ready = false;
    for (let i = 0; i < 30; i++) {
      try { if ((await request("/healthz")).status === 200) { ready = true; break; } } catch { /* Startup only. */ }
      await delay(500);
    }
    assert.ok(ready, "Container must become healthy on PORT=9090");
    let html;
    await t.test("HTML and nested SPA routes carry the exact release security policy", async () => {
      for (const path of ["/", "/index.html", "/finance/ledger"]) {
        const response = await request(path);
        assert.equal(response.status, 200);
        assert.match(response.headers.get("content-type"), /text\/html/);
        const csp = response.headers.get("content-security-policy");
        assert.match(csp, /connect-src 'self' https:\/\/ci-release-validation\.supabase\.co wss:\/\/ci-release-validation\.supabase\.co;/);
        assert.match(csp, /frame-ancestors 'none'/);
        assert.equal(response.headers.get("x-frame-options"), "DENY");
        assert.equal(response.headers.get("x-content-type-options"), "nosniff");
        assert.equal(response.headers.get("strict-transport-security"), "max-age=63072000");
        assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
        assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
        assert.ok(response.headers.get("permissions-policy"));
        assert.equal(response.headers.get("cache-control"), "no-cache, no-store, must-revalidate");
        const body = await response.text();
        if (html) assert.equal(body, html); else html = body;
      }
    });
    await t.test("hashed assets are cached and contain only synthetic public connection configuration", async () => {
      const asset = html.match(/src="(\/assets\/[^\"]+\.js)"/)?.[1];
      assert.ok(asset);
      const response = await request(asset);
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type"), /javascript/);
      assert.equal(response.headers.get("cache-control"), "public, max-age=31536000, immutable");
      assert.ok((await response.text()).length > 100);
      const compiled = docker("exec", name, "sh", "-c", "cat /srv/assets/*.js");
      assert.ok(compiled.includes("https://ci-release-validation.supabase.co"));
      assert.ok(compiled.includes(key));
      assert.ok(compiled.includes("0123456789abcdef0123456789abcdef01234567"));
    });
    await t.test("missing assets and private deployment files never return the SPA", async () => {
      for (const path of ["/assets/missing.js", "/assets/missing.css", "/assets/source.js.map", "/_headers", "/_redirects", "/.env", "/Caddyfile"]) {
        const response = await request(path);
        assert.equal(response.status, 404, path);
        assert.doesNotMatch(await response.text(), /<html/i);
        assert.match(response.headers.get("cache-control"), /no-store/);
      }
    });
    await t.test("health, HEAD and method restrictions work without exposing a Caddy admin listener", async () => {
      assert.equal(await (await request("/healthz")).text(), "ok");
      const head = await request("/", { method: "HEAD" });
      assert.equal(head.status, 200); assert.equal(await head.text(), "");
      assert.equal((await request("/finance/ledger", { method: "POST" })).status, 405);
      const config = docker("exec", name, "caddy", "adapt", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile");
      assert.equal(JSON.parse(config).admin.disabled, true);
    });
  } finally {
    if (running) docker("rm", "--force", name);
    docker("image", "rm", "--force", name);
  }
});
