import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { notifyTimeOffResponse } from "./useNotifications";
import { captureDecisionTrace } from "./useDecisionLedger";
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
      // First get the request details for notification
      const { data: request } = await supabase
        .from("time_off_requests")
        .select("*, time_off_type:time_off_types(name), employee:employees!time_off_requests_employee_id_fkey(first_name, last_name, email, org_id)")
        .eq("id", requestId)
        .single();

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

      // Capture decision trace
      if (request?.employee?.org_id) {
        await captureDecisionTrace(request.employee.org_id, {
          decision_type: "time_off_approval",
          source_type: "time_off_request",
          source_id: requestId,
          approval_status: "approved",
          approval_channel: "human",
          input_snapshot: {
            employee_name: `${request.employee.first_name} ${request.employee.last_name}`,
            time_off_type: request.time_off_type?.name,
            start_date: request.start_date,
            end_date: request.end_date,
            days_requested: request.days_requested,
            reason: request.reason,
          },
          rationale_text: "Time off request approved by manager",
          commit_writes: [{
            entity: "time_off_requests",
            id: requestId,
            field: "status",
            before: request.status,
            after: "approved",
          }],
          entities: [{
            entity_type: "employee",
            entity_id: request.employee_id,
            entity_label: `${request.employee.first_name} ${request.employee.last_name}`,
          }],
        });
      }

      // Send email notification to employee
      if (request?.employee?.email) {
        notifyTimeOffResponse(
          request.employee.email,
          `${request.employee.first_name} ${request.employee.last_name}`,
          "Approved",
          request.start_date,
          request.end_date,
          request.time_off_type?.name || "Leave"
        );
      }

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
      // First get the request details for notification
      const { data: request } = await supabase
        .from("time_off_requests")
        .select("*, time_off_type:time_off_types(name), employee:employees!time_off_requests_employee_id_fkey(first_name, last_name, email, org_id)")
        .eq("id", requestId)
        .single();

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

      // Capture decision trace
      if (request?.employee?.org_id) {
        await captureDecisionTrace(request.employee.org_id, {
          decision_type: "time_off_rejection",
          source_type: "time_off_request",
          source_id: requestId,
          approval_status: "rejected",
          approval_channel: "human",
          input_snapshot: {
            employee_name: `${request.employee.first_name} ${request.employee.last_name}`,
            time_off_type: request.time_off_type?.name,
            start_date: request.start_date,
            end_date: request.end_date,
            days_requested: request.days_requested,
            reason: request.reason,
          },
          rationale_text: `Time off request rejected: ${reason}`,
          reason_codes: ["rejected_by_manager"],
          commit_writes: [{
            entity: "time_off_requests",
            id: requestId,
            field: "status",
            before: request.status,
            after: "rejected",
          }],
          entities: [{
            entity_type: "employee",
            entity_id: request.employee_id,
            entity_label: `${request.employee.first_name} ${request.employee.last_name}`,
          }],
        });
      }

      // Send email notification to employee
      if (request?.employee?.email) {
        notifyTimeOffResponse(
          request.employee.email,
          `${request.employee.first_name} ${request.employee.last_name}`,
          "Rejected",
          request.start_date,
          request.end_date,
          request.time_off_type?.name || "Leave"
        );
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-off-requests"] });
      toast.success("Time off request rejected");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};
