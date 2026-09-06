import assert from "node:assert/strict";
import test from "node:test";
import { loadTypescript } from "./helpers/load-typescript.mjs";
const { parseAgingReport, agingCsv } = await loadTypescript("../../src/lib/subledgerAging.ts");
const scope = { entityId: "entity-a", kind: "ar", asOf: "2026-09-30", pageSize: 1, revision: "a".repeat(32) };
function pages() {
  const common = { ...scope, entityName: "Company", currency: "USD", accountId: "ar", accountCode: "1100", accountName: "AR",
    generatedAt: "2026-09-06T12:00:00Z", documentCount: 3, openCount: 2, excludedDraftCount: 1, outstanding: "10000000000000.01",
    ledgerBalance: "10000000000000.00", variance: "-0.01", reconciled: false,
    buckets: { current: "0.02", days1to30: "9999999999999.99", days31to60: "0.00", days61to90: "0.00", days91plus: "0.00" } };
  const row = { partyId: "customer", partyName: '=HYPERLINK("https://example.test")', issueDate: "2026-09-01", settled: "0.00" };
  return [{ ...common, offset: 0, rows: [{ ...row, documentId: "a", documentNumber: "INV-A", dueDate: "2026-09-29", daysPastDue: 1, bucket: "days1to30", original: "9999999999999.99", outstanding: "9999999999999.99" }] },
    { ...common, offset: 1, rows: [{ ...row, documentId: "b", documentNumber: "INV-B", dueDate: "2026-09-30", daysPastDue: 0, bucket: "current", original: "0.02", outstanding: "0.02" }] }];
}

test("aging validates exact amounts and exports all pages with reconciliation and safe text", () => {
  const all = pages();
  for (const page of all) assert.equal(parseAgingReport(page, { ...scope, offset: page.offset }).openCount, 2);
  const csv = agingCsv(all);
  assert.ok(csv.includes('"TOTAL OUTSTANDING","10000000000000.01"'));
  assert.ok(csv.includes('"Variance: ledger less subledger","-0.01"'));
  assert.ok(csv.includes('"\'=HYPERLINK(""https://example.test"")"'));
  assert.ok(csv.includes('"Ledger reconciliation","Variance requires review"'));
  assert.throws(() => agingCsv([all[0]]));
  assert.throws(() => agingCsv([]));
});

test("aging rejects scope changes, missing pages, duplicate documents and inconsistent balances or buckets", () => {
  for (const corrupt of [
    p => { p[1].revision = "b".repeat(32); }, p => { p[1].currency = "EUR"; }, p => { p[1].entityId = "foreign"; },
    p => { p[1].kind = "ap"; }, p => { p[1].asOf = "2026-10-01"; }, p => { p[1].offset = 0; },
    p => { p[1].rows[0].documentId = "a"; }, p => { p[0].rows = []; }, p => { p[0].rows[0].outstanding = 100; },
    p => { p[1].rows[0].settled = "0.01"; }, p => { p[1].rows[0].daysPastDue = 1; }, p => { p[1].rows[0].bucket = "days1to30"; },
    p => { p[1].rows[0].dueDate = "2026-02-30"; }, p => { p[1].rows[0].issueDate = "2026-10-01"; },
    p => { p[0].reconciled = true; }, p => { p[0].variance = "0.00"; }, p => { p[0].documentCount = 1; },
    p => { p[1].accountId = "another"; }, p => { p[1].rows[0].original = p[1].rows[0].outstanding = "0.01"; },
  ]) { const all = pages(); corrupt(all); assert.throws(() => agingCsv(all)); }
  assert.throws(() => parseAgingReport(pages()[1], { ...scope, revision: undefined, offset: 1 }));
});

test("a complete empty aging report preserves negative ledger variance without inventing balances", () => {
  const report = { ...pages()[0], rows: [], offset: 0, openCount: 0, outstanding: "0.00", ledgerBalance: "-5.00", variance: "-5.00",
    buckets: { current: "0.00", days1to30: "0.00", days31to60: "0.00", days61to90: "0.00", days91plus: "0.00" } };
  assert.equal(parseAgingReport(report, report).rows.length, 0);
  assert.ok(agingCsv([report]).includes('"Ledger balance","-5.00"'));
  assert.throws(() => agingCsv([report, report]));
});
