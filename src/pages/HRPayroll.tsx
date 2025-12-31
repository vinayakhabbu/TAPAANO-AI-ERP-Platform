import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Users, Building2, Briefcase, DollarSign, Calendar, Play, FileText } from "lucide-react";
import { 
  useEmployees, 
  useDepartments, 
  usePositions, 
  usePayrollPeriods, 
  usePayrollRuns,
  useCreatePayrollRun,
  PAY_FREQUENCIES 
} from "@/hooks/useHRPayroll";
import { EmployeeForm } from "@/components/forms/EmployeeForm";
import { DepartmentForm } from "@/components/forms/DepartmentForm";
import { PositionForm } from "@/components/forms/PositionForm";
import { PayrollPeriodForm } from "@/components/forms/PayrollPeriodForm";
import { format } from "date-fns";

export default function HRPayroll() {
  const { data: employees = [], isLoading: loadingEmployees } = useEmployees();
  const { data: departments = [], isLoading: loadingDepartments } = useDepartments();
  const { data: positions = [], isLoading: loadingPositions } = usePositions();
  const { data: payrollPeriods = [], isLoading: loadingPeriods } = usePayrollPeriods();
  const { data: payrollRuns = [], isLoading: loadingRuns } = usePayrollRuns();
  const createPayrollRun = useCreatePayrollRun();

  const activeEmployees = employees.filter(e => e.employment_status === "active").length;
  const totalPayroll = employees.reduce((sum, e) => sum + (e.base_salary || 0), 0);

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
              <CardTitle className="text-sm font-medium">Departments</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{departments.length}</div>
              <p className="text-xs text-muted-foreground">organizational units</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Positions</CardTitle>
              <Briefcase className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{positions.length}</div>
              <p className="text-xs text-muted-foreground">job roles defined</p>
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
        </div>

        {/* Tabs */}
        <Tabs defaultValue="employees" className="space-y-4">
          <TabsList>
            <TabsTrigger value="employees" className="gap-2">
              <Users className="h-4 w-4" /> Employees
            </TabsTrigger>
            <TabsTrigger value="departments" className="gap-2">
              <Building2 className="h-4 w-4" /> Departments
            </TabsTrigger>
            <TabsTrigger value="positions" className="gap-2">
              <Briefcase className="h-4 w-4" /> Positions
            </TabsTrigger>
            <TabsTrigger value="periods" className="gap-2">
              <Calendar className="h-4 w-4" /> Pay Periods
            </TabsTrigger>
            <TabsTrigger value="runs" className="gap-2">
              <FileText className="h-4 w-4" /> Payroll Runs
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
                      <TableHead className="text-right">Deductions</TableHead>
                      <TableHead className="text-right">Net Pay</TableHead>
                      <TableHead>Status</TableHead>
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
                          <TableCell className="text-right text-destructive">${run.total_deductions.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-medium">${run.total_net.toLocaleString()}</TableCell>
                          <TableCell>{getStatusBadge(run.status)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
