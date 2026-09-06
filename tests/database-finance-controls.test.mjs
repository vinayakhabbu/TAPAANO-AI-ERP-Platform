import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { ids, fixture } from "./helpers/finance-fixture.mjs";

const load = name => readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), "utf8");
const foundation = await load("20260825010000_recovery_journal_periods");
const migrations = await Promise.all(["20260906060000_finance_account_ledger", "20260906070000_finance_period_controls", "20260906080000_finance_manual_journal"].map(load));
async function database() {
  const db = new PGlite(); await db.exec(fixture); await db.exec(foundation);
  await db.exec("GRANT USAGE ON SCHEMA public,auth TO authenticated,anon,service_role;");
  for (const table of ["accounts", "entities"]) await db.exec(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tenant ON public.${table} FOR SELECT TO authenticated USING(org_id=public.get_user_org_id()); GRANT SELECT ON public.${table} TO authenticated;`);
  for (const migration of migrations) { await db.exec(migration); await db.exec(migration); }
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [ids.adminA]);
  return db;
}
const amountLines = amount => JSON.stringify([{ account_id: ids.cashA, debit: amount, credit: "0.00" }, { account_id: ids.revenueA, debit: "0.00", credit: amount }]);
const create = (db, key = "jan") => db.query("SELECT public.create_accounting_period($1,'2026-01-01','2026-01-31',$2) AS id", [ids.entityA, key]).then(r => r.rows[0].id);
const post = (db, key, date = "2026-01-02", amount = "0.01") => db.query("SELECT public.post_manual_journal($1,$2,$3,'Fixture',$4,$2) AS id", [ids.entityA, key, date, amountLines(amount)]).then(r => r.rows[0].id);
const trial = db => db.query("SELECT public.get_entity_trial_balance($1,'2026-01-02','2026-01-31') AS report", [ids.entityA]).then(r => r.rows[0].report);
const ledger = (db, revision, offset = 0, account = ids.cashA, size = 200) => db.query("SELECT public.get_account_ledger($1,$2,'2026-01-02','2026-01-31',$3,$4,$5) AS report", [ids.entityA, account, offset, size, revision]).then(r => r.rows[0].report);
const change = (db, period, version, state, key, reason = "Reviewed close") => db.query("SELECT public.change_accounting_period($1,$2,$3,$4,$5) AS id", [period, version, state, reason, key]).then(r => r.rows[0].id);

test("account ledger pages complete history with exact running balances and refuses changed revisions", async () => {
  const db = await database();
  try {
    await db.exec("SET ROLE authenticated"); await create(db); await post(db, "opening", "2026-01-01", "9999999999999.99");
    await db.exec("BEGIN"); for (let n = 0; n < 1005; n++) await post(db, "line-" + n); await db.exec("COMMIT");
    const balance = await trial(db); assert.match(balance.revision, /^[a-f0-9]{32}$/);
    assert.equal((await trial(db)).revision, balance.revision, "timestamps do not invalidate unchanged content");
    let seen = new Set(); let last;
    for (let offset = 0; offset < 1005; offset += 200) {
      const page = await ledger(db, balance.revision, offset);
      assert.equal(page.lineCount, 1005); assert.equal(page.rows.length, Math.min(200, 1005 - offset));
      for (const row of page.rows) { assert.ok(!seen.has(row.lineId)); seen.add(row.lineId); }
      if (last) assert.equal(page.pageOpening, last);
      last = page.rows.at(-1).balance;
    }
    assert.equal(seen.size, 1005); assert.equal(last, "10000000000010.04");
    const revenue = await ledger(db, balance.revision, 0, ids.revenueA);
    assert.equal(revenue.pageOpening, "-9999999999999.99"); assert.equal(revenue.rows[0].balance, "-10000000000000.00");
    const recent = (await db.query("SELECT public.get_recent_posted_journals() AS rows")).rows[0].rows;
    assert.equal(recent.length, 20); assert.ok(recent.every(j => j.currency === "USD" && j.debit === j.credit));
    await assert.rejects(ledger(db, balance.revision, 1005), /outside the selected history/);
    await assert.rejects(ledger(db, null, 200), /revision is required/);
    await assert.rejects(ledger(db, balance.revision, 0, ids.cashA, 201), /invalid ledger page/);
    await assert.rejects(ledger(db, balance.revision, 0, ids.cashB), /account not found or unavailable/);
    await post(db, "backdated"); await assert.rejects(ledger(db, balance.revision, 200), /ledger changed/);
    const updated = await trial(db); assert.notEqual(updated.revision, balance.revision);
    await db.exec("RESET ROLE; UPDATE public.accounts SET is_active=false WHERE id='" + ids.cashA + "'; SET ROLE authenticated");
    assert.equal((await ledger(db, updated.revision)).lineCount, 1006, "retirement does not hide recorded activity");
  } finally { await db.close(); }
});

test("manual journal rejects invalid fields and amounts atomically before recording an event", async () => {
  const db = await database();
  try {
    await db.exec("SET ROLE authenticated"); await create(db);
    const original = JSON.parse(amountLines("10.00"));
    for (const fields of [{ debit: null }, { credit: "5.00" }, { debit: "1.001" }, { debit: "NaN" }, { debit: "10000000000000.00" }, { tax: "0.00" }]) {
      await assert.rejects(db.query("SELECT public.post_manual_journal($1,'INVALID','2026-01-02','Test',$2,'invalid')", [ids.entityA, JSON.stringify([{ ...original[0], ...fields }, original[1]])]));
    }
    await assert.rejects(post(db, "bad-date", "infinity"), /entry number and date/);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM public.accounting_events")).rows[0].n, 0);
  } finally { await db.close(); }
});

test("empty date ranges retain opening balances, and tenant/role boundaries stay closed", async () => {
  const db = await database();
  try {
    await db.exec("SET ROLE authenticated"); await create(db); await post(db, "opening", "2026-01-01", "25.10");
    const balance = await trial(db); const page = await ledger(db, balance.revision);
    assert.equal(page.lineCount, 0); assert.deepEqual(page.rows, []); assert.equal(page.pageOpening, "25.10");
    assert.equal(page.totals.closingDebit, "25.10");
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [ids.userA]);
    assert.equal((await ledger(db, balance.revision)).lineCount, 0);
    await assert.rejects(create(db), /admin or moderator/);
    await db.query("SELECT set_config('request.jwt.claim.sub','',false)");
    await assert.rejects(ledger(db, balance.revision), /tenant membership/);
    for (const role of ["anon", "service_role"]) {
      await db.exec(`RESET ROLE; SET ROLE ${role}`); await assert.rejects(ledger(db, balance.revision), /permission denied/);
    }
  } finally { await db.close(); }
});

test("period controls validate retries, versions, staged closure, immutable evidence and authorization", async () => {
  const db = await database();
  try {
    await db.exec("SET ROLE authenticated"); const period = await create(db); assert.equal(await create(db), period);
    await assert.rejects(db.query("SELECT public.create_accounting_period($1,'2026-01-01','2026-02-28','jan')", [ids.entityA]), /conflicts with another payload/);
    await assert.rejects(db.query("SELECT public.create_accounting_period($1,'2026-01-01','infinity','infinite')", [ids.entityA]), /invalid accounting period date/);
    await assert.rejects(change(db, period, 1, "HARD_CLOSED", "premature"), /soft close/);
    await assert.rejects(db.query("SELECT public.transition_accounting_period($1,'HARD_CLOSED','bypass')", [period]), /permission denied/);
    assert.equal(await change(db, period, 1, "SOFT_CLOSED", "soft"), period);
    assert.equal(await change(db, period, 1, "SOFT_CLOSED", "soft"), period);
    await assert.rejects(change(db, period, 1, "SOFT_CLOSED", "soft", "Different payload"), /conflicts with another payload/);
    await assert.rejects(change(db, period, 1, "OPEN", "stale"), /period changed/);
    await assert.rejects(post(db, "closed"), /OPEN accounting period/);
    await change(db, period, 2, "OPEN", "reopen"); const posted = await post(db, "safe-retry");
    await change(db, period, 3, "SOFT_CLOSED", "soft-again"); await change(db, period, 4, "HARD_CLOSED", "hard");
    assert.equal(await post(db, "safe-retry"), posted, "confirmed journal retries remain safe after closure");
    assert.equal(await change(db, period, 4, "HARD_CLOSED", "hard"), period);
    await assert.rejects(change(db, period, 5, "OPEN", "forged"), /terminal/);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM public.accounting_period_events WHERE accounting_period_id=$1", [period])).rows[0].n, 5);
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [ids.userA]);
    await assert.rejects(change(db, period, 5, "OPEN", "viewer"), /admin or moderator/);
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [ids.adminA]);
    for (const target of [ids.entityB, "00000000-0000-4000-8000-000000000099"]) {
      await assert.rejects(change(db, target, 1, "SOFT_CLOSED", "foreign"), /not found or unavailable/);
    }
    await db.exec("RESET ROLE; SELECT set_config('tapaano.accounting_write','trusted',false)");
    await assert.rejects(db.exec("UPDATE public.accounting_period_events SET reason='forged'"), /immutable/);
    await assert.rejects(db.exec("DELETE FROM public.accounting_period_events"), /immutable/);
  } finally { await db.close(); }
});
