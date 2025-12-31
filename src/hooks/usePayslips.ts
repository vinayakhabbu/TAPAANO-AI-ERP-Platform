import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Payslip {
  id: string;
  org_id: string;
  payroll_item_id: string;
  payroll_run_id: string;
  employee_id: string;
  payslip_number: string;
  period_start: string;
  period_end: string;
  pay_date: string;
  gross_pay: number;
  total_deductions: number;
  net_pay: number;
  earnings_breakdown: Record<string, number>;
  deductions_breakdown: Record<string, number>;
  ytd_gross: number;
  ytd_deductions: number;
  ytd_net: number;
  generated_at: string;
  employee?: { first_name: string; last_name: string; employee_number: string };
}

export const usePayslips = (employeeId?: string) => {
  return useQuery({
    queryKey: ["payslips", employeeId],
    queryFn: async () => {
      let query = supabase
        .from("payslips")
        .select("*, employee:employees(first_name, last_name, employee_number)")
        .order("pay_date", { ascending: false });
      
      if (employeeId) {
        query = query.eq("employee_id", employeeId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as Payslip[];
    },
  });
};

export const useGeneratePayslips = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payrollRunId: string) => {
      const { data: profile } = await supabase.from("profiles").select("org_id").single();
      if (!profile?.org_id) throw new Error("No organization found");

      // Get payroll run and period
      const { data: run, error: runError } = await supabase
        .from("payroll_runs")
        .select("*, payroll_period:payroll_periods(*)")
        .eq("id", payrollRunId)
        .single();
      if (runError) throw runError;

      // Get payroll items
      const { data: items, error: itemsError } = await supabase
        .from("payroll_items")
        .select("*")
        .eq("payroll_run_id", payrollRunId);
      if (itemsError) throw itemsError;

      const period = run.payroll_period;
      
      // Generate payslips for each item
      const payslips = items?.map((item, index) => ({
        org_id: profile.org_id,
        payroll_item_id: item.id,
        payroll_run_id: payrollRunId,
        employee_id: item.employee_id,
        payslip_number: `PS-${run.run_number}-${String(index + 1).padStart(3, "0")}`,
        period_start: period.period_start,
        period_end: period.period_end,
        pay_date: period.pay_date,
        gross_pay: item.gross_pay,
        total_deductions: item.total_deductions,
        net_pay: item.net_pay,
        earnings_breakdown: { "Base Salary": item.gross_pay },
        deductions_breakdown: {
          "Federal Tax": item.federal_tax || 0,
          "State Tax": item.state_tax || 0,
          "Social Security": item.social_security || 0,
          "Medicare": item.medicare || 0,
        },
      }));

      if (payslips && payslips.length > 0) {
        const { error: insertError } = await supabase
          .from("payslips")
          .insert(payslips);
        if (insertError) throw insertError;
      }

      return payslips;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payslips"] });
      toast.success("Payslips generated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};
