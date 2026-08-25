import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Department {
  id: string;
  org_id: string;
  code: string;
  name: string;
  description: string | null;
  parent_id: string | null;
  manager_id: string | null;
  cost_center_id: string | null;
  is_active: boolean;
  created_at: string;
  manager?: Employee;
}

export interface Position {
  id: string;
  org_id: string;
  code: string;
  title: string;
  description: string | null;
  department_id: string | null;
  min_salary: number | null;
  max_salary: number | null;
  is_active: boolean;
  department?: Department;
}

export interface Employee {
  id: string;
  org_id: string;
  employee_number: string;
  user_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  hire_date: string;
  termination_date: string | null;
  department_id: string | null;
  position_id: string | null;
  manager_id: string | null;
  employment_type: string;
  employment_status: string;
  pay_frequency: string;
  base_salary: number | null;
  hourly_rate: number | null;
  currency: string;
  department?: Department;
  position?: Position;
  manager?: Employee;
}

export interface DeductionType {
  id: string;
  org_id: string;
  code: string;
  name: string;
  category: string;
  calculation_type: string;
  default_amount: number | null;
  default_percentage: number | null;
  is_pretax: boolean;
  is_employer_contribution: boolean;
  gl_account_id: string | null;
  is_active: boolean;
}

export interface PayrollPeriod {
  id: string;
  org_id: string;
  entity_id: string;
  period_name: string;
  period_start: string;
  period_end: string;
  pay_date: string;
  pay_frequency: string;
  status: string;
}

export interface PayrollRun {
  id: string;
  org_id: string;
  payroll_period_id: string;
  run_number: string;
  run_date: string;
  status: string;
  total_gross: number;
  total_deductions: number;
  total_net: number;
  total_employer_cost: number;
  employee_count: number;
  journal_entry_id: string | null;
  payroll_period?: PayrollPeriod;
}

export interface PayrollItem {
  id: string;
  org_id: string;
  payroll_run_id: string;
  employee_id: string;
  gross_pay: number;
  total_deductions: number;
  net_pay: number;
  total_employer_cost: number;
  status: string;
  employee?: Employee;
}

export const EMPLOYMENT_TYPES = [
  { value: "full_time", label: "Full Time" },
  { value: "part_time", label: "Part Time" },
  { value: "contractor", label: "Contractor" },
  { value: "intern", label: "Intern" },
  { value: "temporary", label: "Temporary" },
];

export const EMPLOYMENT_STATUSES = [
  { value: "active", label: "Active" },
  { value: "on_leave", label: "On Leave" },
  { value: "terminated", label: "Terminated" },
  { value: "suspended", label: "Suspended" },
];

export const PAY_FREQUENCIES = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Bi-Weekly" },
  { value: "semimonthly", label: "Semi-Monthly" },
  { value: "monthly", label: "Monthly" },
];

export const DEDUCTION_CATEGORIES = [
  { value: "tax", label: "Tax" },
  { value: "insurance", label: "Insurance" },
  { value: "retirement", label: "Retirement" },
  { value: "garnishment", label: "Garnishment" },
  { value: "other", label: "Other" },
];

// Departments
export const useDepartments = () => {
  return useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("departments")
        .select("*, manager:employees(*)")
        .order("name");
      if (error) throw error;
      return data as Department[];
    },
  });
};

