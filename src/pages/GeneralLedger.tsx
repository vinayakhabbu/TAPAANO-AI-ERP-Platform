import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  Search,
  Plus,
  Filter,
  Download,
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
} from "lucide-react";
import { useState, useMemo } from "react";
import { useAccounts, useJournalEntries, useAccountBalances } from "@/hooks/useGeneralLedger";
import { useJournalEntryApproval } from "@/hooks/useApprovals";
import { ApprovalActions } from "@/components/ApprovalActions";
import { format } from "date-fns";

const statusConfig = {
  draft: { label: "Draft", className: "bg-warning/10 text-warning" },
  posted: { label: "Posted", className: "bg-success/10 text-success" },
  reversed: { label: "Reversed", className: "bg-muted text-muted-foreground" },
};

const typeConfig = {
  asset: { className: "text-cash" },
  liability: { className: "text-warning" },
  equity: { className: "text-primary" },
  revenue: { className: "text-success" },
  expense: { className: "text-destructive" },
};

const GeneralLedger = () => {
  const [expandedAccounts, setExpandedAccounts] = useState<string[]>([]);
  const { data: accounts, isLoading: accountsLoading } = useAccounts();
  const { data: journalEntries, isLoading: entriesLoading } = useJournalEntries();
  const { data: balances } = useAccountBalances();
  
  // Journal entry approval
  const journalApproval = useJournalEntryApproval();

  const toggleAccount = (id: string) => {
    setExpandedAccounts((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // Build account tree structure
  const { accountTree, totals } = useMemo(() => {
    if (!accounts) return { accountTree: [], totals: { assets: 0, liabilities: 0, equity: 0 } };

    // Find parent accounts (those without parent_id)
    const parents = accounts.filter((a) => !a.parent_id);
    const children = accounts.filter((a) => a.parent_id);

    const tree = parents.map((parent) => ({
      ...parent,
      isParent: children.some((c) => c.parent_id === parent.id),
      children: children.filter((c) => c.parent_id === parent.id),
      balance: balances?.[parent.id] || 0,
    }));

    // Calculate totals by type
    const totals = {
      assets: accounts
        .filter((a) => a.account_type === "asset")
        .reduce((sum, a) => sum + (balances?.[a.id] || 0), 0),
      liabilities: accounts
        .filter((a) => a.account_type === "liability")
        .reduce((sum, a) => sum + (balances?.[a.id] || 0), 0),
      equity: accounts
        .filter((a) => a.account_type === "equity")
        .reduce((sum, a) => sum + (balances?.[a.id] || 0), 0),
    };

    return { accountTree: tree, totals };
  }, [accounts, balances]);

  // Flatten visible accounts based on expansion state
  const visibleAccounts = useMemo(() => {
    const result: Array<{
      id: string;
      code: string;
      name: string;
      account_type: string;
      isParent: boolean;
      indent: number;
      balance: number;
    }> = [];

    accountTree.forEach((parent) => {
      result.push({
        id: parent.id,
        code: parent.code,
        name: parent.name,
        account_type: parent.account_type,
        isParent: parent.isParent,
        indent: 0,
        balance: parent.balance,
      });

      if (expandedAccounts.includes(parent.id) && parent.children) {
        parent.children.forEach((child) => {
          result.push({
            id: child.id,
            code: child.code,
            name: child.name,
            account_type: child.account_type,
            isParent: false,
            indent: 1,
            balance: balances?.[child.id] || 0,
          });
        });
      }
    });

    return result;
  }, [accountTree, expandedAccounts, balances]);

  const assetCount = accounts?.filter((a) => a.account_type === "asset").length || 0;
  const liabilityCount = accounts?.filter((a) => a.account_type === "liability").length || 0;

  return (
    <AppLayout title="General Ledger" subtitle="Chart of accounts and journal entries">
      {/* Trial Balance Summary */}
      <div className="grid gap-6 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="text-sm font-medium text-muted-foreground">Total Assets</h3>
          {accountsLoading ? (
            <Skeleton className="mt-2 h-9 w-32" />
          ) : (
            <>
              <p className="mt-2 text-3xl font-bold text-cash">
                ${Math.abs(totals.assets).toLocaleString()}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{assetCount} accounts</p>
            </>
          )}
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="text-sm font-medium text-muted-foreground">Total Liabilities</h3>
          {accountsLoading ? (
            <Skeleton className="mt-2 h-9 w-32" />
          ) : (
            <>
              <p className="mt-2 text-3xl font-bold text-warning">
                ${Math.abs(totals.liabilities).toLocaleString()}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{liabilityCount} accounts</p>
            </>
          )}
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="text-sm font-medium text-muted-foreground">Total Equity</h3>
          {accountsLoading ? (
            <Skeleton className="mt-2 h-9 w-32" />
          ) : (
            <>
              <p className="mt-2 text-3xl font-bold text-primary">
                ${Math.abs(totals.equity).toLocaleString()}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">Retained + Current</p>
            </>
          )}
        </div>
      </div>

      {/* Chart of Accounts */}
      <div className="mt-6 rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Chart of Accounts</h3>
            <p className="text-sm text-muted-foreground">Account hierarchy and balances</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search accounts..." className="w-64 pl-9" />
            </div>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              New Account
            </Button>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-muted-foreground w-24">Code</TableHead>
              <TableHead className="text-muted-foreground">Account Name</TableHead>
              <TableHead className="text-muted-foreground">Type</TableHead>
              <TableHead className="text-muted-foreground text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accountsLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="border-border">
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                </TableRow>
              ))
            ) : visibleAccounts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  No accounts found
                </TableCell>
              </TableRow>
            ) : (
              visibleAccounts.map((account) => {
                const isExpanded = expandedAccounts.includes(account.id);
                const typeClass = typeConfig[account.account_type as keyof typeof typeConfig];

                return (
                  <TableRow key={account.id} className="border-border">
                    <TableCell className="font-mono text-muted-foreground">
                      {account.code}
                    </TableCell>
                    <TableCell>
                      <div
                        className="flex items-center gap-2"
                        style={{ paddingLeft: account.indent * 24 }}
                      >
                        {account.isParent ? (
                          <button
                            onClick={() => toggleAccount(account.id)}
                            className="flex h-5 w-5 items-center justify-center rounded hover:bg-muted"
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                          </button>
                        ) : (
                          <span className="w-5" />
                        )}
                        {account.isParent ? (
                          isExpanded ? (
                            <FolderOpen className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <Folder className="h-4 w-4 text-muted-foreground" />
                          )
                        ) : null}
                        <span className={cn("font-medium", account.isParent ? "text-foreground" : "text-muted-foreground")}>
                          {account.name}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={cn("capitalize", typeClass?.className)}>
                        {account.account_type}
                      </span>
                    </TableCell>
                    <TableCell className={cn("text-right font-semibold", typeClass?.className)}>
                      ${Math.abs(account.balance).toLocaleString()}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Journal Entries */}
      <div className="mt-6 rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Recent Journal Entries</h3>
            <p className="text-sm text-muted-foreground">Manual adjustments and entries</p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="icon">
              <Filter className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon">
              <Download className="h-4 w-4" />
            </Button>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              New Entry
            </Button>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-muted-foreground">Entry #</TableHead>
              <TableHead className="text-muted-foreground">Date</TableHead>
              <TableHead className="text-muted-foreground">Memo</TableHead>
              <TableHead className="text-muted-foreground text-right">Debit</TableHead>
              <TableHead className="text-muted-foreground text-right">Credit</TableHead>
              <TableHead className="text-muted-foreground">Status</TableHead>
              <TableHead className="text-muted-foreground w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entriesLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="border-border">
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                </TableRow>
              ))
            ) : journalEntries?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No journal entries found
                </TableCell>
              </TableRow>
            ) : (
              journalEntries?.map((entry) => {
                const status = statusConfig[entry.status as keyof typeof statusConfig] || statusConfig.draft;
                const totalDebit = entry.journal_lines?.reduce((sum, l) => sum + Number(l.debit || 0), 0) || 0;
                const totalCredit = entry.journal_lines?.reduce((sum, l) => sum + Number(l.credit || 0), 0) || 0;

                return (
                  <TableRow key={entry.id} className="border-border">
                    <TableCell className="font-medium text-foreground">
                      {entry.entry_number}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(entry.entry_date), "yyyy-MM-dd")}
                    </TableCell>
                    <TableCell className="text-foreground">{entry.memo || "—"}</TableCell>
                    <TableCell className="text-right font-medium text-foreground">
                      ${totalDebit.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-medium text-foreground">
                      ${totalCredit.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge className={cn("font-medium", status.className)}>
                        {status.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <ApprovalActions
                        documentType="journal_entry"
                        documentId={entry.id}
                        currentStatus={entry.status}
                        onPost={(rationale) => journalApproval.mutate({ id: entry.id, action: "post", rationale })}
                        onReverse={(rationale) => journalApproval.mutate({ id: entry.id, action: "reverse", rationale })}
                        isLoading={journalApproval.isPending}
                      />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </AppLayout>
  );
};

export default GeneralLedger;
