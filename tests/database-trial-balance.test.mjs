import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ids = { org: id(1), otherOrg: id(2), actor: id(3), otherActor: id(4), usd: id(5), eur: id(6), foreign: id(7), cash: id(8), revenue: id(9) };
const migration = await readFile(new URL("../supabase/migrations/20260906050000_recovery_trial_balance.sql", import.meta.url), "utf8");

async function createDb() {
  const db = new PGlite();
  await db.exec(`
    CREATE SCHEMA auth;
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE TABLE public.profiles(id uuid PRIMARY KEY, org_id uuid);
    INSERT INTO public.profiles VALUES('${ids.actor}','${ids.org}'),('${ids.otherActor}','${ids.otherOrg}');
    CREATE FUNCTION public.get_user_org_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT org_id FROM public.profiles WHERE id=auth.uid() $$;
    CREATE TABLE public.entities(id uuid PRIMARY KEY,org_id uuid,name text,currency text);
    CREATE TABLE public.accounts(id uuid PRIMARY KEY,org_id uuid,code text,name text,account_type text,is_active boolean DEFAULT true);
    CREATE TABLE public.accounting_periods(id uuid PRIMARY KEY,org_id uuid,entity_id uuid,period_start date,period_end date);
    CREATE TABLE public.accounting_events(id uuid PRIMARY KEY,org_id uuid,entity_id uuid,journal_entry_id uuid);
    CREATE TABLE public.journal_entries(id uuid PRIMARY KEY,org_id uuid,entity_id uuid,entry_date date,status text,accounting_period_id uuid,accounting_event_id uuid);
    CREATE TABLE public.journal_lines(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid,entity_id uuid,journal_entry_id uuid,account_id uuid,debit numeric(15,2),credit numeric(15,2));
    INSERT INTO public.entities VALUES('${ids.usd}','${ids.org}','USD company','USD'),('${ids.eur}','${ids.org}','EUR company','EUR'),('${ids.foreign}','${ids.otherOrg}','Foreign company','USD');
    INSERT INTO public.accounts VALUES('${ids.cash}','${ids.org}','1000','Cash','asset',true),('${ids.revenue}','${ids.org}','4000','Retired revenue','revenue',false);
    INSERT INTO public.accounting_periods VALUES('${id(10)}','${ids.org}','${ids.usd}','2026-01-01','2026-12-31'),('${id(11)}','${ids.org}','${ids.eur}','2026-01-01','2026-12-31');
    GRANT USAGE ON SCHEMA public,auth TO authenticated,anon,service_role;
  `);
  for (const table of ["entities", "accounts", "accounting_periods", "accounting_events", "journal_entries", "journal_lines"]) {
    await db.exec(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;
      CREATE POLICY tenant_read ON public.${table} FOR SELECT TO authenticated USING(org_id=public.get_user_org_id());
      GRANT SELECT ON public.${table} TO authenticated;`);
  }
  await db.exec(migration);
  await db.exec(migration);
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [ids.actor]);
  return db;
}

async function journal(db, n, date, amount, { entity = ids.usd, reverse = false, status = "posted" } = {}) {
  const key = id(n);
  const period = entity === ids.usd ? id(10) : id(11);
  await db.query("INSERT INTO public.accounting_events VALUES($1,$2,$3,$1)", [key, ids.org, entity]);
  await db.query("INSERT INTO public.journal_entries VALUES($1,$2,$3,$4,$5,$6,$1)", [key, ids.org, entity, date, status, period]);
  const [debit, credit] = reverse ? [ids.revenue, ids.cash] : [ids.cash, ids.revenue];
  await db.query(`INSERT INTO public.journal_lines(org_id,entity_id,journal_entry_id,account_id,debit,credit)
    VALUES($1,$2,$3,$4,$6,0),($1,$2,$3,$5,0,$6)`, [ids.org, entity, key, debit, credit, amount]);
}

async function report(db, entity = ids.usd, from = "2026-02-01", to = "2026-02-28") {
  return (await db.query("SELECT public.get_entity_trial_balance($1,$2,$3) AS report", [entity, from, to])).rows[0].report;
}

test("trial balance reconciles opening/activity/closing over the API row limit in one currency", async () => {
  const db = await createDb();
  try {
    await db.exec("BEGIN");
    for (let n = 100; n < 1105; n++) await journal(db, n, "2026-01-31", "0.01");
    await journal(db, 1200, "2026-02-01", "25.10");
    await journal(db, 1201, "2026-02-28", "25.10", { reverse: true });
    await journal(db, 1202, "2026-03-01", "500.00");
    await journal(db, 1203, "2026-02-05", "900.00", { status: "draft" });
    await journal(db, 1204, "2026-02-05", "200.00", { entity: ids.eur });
    await db.exec("COMMIT; SET ROLE authenticated");
    const result = await report(db);
    assert.equal(result.currency, "USD");
    assert.equal(result.journalCount, 1007); assert.equal(result.periodJournalCount, 2); assert.equal(result.draftJournalCount, 1);
    assert.deepEqual(result.totals, { openingDebit: "10.05", openingCredit: "10.05", periodDebit: "50.20", periodCredit: "50.20", closingDebit: "10.05", closingCredit: "10.05" });
    assert.equal(result.rows[1].name, "Retired revenue");
    assert.equal((await report(db, ids.eur)).totals.closingDebit, "200.00");
    await db.exec("RESET ROLE");
    await db.exec("UPDATE public.journal_lines SET debit=CASE WHEN debit>0 THEN 9999999999999.99 ELSE 0 END,credit=CASE WHEN credit>0 THEN 9999999999999.99 ELSE 0 END WHERE journal_entry_id IN(SELECT id FROM public.journal_entries WHERE entry_date='2026-01-31')");
    await db.exec("SET ROLE authenticated");
    assert.equal((await report(db)).totals.openingDebit, "10049999999999989.95");
  } finally { await db.close(); }
});

test("trial balance denies foreign entities, invalid dates, and unauthenticated execution", async () => {
  const db = await createDb();
  try {
    await db.exec("SET ROLE authenticated");
    assert.equal((await report(db)).rows.length, 0);
    for (const entity of [ids.foreign, id(9999)]) await assert.rejects(report(db, entity), /entity not found or unavailable/);
    await assert.rejects(report(db, ids.usd, "2026-03-01", "2026-02-01"), /invalid report date range/);
    await assert.rejects(report(db, ids.usd, "2026-02-01", "infinity"), /invalid report date range/);
    await db.query("SELECT set_config('request.jwt.claim.sub','',false)");
    await assert.rejects(report(db), /tenant membership is unavailable/);
    await db.exec("RESET ROLE; SET ROLE anon");
    await assert.rejects(report(db), /permission denied for function get_entity_trial_balance/);
    await db.exec("RESET ROLE; SET ROLE service_role");
    await assert.rejects(report(db), /permission denied for function get_entity_trial_balance/);
  } finally { await db.close(); }
});

test("trial balance refuses unverified lineage, legacy reversals, and corrupt journal amounts", async () => {
  const db = await createDb();
  try {
    await journal(db, 2000, "2026-02-01", "10.00");
    const corruptions = [
      ["UPDATE public.journal_entries SET accounting_event_id=NULL", /unverified posted journal/],
      ["UPDATE public.accounting_events SET journal_entry_id=NULL", /unverified posted journal/],
      ["UPDATE public.journal_entries SET accounting_period_id=NULL", /unverified posted journal/],
      ["UPDATE public.journal_entries SET status='reversed'", /unverified reversed journal/],
      ["UPDATE public.journal_lines SET debit=9 WHERE debit>0", /invalid or unbalanced journal/],
      ["DELETE FROM public.journal_lines", /invalid or unbalanced journal/],
      ["UPDATE public.journal_lines SET entity_id='" + ids.eur + "'", /invalid or unbalanced journal/],
    ];
    for (const [sql, error] of corruptions) {
      await db.exec("BEGIN");
      await db.exec(sql);
      await db.exec("SET LOCAL ROLE authenticated");
      await assert.rejects(report(db), error);
      await db.exec("ROLLBACK");
    }
    await db.exec("SET ROLE authenticated");
    assert.equal((await report(db)).totals.closingDebit, "10.00");
  } finally { await db.close(); }
});
