import { SettlementAmountForm } from "@/components/forms/SettlementAmountForm";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useReportEntities } from "@/hooks/useTrialBalance";
import { fetchSubledgerAging, useSubledgerAging } from "@/hooks/useSubledgerAging";
import { agingBuckets, agingLabels, agingCsv, type AgingKind, type AgingReport, type AgingRequest } from "@/lib/subledgerAging";
import { formatSignedAmount } from "@/lib/financeReports";
import { isReportDate } from "@/lib/trialBalance";
import { downloadCsv } from "@/lib/downloadCsv";
import { reportClientError } from "@/lib/clientDiagnostics";

function AgingResult({ scope, generation }: { scope: AgingRequest; generation: number }) {
  const [request, setRequest] = useState(scope), [exporting, setExporting] = useState(false), [exportFailed, setExportFailed] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const query = useSubledgerAging(request, generation);
  useEffect(() => { if (query.error) reportClientError("Data read failed", query.error); }, [query.error]);
  const report = !query.isFetching && !query.isError && !exportFailed ? query.data : undefined;
  async function exportAll() {
    if (!report || exporting || report.openCount > 50_000) return;
    const active = new AbortController(); controller.current = active; setExporting(true);
    try {
      const pages: AgingReport[] = [];
      for (let offset = 0; offset < Math.max(report.openCount, 1); offset += 100) {
        pages.push(await fetchSubledgerAging({ ...scope, offset, revision: report.revision }, active.signal));
      }
      if (!active.signal.aborted) downloadCsv(`${scope.kind}-aging-${scope.entityId}-${scope.asOf}.csv`, agingCsv(pages));
    } catch (error) {
      if (!active.signal.aborted) { setExportFailed(true); reportClientError("Data read failed", error); }
    } finally { if (!active.signal.aborted) setExporting(false); }
  }
  return <div className="space-y-4" aria-label="Aging result">
    {query.isFetching ? <p role="status">Loading aging…</p> : null}
    {query.isError || exportFailed ? <Alert variant="destructive"><AlertTitle>Aging unavailable</AlertTitle><AlertDescription>History changed or could not be verified. Check posting-account setup and legacy records, then generate the report again.</AlertDescription></Alert> : null}
    {report ? <>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{report.entityName} · {report.currency} · as of {report.asOf}</h3><p className="text-sm text-muted-foreground">{report.openCount.toLocaleString()} open of {report.documentCount.toLocaleString()} posted documents; {report.excludedDraftCount.toLocaleString()} unposted drafts excluded.</p></div>
        <Button variant="outline" disabled={exporting || report.openCount > 50_000} onClick={() => void exportAll()}>{exporting ? "Preparing aging export…" : "Download aging CSV"}</Button></div>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">{[...agingBuckets.map((key, i) => [agingLabels[i], report.buckets[key]]), ["Total outstanding", report.outstanding]].map(([label, amount]) =>
        <div key={label} className="rounded border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="overflow-x-auto whitespace-nowrap font-mono text-sm">{formatSignedAmount(report.currency, amount)}</p></div>)}</div>
      <Alert variant={report.reconciled ? "default" : "destructive"}><AlertTitle>{report.reconciled ? "Subledger agrees with the ledger" : "Ledger variance requires review"}</AlertTitle><AlertDescription>
        Control account {report.accountCode} · {report.accountName}: {formatSignedAmount(report.currency, report.ledgerBalance)}. Difference from outstanding documents: {formatSignedAmount(report.currency, report.variance)}.
        {!report.reconciled ? " Review control-account adjustments and opening balances in Financial reports." : " This comparison does not establish bank reconciliation."}
      </AlertDescription></Alert>
      {report.openCount > 50_000 ? <p className="text-sm text-muted-foreground">CSV export supports up to 50,000 open documents. This report exceeds that limit; all documents remain available through the page controls.</p> : null}
      <Table><TableHeader><TableRow>{["Document / party", "Issued", "Due", "Days past due", "Original", "Settled as of date", "Outstanding", "Record settlement"].map(label => <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader><TableBody>
        {report.rows.length === 0 ? <TableRow><TableCell colSpan={8}>No open posted documents as of this date.</TableCell></TableRow> : report.rows.map(row => <TableRow key={row.documentId}>
          <TableCell><span className="font-medium">{row.documentNumber}</span><span className="block text-xs text-muted-foreground">{row.partyName}</span></TableCell>
          <TableCell className="whitespace-nowrap">{row.issueDate}</TableCell><TableCell className="whitespace-nowrap">{row.dueDate}</TableCell><TableCell>{row.daysPastDue}</TableCell>
          {[row.original, row.settled, row.outstanding].map((amount, i) => <TableCell key={i} className="whitespace-nowrap font-mono">{formatSignedAmount(report.currency, amount)}</TableCell>)}
          <TableCell><SettlementAmountForm kind={scope.kind} documentId={row.documentId} documentNumber={row.documentNumber} issueDate={row.issueDate} currency={report.currency} outstanding={row.outstanding} asOf={report.asOf} /></TableCell>
        </TableRow>)}
      </TableBody></Table>
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm">{report.openCount ? `${report.offset + 1}–${report.offset + report.rows.length}` : "0"} of {report.openCount.toLocaleString()}</p><div className="flex gap-2">
        <Button variant="outline" disabled={report.offset === 0 || exporting} onClick={() => setRequest({ ...request, offset: Math.max(0, report.offset - 100), revision: report.revision })}>Previous aging page</Button>
        <Button variant="outline" disabled={report.offset + report.rows.length >= report.openCount || exporting} onClick={() => setRequest({ ...request, offset: report.offset + 100, revision: report.revision })}>Next aging page</Button>
      </div></div>
    </> : null}
  </div>;
}

export function SubledgerAging({ kind }: { kind: AgingKind }) {
  const entities = useReportEntities();
  const [entityId, setEntityId] = useState(""), [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const [generation, setGeneration] = useState(0), [scope, setScope] = useState<AgingRequest | null>(null);
  return <section className="my-6 space-y-4 rounded-xl border bg-card p-5" aria-label={kind === "ar" ? "Receivables aging" : "Payables aging"}>
    <div><h2 className="text-lg font-semibold">{kind === "ar" ? "Receivables" : "Payables"} aging</h2><p className="text-sm text-muted-foreground">Open posted documents by due date, with dated credits, settlements and corrections. <Link to="/settings" className="underline">Manage posting accounts</Link></p></div>
    <form className="flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); if (!entityId || !isReportDate(asOf)) return; setScope({ entityId, kind, asOf, offset: 0, pageSize: 100 }); setGeneration(value => value + 1); }}>
      <div className="space-y-1"><Label htmlFor={kind + "-aging-entity"}>Aging entity</Label><select id={kind + "-aging-entity"} className="h-10 rounded border bg-background px-3 text-sm" value={entityId} disabled={entities.isFetching || entities.isError} required onChange={event => { setEntityId(event.target.value); setScope(null); }}><option value="">Select entity</option>{entities.data?.map(entity => <option key={entity.id} value={entity.id}>{entity.name} · {entity.currency}</option>)}</select></div>
      <div className="space-y-1"><Label htmlFor={kind + "-aging-date"}>Aging as of</Label><Input id={kind + "-aging-date"} type="date" min="0001-01-01" max="9999-12-31" value={asOf} required onChange={event => { setAsOf(event.target.value); setScope(null); }}/></div>
      <Button type="submit" disabled={entities.isFetching || entities.isError || !entityId || !isReportDate(asOf)}>Generate aging</Button>
    </form>
    {entities.isError ? <p role="alert" className="text-sm text-destructive">Entities are unavailable. Refresh before generating aging.</p> : null}
    {scope && !entities.isError ? <AgingResult key={`${scope.entityId}:${scope.asOf}:${generation}`} scope={scope} generation={generation}/> : null}
  </section>;
}
