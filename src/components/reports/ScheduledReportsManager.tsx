import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  Clock,
  Plus,
  Calendar,
  Mail,
  MoreHorizontal,
  Trash2,
  Edit2,
  Play,
  Loader2,
} from "lucide-react";
import {
  useScheduledReports,
  useCreateScheduledReport,
  useDeleteScheduledReport,
  useToggleScheduledReport,
  ScheduledReport,
} from "@/hooks/useScheduledReports";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const REPORT_TYPES = [
  { value: "income_statement", label: "Income Statement" },
  { value: "balance_sheet", label: "Balance Sheet" },
  { value: "cash_flow", label: "Cash Flow Statement" },
  { value: "ar_aging", label: "A/R Aging Report" },
  { value: "ap_aging", label: "A/P Aging Report" },
  { value: "trial_balance", label: "Trial Balance" },
  { value: "budget_variance", label: "Budget vs Actual" },
  { value: "tax_summary", label: "Tax Summary" },
];

const FREQUENCIES = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
];

export function ScheduledReportsManager() {
  const { data: reports, isLoading } = useScheduledReports();
  const createReport = useCreateScheduledReport();
  const deleteReport = useDeleteScheduledReport();
  const toggleReport = useToggleScheduledReport();

  const [isOpen, setIsOpen] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [reportType, setReportType] = useState("");
  const [frequency, setFrequency] = useState("");
  const [scheduleDay, setScheduleDay] = useState("1");
  const [scheduleTime, setScheduleTime] = useState("08:00");
  const [recipients, setRecipients] = useState("");

  const resetForm = () => {
    setName("");
    setReportType("");
    setFrequency("");
    setScheduleDay("1");
    setScheduleTime("08:00");
    setRecipients("");
  };

  const handleCreate = async () => {
    if (!name || !reportType || !frequency) {
      toast.error("Please fill in all required fields");
      return;
    }

    const recipientList = recipients
      .split(",")
      .map((r) => r.trim())
      .filter((r) => r.includes("@"));

    if (recipientList.length === 0) {
      toast.error("Please add at least one valid email recipient");
      return;
    }

    await createReport.mutateAsync({
      name,
      report_type: reportType,
      schedule_frequency: frequency,
      schedule_day: parseInt(scheduleDay) || undefined,
      schedule_time: scheduleTime,
      recipients: recipientList,
    });

    resetForm();
    setIsOpen(false);
  };

  const handleRunNow = async (report: ScheduledReport) => {
    setRunningId(report.id);
    try {
      const { error } = await supabase.functions.invoke("process-scheduled-report", {
        body: { reportId: report.id },
      });

      if (error) throw error;
      toast.success(`Report "${report.name}" sent to recipients`);
    } catch (error: any) {
      toast.error(error.message || "Failed to run report");
    } finally {
      setRunningId(null);
    }
  };

  const getFrequencyLabel = (freq: string) =>
    FREQUENCIES.find((f) => f.value === freq)?.label || freq;

  const getReportTypeLabel = (type: string) =>
    REPORT_TYPES.find((r) => r.value === type)?.label || type;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Scheduled Reports
              </CardTitle>
              <CardDescription>
                Automate report generation and delivery to stakeholders
              </CardDescription>
            </div>
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  New Schedule
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Create Scheduled Report</DialogTitle>
                  <DialogDescription>
                    Configure automated report delivery to your team
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Schedule Name</Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Monthly Financial Summary"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Report Type</Label>
                    <Select value={reportType} onValueChange={setReportType}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select report type" />
                      </SelectTrigger>
                      <SelectContent>
                        {REPORT_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Frequency</Label>
                      <Select value={frequency} onValueChange={setFrequency}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select frequency" />
                        </SelectTrigger>
                        <SelectContent>
                          {FREQUENCIES.map((freq) => (
                            <SelectItem key={freq.value} value={freq.value}>
                              {freq.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="time">Delivery Time</Label>
                      <Input
                        id="time"
                        type="time"
                        value={scheduleTime}
                        onChange={(e) => setScheduleTime(e.target.value)}
                      />
                    </div>
                  </div>

                  {(frequency === "weekly" || frequency === "monthly") && (
                    <div className="space-y-2">
                      <Label htmlFor="day">
                        {frequency === "weekly" ? "Day of Week" : "Day of Month"}
                      </Label>
                      {frequency === "weekly" ? (
                        <Select value={scheduleDay} onValueChange={setScheduleDay}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">Monday</SelectItem>
                            <SelectItem value="2">Tuesday</SelectItem>
                            <SelectItem value="3">Wednesday</SelectItem>
                            <SelectItem value="4">Thursday</SelectItem>
                            <SelectItem value="5">Friday</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          id="day"
                          type="number"
                          min="1"
                          max="28"
                          value={scheduleDay}
                          onChange={(e) => setScheduleDay(e.target.value)}
                          placeholder="1-28"
                        />
                      )}
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="recipients">
                      Recipients (comma-separated emails)
                    </Label>
                    <Input
                      id="recipients"
                      value={recipients}
                      onChange={(e) => setRecipients(e.target.value)}
                      placeholder="cfo@company.com, controller@company.com"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreate}
                    disabled={createReport.isPending}
                  >
                    {createReport.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      "Create Schedule"
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !reports?.length ? (
            <div className="text-center py-12">
              <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No Scheduled Reports</h3>
              <p className="text-muted-foreground text-sm mb-4">
                Create your first automated report schedule
              </p>
              <Button onClick={() => setIsOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                New Schedule
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Report</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead>Next Run</TableHead>
                  <TableHead>Recipients</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[70px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((report) => (
                  <TableRow key={report.id}>
                    <TableCell className="font-medium">{report.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {getReportTypeLabel(report.report_type)}
                      </Badge>
                    </TableCell>
                    <TableCell className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      {getFrequencyLabel(report.schedule_frequency)}
                    </TableCell>
                    <TableCell>
                      {report.next_run_at
                        ? format(new Date(report.next_run_at), "MMM d, h:mm a")
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span>{report.recipients?.length || 0}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={report.is_active}
                        onCheckedChange={(checked) =>
                          toggleReport.mutate({
                            id: report.id,
                            is_active: checked,
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => handleRunNow(report)}
                            disabled={runningId === report.id}
                          >
                            {runningId === report.id ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Play className="h-4 w-4 mr-2" />
                            )}
                            Run Now
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => deleteReport.mutate(report.id)}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
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
  );
}
