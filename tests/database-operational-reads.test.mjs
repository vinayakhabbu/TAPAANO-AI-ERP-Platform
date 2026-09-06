import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const orgA = "00000000-0000-4000-8000-000000000001";
const orgB = "00000000-0000-4000-8000-000000000002";
const adminA = "10000000-0000-4000-8000-000000000001";
const viewerA = "10000000-0000-4000-8000-000000000002";
const adminB = "10000000-0000-4000-8000-000000000003";
const tables = ["customers", "invoices", "customer_credit_notes", "customer_receipts",
  "customer_receipt_corrections", "customer_receipt_replacements", "vendors", "bills",
  "supplier_bill_credit_notes", "supplier_payments", "supplier_payment_corrections",
  "supplier_payment_replacements", "payment_runs", "bank_accounts", "accounting_periods"];

async function createDb() {
  const db = new PGlite();
  await db.exec(`
    CREATE SCHEMA auth;
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    CREATE TYPE public.app_role AS ENUM ('admin','moderator','user','viewer');
    CREATE TABLE public.organizations(id uuid PRIMARY KEY);
    CREATE TABLE public.profiles(id uuid PRIMARY KEY,org_id uuid REFERENCES public.organizations(id),role public.app_role);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    CREATE FUNCTION public.get_user_org_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
      SELECT org_id FROM public.profiles WHERE id=auth.uid()
    $$;
    CREATE FUNCTION public.has_role(actor uuid, desired public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
      SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=actor AND role=desired)
    $$;
    INSERT INTO public.organizations VALUES ('${orgA}'),('${orgB}');
    INSERT INTO public.profiles VALUES ('${adminA}','${orgA}','admin'),('${viewerA}','${orgA}','viewer'),('${adminB}','${orgB}','admin');
  `);
  for (const table of tables) await db.exec(`
    CREATE TABLE public.${table}(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,
      accounting_status text DEFAULT 'POSTED',journal_entry_id uuid DEFAULT gen_random_uuid(),
      currency text DEFAULT 'USD',total numeric(15,2) DEFAULT 0,status text DEFAULT 'OPEN');
    ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tenant_read ON public.${table} FOR SELECT TO authenticated USING(org_id=public.get_user_org_id());
    GRANT SELECT ON public.${table} TO authenticated;
  `);
  // Banking deliberately grants only individual safe columns in the real chain.
  await db.exec("REVOKE SELECT ON public.bank_accounts FROM authenticated; GRANT SELECT(id,org_id) ON public.bank_accounts TO authenticated;");
  for (const migration of ["20260906010000_recovery_operational_reads.sql", "20260906020000_recovery_client_diagnostics.sql"]) {
    await db.exec(await readFile(new URL("../supabase/migrations/" + migration, import.meta.url), "utf8"));
  }
  return db;
}

async function actor(db, id) {
  await db.exec("RESET ROLE");
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("SET ROLE authenticated");
}

test("database summary counts all history, separates currencies, excludes legacy and other tenants", async () => {
  const db = await createDb();
  try {
    await db.exec(`INSERT INTO public.invoices(org_id,currency,total)
      SELECT '${orgA}',CASE WHEN i%2=1 THEN 'USD' ELSE 'EUR' END,0.10 FROM generate_series(1,1005) i;
      INSERT INTO public.invoices(org_id,total) VALUES('${orgB}',9999);
      INSERT INTO public.invoices(org_id,accounting_status,total) VALUES('${orgA}','UNVERIFIED_LEGACY',9999);
      INSERT INTO public.bank_accounts(org_id) VALUES('${orgA}');`);
    await actor(db, adminA);
    const { rows: [row] } = await db.query("SELECT public.get_tenant_operational_summary() AS summary");
    assert.equal(row.summary.invoiceCount, 1005);
    assert.equal(row.summary.bankAccountCount, 1);
    assert.deepEqual(row.summary.postedInvoiceTotals, [{ currency: "EUR", total: "50.20" }, { currency: "USD", total: "50.30" }]);
    await actor(db, adminB);
    const other = await db.query("SELECT public.get_tenant_operational_summary() AS summary");
    assert.equal(other.rows[0].summary.invoiceCount, 1);
    await db.exec("RESET ROLE; SET ROLE anon");
    await assert.rejects(db.query("SELECT public.get_tenant_operational_summary()"), /permission denied/);
  } finally { await db.close(); }
});

test("summary read fails closed on invalid currencies and missing membership", async () => {
  const db = await createDb();
  try {
    await db.exec(`INSERT INTO public.invoices(org_id,currency,total) VALUES('${orgA}',NULL,5)`);
    await actor(db, adminA);
    await assert.rejects(db.query("SELECT public.get_tenant_operational_summary()"), /currency is invalid/);
    await actor(db, "");
    await assert.rejects(db.query("SELECT public.get_tenant_operational_summary()"), /membership is unavailable/);
  } finally { await db.close(); }
});

test("diagnostics derive tenant and actor, redact payload surface, and protect counters", async () => {
  const db = await createDb();
  try {
    await actor(db, viewerA);
    await db.query("SELECT public.record_client_diagnostic('render_failed','unversioned')");
    await db.query("SELECT public.record_client_diagnostic('render_failed','unversioned')");
    assert.equal((await db.query("SELECT * FROM public.client_diagnostic_buckets")).rows.length, 0);
    await assert.rejects(db.query("UPDATE public.client_diagnostic_buckets SET occurrences=99"), /permission denied/);
    await assert.rejects(db.query("SELECT public.record_client_diagnostic('secret payload','unversioned')"), /invalid diagnostic/);
    await actor(db, adminA);
    const { rows: [row] } = await db.query("SELECT * FROM public.client_diagnostic_buckets");
    assert.equal(row.org_id, orgA);
    assert.equal(row.actor_id, viewerA);
    assert.equal(row.occurrences, 2);
    assert.equal(row.event_code, "render_failed");
    await actor(db, adminB);
    assert.equal((await db.query("SELECT * FROM public.client_diagnostic_buckets")).rows.length, 0);
    await db.exec("RESET ROLE; SET ROLE anon");
    await assert.rejects(db.query("SELECT public.record_client_diagnostic('render_failed','unversioned')"), /permission denied/);
  } finally { await db.close(); }
});
