import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";
import { addMonths, differenceInMonths, format } from "date-fns";

export interface PrepaidExpense {
  id: string;
  org_id: string;
  entity_id: string;
  vendor_id: string | null;
  description: string;
  reference_number: string | null;
  original_amount: number;
  remaining_amount: number;
  start_date: string;
  end_date: string;
  amortization_method: string;
  prepaid_account_id: string | null;
  expense_account_id: string | null;
  cost_center_id: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  vendor?: { name: string } | null;
  entity?: { name: string } | null;
  prepaid_account?: { code: string; name: string } | null;
  expense_account?: { code: string; name: string } | null;
}

export interface AmortizationScheduleLine {
  id: string;
  prepaid_expense_id: string;
  period_date: string;
  amount: number;
  cumulative_amount: number;
  remaining_balance: number;
  status: string;
  journal_entry_id: string | null;
  posted_at: string | null;
  created_at: string;
}

export function usePrepaidExpenses() {
  const { profile } = useAuth();
  
  return useQuery({
    queryKey: ['prepaid-expenses', profile?.org_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('prepaid_expenses')
        .select(`
          *,
          vendor:vendors(name),
          entity:entities(name),
          prepaid_account:accounts!prepaid_expenses_prepaid_account_id_fkey(code, name),
          expense_account:accounts!prepaid_expenses_expense_account_id_fkey(code, name)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as PrepaidExpense[];
    },
    enabled: !!profile?.org_id,
  });
}

export function useAmortizationSchedule(prepaidExpenseId: string | null) {
  return useQuery({
    queryKey: ['amortization-schedule', prepaidExpenseId],
    queryFn: async () => {
      if (!prepaidExpenseId) return [];
      
      const { data, error } = await supabase
        .from('amortization_schedule')
        .select('*')
        .eq('prepaid_expense_id', prepaidExpenseId)
        .order('period_date');
      
      if (error) throw error;
      return data as AmortizationScheduleLine[];
    },
    enabled: !!prepaidExpenseId,
  });
}

export function useCreatePrepaidExpense() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  
  return useMutation({
    mutationFn: async (data: {
      entity_id: string;
      vendor_id?: string;
      description: string;
      reference_number?: string;
      original_amount: number;
      start_date: string;
      end_date: string;
      amortization_method?: string;
      prepaid_account_id?: string;
      expense_account_id?: string;
      cost_center_id?: string;
      notes?: string;
    }) => {
      if (!profile?.org_id) throw new Error("No organization");
      
      // Create prepaid expense
      const { data: expense, error: expenseError } = await supabase
        .from('prepaid_expenses')
        .insert({
          ...data,
          org_id: profile.org_id,
          remaining_amount: data.original_amount,
          amortization_method: data.amortization_method || 'straight_line',
        })
        .select()
        .single();
      
      if (expenseError) throw expenseError;
      
      // Generate amortization schedule
      const startDate = new Date(data.start_date);
      const endDate = new Date(data.end_date);
      const months = differenceInMonths(endDate, startDate) + 1;
      const monthlyAmount = Number((data.original_amount / months).toFixed(2));
      
      const scheduleLines = [];
      let cumulative = 0;
      
      for (let i = 0; i < months; i++) {
        const periodDate = addMonths(startDate, i);
        const amount = i === months - 1 
          ? data.original_amount - cumulative 
          : monthlyAmount;
        cumulative += amount;
        
        scheduleLines.push({
          prepaid_expense_id: expense.id,
          period_date: format(periodDate, 'yyyy-MM-dd'),
          amount,
          cumulative_amount: cumulative,
          remaining_balance: data.original_amount - cumulative,
        });
      }
      
      const { error: scheduleError } = await supabase
        .from('amortization_schedule')
        .insert(scheduleLines);
      
      if (scheduleError) throw scheduleError;
      
      return expense;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prepaid-expenses'] });
      toast.success("Prepaid expense created with amortization schedule");
    },
    onError: (error: Error) => {
      toast.error(`Failed to create: ${error.message}`);
    },
  });
}

export function usePostAmortization() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (scheduleLineId: string) => {
      const { data, error } = await supabase
        .from('amortization_schedule')
        .update({
          status: 'posted',
          posted_at: new Date().toISOString(),
        })
        .eq('id', scheduleLineId)
        .select()
        .single();
      
      if (error) throw error;
      
      // Update prepaid expense remaining amount
      const { data: schedule } = await supabase
        .from('amortization_schedule')
        .select('prepaid_expense_id, amount')
        .eq('id', scheduleLineId)
        .single();
      
      if (schedule) {
        const { data: expense } = await supabase
          .from('prepaid_expenses')
          .select('remaining_amount')
          .eq('id', schedule.prepaid_expense_id)
          .single();
        
        if (expense) {
          const newRemaining = expense.remaining_amount - schedule.amount;
          await supabase
            .from('prepaid_expenses')
            .update({
              remaining_amount: newRemaining,
              status: newRemaining <= 0 ? 'fully_amortized' : 'active',
            })
            .eq('id', schedule.prepaid_expense_id);
        }
      }
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['amortization-schedule'] });
      queryClient.invalidateQueries({ queryKey: ['prepaid-expenses'] });
      toast.success("Amortization entry posted");
    },
    onError: (error: Error) => {
      toast.error(`Failed to post: ${error.message}`);
    },
  });
}

export function useDeletePrepaidExpense() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (expenseId: string) => {
      const { error } = await supabase
        .from('prepaid_expenses')
        .delete()
        .eq('id', expenseId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prepaid-expenses'] });
      toast.success("Prepaid expense deleted");
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete: ${error.message}`);
    },
  });
}
