import assert from "node:assert/strict";
import test from "node:test";
import { loadTypescript } from "./helpers/load-typescript.mjs";
const { parseTrialBalance, trialBalanceCsv, isReportDate } = await loadTypescript("../../src/lib/trialBalance.ts");
const scope = { entityId: "entity-a", fromDate: "2026-02-01", toDate: "2026-02-28" };
function report() {
  const debit = { openingDebit: "10049999999999989.95", openingCredit: "0.00", periodDebit: "10.10", periodCredit: "0.00", closingDebit: "10050000000000000.05", closingCredit: "0.00" };
  const credit = { openingDebit: "0.00", openingCredit: debit.openingDebit, periodDebit: "0.00", periodCredit: debit.periodDebit, closingDebit: "0.00", closingCredit: debit.closingDebit };
  return { ...scope, entityName: "Example", currency: "USD", generatedAt: "2026-09-06T12:00:00Z", revision: "a".repeat(32), journalCount: 1006, periodJournalCount: 1, draftJournalCount: 0,
    rows: [{ accountId: "a", code: "1000", name: "Cash", accountType: "asset", ...debit }, { accountId: "b", code: "4000", name: "Revenue", accountType: "revenue", ...credit }],
    totals: { openingDebit: debit.openingDebit, openingCredit: credit.openingCredit, periodDebit: debit.periodDebit, periodCredit: credit.periodCredit, closingDebit: debit.closingDebit, closingCredit: credit.closingCredit } };
}

test("trial balance preserves exact large decimals and validates calendar dates", () => {
  assert.equal(parseTrialBalance(report(), scope).totals.closingDebit, "10050000000000000.05");
  assert.equal(isReportDate("2024-02-29"), true);
  for (const date of ["2026-02-29", "2026-02-30", "2026-13-01", "0000-01-01", "2026-2-01"]) assert.equal(isReportDate(date), false);
});

test("trial balance rejects changed scope, incomplete totals, duplicate accounts, and inconsistent arithmetic", () => {
  const corruptions = [
    r => { r.entityId = "other"; }, r => { r.toDate = "2026-03-01"; }, r => { r.currency = "???"; },
    r => { r.rows.pop(); }, r => { r.rows[0].closingDebit = "1.00"; },
    r => { r.totals.periodDebit = "0.00"; }, r => { r.rows[1].accountId = "a"; },
    r => { r.rows[0].periodDebit = 10.1; }, r => { r.journalCount = 0; },
  ];
  for (const change of corruptions) { const value = report(); change(value); assert.throws(() => parseTrialBalance(value, scope)); }
});

test("trial balance CSV contains scope and exact amounts and escapes spreadsheet formulas", () => {
  const value = report(); value.rows[0].name = '=HYPERLINK("https://example.test")';
  value.rows[1].code = "+42";
  const csv = trialBalanceCsv(value);
  assert.ok(csv.includes('"USD","From","2026-02-01","Through","2026-02-28"'));
  assert.ok(csv.includes('"10050000000000000.05"'));
  assert.ok(csv.includes('"\'=HYPERLINK(""https://example.test"")"'));
  assert.ok(csv.includes('"\'+42"'));
});
