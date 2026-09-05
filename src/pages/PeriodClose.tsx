import { format } from "date-fns";
import { Calendar, Lock, ShieldCheck } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAccountingPeriods } from "@/hooks/usePeriodClose";

const statusStyle = {
  OPEN: "bg-green-100 text-green-800",
  SOFT_CLOSED: "bg-amber-100 text-amber-800",
  HARD_CLOSED: "bg-slate-200 text-slate-800",
};

const PeriodClose = () => {
  const { data: periods = [], isLoading, isError } = useAccountingPeriods();
  const openCount = periods.filter((period) => period.status === "OPEN").length;

  return (
    <AppLayout title="Accounting Periods" subtitle="Authoritative posting-window status">
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Configured periods</CardDescription>
              <CardTitle className="text-3xl">{isLoading ? "—" : isError ? "Unavailable" : periods.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Open for posting</CardDescription>
              <CardTitle className="text-3xl">{isLoading ? "—" : isError ? "Unavailable" : openCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Browser controls</CardDescription>
              <CardTitle className="flex items-center gap-2 text-base">
                <Lock className="h-4 w-4" /> Read-only
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              Controlled period history
            </CardTitle>
            <CardDescription>
              Only OPEN periods accept controlled postings. HARD_CLOSED is terminal. Creation and transitions are not exposed by this browser.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entity</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Version</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isError ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-destructive">
                      Accounting-period history is unavailable. Do not infer that no periods are configured.
                    </TableCell>
                  </TableRow>
                ) : isLoading ? (
                  <TableRow><TableCell colSpan={5}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
                ) : periods.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      <Calendar className="mx-auto mb-2 h-8 w-8" />
                      No authoritative accounting period is configured. Posting remains unavailable.
                    </TableCell>
                  </TableRow>
                ) : periods.map((period) => (
                  <TableRow key={period.id}>
                    <TableCell className="font-mono text-xs">{period.entity_id}</TableCell>
                    <TableCell>{format(new Date(`${period.period_start}T00:00:00`), "MMM d, yyyy")}</TableCell>
                    <TableCell>{format(new Date(`${period.period_end}T00:00:00`), "MMM d, yyyy")}</TableCell>
                    <TableCell>
                      <Badge className={statusStyle[period.status]}>{period.status.replace("_", " ")}</Badge>
                    </TableCell>
                    <TableCell>{period.version}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default PeriodClose;
