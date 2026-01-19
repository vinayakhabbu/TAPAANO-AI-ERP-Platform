import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { 
  Users, Building2, Briefcase, DollarSign, Calendar, Play, FileText, 
  Clock, Receipt, FolderOpen, BarChart3, Phone, CheckCircle, XCircle
} from "lucide-react";
import { 
  useEmployees, 
  useDepartments, 
  usePositions, 
  usePayrollPeriods, 
  usePayrollRuns,
  useCreatePayrollRun,
  usePostPayrollToGL,
  PAY_FREQUENCIES 
} from "@/hooks/useHRPayroll";
import { useTimeOffRequests, useApproveTimeOffRequest, useRejectTimeOffRequest } from "@/hooks/useTimeOff";
import { useEmergencyContacts } from "@/hooks/useEmergencyContacts";
import { usePayslips, useGeneratePayslips } from "@/hooks/usePayslips";
import { useAttendanceRecords } from "@/hooks/useAttendance";
import { useExpenseClaims, useApproveExpenseClaim, useRejectExpenseClaim, useMarkExpenseAsPaid } from "@/hooks/useExpenseClaims";
import { useEmployeeDocuments } from "@/hooks/useEmployeeDocuments";
import { EmployeeForm } from "@/components/forms/EmployeeForm";
import { DepartmentForm } from "@/components/forms/DepartmentForm";
import { PositionForm } from "@/components/forms/PositionForm";
import { PayrollPeriodForm } from "@/components/forms/PayrollPeriodForm";
import { TimeOffRequestForm } from "@/components/forms/TimeOffRequestForm";
import { EmergencyContactForm } from "@/components/forms/EmergencyContactForm";
import { ExpenseClaimForm } from "@/components/forms/ExpenseClaimForm";
import { AttendanceForm } from "@/components/forms/AttendanceForm";
import { EmployeeDocumentForm } from "@/components/forms/EmployeeDocumentForm";
import { HRAnalyticsDashboard } from "@/components/hr/HRAnalyticsDashboard";
import { format } from "date-fns";

