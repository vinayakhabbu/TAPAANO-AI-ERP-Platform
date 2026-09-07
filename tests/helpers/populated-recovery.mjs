import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, writeFile, chmod, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { captureRecoverySnapshot, verifyRecoveryForeignKeys, requireLocalRecovery } from "./recovery-snapshot.mjs";

const execute = promisify(execFile);
async function command(file, args, options = {}) {
  try { return await execute(file, args, { timeout: 120000, maxBuffer: 8 * 1024 * 1024, ...options }); }
  catch (error) {
    const state=typeof error.stderr === "string" ? error.stderr.match(/ERROR:\s+([0-9A-Z]{5})\b/)?.[1] : null;
    const sqlLine=typeof error.stderr === "string" ? error.stderr.match(/psql:[^\n]*?:(\d+):\s+ERROR:/)?.[1] : null;
    const action=file === "docker" && args[0] === "exec" ? args[2] : args[0];
    throw new Error(`Synthetic recovery command failed: ${file} ${action}${state ? " (SQLSTATE " + state + ")" : ""}${sqlLine ? " at SQL line " + sqlLine : ""}. Captured output is withheld because it may contain backup data.`);
  }
}

const graphChecks = [
  ["finance_statement_policies","validate_statement_policy_graph","true"],
  ["finance_cash_classifications","validate_cash_classification_graph","true"],
  ["finance_intercompany","validate_intercompany_graph","true"],
  ["finance_groups","validate_finance_group","true"],
  ["finance_group_adjustments","validate_group_adjustment","true"],
  ["finance_consolidations","validate_consolidation_graph","true"],
  ["finance_schedules","validate_schedule_graph","true"],
  ["finance_year_closes","validate_fiscal_close_graph","true"],
  ["finance_inbox","validate_integration_graph","true"],
  ["finance_contracts","validate_contract_graph","true"],
  ["cash_registers","validate_cash_matches","true"],
  ["invoices","validate_customer_invoice_graph","accounting_status='POSTED'"],
  ["bills","validate_supplier_bill_graph","accounting_status='POSTED'"],
  ["customer_credit_notes","validate_customer_credit_note_graph","true"],
  ["supplier_bill_credit_notes","validate_supplier_bill_credit_graph","true"],
  ["customer_receipts","validate_customer_receipt_graph","true"],
  ["supplier_payments","validate_supplier_payment_graph","true"],
  ["customer_receipt_corrections","validate_customer_receipt_correction_graph","true"],
  ["supplier_payment_corrections","validate_supplier_payment_correction_graph","true"],
  ["customer_receipt_replacements","validate_customer_receipt_replacement_graph","true"],
  ["supplier_payment_replacements","validate_supplier_payment_replacement_graph","true"],
];
async function validateGraphs(db) {
  let count = 0;
  for (const [table, validator, where] of graphChecks) {
    const { rows } = await db.query(`SELECT id FROM public.${table} WHERE ${where}`);
    assert.ok(rows.length > 0, "Populated recovery fixture must exercise " + table);
    for (const row of rows) await db.query(`SELECT public.${validator}($1)`, [row.id]);
    count += rows.length;
  }
  return count;
}

