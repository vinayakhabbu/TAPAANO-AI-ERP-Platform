import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export interface ScheduledReport {
  id: string;
  org_id: string;
  name: string;
  report_type: string;
  report_config: Record<string, any>;
  schedule_frequency: string;
  schedule_day: number | null;
  schedule_time: string;
  recipients: string[];
  is_active: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export function useScheduledReports() {
  const { profile } = useAuth();
  
  return useQuery({
    queryKey: ['scheduled-reports', profile?.org_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('scheduled_reports')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data as ScheduledReport[];
    },
    enabled: !!profile?.org_id,
  });
}

export function useCreateScheduledReport() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  
  return useMutation({
    mutationFn: async (data: {
      name: string;
      report_type: string;
      report_config?: Record<string, any>;
      schedule_frequency: string;
      schedule_day?: number;
      schedule_time?: string;
      recipients: string[];
    }) => {
      if (!profile?.org_id) throw new Error("No organization");
      
      // Calculate next run time based on schedule
      const now = new Date();
      let nextRun = new Date();
      
      if (data.schedule_frequency === 'daily') {
        nextRun.setDate(now.getDate() + 1);
      } else if (data.schedule_frequency === 'weekly') {
        nextRun.setDate(now.getDate() + 7);
      } else if (data.schedule_frequency === 'monthly') {
        nextRun.setMonth(now.getMonth() + 1);
      }
      
      const { data: result, error } = await supabase
        .from('scheduled_reports')
        .insert({
          ...data,
          org_id: profile.org_id,
          report_config: data.report_config || {},
          schedule_time: data.schedule_time || '08:00',
          next_run_at: nextRun.toISOString(),
        })
        .select()
        .single();
      
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-reports'] });
      toast.success("Scheduled report created");
    },
    onError: (error: Error) => {
      toast.error(`Failed to create: ${error.message}`);
    },
  });
}

export function useUpdateScheduledReport() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<ScheduledReport> & { id: string }) => {
      const { data: result, error } = await supabase
        .from('scheduled_reports')
        .update({
          ...data,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-reports'] });
      toast.success("Scheduled report updated");
    },
    onError: (error: Error) => {
      toast.error(`Failed to update: ${error.message}`);
    },
  });
}

export function useDeleteScheduledReport() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (reportId: string) => {
      const { error } = await supabase
        .from('scheduled_reports')
        .delete()
        .eq('id', reportId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-reports'] });
      toast.success("Scheduled report deleted");
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete: ${error.message}`);
    },
  });
}

export function useToggleScheduledReport() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { data, error } = await supabase
        .from('scheduled_reports')
        .update({ is_active, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-reports'] });
      toast.success(`Report ${data.is_active ? 'enabled' : 'disabled'}`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to toggle: ${error.message}`);
    },
  });
}