export default function HRPayroll() {
  const { data: employees = [], isLoading: loadingEmployees } = useEmployees();
  const { data: departments = [], isLoading: loadingDepartments } = useDepartments();
  const { data: positions = [], isLoading: loadingPositions } = usePositions();
  const { data: payrollPeriods = [], isLoading: loadingPeriods } = usePayrollPeriods();
  const { data: payrollRuns = [], isLoading: loadingRuns } = usePayrollRuns();
  const { data: timeOffRequests = [], isLoading: loadingTimeOff } = useTimeOffRequests();
  const { data: emergencyContacts = [], isLoading: loadingContacts } = useEmergencyContacts();
  const { data: payslips = [], isLoading: loadingPayslips } = usePayslips();
  const { data: attendanceRecords = [], isLoading: loadingAttendance } = useAttendanceRecords();
  const { data: expenseClaims = [], isLoading: loadingExpenses } = useExpenseClaims();
  const { data: documents = [], isLoading: loadingDocuments } = useEmployeeDocuments();
  
  const createPayrollRun = useCreatePayrollRun();
  const postToGL = usePostPayrollToGL();
  const generatePayslips = useGeneratePayslips();
  const approveTimeOff = useApproveTimeOffRequest();
  const rejectTimeOff = useRejectTimeOffRequest();
  const approveExpense = useApproveExpenseClaim();
  const rejectExpense = useRejectExpenseClaim();
  const markPaid = useMarkExpenseAsPaid();

  const activeEmployees = employees.filter(e => e.employment_status === "active").length;
  const totalPayroll = employees.reduce((sum, e) => sum + (e.base_salary || 0), 0);
  const pendingTimeOff = timeOffRequests.filter(r => r.status === "pending").length;
  const pendingExpenses = expenseClaims.filter(c => c.status === "submitted").length;

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      active: "default",
      on_leave: "secondary",
      terminated: "destructive",
      suspended: "outline",
      draft: "outline",
      pending: "secondary",
      approved: "default",
      posted: "default",
      closed: "secondary",
      open: "default",
      rejected: "destructive",
      submitted: "secondary",
      paid: "default",
      present: "default",
      absent: "destructive",
      late: "secondary",
      remote: "outline",
    };
    return <Badge variant={variants[status] || "outline"}>{status.replace("_", " ")}</Badge>;
  };

  const handleRunPayroll = (periodId: string) => {
    createPayrollRun.mutate(periodId);
  };

  return (
    <AppLayout title="HR & Payroll" subtitle="Manage employees, departments, positions, and payroll">
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{employees.length}</div>
              <p className="text-xs text-muted-foreground">{activeEmployees} active</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Monthly Payroll</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${totalPayroll.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">base salaries</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Pending Time Off</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pendingTimeOff}</div>
              <p className="text-xs text-muted-foreground">awaiting approval</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Pending Expenses</CardTitle>
              <Receipt className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pendingExpenses}</div>
              <p className="text-xs text-muted-foreground">claims to review</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="employees" className="space-y-6">
          <TabsList className="h-auto flex-wrap gap-1 p-1">
            <TabsTrigger value="employees" className="gap-1.5 text-xs sm:text-sm">
              <Users className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Employees</span><span className="sm:hidden">Emp</span>
            </TabsTrigger>
            <TabsTrigger value="departments" className="gap-1.5 text-xs sm:text-sm">
              <Building2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Departments</span><span className="sm:hidden">Dept</span>
            </TabsTrigger>
            <TabsTrigger value="positions" className="gap-1.5 text-xs sm:text-sm">
              <Briefcase className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Positions</span><span className="sm:hidden">Pos</span>
            </TabsTrigger>
            <TabsTrigger value="timeoff" className="gap-1.5 text-xs sm:text-sm">
              <Calendar className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Time Off</span><span className="sm:hidden">Off</span>
            </TabsTrigger>
            <TabsTrigger value="attendance" className="gap-1.5 text-xs sm:text-sm">
              <Clock className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Attendance</span><span className="sm:hidden">Att</span>
            </TabsTrigger>
            <TabsTrigger value="periods" className="gap-1.5 text-xs sm:text-sm">
              <Calendar className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Pay Periods</span><span className="sm:hidden">Per</span>
            </TabsTrigger>
            <TabsTrigger value="runs" className="gap-1.5 text-xs sm:text-sm">
              <FileText className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Payroll</span><span className="sm:hidden">Pay</span>
            </TabsTrigger>
            <TabsTrigger value="payslips" className="gap-1.5 text-xs sm:text-sm">
              <FileText className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Payslips</span><span className="sm:hidden">Slip</span>
            </TabsTrigger>
            <TabsTrigger value="expenses" className="gap-1.5 text-xs sm:text-sm">
              <Receipt className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Expenses</span><span className="sm:hidden">Exp</span>
            </TabsTrigger>
            <TabsTrigger value="documents" className="gap-1.5 text-xs sm:text-sm">
              <FolderOpen className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Documents</span><span className="sm:hidden">Doc</span>
            </TabsTrigger>
            <TabsTrigger value="contacts" className="gap-1.5 text-xs sm:text-sm">
              <Phone className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Emergency</span><span className="sm:hidden">Emg</span>
            </TabsTrigger>
            <TabsTrigger value="analytics" className="gap-1.5 text-xs sm:text-sm">
              <BarChart3 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Analytics</span><span className="sm:hidden">Ana</span>
            </TabsTrigger>
          </TabsList>

          {/* Employees Tab */}
          <TabsContent value="employees">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Employees</CardTitle>
                  <CardDescription>Manage employee records and information</CardDescription>
                </div>
                <EmployeeForm />
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee #</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Position</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Hire Date</TableHead>
                      <TableHead className="text-right">Salary</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingEmployees ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground">Loading...</TableCell>
                      </TableRow>
                    ) : employees.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground">No employees found</TableCell>
                      </TableRow>
                    ) : (
                      employees.map((emp) => (
                        <TableRow key={emp.id}>
                          <TableCell className="font-medium">{emp.employee_number}</TableCell>
                          <TableCell>{emp.first_name} {emp.last_name}</TableCell>
                          <TableCell>{emp.department?.name || "-"}</TableCell>
                          <TableCell>{emp.position?.title || "-"}</TableCell>
                          <TableCell>{getStatusBadge(emp.employment_status)}</TableCell>
                          <TableCell>{format(new Date(emp.hire_date), "MMM d, yyyy")}</TableCell>
                          <TableCell className="text-right">
                            {emp.base_salary ? `$${emp.base_salary.toLocaleString()}` : emp.hourly_rate ? `$${emp.hourly_rate}/hr` : "-"}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Departments Tab */}
          <TabsContent value="departments">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Departments</CardTitle>
                  <CardDescription>Organizational structure and departments</CardDescription>
                </div>
                <DepartmentForm />
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Manager</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingDepartments ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">Loading...</TableCell>
                      </TableRow>
                    ) : departments.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">No departments found</TableCell>
                      </TableRow>
                    ) : (
                      departments.map((dept) => (
                        <TableRow key={dept.id}>
                          <TableCell className="font-medium">{dept.code}</TableCell>
                          <TableCell>{dept.name}</TableCell>
                          <TableCell className="text-muted-foreground">{dept.description || "-"}</TableCell>
                          <TableCell>{dept.manager ? `${dept.manager.first_name} ${dept.manager.last_name}` : "-"}</TableCell>
                          <TableCell>{dept.is_active ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Positions Tab */}
          <TabsContent value="positions">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Positions</CardTitle>
                  <CardDescription>Job roles and salary ranges</CardDescription>
                </div>
                <PositionForm />
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Salary Range</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingPositions ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">Loading...</TableCell>
                      </TableRow>
                    ) : positions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">No positions found</TableCell>
                      </TableRow>
                    ) : (
                      positions.map((pos) => (
                        <TableRow key={pos.id}>
                          <TableCell className="font-medium">{pos.code}</TableCell>
                          <TableCell>{pos.title}</TableCell>
                          <TableCell>{pos.department?.name || "-"}</TableCell>
                          <TableCell>
                            {pos.min_salary && pos.max_salary 
                              ? `$${pos.min_salary.toLocaleString()} - $${pos.max_salary.toLocaleString()}`
                              : "-"}
                          </TableCell>
                          <TableCell>{pos.is_active ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Time Off Tab */}
          <TabsContent value="timeoff">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Time Off Requests</CardTitle>
                  <CardDescription>Manage leave requests and approvals</CardDescription>
                </div>
                <TimeOffRequestForm />
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Start</TableHead>
                      <TableHead>End</TableHead>
                      <TableHead>Days</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingTimeOff ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground">Loading...</TableCell>
                      </TableRow>
                    ) : timeOffRequests.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground">No requests found</TableCell>
                      </TableRow>
                    ) : (
                      timeOffRequests.map((req) => (
                        <TableRow key={req.id}>
                          <TableCell>{req.employee ? `${req.employee.first_name} ${req.employee.last_name}` : "-"}</TableCell>
                          <TableCell>{req.time_off_type?.name || "-"}</TableCell>
                          <TableCell>{format(new Date(req.start_date), "MMM d, yyyy")}</TableCell>
                          <TableCell>{format(new Date(req.end_date), "MMM d, yyyy")}</TableCell>
                          <TableCell>{req.days_requested}</TableCell>
                          <TableCell>{getStatusBadge(req.status)}</TableCell>
                          <TableCell>
                            {req.status === "pending" && (
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => approveTimeOff.mutate({ requestId: req.id, approverId: req.employee_id })}
                                >
                                  <CheckCircle className="h-4 w-4 text-green-600" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => rejectTimeOff.mutate({ requestId: req.id, reason: "Request denied" })}
                                >
                                  <XCircle className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Attendance Tab */}
          <TabsContent value="attendance">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Attendance Records</CardTitle>
                  <CardDescription>Track employee attendance and hours</CardDescription>
                </div>
                <AttendanceForm />
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Clock In</TableHead>
                      <TableHead>Clock Out</TableHead>
                      <TableHead>Hours</TableHead>
                      <TableHead>Overtime</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingAttendance ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground">Loading...</TableCell>
                      </TableRow>
                    ) : attendanceRecords.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground">No records found</TableCell>
                      </TableRow>
                    ) : (
                      attendanceRecords.map((rec) => (
                        <TableRow key={rec.id}>
                          <TableCell>{rec.employee ? `${rec.employee.first_name} ${rec.employee.last_name}` : "-"}</TableCell>
                          <TableCell>{format(new Date(rec.attendance_date), "MMM d, yyyy")}</TableCell>
                          <TableCell>{rec.clock_in ? format(new Date(rec.clock_in), "h:mm a") : "-"}</TableCell>
                          <TableCell>{rec.clock_out ? format(new Date(rec.clock_out), "h:mm a") : "-"}</TableCell>
                          <TableCell>{rec.total_hours || "-"}</TableCell>
                          <TableCell>{rec.overtime_hours > 0 ? rec.overtime_hours : "-"}</TableCell>
                          <TableCell>{getStatusBadge(rec.status)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Pay Periods Tab */}
          <TabsContent value="periods">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Pay Periods</CardTitle>
                  <CardDescription>Define payroll periods and schedules</CardDescription>
                </div>
                <PayrollPeriodForm />
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Period Name</TableHead>
                      <TableHead>Start Date</TableHead>
                      <TableHead>End Date</TableHead>
                      <TableHead>Pay Date</TableHead>
                      <TableHead>Frequency</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingPeriods ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground">Loading...</TableCell>
                      </TableRow>
                    ) : payrollPeriods.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground">No pay periods found</TableCell>
                      </TableRow>
                    ) : (
                      payrollPeriods.map((period) => (
                        <TableRow key={period.id}>
                          <TableCell className="font-medium">{period.period_name}</TableCell>
                          <TableCell>{format(new Date(period.period_start), "MMM d, yyyy")}</TableCell>
                          <TableCell>{format(new Date(period.period_end), "MMM d, yyyy")}</TableCell>
                          <TableCell>{format(new Date(period.pay_date), "MMM d, yyyy")}</TableCell>
                          <TableCell>{PAY_FREQUENCIES.find(f => f.value === period.pay_frequency)?.label || period.pay_frequency}</TableCell>
                          <TableCell>{getStatusBadge(period.status)}</TableCell>
                          <TableCell>
                            {period.status === "open" && (
                              <Button 
                                size="sm" 
                                onClick={() => handleRunPayroll(period.id)}
                                disabled={createPayrollRun.isPending}
                              >
                                <Play className="mr-1 h-3 w-3" /> Run Payroll
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Payroll Runs Tab */}
          <TabsContent value="runs">
            <Card>
              <CardHeader>
                <CardTitle>Payroll Runs</CardTitle>
                <CardDescription>History of payroll processing runs</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Run #</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Run Date</TableHead>
                      <TableHead>Employees</TableHead>
                      <TableHead className="text-right">Gross Pay</TableHead>
                      <TableHead className="text-right">Net Pay</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingRuns ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground">Loading...</TableCell>
                      </TableRow>
                    ) : payrollRuns.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground">No payroll runs found</TableCell>
                      </TableRow>
                    ) : (
                      payrollRuns.map((run) => (
                        <TableRow key={run.id}>
                          <TableCell className="font-medium">{run.run_number}</TableCell>
                          <TableCell>{run.payroll_period?.period_name || "-"}</TableCell>
                          <TableCell>{format(new Date(run.run_date), "MMM d, yyyy")}</TableCell>
                          <TableCell>{run.employee_count}</TableCell>
                          <TableCell className="text-right">${run.total_gross.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-medium">${run.total_net.toLocaleString()}</TableCell>
                          <TableCell>{getStatusBadge(run.status)}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {run.status === "draft" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => postToGL.mutate(run.id)}
                                  disabled={postToGL.isPending}
                                >
                                  Post to GL
                                </Button>
                              )}
                              {run.status === "posted" && !payslips.some(p => p.payroll_run_id === run.id) && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => generatePayslips.mutate(run.id)}
                                  disabled={generatePayslips.isPending}
                                >
                                  Generate Payslips
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Payslips Tab */}
          <TabsContent value="payslips">
            <Card>
              <CardHeader>
                <CardTitle>Payslips</CardTitle>
                <CardDescription>Employee pay statements</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Payslip #</TableHead>
                      <TableHead>Employee</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Pay Date</TableHead>
                      <TableHead className="text-right">Gross</TableHead>
                      <TableHead className="text-right">Deductions</TableHead>
                      <TableHead className="text-right">Net</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingPayslips ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground">Loading...</TableCell>
                      </TableRow>
                    ) : payslips.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground">No payslips found</TableCell>
                      </TableRow>
                    ) : (
                      payslips.map((slip) => (
                        <TableRow key={slip.id}>
                          <TableCell className="font-medium">{slip.payslip_number}</TableCell>
                          <TableCell>{slip.employee ? `${slip.employee.first_name} ${slip.employee.last_name}` : "-"}</TableCell>
                          <TableCell>{format(new Date(slip.period_start), "MMM d")} - {format(new Date(slip.period_end), "MMM d, yyyy")}</TableCell>
                          <TableCell>{format(new Date(slip.pay_date), "MMM d, yyyy")}</TableCell>
                          <TableCell className="text-right">${slip.gross_pay.toLocaleString()}</TableCell>
                          <TableCell className="text-right text-destructive">${slip.total_deductions.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-medium">${slip.net_pay.toLocaleString()}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Expenses Tab */}
          <TabsContent value="expenses">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Expense Claims</CardTitle>
                  <CardDescription>Employee expense reimbursements</CardDescription>
                </div>
                <ExpenseClaimForm />
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Claim #</TableHead>
                      <TableHead>Employee</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingExpenses ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground">Loading...</TableCell>
                      </TableRow>
                    ) : expenseClaims.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground">No expense claims found</TableCell>
                      </TableRow>
                    ) : (
                      expenseClaims.map((claim) => (
                        <TableRow key={claim.id}>
                          <TableCell className="font-medium">{claim.claim_number}</TableCell>
                          <TableCell>{claim.employee ? `${claim.employee.first_name} ${claim.employee.last_name}` : "-"}</TableCell>
                          <TableCell className="capitalize">{claim.category}</TableCell>
                          <TableCell className="max-w-[200px] truncate">{claim.description}</TableCell>
                          <TableCell className="text-right">${claim.amount.toLocaleString()}</TableCell>
                          <TableCell>{getStatusBadge(claim.status)}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {claim.status === "submitted" && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => approveExpense.mutate({ claimId: claim.id, approverId: claim.employee_id })}
                                  >
                                    <CheckCircle className="h-4 w-4 text-green-600" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => rejectExpense.mutate({ claimId: claim.id, reason: "Claim rejected" })}
                                  >
                                    <XCircle className="h-4 w-4 text-destructive" />
                                  </Button>
                                </>
                              )}
                              {claim.status === "approved" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => markPaid.mutate(claim.id)}
                                >
                                  Mark Paid
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Documents Tab */}
          <TabsContent value="documents">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Employee Documents</CardTitle>
                  <CardDescription>Contracts, IDs, certifications, and more</CardDescription>
                </div>
                <EmployeeDocumentForm />
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Document Name</TableHead>
                      <TableHead>Expiry Date</TableHead>
                      <TableHead>Added</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingDocuments ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">Loading...</TableCell>
                      </TableRow>
                    ) : documents.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">No documents found</TableCell>
                      </TableRow>
                    ) : (
                      documents.map((doc) => (
                        <TableRow key={doc.id}>
                          <TableCell>{doc.employee ? `${doc.employee.first_name} ${doc.employee.last_name}` : "-"}</TableCell>
                          <TableCell className="capitalize">{doc.document_type.replace("_", " ")}</TableCell>
                          <TableCell>{doc.document_name}</TableCell>
                          <TableCell>{doc.expiry_date ? format(new Date(doc.expiry_date), "MMM d, yyyy") : "-"}</TableCell>
                          <TableCell>{format(new Date(doc.created_at), "MMM d, yyyy")}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Emergency Contacts Tab */}
          <TabsContent value="contacts">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Emergency Contacts</CardTitle>
                  <CardDescription>Employee emergency contact information</CardDescription>
                </div>
                <EmergencyContactForm />
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Contact Name</TableHead>
                      <TableHead>Relationship</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Primary</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingContacts ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">Loading...</TableCell>
                      </TableRow>
                    ) : emergencyContacts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">No contacts found</TableCell>
                      </TableRow>
                    ) : (
                      emergencyContacts.map((contact) => {
                        const employee = employees.find(e => e.id === contact.employee_id);
                        return (
                          <TableRow key={contact.id}>
                            <TableCell>{employee ? `${employee.first_name} ${employee.last_name}` : "-"}</TableCell>
                            <TableCell>{contact.contact_name}</TableCell>
                            <TableCell>{contact.relationship}</TableCell>
                            <TableCell>{contact.phone_primary}</TableCell>
                            <TableCell>{contact.is_primary ? <Badge>Primary</Badge> : "-"}</TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics">
            <HRAnalyticsDashboard />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
