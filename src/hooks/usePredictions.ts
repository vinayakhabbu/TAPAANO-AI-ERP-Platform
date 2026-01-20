import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export interface CashFlowPrediction {
  id: string;
  org_id: string;
  entity_id: string | null;
  prediction_date: string;
  forecast_date: string;
  predicted_inflow: number;
  predicted_outflow: number;
  predicted_balance: number;
  confidence_score: number;
  factors: Record<string, any> | null;
  model_version: string | null;
  created_at: string;
}

export interface RevenuePrediction {
  id: string;
  org_id: string;
  prediction_date: string;
  forecast_period: string;
  predicted_revenue: number;
  predicted_pipeline_value: number;
  weighted_pipeline: number;
  confidence_score: number;
  factors: Record<string, any> | null;
  model_version: string | null;
  created_at: string;
}

export function useCashFlowPredictions(days: number = 90) {
  const { profile } = useAuth();
  
  return useQuery({
    queryKey: ['cash-flow-predictions', profile?.org_id, days],
    queryFn: async () => {
      const today = new Date();
      const futureDate = new Date();
      futureDate.setDate(today.getDate() + days);
      
      const { data, error } = await supabase
        .from('cash_flow_predictions')
        .select('*')
        .gte('forecast_date', today.toISOString().split('T')[0])
        .lte('forecast_date', futureDate.toISOString().split('T')[0])
        .order('forecast_date');
      
      if (error) throw error;
      return data as CashFlowPrediction[];
    },
    enabled: !!profile?.org_id,
  });
}

export function useRevenuePredictions() {
  const { profile } = useAuth();
  
  return useQuery({
    queryKey: ['revenue-predictions', profile?.org_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('revenue_predictions')
        .select('*')
        .order('forecast_period', { ascending: false })
        .limit(12);
      
      if (error) throw error;
      return data as RevenuePrediction[];
    },
    enabled: !!profile?.org_id,
  });
}

export function useGenerateCashFlowPrediction() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  
  return useMutation({
    mutationFn: async (options: { days?: number; entityId?: string }) => {
      if (!profile?.org_id) throw new Error("No organization");
      
      // Fetch AR/AP data for prediction
      const [arData, apData, bankData] = await Promise.all([
        supabase
          .from('invoices')
          .select('total, due_date')
          .in('status', ['sent', 'overdue']),
        supabase
          .from('bills')
          .select('total, due_date')
          .in('status', ['pending', 'overdue']),
        supabase
          .from('bank_accounts')
          .select('current_balance')
          .eq('is_active', true),
      ]);
      
      const currentBalance = (bankData.data || []).reduce((sum, acc) => sum + acc.current_balance, 0);
      const days = options.days || 90;
      const predictions: Omit<CashFlowPrediction, 'id' | 'created_at'>[] = [];
      
      // Generate daily predictions
      let runningBalance = currentBalance;
      const today = new Date();
      
      for (let i = 1; i <= days; i++) {
        const forecastDate = new Date(today);
        forecastDate.setDate(today.getDate() + i);
        const dateStr = forecastDate.toISOString().split('T')[0];
        
        // Calculate expected inflows (AR due on this date)
        const inflows = (arData.data || [])
          .filter(inv => inv.due_date === dateStr)
          .reduce((sum, inv) => sum + inv.total, 0);
        
        // Calculate expected outflows (AP due on this date)
        const outflows = (apData.data || [])
          .filter(bill => bill.due_date === dateStr)
          .reduce((sum, bill) => sum + bill.total, 0);
        
        runningBalance = runningBalance + inflows - outflows;
        
        predictions.push({
          org_id: profile.org_id,
          entity_id: options.entityId || null,
          prediction_date: today.toISOString().split('T')[0],
          forecast_date: dateStr,
          predicted_inflow: inflows,
          predicted_outflow: outflows,
          predicted_balance: runningBalance,
          confidence_score: Math.max(0.5, 0.95 - (i * 0.005)), // Confidence decreases over time
          factors: {
            ar_count: (arData.data || []).filter(inv => inv.due_date === dateStr).length,
            ap_count: (apData.data || []).filter(bill => bill.due_date === dateStr).length,
          },
          model_version: 'v1.0-simple',
        });
      }
      
      // Insert predictions
      const { error } = await supabase
        .from('cash_flow_predictions')
        .insert(predictions);
      
      if (error) throw error;
      
      return predictions;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-flow-predictions'] });
      toast.success("Cash flow prediction generated");
    },
    onError: (error: Error) => {
      toast.error(`Failed to generate prediction: ${error.message}`);
    },
  });
}

export function useGenerateRevenuePrediction() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  
  return useMutation({
    mutationFn: async () => {
      if (!profile?.org_id) throw new Error("No organization");
      
      // Fetch pipeline data - cast to any to avoid TS2589 deep type instantiation
      type OpportunityRow = { expected_value: number | null; probability: number | null; expected_close_date: string | null; stage: string | null };
      const query = supabase.from('opportunities').select('expected_value, probability, expected_close_date, stage') as any;
      const result = await query.eq('is_won', false).eq('is_lost', false);
      const opportunities = (result.data || []) as OpportunityRow[];
      
      // Group by quarter
      const quarterMap = new Map<string, { total: number; weighted: number }>();
      
      (opportunities || []).forEach(opp => {
        if (!opp.expected_close_date) return;
        
        const date = new Date(opp.expected_close_date);
        const quarter = `${date.getFullYear()}-Q${Math.ceil((date.getMonth() + 1) / 3)}`;
        
        const existing = quarterMap.get(quarter) || { total: 0, weighted: 0 };
        existing.total += opp.expected_value || 0;
        existing.weighted += (opp.expected_value || 0) * (opp.probability || 0) / 100;
        quarterMap.set(quarter, existing);
      });
      
      const predictions: Array<{
        org_id: string;
        prediction_date: string;
        forecast_period: string;
        predicted_revenue: number;
        predicted_pipeline_value: number;
        weighted_pipeline: number;
        confidence_score: number;
        factors: Record<string, number>;
        model_version: string;
      }> = [];
      
      quarterMap.forEach((values, period) => {
        predictions.push({
          org_id: profile.org_id,
          prediction_date: new Date().toISOString().split('T')[0],
          forecast_period: period,
          predicted_revenue: values.weighted,
          predicted_pipeline_value: values.total,
          weighted_pipeline: values.weighted,
          confidence_score: 0.75,
          factors: {
            opportunity_count: opportunities?.filter(o => {
              if (!o.expected_close_date) return false;
              const d = new Date(o.expected_close_date);
              return `${d.getFullYear()}-Q${Math.ceil((d.getMonth() + 1) / 3)}` === period;
            }).length || 0,
          },
          model_version: 'v1.0-pipeline',
        });
      });
      
      if (predictions.length > 0) {
        const { error } = await supabase
          .from('revenue_predictions')
          .insert(predictions);
        
        if (error) throw error;
      }
      
      return predictions;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['revenue-predictions'] });
      toast.success("Revenue prediction generated");
    },
    onError: (error: Error) => {
      toast.error(`Failed to generate prediction: ${error.message}`);
    },
  });
}