export const useCreateDepartment = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dept: { code: string; name: string; description?: string | null; manager_id?: string | null; cost_center_id?: string | null }) => {
      const { data: profile } = await supabase.from("profiles").select("org_id").single();
      if (!profile?.org_id) throw new Error("No organization found");

      const { data, error } = await supabase
        .from("departments")
        .insert({ 
          org_id: profile.org_id,
          code: dept.code,
          name: dept.name,
          description: dept.description || null,
          manager_id: dept.manager_id || null,
          cost_center_id: dept.cost_center_id || null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["departments"] });
      toast.success("Department created");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

// Positions
export const usePositions = () => {
  return useQuery({
    queryKey: ["positions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("positions")
        .select("*, department:departments(*)")
        .order("title");
      if (error) throw error;
      return data as Position[];
    },
  });
};

export const useCreatePosition = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (pos: { code: string; title: string; description?: string | null; department_id?: string | null; min_salary?: number | null; max_salary?: number | null }) => {
      const { data: profile } = await supabase.from("profiles").select("org_id").single();
      if (!profile?.org_id) throw new Error("No organization found");

      const { data, error } = await supabase
        .from("positions")
        .insert({ 
          org_id: profile.org_id,
          code: pos.code,
          title: pos.title,
          description: pos.description || null,
          department_id: pos.department_id || null,
          min_salary: pos.min_salary || null,
          max_salary: pos.max_salary || null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["positions"] });
      toast.success("Position created");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

// Employees
export const useEmployees = () => {
  return useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("*, department:departments(*), position:positions(*)")
        .order("last_name");
      if (error) throw error;
      return data as Employee[];
    },
  });
};

