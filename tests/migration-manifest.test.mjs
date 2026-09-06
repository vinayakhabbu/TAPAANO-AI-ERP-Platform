import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const migrationsDirectory = new URL("../supabase/migrations/", import.meta.url);
const expectedManifestHash = "9b7a664c7bcf47cc6f8051280f986f495cad23c6fd555c5ee09b1548f1392902";

async function migrationManifest() {
  const names = (await readdir(migrationsDirectory))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const lines = [];

  for (const name of names) {
    const contents = await readFile(new URL(name, migrationsDirectory));
    const fileHash = createHash("sha256").update(contents).digest("hex");
    lines.push(`${fileHash}  supabase/migrations/${name}\n`);
  }

  return {
    names,
    hash: createHash("sha256").update(lines.join("")).digest("hex"),
  };
}

test("the ordered migration manifest is explicit and review-gated", async () => {
  const { names, hash } = await migrationManifest();
  const recoveryNames = names.filter((name) => /^20260825\d{6}_recovery_/.test(name));

  assert.equal(names.length, 72);
  assert.equal(new Set(names).size, names.length);
  assert.equal(recoveryNames.length, 22);
  assert.deepEqual(
    recoveryNames.map((name) => name.slice(8, 14)),
    Array.from({ length: 22 }, (_, index) => String(index + 1).padStart(2, "0") + "0000"),
  );
  assert.equal(hash, expectedManifestHash);
});
