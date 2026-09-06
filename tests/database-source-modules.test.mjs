import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("the historical source constraint admits supported posting sources after migration", async () => {
  const directory = new URL("../supabase/migrations/", import.meta.url);
  const historical = await readFile(new URL("20251207071146_2c827533-d0f9-4d32-865d-9664c8ddea81.sql", directory), "utf8");
  const original = historical.match(/ALTER TABLE public\.journal_entries\s+ADD COLUMN IF NOT EXISTS source_module text DEFAULT 'gl'\s+CHECK \(source_module IN \([^;]+\)\);/)?.[0];
  assert.ok(original, "Exercise the actual historical constraint");
  const recovery = (await readdir(directory)).filter(name => name.startsWith("20260825") && name.endsWith(".sql"));
  const sources = new Set();
  for (const name of recovery) {
    const sql = await readFile(new URL(name, directory), "utf8");
    for (const match of sql.matchAll(/source_module IS DISTINCT FROM '([a-z_]+)'/g)) sources.add(match[1]);
  }
  assert.ok(sources.has("ar_receipt") && sources.has("ap_payment_replacement"));
  const db = new PGlite();
  try {
    await db.exec("CREATE TABLE public.journal_entries(id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY)");
    await db.exec(original);
    await assert.rejects(db.query("INSERT INTO public.journal_entries(source_module) VALUES('ar_receipt')"), /journal_entries_source_module_check/);
    const migration = await readFile(new URL("20260906040000_recovery_posting_source_modules.sql", directory), "utf8");
    await db.exec(migration);
    await db.exec(migration);
    for (const source of new Set(["gl", "banking", "ar", "ap", "payroll", "other", ...sources])) {
      await db.query("INSERT INTO public.journal_entries(source_module) VALUES($1)", [source]);
    }
    await assert.rejects(db.query("INSERT INTO public.journal_entries(source_module) VALUES('unrecognized_source')"), /journal_entries_source_module_check/);
  } finally { await db.close(); }
});
