import { cents, csvCell, parseTrialBalance, reportObject, isReportDate, type BalanceAmounts, type TrialBalance, type TrialBalanceRequest } from "./trialBalance";

export function signedCents(value: unknown): bigint {
  if (typeof value !== "string" || !/^-?(0|[1-9]\d{0,35})\.\d{2}$/.test(value) || value === "-0.00") throw new Error("Invalid report amount.");
  return value.startsWith("-") ? -cents(value.slice(1)) : cents(value);
}
export function decimal(value: bigint): string {
  const magnitude = value < 0n ? -value : value;
  return `${value < 0n ? "-" : ""}${magnitude / 100n}.${String(magnitude % 100n).padStart(2, "0")}`;
}
export function formatSignedAmount(currency: string, value: string): string {
  const amount = signedCents(value);
  const magnitude = amount < 0n ? -amount : amount;
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Invalid report currency.");
  return `${currency} ${amount < 0n ? "−" : ""}${new Intl.NumberFormat("en-US").format(magnitude / 100n)}.${String(magnitude % 100n).padStart(2, "0")}`;
}
function csvAmount(value: string): string { signedCents(value); return '"' + value + '"'; }

export type StatementRow = { accountId: string; code: string; name: string; amount: string };
export type StatementGroup = { label: string; rows: StatementRow[]; total: string };
export type LedgerStatements = { revenue: StatementGroup; expenses: StatementGroup; assets: StatementGroup; liabilities: StatementGroup; equity: StatementGroup; netIncome: string; unclosedEarnings: string; totalEquity: string; liabilitiesAndEquity: string };

/** Account classifications are immutable. No cash-flow or GAAP layout is inferred. */
export function deriveLedgerStatements(report: TrialBalance): LedgerStatements {
  parseTrialBalance(report, report);
  const group = (type: string, label: string, period: boolean, creditNormal: boolean): StatementGroup => {
    const rows = report.rows.filter(row => row.accountType === type).map(row => {
      const closing=period?report.fiscalClosingActivity?.find(item=>item.accountId===row.accountId):undefined;
      const debit = cents(row[period ? "periodDebit" : "closingDebit"])-cents(closing?.debit??"0.00");
      const credit = cents(row[period ? "periodCredit" : "closingCredit"])-cents(closing?.credit??"0.00");
      return { accountId: row.accountId, code: row.code, name: row.name, amount: decimal(creditNormal ? credit - debit : debit - credit) };
    });
    return { label, rows, total: decimal(rows.reduce((sum, row) => sum + signedCents(row.amount), 0n)) };
  };
  const revenue = group("revenue", "Revenue", true, true), expenses = group("expense", "Expenses", true, false);
  const assets = group("asset", "Assets", false, false), liabilities = group("liability", "Liabilities", false, true), equity = group("equity", "Recorded equity", false, true);
  const unclosed = signedCents(group("revenue", "", false, true).total) - signedCents(group("expense", "", false, false).total);
  const totalEquity = signedCents(equity.total) + unclosed;
  const liabilitiesAndEquity = signedCents(liabilities.total) + totalEquity;
  if (signedCents(assets.total) !== liabilitiesAndEquity) throw new Error("Balance sheet does not reconcile.");
  return { revenue, expenses, assets, liabilities, equity, netIncome: decimal(signedCents(revenue.total) - signedCents(expenses.total)),
    unclosedEarnings: decimal(unclosed), totalEquity: decimal(totalEquity), liabilitiesAndEquity: decimal(liabilitiesAndEquity) };
}

