import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Lock,
} from "lucide-react";
import { useState, useMemo } from "react";
import { useAccounts, useJournalEntries } from "@/hooks/useGeneralLedger";
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
  const [accountSearch, setAccountSearch] = useState("");
  const { data: accounts, isLoading: accountsLoading, isError: accountsError } = useAccounts();
  const { data: journalEntries, isLoading: entriesLoading, isError: entriesError } = useJournalEntries();
  
  const toggleAccount = (id: string) => {
    setExpandedAccounts((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // Build account tree structure
  const accountTree = useMemo(() => {
    if (!accounts) return [];

    // Find parent accounts (those without parent_id)
    const parents = accounts.filter((a) => !a.parent_id);
    const children = accounts.filter((a) => a.parent_id);

    const tree = parents.map((parent) => ({
      ...parent,
      isParent: children.some((c) => c.parent_id === parent.id),
      children: children.filter((c) => c.parent_id === parent.id),
    }));

    return tree;
  }, [accounts]);

  // Flatten visible accounts based on expansion state
  const visibleAccounts = useMemo(() => {
    const result: Array<{
      id: string;
      code: string;
      name: string;
      account_type: string;
      isParent: boolean;
      indent: number;
    }> = [];

    accountTree.forEach((parent) => {
      result.push({
        id: parent.id,
        code: parent.code,
        name: parent.name,
        account_type: parent.account_type,
        isParent: parent.isParent,
        indent: 0,
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
          });
        });
      }
    });

    return result;
  }, [accountTree, expandedAccounts]);

  const normalizedSearch = accountSearch.trim().toLowerCase();
  const displayedAccounts = normalizedSearch
    ? visibleAccounts.filter((account) => (
        account.code.toLowerCase().includes(normalizedSearch)
        || account.name.toLowerCase().includes(normalizedSearch)
      ))
    : visibleAccounts;

  const assetCount = accounts?.filter((a) => a.account_type === "asset").length || 0;
  const liabilityCount = accounts?.filter((a) => a.account_type === "liability").length || 0;
  const equityCount = accounts?.filter((a) => a.account_type === "equity").length || 0;

  return (
    <AppLayout title="General Ledger" subtitle="Chart of accounts and immutable posted-journal history">
      <Tabs defaultValue="chart" className="space-y-6">
        <TabsList className="h-auto flex-wrap gap-1 p-1 bg-muted/50">
          <TabsTrigger value="chart" className="gap-2 text-xs sm:text-sm">
            <Folder className="h-4 w-4" />
            <span className="hidden sm:inline">Chart of Accounts</span>
            <span className="sm:hidden">CoA</span>
          </TabsTrigger>
          <TabsTrigger value="journals" className="gap-2 text-xs sm:text-sm">
            <FileOpen className="h-4 w-4" />
            <span className="hidden sm:inline">Journal Entries</span>
            <span className="sm:hidden">JE</span>
          </TabsTrigger>
        </TabsList>

        {/* Chart of Accounts Tab */}
        <TabsContent value="chart">
          {/* Account classification summary. Amounts remain unavailable until reporting is verified. */}
          <div className="grid gap-6 sm:grid-cols-3 mb-6">
            <div className="rounded-xl border border-border bg-card p-6">
              <h3 className="text-sm font-medium text-muted-foreground">Asset accounts</h3>
              {accountsLoading ? (
                <Skeleton className="mt-2 h-9 w-32" />
              ) : accountsError ? (
                <p className="mt-2 text-lg font-semibold text-destructive">Unavailable</p>
              ) : (
                <>
                  <p className="mt-2 text-3xl font-bold text-cash">{assetCount}</p>
                  <p className="mt-1 text-sm text-muted-foreground">Active chart rows</p>
                </>
              )}
            </div>
            <div className="rounded-xl border border-border bg-card p-6">
              <h3 className="text-sm font-medium text-muted-foreground">Liability accounts</h3>
              {accountsLoading ? (
                <Skeleton className="mt-2 h-9 w-32" />
              ) : accountsError ? (
                <p className="mt-2 text-lg font-semibold text-destructive">Unavailable</p>
              ) : (
                <>
                  <p className="mt-2 text-3xl font-bold text-warning">{liabilityCount}</p>
                  <p className="mt-1 text-sm text-muted-foreground">Active chart rows</p>
                </>
              )}
            </div>
            <div className="rounded-xl border border-border bg-card p-6">
              <h3 className="text-sm font-medium text-muted-foreground">Equity accounts</h3>
              {accountsLoading ? (
                <Skeleton className="mt-2 h-9 w-32" />
              ) : accountsError ? (
                <p className="mt-2 text-lg font-semibold text-destructive">Unavailable</p>
              ) : (
                <>
                  <p className="mt-2 text-3xl font-bold text-primary">{equityCount}</p>
                  <p className="mt-1 text-sm text-muted-foreground">Active chart rows</p>
                </>
              )}
            </div>
          </div>

          {/* Chart of Accounts */}
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border p-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Chart of Accounts</h3>
                <p className="text-sm text-muted-foreground">Active tenant-scoped account hierarchy</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    aria-label="Search accounts"
                    placeholder="Search accounts..."
                    className="w-64 pl-9"
                    value={accountSearch}
                    onChange={(event) => setAccountSearch(event.target.value)}
                  />
                </div>
                <Button className="gap-2" disabled title="Use controlled account maintenance in Settings">
                  <Plus className="h-4 w-4" />
                  Managed in Settings
                </Button>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground w-24">Code</TableHead>
                  <TableHead className="text-muted-foreground">Account Name</TableHead>
                  <TableHead className="text-muted-foreground">Type</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accountsError ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-8 text-center text-destructive">
                      Chart of accounts is unavailable. Do not infer an empty ledger.
                    </TableCell>
                  </TableRow>
                ) : accountsLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i} className="border-border">
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    </TableRow>
                  ))
                ) : displayedAccounts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                      No accounts found
                    </TableCell>
                  </TableRow>
                ) : (
                  displayedAccounts.map((account) => {
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
                                aria-label={`${isExpanded ? "Collapse" : "Expand"} ${account.name}`}
                                onClick={() => toggleAccount(account.id)}
                                className="flex h-5 w-5 items-center justify-center rounded hover:bg-muted"
                                type="button"
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
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Journal Entries Tab */}
        <TabsContent value="journals">
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border p-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Journal Entries</h3>
                <p className="text-sm text-muted-foreground">Immutable posted-journal history</p>
              </div>
              <div className="flex items-center gap-3">
                <Button variant="outline" size="icon" disabled title="Journal filtering is not available">
                  <Filter className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" disabled title="Authoritative report export is not available">
                  <Download className="h-4 w-4" />
                </Button>
                <Button className="gap-2" disabled title="Use only an audited workflow-specific posting path">
                  <Lock className="h-4 w-4" />
                  Posting unavailable
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
                {entriesError ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-destructive">
                      Journal history is unavailable. Do not infer that no entries exist.
                    </TableCell>
                  </TableRow>
                ) : entriesLoading ? (
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
                          <span className="text-xs text-muted-foreground">Read-only</span>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

      </Tabs>
    </AppLayout>
  );
};

// Add missing import alias
const FileOpen = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M4 22h14a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v4" />
    <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    <path d="M3 15h6" />
    <path d="M6 12v6" />
  </svg>
);

export default GeneralLedger;
