import { cents, csvCell, isReportDate, reportObject } from "./trialBalance";
import { signedCents } from "./financeReports";

export const agingBuckets = ["current", "days1to30", "days31to60", "days61to90", "days91plus"] as const;
export const agingLabels = ["Current", "1–30 days", "31–60 days", "61–90 days", "91+ days"] as const;
export type AgingKind = "ar" | "ap";
export type AgingRequest = { entityId: string; kind: AgingKind; asOf: string; offset: number; pageSize: number; revision?: string };
export type AgingRow = { documentId: string; documentNumber: string; partyId: string; partyName: string; issueDate: string; dueDate: string;
  daysPastDue: number; bucket: typeof agingBuckets[number]; original: string; settled: string; outstanding: string };
export type AgingReport = AgingRequest & { entityName: string; currency: string; accountId: string; accountCode: string; accountName: string;
  generatedAt: string; revision: string; documentCount: number; openCount: number; excludedDraftCount: number;
  outstanding: string; ledgerBalance: string; variance: string; reconciled: boolean; buckets: Record<typeof agingBuckets[number], string>; rows: AgingRow[] };

const fail = (): never => { throw new Error("Aging report is incomplete or invalid. Generate it again."); };
function validateOrder(rows: AgingRow[]) {
  const seen = new Set<string>(); let previous = "";
  for (const row of rows) {
    const key = row.dueDate + row.documentId;
    if (seen.has(row.documentId) || (previous && key <= previous)) fail();
    seen.add(row.documentId); previous = key;
  }
}
function validateTotals(rows: AgingRow[], report: AgingReport) {
  for (const bucket of agingBuckets) {
    if (rows.filter(row => row.bucket === bucket).reduce((sum, row) => sum + cents(row.outstanding), 0n) !== cents(report.buckets[bucket])) fail();
  }
}

export function parseAgingReport(value: unknown, request: AgingRequest): AgingReport {
  const raw = reportObject(value);
  if (!["ar", "ap"].includes(request.kind) || !request.entityId || !isReportDate(request.asOf)
    || !Number.isSafeInteger(request.offset) || request.offset < 0 || !Number.isSafeInteger(request.pageSize) || request.pageSize < 1 || request.pageSize > 200
    || request.offset > 0 && !request.revision) fail();
  for (const key of ["entityId", "kind", "asOf", "offset", "pageSize"] as const) if (raw[key] !== request[key]) fail();
  for (const key of ["entityName", "accountId", "accountCode", "accountName"]) if (typeof raw[key] !== "string" || !(raw[key] as string).trim()) fail();
  if (typeof raw.currency !== "string" || !/^[A-Z]{3}$/.test(raw.currency) || typeof raw.revision !== "string" || !/^[a-f0-9]{32}$/.test(raw.revision)
    || request.revision && raw.revision !== request.revision || typeof raw.generatedAt !== "string" || !Number.isFinite(Date.parse(raw.generatedAt))
    || !Array.isArray(raw.rows)) fail();
  for (const key of ["documentCount", "openCount", "excludedDraftCount"]) if (!Number.isSafeInteger(raw[key]) || (raw[key] as number) < 0) fail();
  const report = raw as AgingReport;
  if (report.openCount > report.documentCount || (report.openCount === 0 ? report.offset !== 0 : report.offset >= report.openCount)
    || report.rows.length !== Math.min(report.pageSize, report.openCount - report.offset)) fail();
  const buckets = reportObject(report.buckets);
  if (agingBuckets.reduce((sum, key) => sum + cents(buckets[key]), 0n) !== cents(report.outstanding)
    || signedCents(report.ledgerBalance) - cents(report.outstanding) !== signedCents(report.variance)
    || report.reconciled !== (signedCents(report.variance) === 0n)) fail();
  for (const rawRow of report.rows) {
    const row = reportObject(rawRow);
    for (const key of ["documentId", "documentNumber", "partyId", "partyName"]) if (typeof row[key] !== "string" || !(row[key] as string).trim()) fail();
    if (typeof row.issueDate !== "string" || !isReportDate(row.issueDate) || row.issueDate > report.asOf
      || typeof row.dueDate !== "string" || !isReportDate(row.dueDate) || row.dueDate < row.issueDate) fail();
    const days = Math.max(0, (Date.parse(report.asOf) - Date.parse(row.dueDate as string)) / 86_400_000);
    const bucket = days === 0 ? "current" : days <= 30 ? "days1to30" : days <= 60 ? "days31to60" : days <= 90 ? "days61to90" : "days91plus";
    if (row.daysPastDue !== days || row.bucket !== bucket || cents(row.outstanding) <= 0n
      || cents(row.settled) + cents(row.outstanding) !== cents(row.original)) fail();
  }
  validateOrder(report.rows);
  if (report.offset === 0 && report.rows.length === report.openCount) validateTotals(report.rows, report);
  return report;
}

export function agingCsv(pages: AgingReport[]): string {
  if (!pages.length) fail();
  const first = pages[0]; let offset = 0;
  for (const page of pages) {
    parseAgingReport(page, { entityId: first.entityId, kind: first.kind, asOf: first.asOf, revision: first.revision, offset, pageSize: first.pageSize });
    for (const key of ["accountId", "accountCode", "accountName", "currency", "entityName", "documentCount", "openCount", "excludedDraftCount", "outstanding", "ledgerBalance", "variance", "reconciled"] as const) if (page[key] !== first[key]) fail();
    for (const bucket of agingBuckets) if (page.buckets[bucket] !== first.buckets[bucket]) fail();
    offset += page.rows.length;
  }
  const rows = pages.flatMap(page => page.rows);
  if (offset !== first.openCount || (first.openCount === 0 && pages.length !== 1)) fail();
  validateOrder(rows); validateTotals(rows, first);
  const records = [
    [first.kind === "ar" ? "Receivables aging" : "Payables aging", first.entityName, first.entityId],
    ["As of", first.asOf, "Currency", first.currency], ["Control account", first.accountCode, first.accountName, first.accountId],
    ["Generated at", first.generatedAt, "Revision", first.revision],
    ["Posted documents", String(first.documentCount), "Open documents", String(first.openCount), "Unposted drafts excluded", String(first.excludedDraftCount)],
    ["Document", "Party", "Issue date", "Due date", "Days past due", "Bucket", "Original", "Settled as of date", "Outstanding", "Document ID", "Party ID"],
    ...rows.map(row => [row.documentNumber, row.partyName, row.issueDate, row.dueDate, String(row.daysPastDue), agingLabels[agingBuckets.indexOf(row.bucket)], row.original, row.settled, row.outstanding, row.documentId, row.partyId]),
    ["TOTAL OUTSTANDING", first.outstanding], ...agingBuckets.map((bucket, i) => [agingLabels[i], first.buckets[bucket]]),
  ];
  return records.map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n"
    + [["Ledger balance", first.ledgerBalance], ["Variance: ledger less subledger", first.variance]].map(([label, amount]) => `${csvCell(label)},"${amount}"`).join("\r\n")
    + `\r\n"Ledger reconciliation",${csvCell(first.reconciled ? "Agrees" : "Variance requires review")}\r\n`;
}
