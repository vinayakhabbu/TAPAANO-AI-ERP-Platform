import assert from "node:assert/strict";
import test from "node:test";
import { loadTypescript } from "./helpers/load-typescript.mjs";
const { deriveLedgerStatements, statementsCsv, parseAccountLedger, accountLedgerCsv, formatSignedAmount, parsePostedJournals } = await loadTypescript("../../src/lib/financeReports.ts");
const { prepareManualJournal } = await loadTypescript("../../src/lib/manualJournal.ts");
const scope = { entityId: "entity-a", fromDate: "2026-01-01", toDate: "2026-01-31", revision: "a".repeat(32) };
const meta = { ...scope, entityName: "Test company", currency: "USD", generatedAt: "2026-09-06T12:00:00Z" };
function trial() {
  const fields = ["openingDebit", "openingCredit", "periodDebit", "periodCredit", "closingDebit", "closingCredit"];
  const accounts = [
    ["Cash", "asset", "5000.00", "0.00", "800.00", "700.00", "5100.00", "0.00"],
    ["AR", "asset", "1200.00", "0.00", "1000.00", "850.00", "1350.00", "0.00"],
    ["Equipment", "asset", "3000.00", "0.00", "0.00", "0.00", "3000.00", "0.00"],
    ["Accumulated depreciation", "asset", "0.00", "500.00", "0.00", "100.00", "0.00", "600.00"],
    ["AP", "liability", "0.00", "700.00", "500.00", "0.00", "0.00", "200.00"],
    ["Loan", "liability", "0.00", "2000.00", "0.00", "0.00", "0.00", "2000.00"],
    ["Equity", "equity", "0.00", "5000.00", "0.00", "0.00", "0.00", "5000.00"],
    ["Revenue", "revenue", "0.00", "1500.00", "50.00", "1000.00", "0.00", "2450.00"],
    ["Expense", "expense", "500.00", "0.00", "300.00", "0.00", "800.00", "0.00"],
  ];
  const rows = accounts.map(([name, accountType, ...values], index) => ({ accountId: "account-" + index, code: String(index), name, accountType, ...Object.fromEntries(fields.map((field, i) => [field, values[i]])) }));
  return { ...meta, journalCount: 20, periodJournalCount: 6, draftJournalCount: 0, rows,
    totals: { openingDebit: "9700.00", openingCredit: "9700.00", periodDebit: "2650.00", periodCredit: "2650.00", closingDebit: "10250.00", closingCredit: "10250.00" } };
}

test("ledger statements distinguish period income from cumulative unclosed earnings and preserve contra accounts", () => {
  const result = deriveLedgerStatements(trial());
  assert.equal(result.revenue.total, "950.00"); assert.equal(result.expenses.total, "300.00"); assert.equal(result.netIncome, "650.00");
  assert.equal(result.unclosedEarnings, "1650.00"); assert.equal(result.assets.total, "8850.00");
  assert.equal(result.liabilities.total, "2200.00"); assert.equal(result.equity.total, "5000.00"); assert.equal(result.totalEquity, "6650.00");
  assert.equal(result.liabilitiesAndEquity, result.assets.total);
  assert.equal(result.assets.rows.find(row => row.name === "Accumulated depreciation").amount, "-600.00");
  const csv = statementsCsv(trial(), "balance"); assert.ok(csv.includes('"-600.00"')); assert.ok(!csv.includes("'-600.00"));
  const broken = trial(); broken.rows[0].closingDebit = "1.00"; assert.throws(() => deriveLedgerStatements(broken));
});

test("statement exports preserve scope, exact large values and untrusted text without inferring cash flow", () => {
  const report = trial(); report.rows[0].name = '=HYPERLINK("https://example.test")';
  const csv = statementsCsv(report, "balance"); assert.ok(csv.includes('"\'=HYPERLINK(""https://example.test"")"')); assert.ok(csv.includes(scope.revision));
  assert.ok(statementsCsv(report, "income").includes('"Net income / loss","","","650.00"'));
  assert.equal(formatSignedAmount("USD", "-10050000000000000.05"), "USD −10,050,000,000,000,000.05");
  assert.throws(() => formatSignedAmount("USD", "-0.00"));
});

