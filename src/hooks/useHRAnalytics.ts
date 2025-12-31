import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmployees, useDepartments, usePayrollRuns } from "./useHRPayroll";
import { useAttendanceRecords } from "./useAttendance";
import { useExpenseClaims } from "./useExpenseClaims";
import { format, subMonths, startOfMonth, endOfMonth, parseISO, differenceInDays } from "date-fns";

export interface HeadcountByDepartment {
  department: string;
  count: number;
  percentage: number;
}

export interface HeadcountByStatus {
  status: string;
  count: number;
}

export interface PayrollCostByDepartment {
  department: string;
  cost: number;
  percentage: number;
}

export interface TurnoverMetrics {
  month: string;
  hires: number;
  terminations: number;
  netChange: number;
}

export interface AttendanceMetrics {
  presentRate: number;
  absentRate: number;
  lateRate: number;
  avgHoursPerDay: number;
}

export const useHeadcountByDepartment = () => {
  const { data: employees = [] } = useEmployees();
  const { data: departments = [] } = useDepartments();

  const activeEmployees = employees.filter(e => e.employment_status === "active");
  const total = activeEmployees.length;

  const headcount: HeadcountByDepartment[] = departments.map(dept => {
    const count = activeEmployees.filter(e => e.department_id === dept.id).length;
    return {
      department: dept.name,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0,
    };
  });

  // Add unassigned
  const unassigned = activeEmployees.filter(e => !e.department_id).length;
  if (unassigned > 0) {
    headcount.push({
      department: "Unassigned",
      count: unassigned,
      percentage: total > 0 ? Math.round((unassigned / total) * 100) : 0,
    });
  }

  return { data: headcount.filter(h => h.count > 0), total };
};

export const useHeadcountByStatus = () => {
  const { data: employees = [] } = useEmployees();

  const statusCounts: Record<string, number> = {};
  employees.forEach(emp => {
    const status = emp.employment_status || "unknown";
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  });

  const data: HeadcountByStatus[] = Object.entries(statusCounts).map(([status, count]) => ({
    status: status.replace("_", " "),
    count,
  }));

  return { data };
};

export const usePayrollCostAnalysis = () => {
  const { data: employees = [] } = useEmployees();
  const { data: departments = [] } = useDepartments();
  const { data: payrollRuns = [] } = usePayrollRuns();

  const activeEmployees = employees.filter(e => e.employment_status === "active");
  const totalCost = activeEmployees.reduce((sum, e) => sum + (e.base_salary || 0), 0);

  const costByDepartment: PayrollCostByDepartment[] = departments.map(dept => {
    const deptEmployees = activeEmployees.filter(e => e.department_id === dept.id);
    const cost = deptEmployees.reduce((sum, e) => sum + (e.base_salary || 0), 0);
    return {
      department: dept.name,
      cost,
      percentage: totalCost > 0 ? Math.round((cost / totalCost) * 100) : 0,
    };
  });

  // Monthly payroll totals from runs
  const monthlyTotals = payrollRuns.slice(0, 12).map(run => ({
    month: format(parseISO(run.run_date), "MMM yyyy"),
    gross: run.total_gross,
    net: run.total_net,
    deductions: run.total_deductions,
    employerCost: run.total_employer_cost,
  }));

  return {
    totalMonthlyCost: totalCost,
    costByDepartment: costByDepartment.filter(c => c.cost > 0),
    monthlyTotals,
    avgSalary: activeEmployees.length > 0 ? Math.round(totalCost / activeEmployees.length) : 0,
  };
};

export const useTurnoverMetrics = () => {
  const { data: employees = [] } = useEmployees();

  // Get last 12 months
  const months: TurnoverMetrics[] = [];
  for (let i = 11; i >= 0; i--) {
    const monthDate = subMonths(new Date(), i);
    const monthStart = startOfMonth(monthDate);
    const monthEnd = endOfMonth(monthDate);
    const monthLabel = format(monthDate, "MMM yyyy");

    const hires = employees.filter(emp => {
      const hireDate = parseISO(emp.hire_date);
      return hireDate >= monthStart && hireDate <= monthEnd;
    }).length;

    const terminations = employees.filter(emp => {
      if (!emp.termination_date) return false;
      const termDate = parseISO(emp.termination_date);
      return termDate >= monthStart && termDate <= monthEnd;
    }).length;

    months.push({
      month: monthLabel,
      hires,
      terminations,
      netChange: hires - terminations,
    });
  }

  // Calculate turnover rate
  const activeCount = employees.filter(e => e.employment_status === "active").length;
  const last12MonthsTerminations = months.reduce((sum, m) => sum + m.terminations, 0);
  const turnoverRate = activeCount > 0 ? Math.round((last12MonthsTerminations / activeCount) * 100) : 0;

  // Average tenure
  const activeEmployees = employees.filter(e => e.employment_status === "active");
  const avgTenure = activeEmployees.length > 0
    ? Math.round(
        activeEmployees.reduce((sum, e) => sum + differenceInDays(new Date(), parseISO(e.hire_date)), 0) /
        activeEmployees.length / 365 * 10
      ) / 10
    : 0;

  return {
    monthlyTrends: months,
    turnoverRate,
    avgTenureYears: avgTenure,
    totalHires: months.reduce((sum, m) => sum + m.hires, 0),
    totalTerminations: months.reduce((sum, m) => sum + m.terminations, 0),
  };
};

export const useAttendanceAnalytics = () => {
  const { data: records = [] } = useAttendanceRecords();

  const total = records.length;
  if (total === 0) {
    return {
      presentRate: 0,
      absentRate: 0,
      lateRate: 0,
      remoteRate: 0,
      avgHoursPerDay: 0,
    };
  }

  const present = records.filter(r => r.status === "present").length;
  const absent = records.filter(r => r.status === "absent").length;
  const late = records.filter(r => r.status === "late").length;
  const remote = records.filter(r => r.status === "remote").length;

  const hoursRecords = records.filter(r => r.total_hours != null);
  const avgHours = hoursRecords.length > 0
    ? hoursRecords.reduce((sum, r) => sum + (r.total_hours || 0), 0) / hoursRecords.length
    : 0;

  return {
    presentRate: Math.round((present / total) * 100),
    absentRate: Math.round((absent / total) * 100),
    lateRate: Math.round((late / total) * 100),
    remoteRate: Math.round((remote / total) * 100),
    avgHoursPerDay: Math.round(avgHours * 10) / 10,
  };
};

export const useExpenseAnalytics = () => {
  const { data: claims = [] } = useExpenseClaims();

  const totalAmount = claims.reduce((sum, c) => sum + c.amount, 0);
  const approvedAmount = claims
    .filter(c => c.status === "approved" || c.status === "paid")
    .reduce((sum, c) => sum + c.amount, 0);
  const pendingAmount = claims
    .filter(c => c.status === "submitted")
    .reduce((sum, c) => sum + c.amount, 0);

  const byCategory = claims.reduce((acc, claim) => {
    acc[claim.category] = (acc[claim.category] || 0) + claim.amount;
    return acc;
  }, {} as Record<string, number>);

  return {
    totalAmount,
    approvedAmount,
    pendingAmount,
    pendingCount: claims.filter(c => c.status === "submitted").length,
    byCategory: Object.entries(byCategory).map(([category, amount]) => ({
      category,
      amount,
    })),
  };
};
