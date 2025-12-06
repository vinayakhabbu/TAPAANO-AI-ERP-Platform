import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Opportunity {
  id: string;
  opportunity_name: string;
  opportunity_number: string;
  description: string | null;
  stage: string;
  probability: number;
  expected_value: number;
  expected_close_date: string | null;
  source: string | null;
  notes: string | null;
  customer_id: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  won_reason: string | null;
  lost_reason: string | null;
  customers?: { name: string } | null;
}

export const OPPORTUNITY_STAGES = [
  { value: "lead", label: "Lead", probability: 10, color: "bg-muted text-muted-foreground" },
  { value: "qualified", label: "Qualified", probability: 25, color: "bg-secondary text-secondary-foreground" },
  { value: "proposal", label: "Proposal", probability: 50, color: "bg-primary/10 text-primary" },
  { value: "negotiation", label: "Negotiation", probability: 75, color: "bg-warning/10 text-warning" },
  { value: "closed_won", label: "Closed Won", probability: 100, color: "bg-success/10 text-success" },
  { value: "closed_lost", label: "Closed Lost", probability: 0, color: "bg-destructive/10 text-destructive" },
] as const;

export const useOpportunities = () => {
  return useQuery({
    queryKey: ["opportunities"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("opportunities")
        .select(`
          *,
          customers (name)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Opportunity[];
    },
  });
};

export const useCreateOpportunity = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      opportunity_name: string;
      customer_id?: string;
      description?: string;
      stage?: string;
      probability?: number;
      expected_value: number;
      expected_close_date?: string;
      source?: string;
      notes?: string;
    }) => {
      // Get org_id
      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .single();

      if (!profile) throw new Error("No profile found");

      // Generate opportunity number
      const oppNumber = `OPP-${Date.now().toString(36).toUpperCase()}`;

      const { data: opportunity, error } = await supabase
        .from("opportunities")
        .insert({
          org_id: profile.org_id,
          opportunity_number: oppNumber,
          opportunity_name: data.opportunity_name,
          customer_id: data.customer_id || null,
          description: data.description || null,
          stage: data.stage || "lead",
          probability: data.probability || 10,
          expected_value: data.expected_value,
          expected_close_date: data.expected_close_date || null,
          source: data.source || null,
          notes: data.notes || null,
        })
        .select()
        .single();

      if (error) throw error;
      return opportunity;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["opportunities"] });
    },
  });
};

export const useUpdateOpportunityStage = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, stage, reason }: { id: string; stage: string; reason?: string }) => {
      const stageConfig = OPPORTUNITY_STAGES.find((s) => s.value === stage);
      const updateData: Record<string, unknown> = {
        stage,
        probability: stageConfig?.probability || 0,
      };

      if (stage === "closed_won") {
        updateData.closed_at = new Date().toISOString();
        updateData.won_reason = reason || null;
      } else if (stage === "closed_lost") {
        updateData.closed_at = new Date().toISOString();
        updateData.lost_reason = reason || null;
      }

      const { error } = await supabase
        .from("opportunities")
        .update(updateData)
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["opportunities"] });
    },
  });
};

export const useOpportunityStats = () => {
  const { data: opportunities } = useOpportunities();

  const stats = {
    total: opportunities?.length || 0,
    open: opportunities?.filter((o) => !["closed_won", "closed_lost"].includes(o.stage)).length || 0,
    won: opportunities?.filter((o) => o.stage === "closed_won").length || 0,
    lost: opportunities?.filter((o) => o.stage === "closed_lost").length || 0,
    totalValue: opportunities?.reduce((sum, o) => sum + o.expected_value, 0) || 0,
    weightedValue: opportunities
      ?.filter((o) => !["closed_won", "closed_lost"].includes(o.stage))
      .reduce((sum, o) => sum + (o.expected_value * o.probability) / 100, 0) || 0,
  };

  return stats;
};
