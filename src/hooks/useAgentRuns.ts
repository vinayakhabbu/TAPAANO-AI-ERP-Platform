import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface AgentRunStep {
  id: string;
  run_id: string;
  step_number: number;
  step_type: string;
  step_name: string;
  step_status: string;
  started_at: string | null;
  completed_at: string | null;
  input_data: Record<string, unknown>;
  output_data: Record<string, unknown>;
  duration_ms: number | null;
  error_message: string | null;
  created_at: string;
}

export interface AgentRun {
  id: string;
  org_id: string;
  run_type: string;
  run_status: string;
  started_at: string;
  completed_at: string | null;
  trigger_source: string | null;
  trigger_context: Record<string, unknown>;
  result_summary: string | null;
  error_message: string | null;
  created_at: string;
  steps?: AgentRunStep[];
}

export const useAgentRuns = (params?: {
  limit?: number;
  run_type?: string;
}) => {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ["agent-runs", params?.limit, params?.run_type],
    queryFn: async (): Promise<AgentRun[]> => {
      if (!profile?.org_id) return [];

      let query = supabase
        .from("agent_runs")
        .select("*")
        .eq("org_id", profile.org_id)
        .order("started_at", { ascending: false });

      if (params?.run_type) {
        query = query.eq("run_type", params.run_type);
      }

      if (params?.limit) {
        query = query.limit(params.limit);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Failed to fetch agent runs:", error);
        return [];
      }

      return (data || []) as unknown as AgentRun[];
    },
    enabled: !!profile?.org_id,
  });
};

export const useAgentRunWithSteps = (runId: string | null) => {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ["agent-run-steps", runId],
    queryFn: async (): Promise<AgentRun | null> => {
      if (!runId || !profile?.org_id) return null;

      // Get the run
      const { data: run, error: runError } = await supabase
        .from("agent_runs")
        .select("*")
        .eq("id", runId)
        .single();

      if (runError || !run) {
        console.error("Failed to fetch agent run:", runError);
        return null;
      }

      // Get the steps
      const { data: steps, error: stepsError } = await supabase
        .from("agent_run_steps")
        .select("*")
        .eq("run_id", runId)
        .order("step_number", { ascending: true });

      if (stepsError) {
        console.error("Failed to fetch agent run steps:", stepsError);
      }

      return {
        ...(run as unknown as AgentRun),
        steps: (steps || []) as unknown as AgentRunStep[],
      };
    },
    enabled: !!runId && !!profile?.org_id,
  });
};