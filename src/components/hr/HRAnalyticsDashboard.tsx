import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  useHeadcountByDepartment,
  useHeadcountByStatus,
  usePayrollCostAnalysis,
  useTurnoverMetrics,
  useAttendanceAnalytics,
  useExpenseAnalytics,
} from "@/hooks/useHRAnalytics";
import { Users, TrendingUp, TrendingDown, DollarSign, Clock, Receipt } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from "recharts";

const COLORS = ["hsl(var(--primary))", "hsl(var(--secondary))", "hsl(var(--accent))", "hsl(var(--muted))", "#8884d8", "#82ca9d"];

export function HRAnalyticsDashboard() {
  const { data: headcountByDept = [], total: totalHeadcount } = useHeadcountByDepartment();
  const { data: headcountByStatus = [] } = useHeadcountByStatus();
  const payrollCost = usePayrollCostAnalysis();
  const turnover = useTurnoverMetrics();
  const attendance = useAttendanceAnalytics();
  const expenses = useExpenseAnalytics();

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Headcount</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalHeadcount}</div>
            <p className="text-xs text-muted-foreground">
              {turnover.totalHires} hires, {turnover.totalTerminations} terms (12mo)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Turnover Rate</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{turnover.turnoverRate}%</div>
            <p className="text-xs text-muted-foreground">
              Avg tenure: {turnover.avgTenureYears} years
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Monthly Payroll</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${payrollCost.totalMonthlyCost.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              Avg salary: ${payrollCost.avgSalary.toLocaleString()}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Attendance Rate</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{attendance.presentRate}%</div>
            <p className="text-xs text-muted-foreground">
              Avg {attendance.avgHoursPerDay} hrs/day
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 1 */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Headcount by Department</CardTitle>
            <CardDescription>Distribution of employees across departments</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={headcountByDept}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ department, percentage }) => `${department} (${percentage}%)`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="count"
                    nameKey="department"
                  >
                    {headcountByDept.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payroll Cost by Department</CardTitle>
            <CardDescription>Monthly payroll distribution</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={payrollCost.costByDepartment}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="department" />
                  <YAxis />
                  <Tooltip formatter={(value: number) => `$${value.toLocaleString()}`} />
                  <Bar dataKey="cost" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Hire & Termination Trends</CardTitle>
            <CardDescription>12-month rolling view</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={turnover.monthlyTrends}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="hires" stroke="hsl(var(--primary))" name="Hires" />
                  <Line type="monotone" dataKey="terminations" stroke="hsl(var(--destructive))" name="Terminations" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Expense Claims Summary</CardTitle>
            <CardDescription>Reimbursement status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-muted-foreground" />
                  <span>Total Submitted</span>
                </div>
                <span className="font-medium">${expenses.totalAmount.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-500" />
                  <span>Approved</span>
                </div>
                <span className="font-medium text-green-600">${expenses.approvedAmount.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-500" />
                  <span>Pending</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{expenses.pendingCount}</Badge>
                  <span className="font-medium text-amber-600">${expenses.pendingAmount.toLocaleString()}</span>
                </div>
              </div>
              
              <div className="pt-4 border-t">
                <p className="text-sm font-medium mb-2">By Category</p>
                <div className="space-y-2">
                  {expenses.byCategory.map((cat) => (
                    <div key={cat.category} className="flex items-center justify-between text-sm">
                      <span className="capitalize">{cat.category}</span>
                      <span>${cat.amount.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Status Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Employee Status Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 flex-wrap">
            {headcountByStatus.map((status) => (
              <div key={status.status} className="flex items-center gap-2">
                <Badge variant={status.status === "active" ? "default" : "secondary"}>
                  {status.count}
                </Badge>
                <span className="capitalize">{status.status}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
