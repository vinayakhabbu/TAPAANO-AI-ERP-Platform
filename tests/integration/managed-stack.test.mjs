import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import pg from "pg";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { loadTypescript } from "../helpers/load-typescript.mjs";

const { JOURNAL_HISTORY_SELECT } = await loadTypescript("../../src/lib/journalQuery.ts");
const { readAllRows } = await loadTypescript("../../src/lib/readAllRows.ts");

function requireLoopback(value) {
  const url = new URL(value);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname), "Integration tests require a disposable loopback stack");
  return value;
}

async function rpc(client, name, args) {
  const { data, error } = await client.rpc(name, args);
  assert.equal(error, null, name + ": " + (error?.message ?? ""));
  return data;
}

// Never accepts remote URLs or credentials from environment variables. Bootstrap
// creates synthetic identities only in the CLI's disposable local database.
// Normal application calls below run with actual authenticated JWTs and guards.
test("full migration stack supports authenticated finance reads and the browser", { timeout: 180000 }, async (t) => {
  const status = JSON.parse(execFileSync("supabase", ["status", "--output", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  const api = requireLoopback(status.API_URL);
  const dbUrl = requireLoopback(status.DB_URL);
  assert.ok(status.ANON_KEY, "Local anon key is required");
  const db = new pg.Client({ connectionString: dbUrl });
  await db.connect();
  let browser, server;
  const ids = Object.fromEntries(["orgA", "orgB", "adminA", "adminB", "usd", "eur", "ar", "revenue", "customer"].map((key) => [key, randomUUID()]));
  const emailA = "integration-a@tapaano.test", emailB = "integration-b@tapaano.test";
  const password = "Synthetic-local-test-" + randomUUID();
  try {
    assert.equal((await db.query("SELECT count(*)::int AS count FROM public.organizations")).rows[0].count, 0,
      "Integration fixture requires an empty disposable stack");
    await db.query("BEGIN");
    // Local test bootstrap only: public tenant provisioning is intentionally closed.
    await db.query("SET LOCAL session_replication_role = replica");
    await db.query("INSERT INTO public.organizations(id,name) VALUES($1,'Synthetic A'),($2,'Synthetic B')", [ids.orgA, ids.orgB]);
    for (const [id, org, email] of [[ids.adminA, ids.orgA, emailA], [ids.adminB, ids.orgB, emailB]]) {
      await db.query(`INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
        raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change_token_new,email_change)
        VALUES('00000000-0000-0000-0000-000000000000',$1,'authenticated','authenticated',$2,
          extensions.crypt($3,extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','')`, [id, email, password]);
      await db.query(`INSERT INTO auth.identities(id,provider_id,user_id,identity_data,provider,created_at,updated_at)
        VALUES($1,$2::text,$2::uuid,jsonb_build_object('sub',$2::text,'email',$3::text),'email',now(),now())`, [randomUUID(), id, email]);
      await db.query("INSERT INTO public.profiles(id,org_id,display_name,role) VALUES($1,$2,'Synthetic administrator','admin')", [id, org]);
      await db.query("INSERT INTO public.user_roles(user_id,org_id,role) VALUES($1,$2,'admin')", [id, org]);
    }
    await db.query("INSERT INTO public.entities(id,org_id,name,currency) VALUES($1,$3,'USD entity','USD'),($2,$3,'EUR entity','EUR')", [ids.usd, ids.eur, ids.orgA]);
    await db.query("INSERT INTO public.accounts(id,org_id,code,name,account_type) VALUES($1,$3,'1100','AR','asset'),($2,$3,'4000','Revenue','revenue')", [ids.ar, ids.revenue, ids.orgA]);
    await db.query("INSERT INTO public.customers(id,org_id,name) VALUES($1,$2,'Synthetic buyer')", [ids.customer, ids.orgA]);
    await db.query("INSERT INTO public.customers(org_id,name) SELECT $1,'Synthetic customer ' || i FROM generate_series(1,1005) i", [ids.orgA]);
    await db.query("INSERT INTO public.customers(org_id,name) VALUES($1,'Other tenant buyer')", [ids.orgB]);
    await db.query("COMMIT");
    await db.query("NOTIFY pgrst, 'reload schema'");
    await delay(1500);
    const options = { auth: { persistSession: false, autoRefreshToken: false } };
    const clientA = createClient(api, status.ANON_KEY, options);
    const clientB = createClient(api, status.ANON_KEY, options);
    for (const [client, email] of [[clientA, emailA], [clientB, emailB]]) {
      const { error } = await client.auth.signInWithPassword({ email, password });
      assert.equal(error, null, "Local Auth login must succeed: " + (error?.message ?? ""));
    }
    for (const entity of [ids.usd, ids.eur]) {
      await rpc(clientA, "create_accounting_period", { p_entity_id: entity, p_period_start: "2026-09-01", p_period_end: "2026-09-30", p_idempotency_key: "period-" + entity });
      await rpc(clientA, "configure_entity_invoice_accounts", { p_entity_id: entity, p_ar_account_id: ids.ar, p_revenue_account_id: ids.revenue, p_idempotency_key: "controls-" + entity });
    }
    const invoice = (entity, currency, number) => ({ p_entity_id: entity, p_customer_id: ids.customer,
      p_invoice_number: number, p_issue_date: "2026-09-06", p_due_date: "2026-09-20", p_currency: currency,
      p_tax: 0, p_notes: null, p_lines: [{ description: "Synthetic service", quantity: "1", unit_price: "100" }], p_idempotency_key: number });
    const usdPayload = invoice(ids.usd, "USD", "INTEGRATION-USD");
    await t.test("concurrent independent API requests create one idempotent invoice", async () => {
      const secondSession = createClient(api, status.ANON_KEY, options);
      const { error } = await secondSession.auth.signInWithPassword({ email: emailA, password });
      assert.equal(error, null);
      const posted = await Promise.all([rpc(clientA, "post_customer_invoice", usdPayload), rpc(secondSession, "post_customer_invoice", usdPayload)]);
      assert.equal(posted[0], posted[1]);
      const { rows: [row] } = await db.query(`SELECT count(DISTINCT i.id)::int AS invoices, sum(l.debit)::text AS debit, sum(l.credit)::text AS credit
        FROM public.invoices i JOIN public.journal_lines l ON l.journal_entry_id=i.journal_entry_id WHERE i.invoice_number=$1`, [usdPayload.p_invoice_number]);
      assert.equal(row.invoices, 1); assert.equal(row.debit, "100.00"); assert.equal(row.credit, "100.00");
    });
    await rpc(clientA, "post_customer_invoice", invoice(ids.eur, "EUR", "INTEGRATION-EUR"));
    await t.test("the exact browser ledger projection succeeds with contained-table grants", async () => {
      const { data, error } = await clientA.from("journal_entries").select(JOURNAL_HISTORY_SELECT).eq("org_id", ids.orgA).limit(20);
      assert.equal(error, null, error?.message); assert.equal(data.length, 2);
      const blocked = await clientA.from("cost_centers").select("id");
      assert.ok(blocked.error, "Cost-center permissions must remain contained");
    });
    await t.test("API histories exceed the row cap and summary amounts remain separated", async () => {
      const customers = await readAllRows((from, to) => clientA.from("customers").select("id", { count: "exact" }).eq("org_id", ids.orgA).order("id").range(from, to));
      assert.equal(customers.length, 1006);
      const summary = await rpc(clientA, "get_tenant_operational_summary");
      assert.equal(summary.customerCount, 1006); assert.equal(summary.invoiceCount, 2);
      assert.deepEqual(summary.postedInvoiceTotals, [{ currency: "EUR", total: "100.00" }, { currency: "USD", total: "100.00" }]);
    });
    await t.test("real JWTs enforce cross-tenant reads and writes", async () => {
      const { data, error } = await clientB.from("invoices").select("id").eq("org_id", ids.orgA);
      assert.equal(error, null); assert.deepEqual(data, []);
      assert.ok((await clientB.rpc("post_customer_invoice", usdPayload)).error);
      assert.equal((await rpc(clientB, "get_tenant_operational_summary")).invoiceCount, 0);
      await rpc(clientA, "record_client_diagnostic", { p_event_code: "render_failed", p_release_sha: "unversioned" });
      assert.equal((await clientB.from("client_diagnostic_buckets").select("event_code")).data.length, 0);
    });
    await t.test("browser login loads dashboard, ledger, and separate currency totals", async () => {
      server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "4173", "--strictPort"], {
        env: { ...process.env, VITE_SUPABASE_URL: api, VITE_SUPABASE_PUBLISHABLE_KEY: status.ANON_KEY }, stdio: "ignore",
      });
      const origin = "http://127.0.0.1:4173";
      let ready = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        if (server.exitCode !== null) throw new Error("Test app exited before startup");
        try { if ((await fetch(origin)).ok) { ready = true; break; } } catch { /* starting */ }
        await delay(200);
      }
      assert.ok(ready, "Local browser app must start");
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      const failures = [];
      page.on("pageerror", (error) => failures.push(error.message));
      await page.goto(origin + "/auth");
      await page.getByLabel("Email", { exact: true }).fill(emailA);
      await page.getByLabel("Password", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Sign In", exact: true }).click();
      await page.getByText("Journal-linked posted invoices", { exact: true }).waitFor();
      await page.goto(origin + "/gl");
      await page.getByRole("tab", { name: /Journal Entries/ }).click();
      await page.getByText("INTEGRATION-USD", { exact: false }).first().waitFor();
      assert.equal(await page.getByText("Journal history unavailable", { exact: false }).count(), 0);
      await page.goto(origin + "/ar");
      await page.getByText("USD 100.00", { exact: true }).waitFor();
      await page.getByText("EUR 100.00", { exact: true }).waitFor();
      await page.route("**/rest/v1/rpc/get_tenant_operational_summary", (route) => route.fulfill({
        status: 503, contentType: "application/json", body: JSON.stringify({ message: "Synthetic read failure" }),
      }));
      await page.reload();
      await page.getByText("Receivables summary unavailable", { exact: true }).waitFor();
      assert.equal(await page.getByText("USD 100.00", { exact: true }).count(), 0);
      let captured = false;
      for (let attempt = 0; attempt < 30; attempt++) {
        captured = (await db.query("SELECT count(*)::int AS count FROM public.client_diagnostic_buckets WHERE event_code='read_failed' AND org_id=$1", [ids.orgA])).rows[0].count > 0;
        if (captured) break;
        await delay(100);
      }
      assert.ok(captured, "Failed browser reads must produce a sanitized operational event");
      assert.deepEqual(failures, []);
    });
  } finally {
    await browser?.close();
    server?.kill("SIGTERM");
    await db.end();
  }
});
