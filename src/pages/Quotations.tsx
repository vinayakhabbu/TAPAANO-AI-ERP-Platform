import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, FileText, MoreHorizontal, ArrowRight, Send, X } from "lucide-react";
import { useQuotations, useUpdateQuotationStatus, useConvertToSalesOrder } from "@/hooks/useQuotations";
import { QuotationForm } from "@/components/forms/QuotationForm";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  accepted: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  expired: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  converted: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
};

export default function Quotations() {
  const [formOpen, setFormOpen] = useState(false);
  const { data: quotations, isLoading } = useQuotations();
  const updateStatus = useUpdateQuotationStatus();
  const convertToSO = useConvertToSalesOrder();
  const { toast } = useToast();

  const handleStatusUpdate = async (id: string, status: "sent" | "accepted" | "rejected") => {
    try {
      await updateStatus.mutateAsync({ id, status });
      toast({ title: "Status Updated", description: `Quotation marked as ${status}` });
    } catch {
      toast({ title: "Error", description: "Failed to update status", variant: "destructive" });
    }
  };

  const handleConvert = async (id: string) => {
    try {
      await convertToSO.mutateAsync(id);
      toast({ title: "Converted", description: "Sales Order created from quotation" });
    } catch {
      toast({ title: "Error", description: "Failed to convert", variant: "destructive" });
    }
  };

  const stats = {
    total: quotations?.length || 0,
    draft: quotations?.filter((q) => q.status === "draft").length || 0,
    sent: quotations?.filter((q) => q.status === "sent").length || 0,
    accepted: quotations?.filter((q) => q.status === "accepted").length || 0,
  };

  return (
    <AppLayout title="Quotations">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Quotations</h1>
            <p className="text-muted-foreground">
              Create and manage customer quotations
            </p>
          </div>
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> New Quotation
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Quotes</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Draft</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.draft}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Sent</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.sent}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Accepted</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.accepted}</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All Quotations</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-muted-foreground">Loading...</p>
            ) : quotations?.length === 0 ? (
              <p className="text-muted-foreground">No quotations yet</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quote #</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Valid Until</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quotations?.map((quote) => (
                    <TableRow key={quote.id}>
                      <TableCell className="font-medium">{quote.quote_number}</TableCell>
                      <TableCell>{quote.customers?.name || "—"}</TableCell>
                      <TableCell>{format(new Date(quote.quote_date), "MMM d, yyyy")}</TableCell>
                      <TableCell>
                        {quote.valid_until
                          ? format(new Date(quote.valid_until), "MMM d, yyyy")
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        ${quote.total.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell>
                        <Badge className={statusColors[quote.status]}>
                          {quote.status.charAt(0).toUpperCase() + quote.status.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {quote.status === "draft" && (
                              <DropdownMenuItem onClick={() => handleStatusUpdate(quote.id, "sent")}>
                                <Send className="h-4 w-4 mr-2" /> Mark as Sent
                              </DropdownMenuItem>
                            )}
                            {quote.status === "sent" && (
                              <>
                                <DropdownMenuItem
                                  onClick={() => handleStatusUpdate(quote.id, "accepted")}
                                >
                                  <ArrowRight className="h-4 w-4 mr-2" /> Mark Accepted
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleStatusUpdate(quote.id, "rejected")}
                                >
                                  <X className="h-4 w-4 mr-2" /> Mark Rejected
                                </DropdownMenuItem>
                              </>
                            )}
                            {quote.status === "accepted" && (
                              <DropdownMenuItem onClick={() => handleConvert(quote.id)}>
                                <ArrowRight className="h-4 w-4 mr-2" /> Convert to Sales Order
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <QuotationForm open={formOpen} onOpenChange={setFormOpen} />
    </AppLayout>
  );
}
