import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowPath = new URL("../.github/workflows/ci.yml", import.meta.url);
const securityWorkflowPath = new URL("../.github/workflows/security.yml", import.meta.url);

test("CI is read-only and verifies the locked repository on Node 22", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  assert.match(workflow, /contents: read/);
  assert.match(workflow, /node-version: 22/);
  assert.match(workflow, /npm ci --legacy-peer-deps/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm run typecheck/);
  assert.match(workflow, /npm run lint/);
  assert.match(workflow, /npm run build/);

  assert.doesNotMatch(workflow, /secrets\./);
  assert.doesNotMatch(workflow, /deploy|publish/i);
  assert.doesNotMatch(workflow, /permissions:\s*write|contents:\s*write/);
});

test("CI rehearses migrations only in a disposable local Supabase stack", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  assert.match(workflow, /supabase\/setup-cli@v1/);
  assert.match(workflow, /version: 2\.116\.0/);
  assert.match(workflow, /supabase start/);
  assert.equal(workflow.match(/supabase db reset --local --no-seed/g)?.length, 2);
  assert.equal(workflow.match(/supabase db dump --local --schema public/g)?.length, 2);
  assert.match(workflow, /diff --unified \/tmp\/schema-first\.sql \/tmp\/schema-replay\.sql/);
  assert.match(workflow, /supabase db lint --local --level error/);
  assert.match(workflow, /if: always\(\)[\s\S]*supabase stop --no-backup/);

  assert.doesNotMatch(workflow, /SUPABASE_ACCESS_TOKEN|DB_PASSWORD|PROJECT_ID/);
  assert.doesNotMatch(workflow, /supabase (?:link|db push|functions deploy)/);
});

test("security CI rejects high and critical production dependency advisories", async () => {
  const workflow = await readFile(securityWorkflowPath, "utf8");

  assert.match(workflow, /node-version: 22/);
  assert.match(workflow, /npm ci --legacy-peer-deps/);
  assert.match(workflow, /npm audit --omit=dev --audit-level=high/);
  assert.match(workflow, /dependency-review-action@v4/);
  assert.match(workflow, /github\/codeql-action\/analyze@v3/);
});