export function statementsCsv(report: TrialBalance, kind: "income" | "balance"): string {
  const statements = deriveLedgerStatements(report);
  const groups = kind === "income" ? [statements.revenue, statements.expenses] : [statements.assets, statements.liabilities, statements.equity];
  const rows = [[kind === "income" ? "Ledger income statement" : "Ledger balance sheet", report.entityName, report.entityId],
    ["Currency", report.currency, "From", report.fromDate, "Through", report.toDate],
    ["Generated at", report.generatedAt, "Revision", report.revision], ["Section", "Code", "Account", "Amount"],
    ...groups.flatMap(group => [...group.rows.map(row => [group.label, row.code, row.name, row.amount]), [group.label, "", "TOTAL", group.total]]),
    ...(kind === "income" ? [["Net income / loss", "", "", statements.netIncome]] : [
      ["Unclosed earnings through end date", "", "", statements.unclosedEarnings], ["Total equity including unclosed earnings", "", "", statements.totalEquity], ["Liabilities and equity", "", "", statements.liabilitiesAndEquity]]),
    ["Basis", "Recorded account classifications. Identified fiscal transfers are excluded from income; balance-sheet balances include them. Opening balances and presentation require finance review."]];
  return rows.map((row, index) => row.map((cell, column) => index >= 4 && column === 3 ? csvAmount(cell) : csvCell(cell)).join(",")).join("\r\n") + "\r\n";
}

export type AccountLedgerRequest = TrialBalanceRequest & { accountId: string; revision: string; offset: number; pageSize: number };
export type LedgerLine = { lineId: string; lineNumber: number; entryId: string; entryNumber: string; entryDate: string; memo: string; sourceType: string; sourceId: string | null; debit: string; credit: string; balance: string };
export type AccountLedger = AccountLedgerRequest & { entityName: string; currency: string; accountCode: string; accountName: string; accountType: string; generatedAt: string; lineCount: number; pageOpening: string; totals: BalanceAmounts; rows: LedgerLine[] };

export function parseAccountLedger(value: unknown, request: AccountLedgerRequest): AccountLedger {
  const report = reportObject(value);
  for (const key of ["entityId", "accountId", "fromDate", "toDate", "revision", "offset", "pageSize"] as const) {
    if (report[key] !== request[key]) throw new Error("Account ledger scope changed.");
  }
  if (!isReportDate(request.fromDate) || !isReportDate(request.toDate) || request.fromDate > request.toDate || !/^[a-f0-9]{32}$/.test(request.revision)
    || !Number.isSafeInteger(request.offset) || request.offset < 0 || !Number.isSafeInteger(request.pageSize) || request.pageSize < 1 || request.pageSize > 200
    || !Number.isSafeInteger(report.lineCount) || (report.lineCount as number) < 0 || !Array.isArray(report.rows)
    || typeof report.currency !== "string" || !/^[A-Z]{3}$/.test(report.currency) || typeof report.generatedAt !== "string" || !Number.isFinite(Date.parse(report.generatedAt))) throw new Error("Invalid account ledger.");
  for (const key of ["entityName", "accountCode", "accountName", "accountType"]) if (typeof report[key] !== "string" || !report[key]) throw new Error("Account information is unavailable.");
  const count = report.lineCount as number;
  if (request.offset > Math.max(0, count - 1) || report.rows.length !== Math.min(request.pageSize, count - request.offset)) throw new Error("Account ledger page is incomplete.");
  const totals = reportObject(report.totals);
  const opening = cents(totals.openingDebit) - cents(totals.openingCredit), closing = cents(totals.closingDebit) - cents(totals.closingCredit);
  if (opening + cents(totals.periodDebit) - cents(totals.periodCredit) !== closing
    || (cents(totals.openingDebit) > 0n && cents(totals.openingCredit) > 0n) || (cents(totals.closingDebit) > 0n && cents(totals.closingCredit) > 0n)) throw new Error("Account totals do not reconcile.");
  let running = signedCents(report.pageOpening), previous: string | undefined;
  let debits = 0n, credits = 0n;
  if (request.offset === 0 && running !== opening) throw new Error("Account opening balance changed.");
  const ids = new Set<string>();
  for (const raw of report.rows) {
    const row = reportObject(raw);
    if (typeof row.lineId !== "string" || !row.lineId || ids.has(row.lineId) || typeof row.entryId !== "string" || !row.entryId
      || typeof row.entryNumber !== "string" || !row.entryNumber || typeof row.memo !== "string" || typeof row.sourceType !== "string" || !row.sourceType
      || (row.sourceId !== null && typeof row.sourceId !== "string") || !Number.isSafeInteger(row.lineNumber) || (row.lineNumber as number) < 1
      || typeof row.entryDate !== "string" || !isReportDate(row.entryDate) || row.entryDate < request.fromDate || row.entryDate > request.toDate) throw new Error("Invalid account activity.");
    const sort = `${row.entryDate}/${row.entryId}/${String(row.lineNumber).padStart(12, "0")}/${row.lineId}`;
    if (previous && sort <= previous) throw new Error("Account activity is out of order.");
    previous = sort; ids.add(row.lineId);
    const debit = cents(row.debit), credit = cents(row.credit);
    if (!((debit > 0n && credit === 0n) || (credit > 0n && debit === 0n))) throw new Error("Invalid ledger line amounts.");
    debits += debit; credits += credit; running += debit - credit;
    if (running !== signedCents(row.balance)) throw new Error("Account running balance does not reconcile.");
  }
  if (request.offset + report.rows.length === count && running !== closing) throw new Error("Account closing balance does not reconcile.");
  if (request.offset === 0 && report.rows.length === count && (debits !== cents(totals.periodDebit) || credits !== cents(totals.periodCredit))) throw new Error("Account activity totals are incomplete.");
  return report as AccountLedger;
}

