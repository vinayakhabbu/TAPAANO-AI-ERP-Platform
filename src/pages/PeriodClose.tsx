import { format } from "date-fns";
import { Calendar, ShieldCheck } from "lucide-react";
import { useState } from "react";
import {Link} from "react-router-dom";
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
import { useReportEntities } from "@/hooks/useTrialBalance";
import { Button } from "@/components/ui/button";
import { CreatePeriodForm, PeriodManagement, type SelectedPeriod } from "@/components/reports/PeriodControls";

const statusStyle = {
  OPEN: "bg-green-100 text-green-800",
  SOFT_CLOSED: "bg-amber-100 text-amber-800",
  HARD_CLOSED: "bg-slate-200 text-slate-800",
};

const PeriodClose = () => {
  const { data: periods = [], isLoading, isError, isFetching, refetch } = useAccountingPeriods();
  const entities = useReportEntities();
  const [selected, setSelected] = useState<SelectedPeriod | null>(null);
  const entityName = (id: string) => entities.data?.find(entity => entity.id === id)?.name ?? id;
  const openCount = periods.filter((period) => period.status === "OPEN").length;

  return (
    <AppLayout title="Accounting Periods" subtitle="Authoritative posting-window status">
      <div className="space-y-6">
        <p><Link className="underline" to="/finance-close">Open Financial Close</Link> for reconciliation checks, independent period reviews and fiscal-year closing. Entities with required journal approvals use that review workflow for period changes.</p>
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
              <CardDescription>Posting controls</CardDescription>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4" /> Versioned and audited
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        <CreatePeriodForm />
        {selected ? <PeriodManagement key={`${selected.id}:${selected.version}`} period={selected} entityName={entityName(selected.entity_id)} onClose={() => { setSelected(null); void refetch(); }} /> : null}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              Controlled period history
            </CardTitle>
            <CardDescription>
              Only OPEN periods accept postings. Soft close pauses posting and can be reopened. Hard close is permanent and requires a prior soft close.
            </CardDescription>
            <Button variant="outline" className="w-fit" disabled={isFetching} onClick={() => { setSelected(null); void refetch(); }}>Refresh period history</Button>
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
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isError ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-destructive">
                      Accounting-period history is unavailable. Do not infer that no periods are configured.
                    </TableCell>
                  </TableRow>
                ) : isLoading ? (
                  <TableRow><TableCell colSpan={6}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
                ) : periods.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      <Calendar className="mx-auto mb-2 h-8 w-8" />
                      No authoritative accounting period is configured. Posting remains unavailable.
                    </TableCell>
                  </TableRow>
                ) : periods.map((period) => (
                  <TableRow key={period.id}>
                    <TableCell>{entityName(period.entity_id)}</TableCell>
                    <TableCell>{format(new Date(`${period.period_start}T00:00:00`), "MMM d, yyyy")}</TableCell>
                    <TableCell>{format(new Date(`${period.period_end}T00:00:00`), "MMM d, yyyy")}</TableCell>
                    <TableCell>
                      <Badge className={statusStyle[period.status]}>{period.status.replace("_", " ")}</Badge>
                    </TableCell>
                    <TableCell>{period.version}</TableCell>
                    <TableCell><Button variant="outline" size="sm" disabled={isFetching} onClick={() => setSelected({ ...period })}>Period details</Button></TableCell>
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
