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
import { cn } from "@/lib/utils";
import {
  Search,
  Plus,
  Filter,
  Download,
  Mail,
  MoreHorizontal,
  TrendingUp,
  TrendingDown,
  Users,
  DollarSign,
  Clock,
  AlertCircle,
} from "lucide-react";

// Demo data
const customers = [
  {
    id: "1",
    name: "TechStart Inc",
    email: "billing@techstart.com",
    totalOwed: 28200,
    current: 12000,
    overdue30: 8200,
    overdue60: 5000,
    overdue90: 3000,
    lastPayment: "2024-11-15",
    creditLimit: 50000,
  },
  {
    id: "2",
    name: "GlobalTech Corp",
    email: "accounts@globaltech.com",
    totalOwed: 45600,
    current: 45600,
    overdue30: 0,
    overdue60: 0,
    overdue90: 0,
    lastPayment: "2024-11-28",
    creditLimit: 100000,
  },
  {
    id: "3",
    name: "CloudFirst Ltd",
    email: "finance@cloudfirst.io",
    totalOwed: 16400,
    current: 4200,
    overdue30: 6100,
    overdue60: 4200,
    overdue90: 1900,
    lastPayment: "2024-10-22",
    creditLimit: 30000,
  },
  {
    id: "4",
    name: "DataFlow Corp",
    email: "ap@dataflow.com",
    totalOwed: 9800,
    current: 8000,
    overdue30: 1800,
    overdue60: 0,
    overdue90: 0,
    lastPayment: "2024-11-20",
    creditLimit: 25000,
  },
  {
    id: "5",
    name: "WebSolutions",
    email: "billing@websolutions.net",
    totalOwed: 7100,
    current: 6000,
    overdue30: 1100,
    overdue60: 0,
    overdue90: 0,
    lastPayment: "2024-11-25",
    creditLimit: 20000,
  },
];

const invoices = [
  { id: "INV-1042", customer: "TechStart Inc", amount: 8200, dueDate: "2024-10-15", status: "overdue", daysOverdue: 51 },
  { id: "INV-1043", customer: "GlobalTech Corp", amount: 15600, dueDate: "2024-12-15", status: "sent", daysOverdue: 0 },
  { id: "INV-1044", customer: "CloudFirst Ltd", amount: 4200, dueDate: "2024-11-01", status: "overdue", daysOverdue: 34 },
  { id: "INV-1045", customer: "DataFlow Corp", amount: 3200, dueDate: "2024-12-10", status: "sent", daysOverdue: 0 },
  { id: "INV-1046", customer: "TechStart Inc", amount: 5000, dueDate: "2024-10-25", status: "overdue", daysOverdue: 41 },
  { id: "INV-1047", customer: "WebSolutions", amount: 1100, dueDate: "2024-11-10", status: "overdue", daysOverdue: 25 },
];

const statusConfig = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
  sent: { label: "Sent", className: "bg-cash/10 text-cash" },
  paid: { label: "Paid", className: "bg-success/10 text-success" },
  overdue: { label: "Overdue", className: "bg-destructive/10 text-destructive" },
};

const Receivables = () => {
  const totalAR = customers.reduce((sum, c) => sum + c.totalOwed, 0);
  const overdueAR = customers.reduce((sum, c) => sum + c.overdue30 + c.overdue60 + c.overdue90, 0);

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
              <p className="text-2xl font-bold text-foreground">
                ${totalAR.toLocaleString()}
              </p>
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
              <p className="text-2xl font-bold text-destructive">
                ${overdueAR.toLocaleString()}
              </p>
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
              <p className="text-2xl font-bold text-foreground">42 days</p>
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
              <p className="text-2xl font-bold text-foreground">{customers.length}</p>
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
            {invoices.map((invoice) => {
              const status = statusConfig[invoice.status as keyof typeof statusConfig];
              return (
                <TableRow key={invoice.id} className="border-border">
                  <TableCell className="font-medium text-foreground">
                    {invoice.id}
                  </TableCell>
                  <TableCell className="text-foreground">{invoice.customer}</TableCell>
                  <TableCell className="font-medium text-foreground">
                    ${invoice.amount.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{invoice.dueDate}</TableCell>
                  <TableCell>
                    <Badge className={cn("font-medium", status.className)}>
                      {status.label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {invoice.daysOverdue > 0 ? (
                      <span className="text-destructive font-medium">
                        {invoice.daysOverdue} days
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
            })}
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
            {customers.map((customer) => (
              <TableRow key={customer.id} className="border-border">
                <TableCell>
                  <div>
                    <p className="font-medium text-foreground">{customer.name}</p>
                    <p className="text-sm text-muted-foreground">{customer.email}</p>
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
            ))}
          </TableBody>
        </Table>
      </div>
    </AppLayout>
  );
};

export default Receivables;
