import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowPath = new URL("../.github/workflows/ci.yml", import.meta.url);

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
  assert.doesNotMatch(workflow, /supabase|deploy|publish/i);
  assert.doesNotMatch(workflow, /permissions:\s*write|contents:\s*write/);
});
