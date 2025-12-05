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
  Mail,
  MoreHorizontal,
  Users,
  DollarSign,
  Clock,
  AlertCircle,
  FileText,
} from "lucide-react";
import { useReceivables } from "@/hooks/useReceivables";
import { format } from "date-fns";

const statusConfig = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
  sent: { label: "Sent", className: "bg-cash/10 text-cash" },
  paid: { label: "Paid", className: "bg-success/10 text-success" },
  overdue: { label: "Overdue", className: "bg-destructive/10 text-destructive" },
};

const Receivables = () => {
  const { customers, invoices, stats, isLoading } = useReceivables();

  return (
    <AppLayout title="Accounts Receivable" subtitle="Manage invoices and collections">
      {/* Summary Cards */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2.5">
              <DollarSign className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total AR</p>
              {isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <p className="text-2xl font-bold text-foreground">
                  ${stats.totalAR.toLocaleString()}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-destructive/10 p-2.5">
              <AlertCircle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Overdue</p>
              {isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <p className="text-2xl font-bold text-destructive">
                  ${stats.overdueAR.toLocaleString()}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-cash/10 p-2.5">
              <Clock className="h-5 w-5 text-cash" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Avg DSO</p>
              <p className="text-2xl font-bold text-foreground">— days</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-success/10 p-2.5">
              <Users className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Customers</p>
              {isLoading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <p className="text-2xl font-bold text-foreground">{stats.customerCount}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="mt-6 rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Recent Invoices</h3>
            <p className="text-sm text-muted-foreground">Track and manage outstanding invoices</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search invoices..." className="w-64 pl-9" />
            </div>
            <Button variant="outline" size="icon">
              <Filter className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon">
              <Download className="h-4 w-4" />
            </Button>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              New Invoice
            </Button>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-muted-foreground">Invoice</TableHead>
              <TableHead className="text-muted-foreground">Customer</TableHead>
              <TableHead className="text-muted-foreground">Amount</TableHead>
              <TableHead className="text-muted-foreground">Due Date</TableHead>
              <TableHead className="text-muted-foreground">Status</TableHead>
              <TableHead className="text-muted-foreground">Days Overdue</TableHead>
              <TableHead className="text-muted-foreground w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="border-border">
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                </TableRow>
              ))
            ) : invoices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <FileText className="h-8 w-8" />
                    <p>No invoices found</p>
                    <Button variant="outline" size="sm" className="mt-2 gap-2">
                      <Plus className="h-4 w-4" />
                      Create your first invoice
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              invoices.map((invoice) => {
                const status = statusConfig[invoice.status as keyof typeof statusConfig] || statusConfig.draft;
                return (
                  <TableRow key={invoice.id} className="border-border">
                    <TableCell className="font-medium text-foreground">
                      {invoice.invoice_number}
                    </TableCell>
                    <TableCell className="text-foreground">{invoice.customer_name}</TableCell>
                    <TableCell className="font-medium text-foreground">
                      ${invoice.total.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(invoice.due_date), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell>
                      <Badge className={cn("font-medium", status.className)}>
                        {status.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {invoice.days_overdue > 0 ? (
                        <span className="text-destructive font-medium">
                          {invoice.days_overdue} days
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Customers Table */}
      <div className="mt-6 rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Customer Balances</h3>
            <p className="text-sm text-muted-foreground">AR aging by customer</p>
          </div>
          <Button variant="outline" className="gap-2">
            <Mail className="h-4 w-4" />
            Send Reminders
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-muted-foreground">Customer</TableHead>
              <TableHead className="text-muted-foreground text-right">Total Owed</TableHead>
              <TableHead className="text-muted-foreground text-right">Current</TableHead>
              <TableHead className="text-muted-foreground text-right">1-30 Days</TableHead>
              <TableHead className="text-muted-foreground text-right">31-60 Days</TableHead>
              <TableHead className="text-muted-foreground text-right">61-90+ Days</TableHead>
              <TableHead className="text-muted-foreground w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="border-border">
                  <TableCell><Skeleton className="h-10 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                </TableRow>
              ))
            ) : customers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Users className="h-8 w-8" />
                    <p>No outstanding balances</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              customers.map((customer) => (
                <TableRow key={customer.id} className="border-border">
                  <TableCell>
                    <div>
                      <p className="font-medium text-foreground">{customer.name}</p>
                      <p className="text-sm text-muted-foreground">{customer.email || "—"}</p>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-semibold text-foreground">
                    ${customer.totalOwed.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right text-success">
                    ${customer.current.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right text-warning">
                    {customer.overdue30 > 0 ? `$${customer.overdue30.toLocaleString()}` : "—"}
                  </TableCell>
                  <TableCell className="text-right text-orange-500">
                    {customer.overdue60 > 0 ? `$${customer.overdue60.toLocaleString()}` : "—"}
                  </TableCell>
                  <TableCell className="text-right text-destructive">
                    {customer.overdue90 > 0 ? `$${customer.overdue90.toLocaleString()}` : "—"}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <Mail className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </AppLayout>
  );
};

export default Receivables;
