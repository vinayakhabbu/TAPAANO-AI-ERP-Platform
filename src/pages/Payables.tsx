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
  CreditCard,
  MoreHorizontal,
  DollarSign,
  Clock,
  AlertCircle,
  Building2,
} from "lucide-react";

const vendors = [
  { id: "1", name: "AWS Services", category: "Cloud Infrastructure", balance: 12500, paymentTerms: 30 },
  { id: "2", name: "Microsoft 365", category: "Software", balance: 4800, paymentTerms: 30 },
  { id: "3", name: "WeWork", category: "Office Space", balance: 8500, paymentTerms: 15 },
  { id: "4", name: "Salesforce", category: "Software", balance: 6200, paymentTerms: 30 },
  { id: "5", name: "FedEx", category: "Shipping", balance: 1200, paymentTerms: 15 },
];

const bills = [
  { id: "BILL-2024-089", vendor: "AWS Services", amount: 4500, dueDate: "2024-12-06", status: "pending", category: "Cloud Infrastructure" },
  { id: "BILL-2024-090", vendor: "Microsoft 365", amount: 1600, dueDate: "2024-12-10", status: "pending", category: "Software" },
  { id: "BILL-2024-091", vendor: "WeWork", amount: 8500, dueDate: "2024-12-01", status: "overdue", category: "Office Space" },
  { id: "BILL-2024-092", vendor: "Salesforce", amount: 3100, dueDate: "2024-12-15", status: "pending", category: "Software" },
  { id: "BILL-2024-093", vendor: "FedEx", amount: 450, dueDate: "2024-12-08", status: "pending", category: "Shipping" },
  { id: "BILL-2024-088", vendor: "AWS Services", amount: 8000, dueDate: "2024-11-25", status: "paid", category: "Cloud Infrastructure" },
];

const statusConfig = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
  pending: { label: "Pending", className: "bg-warning/10 text-warning" },
  paid: { label: "Paid", className: "bg-success/10 text-success" },
  overdue: { label: "Overdue", className: "bg-destructive/10 text-destructive" },
};

const Payables = () => {
  const totalAP = vendors.reduce((sum, v) => sum + v.balance, 0);
  const dueThisWeek = bills.filter(b => b.status === "pending").reduce((sum, b) => sum + b.amount, 0);
  const overdue = bills.filter(b => b.status === "overdue").reduce((sum, b) => sum + b.amount, 0);

  return (
    <AppLayout title="Accounts Payable" subtitle="Manage bills and vendor payments">
      {/* Summary Cards */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2.5">
              <DollarSign className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total AP</p>
              <p className="text-2xl font-bold text-foreground">
                ${totalAP.toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-warning/10 p-2.5">
              <Clock className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Due This Week</p>
              <p className="text-2xl font-bold text-warning">
                ${dueThisWeek.toLocaleString()}
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
                ${overdue.toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-success/10 p-2.5">
              <Building2 className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Vendors</p>
              <p className="text-2xl font-bold text-foreground">{vendors.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Bills Table */}
      <div className="mt-6 rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Bills</h3>
            <p className="text-sm text-muted-foreground">Track and pay vendor bills</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search bills..." className="w-64 pl-9" />
            </div>
            <Button variant="outline" size="icon">
              <Filter className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon">
              <Download className="h-4 w-4" />
            </Button>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              New Bill
            </Button>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-muted-foreground">Bill #</TableHead>
              <TableHead className="text-muted-foreground">Vendor</TableHead>
              <TableHead className="text-muted-foreground">Category</TableHead>
              <TableHead className="text-muted-foreground">Amount</TableHead>
              <TableHead className="text-muted-foreground">Due Date</TableHead>
              <TableHead className="text-muted-foreground">Status</TableHead>
              <TableHead className="text-muted-foreground w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bills.map((bill) => {
              const status = statusConfig[bill.status as keyof typeof statusConfig];
              return (
                <TableRow key={bill.id} className="border-border">
                  <TableCell className="font-medium text-foreground">
                    {bill.id}
                  </TableCell>
                  <TableCell className="text-foreground">{bill.vendor}</TableCell>
                  <TableCell className="text-muted-foreground">{bill.category}</TableCell>
                  <TableCell className="font-medium text-foreground">
                    ${bill.amount.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{bill.dueDate}</TableCell>
                  <TableCell>
                    <Badge className={cn("font-medium", status.className)}>
                      {status.label}
                    </Badge>
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

      {/* Vendors Table */}
      <div className="mt-6 rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Vendors</h3>
            <p className="text-sm text-muted-foreground">Manage vendor relationships</p>
          </div>
          <Button variant="outline" className="gap-2">
            <CreditCard className="h-4 w-4" />
            Schedule Payments
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-muted-foreground">Vendor</TableHead>
              <TableHead className="text-muted-foreground">Category</TableHead>
              <TableHead className="text-muted-foreground">Payment Terms</TableHead>
              <TableHead className="text-muted-foreground text-right">Balance</TableHead>
              <TableHead className="text-muted-foreground w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vendors.map((vendor) => (
              <TableRow key={vendor.id} className="border-border">
                <TableCell className="font-medium text-foreground">
                  {vendor.name}
                </TableCell>
                <TableCell className="text-muted-foreground">{vendor.category}</TableCell>
                <TableCell className="text-muted-foreground">Net {vendor.paymentTerms}</TableCell>
                <TableCell className="text-right font-semibold text-foreground">
                  ${vendor.balance.toLocaleString()}
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
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

export default Payables;