// Called only after this test process bootstraps an empty disposable local stack.
// No remote endpoint, arbitrary backup, linked project or production credential
// is accepted. The raw dump stays in a private temporary directory and is deleted.
export async function rehearsePopulatedRecovery({ status, expectedOrganizations, expectedUsers, verifyApplication }) {
  const started = performance.now();
  const projectId = (await readFile(new URL("../../supabase/config.toml", import.meta.url), "utf8")).match(/^project_id\s*=\s*"([a-zA-Z0-9_-]+)"/m)?.[1];
  assert.ok(projectId, "Local CLI project must be explicit");
  const container = "supabase_db_" + projectId;
  const inspection = JSON.parse((await command("docker", ["inspect", container])).stdout)[0];
  requireLocalRecovery(status, projectId, inspection);
  const directory = await mkdtemp(join(tmpdir(), "tapaano-synthetic-recovery-"));
  await chmod(directory, 0o700);
  let db = new pg.Client({ connectionString: status.DB_URL }); await db.connect();
  try {
    const organizations = (await db.query("SELECT id FROM public.organizations ORDER BY id")).rows.map(row => row.id);
    const users = (await db.query("SELECT id FROM auth.users ORDER BY id")).rows.map(row => row.id);
    assert.deepEqual(organizations, [...expectedOrganizations].sort(), "Recovery may only reset this process's synthetic tenant fixture");
    assert.deepEqual(users, [...expectedUsers].sort(), "Recovery may only reset this process's synthetic identities");
    const graphs = await validateGraphs(db), foreignKeys = await verifyRecoveryForeignKeys(db);
    const baseline = await captureRecoverySnapshot(db);
    const snapshotHash = createHash("sha256").update(JSON.stringify(baseline)).digest("hex");
    const dump = join(directory, "data.sql");
    const backupStart = performance.now();
    const containerDump = "/tmp/tapaano-synthetic-backup-" + randomUUID() + ".sql";
    try {
      // Use the database container's matching pg_dump version and include all
      // Auth data explicitly. Auth migration versions are rebuilt and compared,
      // not copied over provider-managed metadata.
      await command("docker", ["exec", container, "pg_dump", "--username", "postgres", "--dbname", "postgres", "--data-only", "--quote-all-identifiers", "--schema", "public", "--schema", "auth", "--exclude-table-data=auth.schema_migrations", "--file", containerDump]);
      await command("docker", ["cp", container + ":" + containerDump, dump]);
    } finally { await command("docker", ["exec", container, "rm", "-f", containerDump]); }
    await chmod(dump, 0o600);
    const backup = await readFile(dump);
    assert.ok(backup.includes(Buffer.from('COPY "public"."journal_entries"')) || backup.includes(Buffer.from("COPY public.journal_entries")), "Backup must contain journal data");
    assert.ok(backup.includes(Buffer.from('COPY "auth"."users"')) || backup.includes(Buffer.from("COPY auth.users")), "Backup must contain authentication identities");
    const backupSeconds = (performance.now() - backupStart) / 1000;
    // The source must stay quiescent while the backup is captured.
    assert.deepEqual(await captureRecoverySnapshot(db), baseline, "Synthetic data changed during backup capture");
    await db.end(); db = null;
    const restoreStart = performance.now();
    await command("supabase", ["db", "reset", "--local", "--no-seed"]);
    const freshInspection = JSON.parse((await command("docker", ["inspect", container])).stdout)[0];
    requireLocalRecovery(status, projectId, freshInspection);
    db = new pg.Client({ connectionString: status.DB_URL }); await db.connect();
    assert.equal((await db.query("SELECT count(*)::int AS count FROM public.organizations")).rows[0].count, 0, "Restore target must have no tenant rows");
    // A fresh reset supplies Auth migration metadata. Verify that it exactly
    // matches the source and keep it; every table receiving COPY must be empty.
    // No TRUNCATE or new grants are needed for this restore.
    const empty = await captureRecoverySnapshot(db);
    assert.deepEqual(empty.tables.map(({count,fingerprint,...table}) => table), baseline.tables.map(({count,fingerprint,...table}) => table), "Rebuilt table protections must match the source");
    for(const table of empty.tables) {
      if(table.schema === "auth" && table.name === "schema_migrations") {
        assert.deepEqual(table,baseline.tables.find(item=>item.schema===table.schema && item.name===table.name),"Auth migration versions must match the source");
      } else assert.equal(table.count,"0",`Restore COPY target must be empty: ${table.schema}.${table.name}`);
    }
    const restore = join(directory,"restore.sql");
    await writeFile(restore, "SET LOCAL session_replication_role=replica;\n" + backup.toString("utf8") + "\nSET LOCAL session_replication_role=origin;\n", { mode: 0o600 });
    const containerPath = "/tmp/tapaano-synthetic-recovery-" + snapshotHash + ".sql";
    await command("docker", ["cp", restore, container + ":" + containerPath]);
    try { await command("docker", ["exec", container, "psql", "--username", "postgres", "--dbname", "postgres", "--single-transaction", "--set", "ON_ERROR_STOP=1", "--set", "VERBOSITY=sqlstate", "--file", containerPath]); }
    finally { await command("docker", ["exec", container, "rm", "-f", containerPath]); }
    assert.equal((await db.query("SHOW session_replication_role")).rows[0].session_replication_role, "origin");
    const restored = await captureRecoverySnapshot(db);
    assert.deepEqual(restored, baseline, "Restored rows, policies, grants, functions and constraints must match the backup baseline");
    assert.equal(await verifyRecoveryForeignKeys(db), foreignKeys);
    assert.equal(await validateGraphs(db), graphs);
    await db.query("NOTIFY pgrst, 'reload schema'");
    await verifyApplication(db);
    const evidence = { format: "tapaano-synthetic-recovery-v1", synthetic: true, result: "pass",
      commit: (await command("git", ["rev-parse", "HEAD"])).stdout.trim(),
      snapshotHash, backupSha256: createHash("sha256").update(backup).digest("hex"),
      tables: baseline.tables.length, rows: baseline.tables.reduce((sum,table) => sum+Number(table.count),0),
      financialGraphs: graphs, foreignKeys,
      checks: ["fresh schema rebuild", "complete row fingerprints", "policies and grants", "enabled triggers", "all foreign keys", "financial source graphs", "authenticated application recovery"],
      seconds: { backup: Number(backupSeconds.toFixed(3)), restoreAndVerification: Number(((performance.now()-restoreStart)/1000).toFixed(3)), total: Number(((performance.now()-started)/1000).toFixed(3)) } };
    await mkdir(new URL("../../test-results/", import.meta.url), { recursive: true });
    await writeFile(new URL("../../test-results/recovery.json", import.meta.url), JSON.stringify(evidence,null,2)+"\n");
    return evidence;
  } finally { await db?.end(); await rm(directory,{recursive:true,force:true}); }
}
