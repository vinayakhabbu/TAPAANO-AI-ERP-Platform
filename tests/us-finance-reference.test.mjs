import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const load = name => readFile(new URL(`./fixtures/us-finance/${name}.json`, import.meta.url), "utf8").then(JSON.parse);
const [contracts, bank, expected] = await Promise.all([load("contracts"), load("bank-statement"), load("expected-results")]);
const cents = value => {
  assert.match(value, /^-?(0|[1-9]\d*)\.\d{2}$/);
  return BigInt(value.replace(".", ""));
};
const sum = amounts => amounts.reduce((total, value) => total + cents(value), 0n);

test("synthetic contract schedules reconcile allocations, usage and independent January golden balances", () => {
  assert.equal(contracts.synthetic, true);
  assert.equal(new Set(contracts.contracts.map(c => c.id)).size, 4);
  for (const contract of contracts.contracts) {
    assert.equal(sum(contract.obligations.map(o => o.allocation)), cents(contract.consideration));
    for (const obligation of contract.obligations) assert.equal(sum(obligation.monthlyRevenue), cents(obligation.allocation));
  }
  const annual = contracts.contracts.find(c => c.id === "ANNUAL-01");
  let outstanding = cents(annual.consideration);
  for (const receipt of annual.receipts) { outstanding -= cents(receipt.amount); assert.equal(outstanding, cents(receipt.remainingAR)); }
  assert.equal(outstanding, 0n);
  const usage = contracts.contracts.find(c => c.id === "USAGE-01");
  const events = new Map();
  for (const event of [...usage.usageEvents, usage.duplicateDelivery]) {
    if (events.has(event.id)) assert.deepEqual(event, events.get(event.id));
    events.set(event.id, event);
  }
  const units = [...events.values()].reduce((n, e) => n + BigInt(e.units), 0n);
  assert.equal(units, BigInt(usage.acceptedUnits));
  assert.equal(units * BigInt(usage.ratePerRequest.replace(".", "")) / 100n, cents(usage.consideration));
  const bundle = contracts.contracts.find(c => c.id === "BUNDLE-01");
  const ssp = sum(bundle.obligations.map(o => o.standalonePrice));
  for (const o of bundle.obligations) assert.equal(cents(bundle.consideration) * cents(o.standalonePrice) / ssp, cents(o.allocation));
  // Check the independently specified daily measure, including cumulative rounding.
  let cumulativeDays = 0n, recognized = 0n;
  for (const [index, days] of [31n, 28n, 31n].entries()) {
    cumulativeDays += days;
    const cumulative = (960000n * cumulativeDays + 45n) / 90n;
    assert.equal(cumulative - recognized, cents(bundle.obligations[0].monthlyRevenue[index])); recognized = cumulative;
  }
  assert.equal(sum(contracts.contracts.flatMap(c => c.obligations.map(o => o.monthlyRevenue[0]))), cents(expected.januaryContractRevenue));
});

test("synthetic statement proves gross-to-net payout and leaves unidentified cash unresolved", () => {
  assert.equal(bank.synthetic, true);
  const seen = new Set(); let balance = cents(bank.openingBalance);
  for (const row of bank.transactions) {
    assert.ok(!seen.has(row.sourceId)); seen.add(row.sourceId);
    assert.ok(row.postedDate >= bank.start && row.postedDate <= bank.end);
    balance += cents(row.amount); assert.equal(balance, cents(row.runningBalance));
  }
  assert.equal(balance, cents(bank.closingBalance));
  const payout = bank.processorPayout;
  for (const row of payout.collections) assert.equal(cents(row.gross) - cents(row.fee), cents(row.net));
  assert.equal(sum(payout.collections.map(c => c.gross)), cents(payout.gross));
  assert.equal(sum(payout.collections.map(c => c.fee)), cents(payout.fees));
  assert.equal(sum(payout.collections.map(c => c.net)), cents(payout.net));
  assert.equal(bank.transactions.find(t => t.sourceId === payout.bankTransaction).amount, payout.net);
  assert.equal(payout.collections.find(c => c.invoice === "MONTHLY-01").gross, contracts.contracts.find(c => c.id === "MONTHLY-01").consideration);
  for (const item of bank.timingItems) assert.ok(item.bookDate <= bank.end && item.clearedDate > bank.end);
  const adjusted = balance + sum(bank.timingItems.map(item => item.bookAmount));
  const rec = expected.bankReconciliation;
  assert.equal(adjusted, cents(rec.adjustedStatementBalance));
  const books = cents(bank.bookCashBeforeBankAdjustments) - 2500n + 500n;
  assert.equal(books, cents(rec.bookCashAfterApprovedFeeAndInterest));
  assert.equal(adjusted - books, cents(rec.unresolvedDifference));
  assert.deepEqual(bank.transactions.filter(t => t.reference === null).map(t => t.sourceId), rec.unresolvedSourceIds);
  assert.equal(books + 75000n, cents(rec.conditionalBookCashAfterApprovedSuspense));
  assert.equal(rec.mayAutoComplete, false); assert.equal(rec.ownershipResolvedBySuspense, false);
});

test("expected journal examples balance and separate January revenue, billing, cash and deferred amounts", () => {
  const balances = new Map([["ar", cents(expected.openingAR)]]);
  for (const journal of expected.journalExamples) {
    assert.equal(sum(journal.lines.map(l => l.debit)), sum(journal.lines.map(l => l.credit)), journal.id);
    for (const line of journal.lines) {
      assert.ok(cents(line.debit) >= 0n && cents(line.credit) >= 0n);
      assert.notEqual(cents(line.debit) === 0n, cents(line.credit) === 0n);
      if (journal.date <= "2027-01-31" && journal.status === "expected_future_posting") {
        balances.set(line.account, (balances.get(line.account) ?? 0n) + cents(line.debit) - cents(line.credit));
      }
    }
  }
  assert.equal(balances.get("ar"), cents(expected.januaryClosingBilledAR));
  assert.equal(balances.get("unbilled_receivable"), cents(expected.januaryClosingUnbilledReceivable));
  assert.equal(-balances.get("deferred_revenue"), cents(expected.januaryClosingDeferredRevenue));
  assert.equal(-balances.get("revenue"), cents(expected.januaryContractRevenue));
  assert.equal(balances.get("processor_clearing"), cents(expected.processorClearingAfterPayout));
  const februaryBilling = expected.journalExamples.find(j => j.id === "usage-february-billed");
  assert.ok(februaryBilling.lines.every(l => l.account !== "revenue"));
});