export function accountLedgerCsv(pages: AccountLedger[]): string {
  if (!pages.length) throw new Error("No ledger pages available.");
  const first = pages[0]; let offset = 0, running = signedCents(first.pageOpening), debit = 0n, credit = 0n;
  const ids = new Set<string>(); const lines: LedgerLine[] = [];
  for (const page of pages) {
    parseAccountLedger(page, { ...first, offset });
    if (page.lineCount !== first.lineCount || page.currency !== first.currency || page.pageOpening !== decimal(running)
      || Object.keys(first.totals).some(key => page.totals[key as keyof BalanceAmounts] !== first.totals[key as keyof BalanceAmounts])) throw new Error("Ledger changed during export.");
    for (const line of page.rows) {
      if (ids.has(line.lineId)) throw new Error("Duplicate ledger activity.");
      ids.add(line.lineId); lines.push(line); debit += cents(line.debit); credit += cents(line.credit); running = signedCents(line.balance);
    }
    offset += page.rows.length;
  }
  if (first.offset !== 0 || offset !== first.lineCount || debit !== cents(first.totals.periodDebit) || credit !== cents(first.totals.periodCredit)) throw new Error("Ledger export is incomplete.");
  const rows = [["Account ledger", first.entityName, first.entityId], ["Account", first.accountCode, first.accountName, first.accountId],
    ["Currency", first.currency, "From", first.fromDate, "Through", first.toDate], ["Revision", first.revision],
    ["Opening balance (debit positive)", first.pageOpening], ["Date", "Journal", "Line", "Source", "Memo", "Debit", "Credit", "Balance (debit positive)", "Journal ID", "Line ID"],
    ...lines.map(line => [line.entryDate, line.entryNumber, String(line.lineNumber), line.sourceType, line.memo, line.debit, line.credit, line.balance, line.entryId, line.lineId]),
    ["TOTAL", "", "", "", "", first.totals.periodDebit, first.totals.periodCredit, decimal(running)]];
  return rows.map((row, index) => row.map((cell, column) => (index === 4 && column === 1) || (index >= 6 && column >= 5 && column <= 7) ? csvAmount(cell) : csvCell(cell)).join(",")).join("\r\n") + "\r\n";
}

export type PostedJournal = { id: string; entryNumber: string; entryDate: string; memo: string; entityId: string; entityName: string; currency: string; debit: string; credit: string };
export function parsePostedJournals(value: unknown): PostedJournal[] {
  if (!Array.isArray(value) || value.length > 20) throw new Error("Recent journal history is unavailable.");
  const ids = new Set<string>();
  for (const raw of value) {
    const row = reportObject(raw);
    for (const key of ["id", "entryNumber", "entryDate", "entityId", "entityName", "currency"]) if (typeof row[key] !== "string" || !row[key]) throw new Error("Invalid posted journal.");
    if (ids.has(row.id as string) || typeof row.memo !== "string" || !isReportDate(row.entryDate as string) || !/^[A-Z]{3}$/.test(row.currency as string)
      || cents(row.debit) === 0n || cents(row.debit) !== cents(row.credit)) throw new Error("Posted journal does not reconcile.");
    ids.add(row.id as string);
  }
  return value as PostedJournal[];
}
