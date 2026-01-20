import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface AgentRun {
  id: string;
  org_id: string;
  run_type: string;
  run_status: string;
  started_at: string;
  completed_at: string | null;
  trigger_source: string | null;
  trigger_context: Record<string, unknown> | null;
  result_summary: string | null;
  error_message: string | null;
}

export interface AgentRunStep {
  id: string;
  run_id: string;
  step_number: number;
  step_type: string;
  step_name: string;
  step_status: string;
  started_at: string | null;
  completed_at: string | null;
  input_data: Record<string, unknown> | null;
  output_data: Record<string, unknown> | null;
  duration_ms: number | null;
  error_message: string | null;
}

/**
 * Starts a new agent run and returns the run ID
 */
export async function startAgentRun(
  supabase: SupabaseClient,
  orgId: string,
  runType: string,
  triggerSource: string,
  triggerContext?: Record<string, unknown>
): Promise<string | null> {
  const { data, error } = await supabase
    .from("agent_runs")
    .insert({
      org_id: orgId,
      run_type: runType,
      run_status: "running",
      started_at: new Date().toISOString(),
      trigger_source: triggerSource,
      trigger_context: triggerContext || {},
    })
    .select("id")
    .single();

  if (error) {
    console.error("Failed to start agent run:", error);
    return null;
  }

  return data.id;
}

/**
 * Logs a new step in an agent run
 */
export async function logAgentStep(
  supabase: SupabaseClient,
  runId: string,
  stepNumber: number,
  stepType: string,
  stepName: string,
  inputData?: Record<string, unknown>
): Promise<string | null> {
  const { data, error } = await supabase
    .from("agent_run_steps")
    .insert({
      run_id: runId,
      step_number: stepNumber,
      step_type: stepType,
      step_name: stepName,
      step_status: "running",
      started_at: new Date().toISOString(),
      input_data: inputData || {},
    })
    .select("id")
    .single();

  if (error) {
    console.error("Failed to log agent step:", error);
    return null;
  }

  return data.id;
}

/**
 * Completes an agent step with output data and optional error
 */
export async function completeAgentStep(
  supabase: SupabaseClient,
  stepId: string,
  startedAt: string,
  outputData?: Record<string, unknown>,
  errorMessage?: string
): Promise<void> {
  const completedAt = new Date().toISOString();
  const durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();

  const { error } = await supabase
    .from("agent_run_steps")
    .update({
      step_status: errorMessage ? "failed" : "completed",
      completed_at: completedAt,
      output_data: outputData || {},
      duration_ms: durationMs,
      error_message: errorMessage || null,
    })
    .eq("id", stepId);

  if (error) {
    console.error("Failed to complete agent step:", error);
  }
}

/**
 * Completes an agent run with summary and optional error
 */
export async function completeAgentRun(
  supabase: SupabaseClient,
  runId: string,
  resultSummary: string,
  errorMessage?: string
): Promise<void> {
  const { error } = await supabase
    .from("agent_runs")
    .update({
      run_status: errorMessage ? "failed" : "completed",
      completed_at: new Date().toISOString(),
      result_summary: resultSummary,
      error_message: errorMessage || null,
    })
    .eq("id", runId);

  if (error) {
    console.error("Failed to complete agent run:", error);
  }
}

/**
 * Helper class for managing agent run logging with automatic step tracking
 */
export class AgentRunLogger {
  private supabase: SupabaseClient;
  private runId: string | null = null;
  private currentStepNumber = 0;
  private stepStartTimes: Map<string, string> = new Map();

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  async start(
    orgId: string,
    runType: string,
    triggerSource: string,
    triggerContext?: Record<string, unknown>
  ): Promise<string | null> {
    this.runId = await startAgentRun(
      this.supabase,
      orgId,
      runType,
      triggerSource,
      triggerContext
    );
    return this.runId;
  }

  async step(
    stepType: string,
    stepName: string,
    inputData?: Record<string, unknown>
  ): Promise<string | null> {
    if (!this.runId) {
      console.error("Cannot log step: No active run");
      return null;
    }

    this.currentStepNumber++;
    const startedAt = new Date().toISOString();
    const stepId = await logAgentStep(
      this.supabase,
      this.runId,
      this.currentStepNumber,
      stepType,
      stepName,
      inputData
    );

    if (stepId) {
      this.stepStartTimes.set(stepId, startedAt);
    }

    return stepId;
  }

  async completeStep(
    stepId: string,
    outputData?: Record<string, unknown>,
    errorMessage?: string
  ): Promise<void> {
    const startedAt = this.stepStartTimes.get(stepId) || new Date().toISOString();
    await completeAgentStep(this.supabase, stepId, startedAt, outputData, errorMessage);
    this.stepStartTimes.delete(stepId);
  }

  async complete(resultSummary: string, errorMessage?: string): Promise<void> {
    if (!this.runId) {
      console.error("Cannot complete run: No active run");
      return;
    }

    await completeAgentRun(this.supabase, this.runId, resultSummary, errorMessage);
  }

  getRunId(): string | null {
    return this.runId;
  }
}
