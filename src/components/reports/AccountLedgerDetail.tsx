import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAccountLedger, fetchAccountLedger } from "@/hooks/useAccountLedger";
import { accountLedgerCsv, formatSignedAmount, type AccountLedger, type AccountLedgerRequest } from "@/lib/financeReports";
import { downloadCsv } from "@/lib/downloadCsv";
import { reportClientError } from "@/lib/clientDiagnostics";

export function AccountLedgerDetail({ scope, onClose }: { scope: Omit<AccountLedgerRequest, "offset" | "pageSize">; onClose: () => void }) {
  const [offset, setOffset] = useState(0), [exporting, setExporting] = useState(false), [exportFailed, setExportFailed] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const request = { ...scope, offset, pageSize: 100 };
  const query = useAccountLedger(request);
  const report = !query.isFetching && !query.isError && !exportFailed ? query.data : undefined;
  async function exportAll() {
    if (!report || exporting || report.lineCount > 50_000) return;
    const active = new AbortController(); controller.current = active; setExporting(true);
    try {
      const pages: AccountLedger[] = [];
      for (let pageOffset = 0; pageOffset < Math.max(report.lineCount, 1); pageOffset += 100) {
        pages.push(await fetchAccountLedger({ ...request, offset: pageOffset }, active.signal));
      }
      if (!active.signal.aborted) downloadCsv(`account-ledger-${scope.entityId}-${scope.accountId}-${scope.fromDate}-${scope.toDate}.csv`, accountLedgerCsv(pages));
    } catch (error) {
      if (!active.signal.aborted) { setExportFailed(true); reportClientError("Data read failed", error); }
    } finally { if (!active.signal.aborted) setExporting(false); }
  }
  return <section className="space-y-4 rounded-xl border bg-card p-5" aria-label="Account ledger">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Account activity</h2><Button variant="outline" onClick={onClose}>Back to report</Button></div>
    {query.isFetching ? <p role="status">Loading account activity…</p> : null}
    {query.isError || exportFailed ? <Alert variant="destructive"><AlertTitle>Account ledger unavailable</AlertTitle><AlertDescription>The ledger may have changed or could not be loaded. Return to the report and generate it again before continuing.</AlertDescription></Alert> : null}
    {report ? <>
      <div className="flex flex-wrap justify-between gap-3">
        <div><h3 className="font-semibold">{report.accountCode} · {report.accountName}</h3><p className="text-sm text-muted-foreground">{report.entityName} · {report.currency} · {report.fromDate} through {report.toDate}</p></div>
        <Button variant="outline" onClick={() => void exportAll()} disabled={exporting || report.lineCount > 50_000}>{exporting ? "Preparing full export…" : "Download account CSV"}</Button>
      </div>
      <p className="text-sm">{report.lineCount.toLocaleString()} lines in this range. Balances are positive for net debits and negative for net credits.</p>
      {report.lineCount > 50_000 ? <p className="text-sm text-muted-foreground">Narrow the report dates to export at most 50,000 lines. All activity remains available through the page controls.</p> : null}
      <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Journal / source</TableHead><TableHead>Memo</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead><TableHead className="text-right">Running balance</TableHead></TableRow></TableHeader>
        <TableBody>
          <TableRow><TableCell colSpan={5}>Balance before this page</TableCell><TableCell className="text-right font-mono">{formatSignedAmount(report.currency, report.pageOpening)}</TableCell></TableRow>
          {report.rows.length === 0 ? <TableRow><TableCell colSpan={6}>No account activity in this date range.</TableCell></TableRow> : report.rows.map(line => <TableRow key={line.lineId}>
            <TableCell className="whitespace-nowrap">{line.entryDate}</TableCell><TableCell><span className="font-medium">{line.entryNumber}</span><span className="block text-xs text-muted-foreground">{line.sourceType.replace(/_/g, " ")} · line {line.lineNumber}</span></TableCell><TableCell>{line.memo || "—"}</TableCell>
            <TableCell className="text-right font-mono whitespace-nowrap">{formatSignedAmount(report.currency, line.debit)}</TableCell><TableCell className="text-right font-mono whitespace-nowrap">{formatSignedAmount(report.currency, line.credit)}</TableCell><TableCell className="text-right font-mono whitespace-nowrap">{formatSignedAmount(report.currency, line.balance)}</TableCell>
          </TableRow>)}
        </TableBody>
      </Table>
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm">{report.lineCount ? `${offset + 1}–${offset + report.rows.length}` : "0"} of {report.lineCount.toLocaleString()}</p><div className="flex gap-2">
        <Button variant="outline" disabled={offset === 0 || exporting} onClick={() => setOffset(current => Math.max(0, current - 100))}>Previous page</Button><Button variant="outline" disabled={offset + report.rows.length >= report.lineCount || exporting} onClick={() => setOffset(current => current + 100)}>Next page</Button>
      </div></div>
    </> : null}
  </section>;
}
