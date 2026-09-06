import assert from "node:assert/strict";
import test from "node:test";
import { loadTypescript } from "./helpers/load-typescript.mjs";

const { readAllRows } = await loadTypescript("../../src/lib/readAllRows.ts");
const { parseOperationalSummary, formatCurrencyTotal, summaryCountKeys } = await loadTypescript("../../src/lib/operationalSummary.ts");
const { createDiagnosticReporter } = await loadTypescript("../../src/lib/diagnostics.ts");

test("history exhausts more than 1000 rows even when the API caps each page", async () => {
  const all = Array.from({ length: 1107 }, (_, index) => ({ id: String(index) }));
  const offsets = [];
  const rows = await readAllRows(async (from, to) => {
    offsets.push(from);
    return { data: all.slice(from, Math.min(to + 1, from + 100)), count: all.length, error: null };
  });
  assert.deepEqual(rows, all);
  assert.equal(offsets.at(-1), 1100);
});

test("history fails closed on a later error, missing count, cap, or moving pagination", async () => {
  await assert.rejects(readAllRows(async () => ({ data: [], count: null, error: null })), /unavailable/);
  await assert.rejects(readAllRows(async () => ({ data: [], count: 50001, error: null })), /unavailable/);
  await assert.rejects(readAllRows(async () => ({ data: [], count: 2, error: null })), /ended/);
  await assert.rejects(readAllRows(async (from) => ({ data: [{ id: "same" }], count: from ? 3 : 2, error: null })), /changed/);
  await assert.rejects(readAllRows(async () => ({ data: [{ id: "same" }], count: 2, error: null })), /changed/);
  await assert.rejects(readAllRows(async (from) => ({ data: from ? null : [{ id: "first" }], count: 2, error: from ? new Error("offline") : null })), /offline/);
});

test("summary preserves separate currencies and decimal precision", () => {
  const summary = Object.fromEntries(summaryCountKeys.map((key) => [key, 0]));
  summary.postedInvoiceTotals = [{ currency: "USD", total: "19999999999999999.98" }, { currency: "EUR", total: "0.10" }];
  assert.deepEqual(parseOperationalSummary(summary), summary);
  assert.equal(formatCurrencyTotal("USD", summary.postedInvoiceTotals[0].total), "USD 19,999,999,999,999,999.98");
  assert.equal(formatCurrencyTotal("EUR", "0.10"), "EUR 0.10");
  assert.throws(() => parseOperationalSummary({ ...summary, invoiceCount: undefined }), /invalid count/);
  assert.throws(() => parseOperationalSummary({ ...summary, postedInvoiceTotals: [{ currency: "USD", total: 1 }] }), /currency total/);
  assert.throws(() => parseOperationalSummary({ ...summary, postedInvoiceTotals: [summary.postedInvoiceTotals[0], summary.postedInvoiceTotals[0]] }), /currency total/);
});

test("production diagnostics persist allowlisted codes without credentials and throttle repeats", async () => {
  const sent = [], logged = [];
  let now = 0;
  const report = createDiagnosticReporter({ development: false, release: "a".repeat(40), now: () => now,
    log: (...values) => logged.push(values), send: async (event) => { sent.push(event); } });
  report("Application render failed", new Error("Bearer secret financial record"));
  report("Application render failed", { password: "hidden" });
  report("Arbitrary message with a secret", "hidden");
  await new Promise(setImmediate);
  assert.deepEqual(sent, [{ code: "render_failed", release: "a".repeat(40) }]);
  assert.doesNotMatch(JSON.stringify({ sent, logged }), /Bearer|password|hidden|financial record|Arbitrary/);
  now = 60000;
  report("Application render failed");
  await new Promise(setImmediate);
  assert.equal(sent.length, 2);
});

test("a failing diagnostic sink does not recurse or create unhandled rejections", async () => {
  const logged = [];
  const report = createDiagnosticReporter({ development: false, log: (...values) => logged.push(values),
    send: async () => { throw new Error("database details"); } });
  assert.doesNotThrow(() => report("Profile initialization failed"));
  await new Promise(setImmediate);
  assert.deepEqual(logged.at(-1), ["TAPAANO diagnostic persistence unavailable"]);
});