export const useCreateEmployee = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (emp: { employee_number: string; first_name: string; last_name: string; hire_date: string; email?: string | null; phone?: string | null; department_id?: string | null; position_id?: string | null; manager_id?: string | null; employment_type?: string; employment_status?: string; pay_frequency?: string; base_salary?: number | null; hourly_rate?: number | null; currency?: string }) => {
      const { data: profile } = await supabase.from("profiles").select("org_id").single();
      if (!profile?.org_id) throw new Error("No organization found");

      const { data, error } = await supabase
        .from("employees")
        .insert({ 
          org_id: profile.org_id,
          employee_number: emp.employee_number,
          first_name: emp.first_name,
          last_name: emp.last_name,
          hire_date: emp.hire_date,
          email: emp.email || null,
          phone: emp.phone || null,
          department_id: emp.department_id || null,
          position_id: emp.position_id || null,
          manager_id: emp.manager_id || null,
          employment_type: emp.employment_type || "full_time",
          employment_status: emp.employment_status || "active",
          pay_frequency: emp.pay_frequency || "monthly",
          base_salary: emp.base_salary || null,
          hourly_rate: emp.hourly_rate || null,
          currency: emp.currency || "USD",
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      toast.success("Employee created");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useUpdateEmployee = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Employee> & { id: string }) => {
      const { data, error } = await supabase
        .from("employees")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      toast.success("Employee updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

// Deduction Types
export const useDeductionTypes = () => {
  return useQuery({
    queryKey: ["deduction-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deduction_types")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as DeductionType[];
    },
  });
};

export const useCreateDeductionType = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dt: { code: string; name: string; category: string; calculation_type?: string }) => {
      const { data: profile } = await supabase.from("profiles").select("org_id").single();
      if (!profile?.org_id) throw new Error("No organization found");

      const { data, error } = await supabase
        .from("deduction_types")
        .insert({ 
          org_id: profile.org_id,
          code: dt.code,
          name: dt.name,
          category: dt.category,
          calculation_type: dt.calculation_type || "fixed",
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deduction-types"] });
      toast.success("Deduction type created");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

// Payroll Periods
export const usePayrollPeriods = () => {
  return useQuery({
    queryKey: ["payroll-periods"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payroll_periods")
        .select("*")
        .order("period_start", { ascending: false });
      if (error) throw error;
      return data as PayrollPeriod[];
    },
  });
};

export const useCreatePayrollPeriod = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (period: { entity_id: string; period_name: string; period_start: string; period_end: string; pay_date: string; pay_frequency: string }) => {
      const { data: profile } = await supabase.from("profiles").select("org_id").single();
      if (!profile?.org_id) throw new Error("No organization found");

      const { data, error } = await supabase
        .from("payroll_periods")
        .insert({ 
          org_id: profile.org_id,
          entity_id: period.entity_id,
          period_name: period.period_name,
          period_start: period.period_start,
          period_end: period.period_end,
          pay_date: period.pay_date,
          pay_frequency: period.pay_frequency,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-periods"] });
      toast.success("Payroll period created");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

// Payroll Runs
export const usePayrollRuns = () => {
  return useQuery({
    queryKey: ["payroll-runs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payroll_runs")
        .select("*, payroll_period:payroll_periods(*)")
        .order("run_date", { ascending: false });
      if (error) throw error;
      return data as PayrollRun[];
    },
  });
};

export const useCreatePayrollRun = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (periodId: string) => {
      const { data: profile } = await supabase.from("profiles").select("org_id").single();
      if (!profile?.org_id) throw new Error("No organization found");

      // Get active employees
      const { data: employees, error: empError } = await supabase
        .from("employees")
        .select("*")
        .eq("employment_status", "active");
      if (empError) throw empError;

      const runNumber = `PR-${Date.now().toString().slice(-6)}`;

      // Calculate payroll for each employee
      let totalGross = 0;
      let totalDeductions = 0;
      let totalNet = 0;
      let totalEmployerCost = 0;

      const payrollItems = employees?.map((emp) => {
        const gross = emp.base_salary || (emp.hourly_rate || 0) * 160; // Assume 160 hrs/month
        const federalTax = gross * 0.22;
        const stateTax = gross * 0.05;
        const socialSecurity = gross * 0.062;
        const medicare = gross * 0.0145;
        const deductions = federalTax + stateTax + socialSecurity + medicare;
        const net = gross - deductions;
        const employerSS = gross * 0.062;
        const employerMedicare = gross * 0.0145;
        const employerCost = gross + employerSS + employerMedicare;

        totalGross += gross;
        totalDeductions += deductions;
        totalNet += net;
        totalEmployerCost += employerCost;

        return {
          org_id: profile.org_id,
          employee_id: emp.id,
          gross_pay: gross,
          federal_tax: federalTax,
          state_tax: stateTax,
          social_security: socialSecurity,
          medicare: medicare,
          total_deductions: deductions,
          net_pay: net,
          employer_ss: employerSS,
          employer_medicare: employerMedicare,
          total_employer_cost: employerCost,
        };
      }) || [];

      // Create payroll run
      const { data: run, error: runError } = await supabase
        .from("payroll_runs")
        .insert({
          org_id: profile.org_id,
          payroll_period_id: periodId,
          run_number: runNumber,
          total_gross: totalGross,
          total_deductions: totalDeductions,
          total_net: totalNet,
          total_employer_cost: totalEmployerCost,
          employee_count: payrollItems.length,
          status: "draft",
        })
        .select()
        .single();
      if (runError) throw runError;

      // Create payroll items
      if (payrollItems.length > 0) {
        const { error: itemsError } = await supabase
          .from("payroll_items")
          .insert(payrollItems.map((item) => ({ ...item, payroll_run_id: run.id })));
        if (itemsError) throw itemsError;
      }

      return run;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
      toast.success("Payroll run created");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const usePayrollItems = (runId?: string) => {
  return useQuery({
    queryKey: ["payroll-items", runId],
    queryFn: async () => {
      if (!runId) return [];
      const { data, error } = await supabase
        .from("payroll_items")
        .select("*, employee:employees(*)")
        .eq("payroll_run_id", runId);
      if (error) throw error;
      return data as PayrollItem[];
    },
    enabled: !!runId,
  });
};

export const usePostPayrollToGL = () => {
  return useMutation({
    mutationFn: async (runId: string): Promise<never> => {
      void runId;
      throw new Error("Payroll posting is unavailable pending an atomic payroll-to-GL workflow.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

// HR Stats
export const useHRStats = () => {
  const { data: employees = [] } = useEmployees();
  const { data: departments = [] } = useDepartments();
  const { data: runs = [] } = usePayrollRuns();

  const activeEmployees = employees.filter((e) => e.employment_status === "active").length;
  const totalHeadcount = employees.length;
  const avgSalary = employees.reduce((sum, e) => sum + (e.base_salary || 0), 0) / (activeEmployees || 1);
  const lastPayrollTotal = runs[0]?.total_net || 0;

  return {
    activeEmployees,
    totalHeadcount,
    departmentCount: departments.length,
    avgSalary,
    lastPayrollTotal,
  };
};
