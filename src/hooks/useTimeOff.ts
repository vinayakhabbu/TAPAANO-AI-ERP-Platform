import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface TimeOffType {
  id: string;
  org_id: string;
  name: string;
  code: string;
  default_days_per_year: number;
  is_paid: boolean;
  is_active: boolean;
}

export interface TimeOffBalance {
  id: string;
  org_id: string;
  employee_id: string;
  time_off_type_id: string;
  year: number;
  accrued_days: number;
  used_days: number;
  carried_over: number;
  adjusted_days: number;
  time_off_type?: TimeOffType;
}

export interface TimeOffRequest {
  id: string;
  org_id: string;
  employee_id: string;
  time_off_type_id: string;
  start_date: string;
  end_date: string;
  days_requested: number;
  reason: string | null;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  employee?: { first_name: string; last_name: string };
  time_off_type?: TimeOffType;
}

export const useTimeOffTypes = () => {
  return useQuery({
    queryKey: ["time-off-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_off_types")
        .select("*")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as TimeOffType[];
    },
  });
};

export const useTimeOffBalances = (employeeId?: string) => {
  return useQuery({
    queryKey: ["time-off-balances", employeeId],
    queryFn: async () => {
      let query = supabase
        .from("time_off_balances")
        .select("*, time_off_type:time_off_types(*)")
        .eq("year", new Date().getFullYear());
      
      if (employeeId) {
        query = query.eq("employee_id", employeeId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as TimeOffBalance[];
    },
  });
};

export const useTimeOffRequests = () => {
  return useQuery({
    queryKey: ["time-off-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_off_requests")
        .select("*, time_off_type:time_off_types(*)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as TimeOffRequest[];
    },
  });
};

export const useCreateTimeOffRequest = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (request: {
      employee_id: string;
      time_off_type_id: string;
      start_date: string;
      end_date: string;
      days_requested: number;
      reason?: string;
    }) => {
      const { data: profile } = await supabase.from("profiles").select("org_id").single();
      if (!profile?.org_id) throw new Error("No organization found");

      const { data, error } = await supabase
        .from("time_off_requests")
        .insert({
          org_id: profile.org_id,
          ...request,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-off-requests"] });
      toast.success("Time off request submitted");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useApproveTimeOffRequest = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ requestId, approverId }: { requestId: string; approverId: string }) => {
      const { data, error } = await supabase
        .from("time_off_requests")
        .update({
          status: "approved",
          approved_by: approverId,
          approved_at: new Date().toISOString(),
        })
        .eq("id", requestId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-off-requests"] });
      queryClient.invalidateQueries({ queryKey: ["time-off-balances"] });
      toast.success("Time off request approved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useRejectTimeOffRequest = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ requestId, reason }: { requestId: string; reason: string }) => {
      const { data, error } = await supabase
        .from("time_off_requests")
        .update({
          status: "rejected",
          rejection_reason: reason,
        })
        .eq("id", requestId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-off-requests"] });
      toast.success("Time off request rejected");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useRejectTimeOffRequest = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ requestId, reason }: { requestId: string; reason: string }) => {
      const { data, error } = await supabase
        .from("time_off_requests")
        .update({
          status: "rejected",
          rejection_reason: reason,
        })
        .eq("id", requestId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-off-requests"] });
      toast.success("Time off request rejected");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};