function pages() {
  const common = { ...meta, accountId: "cash", accountCode: "1000", accountName: "Cash", accountType: "asset", pageSize: 1, lineCount: 2,
    totals: { openingDebit: "25.10", openingCredit: "0.00", periodDebit: "2.01", periodCredit: "0.00", closingDebit: "27.11", closingCredit: "0.00" } };
  const line = { lineNumber: 1, entryDate: "2026-01-02", memo: "Fixture", sourceType: "manual_journal", sourceId: null, credit: "0.00" };
  return [{ ...common, offset: 0, pageOpening: "25.10", rows: [{ ...line, lineId: "a", entryId: "a", entryNumber: "ONE", debit: "1.00", balance: "26.10" }] },
    { ...common, offset: 1, pageOpening: "26.10", rows: [{ ...line, lineId: "b", entryId: "b", entryNumber: "TWO", debit: "1.01", balance: "27.11" }] }];
}

test("account ledger validates complete pages, exact balances and full-export continuity", () => {
  const all = pages(); for (const page of all) assert.equal(parseAccountLedger(page, page).lineCount, 2);
  const csv = accountLedgerCsv(all); assert.ok(csv.includes('"TOTAL","","","","","2.01","0.00","27.11"'));
  assert.throws(() => accountLedgerCsv([all[0]]), /incomplete/);
  for (const corrupt of [
    p => { p[1].revision = "b".repeat(32); }, p => { p[1].entityId = "other"; }, p => { p[1].offset = 0; },
    p => { p[1].pageOpening = "26.09"; }, p => { p[1].rows[0].lineId = "a"; }, p => { p[1].lineCount = 3; },
    p => { p[0].rows[0].debit = 1; }, p => { p[0].rows[0].entryDate = "2026-02-01"; }, p => { p[0].rows[0].balance = "99.00"; },
  ]) { const value = pages(); corrupt(value); assert.throws(() => accountLedgerCsv(value)); }
});

test("manual journal preparation preserves exact decimal inputs and rejects ambiguous or unbalanced entries", () => {
  const input = { entityId: "entity-a", number: " OPENING ", date: "2026-01-01", memo: "Opening balances", requestKey: "request",
    lines: [{ accountId: "cash", debit: "9999999999999.99", credit: "0", memo: "" }, { accountId: "equity", debit: "0.00", credit: "9999999999999.99", memo: "" }] };
  const result = prepareManualJournal(input); assert.equal(result.p_entry_number, "OPENING"); assert.equal(result.p_lines[0].debit, "9999999999999.99"); assert.equal(result.p_lines[0].credit, "0.00");
  for (const amount of ["-1", "1e2", "1.001", "1,000", "", "NaN", "10000000000000.00"]) assert.throws(() => prepareManualJournal({ ...input, lines: [{ ...input.lines[0], debit: amount }, input.lines[1]] }));
  assert.throws(() => prepareManualJournal({ ...input, date: "2026-02-30" }));
  assert.throws(() => prepareManualJournal({ ...input, lines: [input.lines[0]] }));
  assert.throws(() => prepareManualJournal({ ...input, lines: [{ ...input.lines[0], debit: "1.00" }, input.lines[1]] }), /balance/);
});

test("recent journal summaries require exact balanced totals and explicit currencies", () => {
  const journal = { id: "j", entryNumber: "J-1", entryDate: "2026-01-01", memo: "", entityId: "entity", entityName: "Euro entity", currency: "EUR", debit: "10049999999999989.95", credit: "10049999999999989.95" };
  assert.equal(parsePostedJournals([journal])[0].currency, "EUR");
  for (const override of [{ debit: 1 }, { credit: "1.00" }, { currency: "$" }, { entryDate: "2026-02-30" }]) assert.throws(() => parsePostedJournals([{ ...journal, ...override }]));
  assert.throws(() => parsePostedJournals([journal, journal]));
});
