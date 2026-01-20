import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export interface AllocationRule {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  source_account_id: string | null;
  allocation_method: string;
  run_frequency: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  source_account?: { code: string; name: string } | null;
}

export interface AllocationRuleTarget {
  id: string;
  rule_id: string;
  target_cost_center_id: string | null;
  target_project_id: string | null;
  target_account_id: string | null;
  percentage: number;
  formula: string | null;
  created_at: string;
  target_cost_center?: { code: string; name: string } | null;
  target_project?: { code: string; name: string } | null;
  target_account?: { code: string; name: string } | null;
}

export interface AllocationRun {
  id: string;
  org_id: string;
  rule_id: string;
  run_date: string;
  period_start: string;
  period_end: string;
  source_amount: number;
  status: string;
  journal_entry_id: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
  allocation_rule?: { name: string } | null;
}

export function useAllocationRules() {
  const { profile } = useAuth();
  
  return useQuery({
    queryKey: ['allocation-rules', profile?.org_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('allocation_rules')
        .select(`
          *,
          source_account:accounts!allocation_rules_source_account_id_fkey(code, name)
        `)
        .order('name');
      
      if (error) throw error;
      return data as AllocationRule[];
    },
    enabled: !!profile?.org_id,
  });
}

export function useAllocationRuleTargets(ruleId: string | null) {
  return useQuery({
    queryKey: ['allocation-rule-targets', ruleId],
    queryFn: async () => {
      if (!ruleId) return [];
      
      const { data, error } = await supabase
        .from('allocation_rule_targets')
        .select(`
          *,
          target_cost_center:cost_centers(code, name),
          target_project:projects(name),
          target_account:accounts!allocation_rule_targets_target_account_id_fkey(code, name)
        `)
        .eq('rule_id', ruleId)
        .order('percentage', { ascending: false });
      
      if (error) throw error;
      return data as unknown as AllocationRuleTarget[];
    },
    enabled: !!ruleId,
  });
}

export function useAllocationRuns() {
  const { profile } = useAuth();
  
  return useQuery({
    queryKey: ['allocation-runs', profile?.org_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('allocation_runs')
        .select(`
          *,
          allocation_rule:allocation_rules(name)
        `)
        .order('run_date', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data as AllocationRun[];
    },
    enabled: !!profile?.org_id,
  });
}

export function useCreateAllocationRule() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  
  return useMutation({
    mutationFn: async (data: {
      name: string;
      description?: string;
      source_account_id?: string;
      allocation_method: string;
      run_frequency: string;
    }) => {
      if (!profile?.org_id) throw new Error("No organization");
      
      const { data: result, error } = await supabase
        .from('allocation_rules')
        .insert({
          ...data,
          org_id: profile.org_id,
        })
        .select()
        .single();
      
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allocation-rules'] });
      toast.success("Allocation rule created");
    },
    onError: (error: Error) => {
      toast.error(`Failed to create rule: ${error.message}`);
    },
  });
}

export function useCreateAllocationTarget() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: {
      rule_id: string;
      target_cost_center_id?: string;
      target_project_id?: string;
      target_account_id?: string;
      percentage: number;
      formula?: string;
    }) => {
      const { data: result, error } = await supabase
        .from('allocation_rule_targets')
        .insert(data)
        .select()
        .single();
      
      if (error) throw error;
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['allocation-rule-targets', variables.rule_id] });
      toast.success("Allocation target added");
    },
    onError: (error: Error) => {
      toast.error(`Failed to add target: ${error.message}`);
    },
  });
}

export function useRunAllocation() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  
  return useMutation({
    mutationFn: async (data: {
      rule_id: string;
      period_start: string;
      period_end: string;
      source_amount: number;
    }) => {
      if (!profile?.org_id) throw new Error("No organization");
      
      // Create allocation run record
      const { data: run, error: runError } = await supabase
        .from('allocation_runs')
        .insert({
          org_id: profile.org_id,
          rule_id: data.rule_id,
          period_start: data.period_start,
          period_end: data.period_end,
          source_amount: data.source_amount,
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .select()
        .single();
      
      if (runError) throw runError;
      return run;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allocation-runs'] });
      toast.success("Allocation run completed");
    },
    onError: (error: Error) => {
      toast.error(`Allocation failed: ${error.message}`);
    },
  });
}

export function useDeleteAllocationRule() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (ruleId: string) => {
      const { error } = await supabase
        .from('allocation_rules')
        .delete()
        .eq('id', ruleId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allocation-rules'] });
      toast.success("Allocation rule deleted");
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete: ${error.message}`);
    },
  });
}
