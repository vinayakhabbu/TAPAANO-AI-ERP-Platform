import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deriveLedgerStatements, formatSignedAmount } from "@/lib/financeReports";
import type { TrialBalance } from "@/lib/trialBalance";

export function LedgerStatements({ report, kind, onAccount }: { report: TrialBalance; kind: "income" | "balance"; onAccount: (id: string) => void }) {
  const statements = deriveLedgerStatements(report);
  const groups = kind === "income" ? [statements.revenue, statements.expenses] : [statements.assets, statements.liabilities, statements.equity];
  return <section className="space-y-4" aria-label={kind === "income" ? "Income statement" : "Balance sheet"}>
    <p className="text-sm text-muted-foreground">{kind === "income" ? "Revenue and expense activity within the selected dates. All recorded adjustments and closing entries in that range are included." : "Account balances through the end date. Unclosed earnings include all revenue and expense balances still recorded outside equity."}</p>
    {groups.map(group => <div key={group.label} className="rounded-xl border bg-card"><h3 className="px-4 pt-4 font-semibold">{group.label}</h3><Table>
      <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Account</TableHead><TableHead className="text-right">{report.currency}</TableHead></TableRow></TableHeader>
      <TableBody>{group.rows.length === 0 ? <TableRow><TableCell colSpan={3}>No recorded accounts in this section.</TableCell></TableRow> : group.rows.map(row => <TableRow key={row.accountId}>
        <TableCell className="font-mono">{row.code}</TableCell><TableCell><button type="button" className="text-left text-primary underline underline-offset-4" onClick={() => onAccount(row.accountId)}>{row.name}</button></TableCell><TableCell className="text-right font-mono">{formatSignedAmount(report.currency, row.amount)}</TableCell>
      </TableRow>)}<TableRow className="font-semibold"><TableCell colSpan={2}>Total {group.label.toLowerCase()}</TableCell><TableCell className="text-right font-mono" data-testid={`statement-${group.label.toLowerCase().replace(/ /g, "-")}`}>{formatSignedAmount(report.currency, group.total)}</TableCell></TableRow></TableBody>
    </Table></div>)}
    <div className="space-y-2 rounded-xl border bg-card p-4">
      {kind === "income" ? <p className="flex justify-between gap-3 font-semibold">Net income / loss <span data-testid="statement-net-income">{formatSignedAmount(report.currency, statements.netIncome)}</span></p> : <>
        <p className="flex justify-between gap-3">Unclosed earnings through end date <span data-testid="statement-unclosed-earnings">{formatSignedAmount(report.currency, statements.unclosedEarnings)}</span></p>
        <p className="flex justify-between gap-3">Total equity including unclosed earnings <span>{formatSignedAmount(report.currency, statements.totalEquity)}</span></p>
        <p className="flex justify-between gap-3 font-semibold">Liabilities and equity <span data-testid="statement-liabilities-and-equity">{formatSignedAmount(report.currency, statements.liabilitiesAndEquity)}</span></p>
      </>}
    </div>
    <p className="text-xs text-muted-foreground">These ledger reports use recorded account classifications. Finance must review opening balances, adjustments, closing entries and presentation. Cash-flow statements, disclosures and statutory reporting are separate workflows.</p>
  </section>;
}
