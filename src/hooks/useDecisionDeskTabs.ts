import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface DecisionDeskTab {
  id: string;
  org_id: string;
  tab_key: string;
  tab_label: string;
  icon_name: string;
  is_visible: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

// Default tabs configuration (fallback when no DB config exists)
export const DEFAULT_TABS: Omit<DecisionDeskTab, 'id' | 'org_id' | 'created_at' | 'updated_at'>[] = [
  { tab_key: 'decisions', tab_label: 'Decision Log', icon_name: 'FileText', is_visible: true, display_order: 1 },
  { tab_key: 'precedents', tab_label: 'Precedents', icon_name: 'Scale', is_visible: true, display_order: 2 },
  { tab_key: 'agent-runs', tab_label: 'Agent Runs', icon_name: 'Bot', is_visible: true, display_order: 3 },
  { tab_key: 'entity-graph', tab_label: 'Entity Graph', icon_name: 'Network', is_visible: true, display_order: 4 },
  { tab_key: 'autonomous', tab_label: 'Autonomous Approver', icon_name: 'Zap', is_visible: true, display_order: 5 },
  { tab_key: 'anomalies', tab_label: 'Anomalies', icon_name: 'AlertTriangle', is_visible: true, display_order: 6 },
  { tab_key: 'analytics', tab_label: 'Analytics', icon_name: 'BarChart3', is_visible: true, display_order: 7 },
];

export function useDecisionDeskTabs() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['decision-desk-tabs', profile?.org_id],
    queryFn: async () => {
      if (!profile?.org_id) return [];

      const { data, error } = await supabase
        .from('decision_desk_tabs')
        .select('*')
        .eq('org_id', profile.org_id)
        .order('display_order', { ascending: true });

      if (error) throw error;
      return data as DecisionDeskTab[];
    },
    enabled: !!profile?.org_id,
  });
}

export function useVisibleTabs() {
  const { data: tabs, isLoading, error } = useDecisionDeskTabs();

  // Return visible tabs sorted by display_order, or defaults if no data
  const visibleTabs = tabs?.length 
    ? tabs.filter(tab => tab.is_visible).sort((a, b) => a.display_order - b.display_order)
    : DEFAULT_TABS.filter(tab => tab.is_visible).map((tab, idx) => ({
        ...tab,
        id: `default-${idx}`,
        org_id: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

  return { tabs: visibleTabs, isLoading, error };
}

export function useUpdateTabVisibility() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ tabId, isVisible }: { tabId: string; isVisible: boolean }) => {
      const { error } = await supabase
        .from('decision_desk_tabs')
        .update({ is_visible: isVisible })
        .eq('id', tabId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['decision-desk-tabs'] });
    },
  });
}

export function useUpdateTabOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: { id: string; display_order: number }[]) => {
      // Update each tab's display order
      for (const update of updates) {
        const { error } = await supabase
          .from('decision_desk_tabs')
          .update({ display_order: update.display_order })
          .eq('id', update.id);

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['decision-desk-tabs'] });
    },
  });
}

export function useUpdateTabLabel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ tabId, label }: { tabId: string; label: string }) => {
      const { error } = await supabase
        .from('decision_desk_tabs')
        .update({ tab_label: label })
        .eq('id', tabId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['decision-desk-tabs'] });
    },
  });
}
