import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfMonth, endOfMonth, format, subMonths, addMonths, startOfQuarter, endOfQuarter } from "date-fns";

interface SalesTarget {
  id: string;
  org_id: string;
  period_type: string;
  period_start: string;
  period_end: string;
  target_amount: number;
  created_at: string;
}

interface Opportunity {
  id: string;
  stage: string;
  expected_value: number;
  probability: number | null;
  expected_close_date: string | null;
  closed_at: string | null;
  created_at: string;
}

interface Invoice {
  id: string;
  total: number;
  status: string;
  issue_date: string;
}

export function useSalesTargets() {
  return useQuery({
    queryKey: ["sales-targets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_targets")
        .select("*")
        .order("period_start", { ascending: false });
      if (error) throw error;
      return data as SalesTarget[];
    },
  });
}

export function useCreateSalesTarget() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (target: {
      period_type: string;
      period_start: string;
      period_end: string;
      target_amount: number;
    }) => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .single();
      if (!profile?.org_id) throw new Error("No organization found");

      const { data, error } = await supabase
        .from("sales_targets")
        .insert({
          org_id: profile.org_id,
          ...target,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-targets"] });
    },
  });
}

export function useSalesForecastData() {
  const { data: opportunities } = useQuery({
    queryKey: ["opportunities-for-forecast"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("opportunities")
        .select("id, stage, expected_value, probability, expected_close_date, closed_at, created_at")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Opportunity[];
    },
  });

  const { data: invoices } = useQuery({
    queryKey: ["invoices-for-forecast"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, total, status, issue_date")
        .order("issue_date", { ascending: true });
      if (error) throw error;
      return data as Invoice[];
    },
  });

  const { data: targets } = useSalesTargets();

  // Calculate pipeline forecast by month
  const pipelineForecast = () => {
    if (!opportunities) return [];
    
    const months: Record<string, { month: string; weighted: number; bestCase: number; committed: number }> = {};
    const now = new Date();
    
    // Initialize next 6 months
    for (let i = 0; i < 6; i++) {
      const month = addMonths(now, i);
      const key = format(month, "yyyy-MM");
      months[key] = {
        month: format(month, "MMM yyyy"),
        weighted: 0,
        bestCase: 0,
        committed: 0,
      };
    }

    opportunities
      .filter((opp) => !["closed_won", "closed_lost"].includes(opp.stage))
      .forEach((opp) => {
        if (opp.expected_close_date) {
          const key = format(new Date(opp.expected_close_date), "yyyy-MM");
          if (months[key]) {
            const probability = opp.probability || 10;
            months[key].weighted += opp.expected_value * (probability / 100);
            months[key].bestCase += opp.expected_value;
            if (probability >= 70) {
              months[key].committed += opp.expected_value;
            }
          }
        }
      });

    return Object.values(months);
  };

  // Calculate historical trends
  const historicalTrends = () => {
    if (!invoices && !opportunities) return [];
    
    const months: Record<string, { month: string; actual: number; won: number }> = {};
    const now = new Date();
    
    // Past 6 months
    for (let i = 5; i >= 0; i--) {
      const month = subMonths(now, i);
      const key = format(month, "yyyy-MM");
      months[key] = {
        month: format(month, "MMM yyyy"),
        actual: 0,
        won: 0,
      };
    }

    // Sum invoices by month
    invoices?.forEach((inv) => {
      if (inv.status !== "draft" && inv.status !== "void") {
        const key = format(new Date(inv.issue_date), "yyyy-MM");
        if (months[key]) {
          months[key].actual += inv.total;
        }
      }
    });

    // Sum won opportunities by closed date
    opportunities
      ?.filter((opp) => opp.stage === "closed_won" && opp.closed_at)
      .forEach((opp) => {
        const key = format(new Date(opp.closed_at!), "yyyy-MM");
        if (months[key]) {
          months[key].won += opp.expected_value;
        }
      });

    return Object.values(months);
  };

  // Calculate target vs actual for current period
  const targetVsActual = () => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    const quarterStart = startOfQuarter(now);
    const quarterEnd = endOfQuarter(now);

    // Find matching targets
    const monthlyTarget = targets?.find(
      (t) =>
        t.period_type === "monthly" &&
        new Date(t.period_start) <= now &&
        new Date(t.period_end) >= now
    );

    const quarterlyTarget = targets?.find(
      (t) =>
        t.period_type === "quarterly" &&
        new Date(t.period_start) <= now &&
        new Date(t.period_end) >= now
    );

    // Calculate actual revenue from invoices
    const monthlyActual = invoices
      ?.filter((inv) => {
        const date = new Date(inv.issue_date);
        return (
          inv.status !== "draft" &&
          inv.status !== "void" &&
          date >= monthStart &&
          date <= monthEnd
        );
      })
      .reduce((sum, inv) => sum + inv.total, 0) || 0;

    const quarterlyActual = invoices
      ?.filter((inv) => {
        const date = new Date(inv.issue_date);
        return (
          inv.status !== "draft" &&
          inv.status !== "void" &&
          date >= quarterStart &&
          date <= quarterEnd
        );
      })
      .reduce((sum, inv) => sum + inv.total, 0) || 0;

    // Calculate pipeline value for gap analysis
    const monthlyPipeline = opportunities
      ?.filter((opp) => {
        if (["closed_won", "closed_lost"].includes(opp.stage)) return false;
        if (!opp.expected_close_date) return false;
        const date = new Date(opp.expected_close_date);
        return date >= monthStart && date <= monthEnd;
      })
      .reduce((sum, opp) => sum + opp.expected_value * ((opp.probability || 10) / 100), 0) || 0;

    const quarterlyPipeline = opportunities
      ?.filter((opp) => {
        if (["closed_won", "closed_lost"].includes(opp.stage)) return false;
        if (!opp.expected_close_date) return false;
        const date = new Date(opp.expected_close_date);
        return date >= quarterStart && date <= quarterEnd;
      })
      .reduce((sum, opp) => sum + opp.expected_value * ((opp.probability || 10) / 100), 0) || 0;

    return {
      monthly: {
        target: monthlyTarget?.target_amount || 0,
        actual: monthlyActual,
        pipeline: monthlyPipeline,
        projected: monthlyActual + monthlyPipeline,
      },
      quarterly: {
        target: quarterlyTarget?.target_amount || 0,
        actual: quarterlyActual,
        pipeline: quarterlyPipeline,
        projected: quarterlyActual + quarterlyPipeline,
      },
    };
  };

  return {
    pipelineForecast: pipelineForecast(),
    historicalTrends: historicalTrends(),
    targetVsActual: targetVsActual(),
    isLoading: !opportunities && !invoices,
  };
}
