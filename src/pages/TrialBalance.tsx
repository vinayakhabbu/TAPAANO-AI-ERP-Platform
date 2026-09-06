import { useState, type FormEvent } from "react";
import { Download, RefreshCw } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useReportEntities, useTrialBalance } from "@/hooks/useTrialBalance";
import { formatCurrencyTotal } from "@/lib/operationalSummary";
import { balanceKeys, isReportDate, trialBalanceCsv, type TrialBalanceRequest } from "@/lib/trialBalance";
import { statementsCsv } from "@/lib/financeReports";
import { downloadCsv } from "@/lib/downloadCsv";
import { AccountLedgerDetail } from "@/components/reports/AccountLedgerDetail";
import { LedgerStatements } from "@/components/reports/LedgerStatements";

const columnLabels = ["Opening debit", "Opening credit", "Period debit", "Period credit", "Closing debit", "Closing credit"];
function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function TrialBalance() {
  const entities = useReportEntities();
  const [filters, setFilters] = useState<TrialBalanceRequest>(() => ({ entityId: "", fromDate: today().slice(0, 8) + "01", toDate: today() }));
  const [request, setRequest] = useState<TrialBalanceRequest | null>(null);
  const [kind, setKind] = useState<"trial" | "income" | "balance">("trial");
  const [accountId, setAccountId] = useState<string | null>(null);
  const report = useTrialBalance(request);
  const valid = Boolean(filters.entityId && isReportDate(filters.fromDate) && isReportDate(filters.toDate) && filters.fromDate <= filters.toDate);
  const result = request && !report.isFetching && !report.isError ? report.data : undefined;
  function change(key: keyof TrialBalanceRequest, value: string) {
    setFilters(current => ({ ...current, [key]: value }));
    setRequest(null);
    setAccountId(null);
  }
  function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid) return;
    setAccountId(null);
    if (request?.entityId === filters.entityId && request.fromDate === filters.fromDate && request.toDate === filters.toDate) void report.refetch();
    else setRequest({ ...filters });
  }
  function download() {
    if (!result) return;
    const name = kind === "trial" ? "trial-balance" : kind === "income" ? "income-statement" : "balance-sheet";
    downloadCsv(`${name}-${result.entityId}-${result.fromDate}-${result.toDate}.csv`, kind === "trial" ? trialBalanceCsv(result) : statementsCsv(result, kind));
  }
  return (
    <AppLayout title="Financial Reports" subtitle="Trial balance, account activity, income statement and balance sheet">
      <div className="space-y-6">
        <p className="max-w-4xl text-sm text-muted-foreground">
          Select one legal entity and date range. Amounts use its functional currency. Posted journals are included;
          drafts are excluded. Opening balances and source documents still need finance reconciliation before financial reliance.
        </p>
        <div className="max-w-sm space-y-2"><Label htmlFor="report-kind">Report view</Label><select id="report-kind" value={kind} onChange={event => { setKind(event.target.value as typeof kind); setAccountId(null); }} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="trial">Trial balance</option><option value="income">Income statement</option><option value="balance">Balance sheet</option></select></div>
        <form onSubmit={generate} className="grid items-end gap-4 rounded-xl border bg-card p-5 md:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="report-entity">Legal entity</Label>
            <select id="report-entity" value={filters.entityId} onChange={event => change("entityId", event.target.value)}
              disabled={entities.isPending || entities.isError} required
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="">Select an entity</option>
              {entities.data?.map(entity => <option key={entity.id} value={entity.id}>{entity.name} ({entity.currency})</option>)}
            </select>
          </div>
          <div className="space-y-2"><Label htmlFor="report-from">From date</Label><Input id="report-from" type="date" min="0001-01-01" max="9999-12-31" required value={filters.fromDate} onChange={event => change("fromDate", event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="report-through">Through date</Label><Input id="report-through" type="date" min="0001-01-01" max="9999-12-31" required value={filters.toDate} onChange={event => change("toDate", event.target.value)} /></div>
          <Button type="submit" disabled={!valid || entities.isError || report.isFetching}><RefreshCw className="mr-2 h-4 w-4" />{report.isFetching ? "Generating…" : "Generate report"}</Button>
        </form>
        {entities.isError ? <Alert variant="destructive"><AlertTitle>Entities unavailable</AlertTitle><AlertDescription>Reload to retry loading the legal entities.</AlertDescription></Alert> : null}
        {!entities.isPending && !entities.isError && entities.data?.length === 0 ? <p className="text-sm">Create a legal entity in Settings before generating a report.</p> : null}
        {filters.fromDate && filters.toDate && !valid && filters.entityId ? <p className="text-sm text-destructive">Enter valid dates with the from date on or before the through date.</p> : null}
        {request && report.isError ? <Alert variant="destructive"><AlertTitle>Trial balance unavailable</AlertTitle><AlertDescription>The report could not be verified. Retry; if the problem persists, ask your administrator to check journal history and access.</AlertDescription></Alert> : null}
        {request && report.isFetching ? <p role="status" className="text-sm">Checking journal history and calculating balances…</p> : null}
        {result && accountId ? <AccountLedgerDetail key={`${result.entityId}:${result.revision}:${accountId}`} scope={{ entityId: result.entityId, fromDate: result.fromDate, toDate: result.toDate, revision: result.revision, accountId }} onClose={() => setAccountId(null)} /> : null}
        {result && !accountId ? <section className="space-y-4" aria-label="Financial report result">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">{result.entityName} · {result.currency}</h2>
              <p className="text-sm text-muted-foreground">{result.fromDate} through {result.toDate} · Generated {new Date(result.generatedAt).toLocaleString()}</p>
              <p className="mt-1 text-sm">{result.journalCount.toLocaleString()} posted journals through the end date; {result.periodJournalCount.toLocaleString()} in this range. {result.draftJournalCount.toLocaleString()} drafts excluded.</p>
            </div>
            <Button variant="outline" onClick={download}><Download className="mr-2 h-4 w-4" />Download CSV</Button>
          </div>
          {kind !== "trial" ? <LedgerStatements report={result} kind={kind} onAccount={setAccountId} /> : <>
          <p className="text-sm">Opening and closing amounts are net balances per account. Period debit and credit columns show activity. Select an account to see its journal lines.</p>
          <div className="rounded-xl border bg-card">
            <Table>
              <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Account</TableHead>{columnLabels.map(label => <TableHead key={label} className="text-right whitespace-nowrap">{label}</TableHead>)}</TableRow></TableHeader>
              <TableBody>
                {result.rows.length === 0 ? <TableRow><TableCell colSpan={8} className="h-24 text-center">No posted journals through this date.</TableCell></TableRow> : result.rows.map(row => <TableRow key={row.accountId}>
                  <TableCell className="font-mono">{row.code}</TableCell><TableCell><button type="button" className="text-left text-primary underline underline-offset-4" onClick={() => setAccountId(row.accountId)}>{row.name}</button><span className="block text-xs capitalize text-muted-foreground">{row.accountType}</span></TableCell>
                  {balanceKeys.map(key => <TableCell key={key} className="text-right font-mono whitespace-nowrap">{formatCurrencyTotal(result.currency, row[key])}</TableCell>)}
                </TableRow>)}
                <TableRow className="font-semibold"><TableCell colSpan={2}>Total ({result.currency})</TableCell>{balanceKeys.map(key => <TableCell key={key} className="text-right font-mono whitespace-nowrap" data-testid={`trial-total-${key}`}>{formatCurrencyTotal(result.currency, result.totals[key])}</TableCell>)}</TableRow>
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">This is a ledger trial balance. Consolidation, cash-flow statements and tax reports require further implementation and acceptance.</p>
          </>}
        </section> : null}
      </div>
    </AppLayout>
  );
}
