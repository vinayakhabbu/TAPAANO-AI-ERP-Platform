import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const endpoints = [
  "agent-river",
  "anomaly-detector",
  "autonomous-approver",
  "generate-embedding",
  "global-search",
  "precedent-search",
  "process-scheduled-report",
  "send-notification",
];

const read = (path) => readFile(new URL(path, root), "utf8");

test("privileged Edge workflows are deterministic unavailable handlers", async () => {
  for (const endpoint of endpoints) {
    const source = await read(`supabase/functions/${endpoint}/index.ts`);
    assert.match(source, /unavailableHandler/);
    assert.match(source, /serve\(unavailableHandler\)/);
    assert.doesNotMatch(
      source,
      /Deno\.env|SUPABASE_SERVICE_ROLE_KEY|createClient|\.from\(|\.rpc\(|req\.json|fetch\s*\(/,
      `${endpoint} must not read secrets/input, access PostgreSQL, or call the network`,
    );
  }
});

test("the shared boundary returns 503 and has no privileged side effects", async () => {
  const source = await read("supabase/functions/_shared/unavailable.ts");
  assert.match(source, /status:\s*503/);
  assert.match(source, /workflow_unavailable/);
  assert.doesNotMatch(source, /Deno\.env|createClient|\.from\(|\.rpc\(|req\.json|fetch\s*\(/);
});

test("every contained endpoint has one JWT-on configuration section", async () => {
  const config = await read("supabase/config.toml");
  for (const endpoint of endpoints) {
    const escaped = endpoint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const sections = [...config.matchAll(new RegExp(`\\[functions\\.${escaped}\\]`, "g"))];
    assert.equal(sections.length, 1, `${endpoint} must have exactly one config section`);
    const block = config.slice(sections[0].index, config.indexOf("\n[", sections[0].index + 1) === -1
      ? config.length
      : config.indexOf("\n[", sections[0].index + 1));
    assert.match(block, /verify_jwt\s*=\s*true/);
  }
});
