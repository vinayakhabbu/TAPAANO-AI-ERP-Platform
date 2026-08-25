import { AlertTriangle, Building2, Landmark } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useBankAccounts, useBankTransactions } from "@/hooks/useBanking";

const Banking = () => {
  const { data: accounts = [], isLoading: accountsLoading } = useBankAccounts();
  const { data: transactions = [], isLoading: transactionsLoading } = useBankTransactions();

  return (
    <AppLayout title="Banking containment" subtitle="Non-secret read-only preservation metadata">
      <Alert className="border-warning/40 bg-warning/5">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Reconciliation and bank execution are unavailable</AlertTitle>
        <AlertDescription>
          Account and routing identifiers, connection metadata, balances, transaction amounts,
          match results, statement imports, feeds, and positive-pay controls are hidden and immutable.
          The metadata below is not proof of cash, reconciliation, posting, or bank activity.
        </AlertDescription>
      </Alert>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">Tenant account metadata rows</p>
          {accountsLoading ? <Skeleton className="mt-2 h-8 w-16" /> : <p className="mt-2 text-2xl font-bold">{accounts.length}</p>}
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">Tenant transaction metadata rows</p>
          {transactionsLoading ? <Skeleton className="mt-2 h-8 w-16" /> : <p className="mt-2 text-2xl font-bold">{transactions.length}</p>}
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-border bg-card">
        <div className="border-b border-border p-5">
          <h2 className="flex items-center gap-2 font-semibold"><Building2 className="h-5 w-5" />Account metadata</h2>
          <p className="text-sm text-muted-foreground">No credentials, account numbers, routing numbers, or balances are exposed.</p>
        </div>
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Institution label</TableHead><TableHead>Currency label</TableHead><TableHead>Evidence</TableHead></TableRow></TableHeader>
          <TableBody>
            {accountsLoading ? <TableRow><TableCell colSpan={4}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
              : accounts.length === 0 ? <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">No account metadata.</TableCell></TableRow>
              : accounts.map((account) => (
                <TableRow key={account.id}>
                  <TableCell>{account.name}</TableCell><TableCell>{account.bank_name ?? "—"}</TableCell>
                  <TableCell>{account.currency}</TableCell><TableCell><Badge variant="outline">Unverified legacy</Badge></TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      <div className="mt-6 rounded-xl border border-border bg-card">
        <div className="border-b border-border p-5">
          <h2 className="flex items-center gap-2 font-semibold"><Landmark className="h-5 w-5" />Transaction metadata</h2>
          <p className="text-sm text-muted-foreground">Descriptions and dates only; amounts and match/reconciliation claims are withheld.</p>
        </div>
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Description</TableHead><TableHead>Evidence</TableHead></TableRow></TableHeader>
          <TableBody>
            {transactionsLoading ? <TableRow><TableCell colSpan={3}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
              : transactions.length === 0 ? <TableRow><TableCell colSpan={3} className="h-24 text-center text-muted-foreground">No transaction metadata.</TableCell></TableRow>
              : transactions.map((transaction) => (
                <TableRow key={transaction.id}>
                  <TableCell>{transaction.transaction_date}</TableCell><TableCell>{transaction.description ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline">Unverified legacy</Badge></TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>
    </AppLayout>
  );
};

export default Banking;
