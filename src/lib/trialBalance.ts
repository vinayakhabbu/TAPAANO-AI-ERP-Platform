export const balanceKeys = ["openingDebit", "openingCredit", "periodDebit", "periodCredit", "closingDebit", "closingCredit"] as const;
export type BalanceAmounts = Record<typeof balanceKeys[number], string>;
export type TrialBalanceRequest = { entityId: string; fromDate: string; toDate: string };
export type TrialBalanceRow = BalanceAmounts & { accountId: string; code: string; name: string; accountType: string };
export type TrialBalance = TrialBalanceRequest & {
  entityName: string; currency: string; generatedAt: string; revision: string;
  journalCount: number; periodJournalCount: number; draftJournalCount: number;
  rows: TrialBalanceRow[]; totals: BalanceAmounts;
};

export function isReportDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "0001-01-01") return false;
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function cents(value: unknown): bigint {
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,35})\.\d{2}$/.test(value)) throw new Error("Invalid trial balance amount.");
  return BigInt(value.replace(".", ""));
}

export function reportObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Trial balance is unavailable.");
  return value as Record<string, unknown>;
}

export function parseTrialBalance(value: unknown, request: TrialBalanceRequest): TrialBalance {
  const report = reportObject(value);
  if (report.entityId !== request.entityId || report.fromDate !== request.fromDate || report.toDate !== request.toDate
    || !isReportDate(request.fromDate) || !isReportDate(request.toDate) || request.fromDate > request.toDate
    || typeof report.entityName !== "string" || !report.entityName.trim()
    || typeof report.currency !== "string" || !/^[A-Z]{3}$/.test(report.currency)
    || typeof report.revision !== "string" || !/^[a-f0-9]{32}$/.test(report.revision)
    || typeof report.generatedAt !== "string" || !Number.isFinite(Date.parse(report.generatedAt)) || !Array.isArray(report.rows)) {
    throw new Error("Trial balance scope is invalid.");
  }
  for (const key of ["journalCount", "periodJournalCount", "draftJournalCount"]) {
    if (!Number.isSafeInteger(report[key]) || (report[key] as number) < 0) throw new Error("Invalid trial balance count.");
  }
  if ((report.periodJournalCount as number) > (report.journalCount as number)) throw new Error("Invalid trial balance count.");
  const totals = reportObject(report.totals);
  const sums = Object.fromEntries(balanceKeys.map(key => [key, 0n])) as Record<typeof balanceKeys[number], bigint>;
  const ids = new Set<string>();
  for (const raw of report.rows) {
    const row = reportObject(raw);
    if (typeof row.accountId !== "string" || !row.accountId || ids.has(row.accountId)
      || typeof row.code !== "string" || !row.code || typeof row.name !== "string" || !row.name
      || !["asset", "liability", "equity", "revenue", "expense"].includes(row.accountType as string)) throw new Error("Invalid trial balance account.");
    ids.add(row.accountId);
    for (const key of balanceKeys) sums[key] += cents(row[key]);
    const opening = cents(row.openingDebit) - cents(row.openingCredit);
    const movement = cents(row.periodDebit) - cents(row.periodCredit);
    const closing = cents(row.closingDebit) - cents(row.closingCredit);
    if (opening + movement !== closing || (cents(row.openingDebit) > 0n && cents(row.openingCredit) > 0n)
      || (cents(row.closingDebit) > 0n && cents(row.closingCredit) > 0n)) throw new Error("Trial balance does not reconcile.");
  }
  for (const key of balanceKeys) if (sums[key] !== cents(totals[key])) throw new Error("Trial balance totals are incomplete.");
  for (const [debit, credit] of [["openingDebit", "openingCredit"], ["periodDebit", "periodCredit"], ["closingDebit", "closingCredit"]] as const) {
    if (sums[debit] !== sums[credit]) throw new Error("Trial balance does not balance.");
  }
  if ((report.journalCount === 0) !== (report.rows.length === 0)) throw new Error("Trial balance history is incomplete.");
  return report as TrialBalance;
}

export function csvCell(value: string): string {
  const safe = /^[\s]*[=+\-@]|^[\t\r\n]/.test(value) ? "'" + value : value;
  return '"' + safe.replace(/"/g, '""') + '"';
}

export function trialBalanceCsv(report: TrialBalance): string {
  parseTrialBalance(report, report);
  const records: string[][] = [
    ["Ledger trial balance", report.entityName, report.entityId],
    ["Currency", report.currency, "From", report.fromDate, "Through", report.toDate],
    ["Generated at", report.generatedAt, "Posted journals", String(report.journalCount), "Drafts excluded", String(report.draftJournalCount)],
    ["Revision", report.revision],
    ["Code", "Account", "Type", "Opening debit", "Opening credit", "Period debit", "Period credit", "Closing debit", "Closing credit"],
    ...report.rows.map(row => [row.code, row.name, row.accountType, ...balanceKeys.map(key => row[key])]),
    ["", "TOTAL", "", ...balanceKeys.map(key => report.totals[key])],
  ];
  return records.map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
