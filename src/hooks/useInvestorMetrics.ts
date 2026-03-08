import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { startOfMonth, subMonths, format, eachMonthOfInterval } from "date-fns";

export interface MonthlyMetrics {
  period: string; // "YYYY-MM"
  periodLabel: string; // "Jan 2025"
  mrr: number;
  newMrr: number;
  churnedMrr: number;
  expansionMrr: number;
  contractionMrr: number;
  activeCustomers: number;
  newCustomers: number;
  churnedCustomers: number;
  nrr: number;
  grossChurnRate: number;
}

export interface InvestorMetricsSummary {
  currentMrr: number;
  arr: number;
  nrr: number;
  grossChurnRate: number;
  activeCustomers: number;
  mrrGrowthRate: number; // MoM %
  waterfall: MonthlyMetrics[];
  topCustomers: { customerId: string; customerName: string; mrr: number }[];
  isLoading: boolean;
}

function formatPeriod(date: Date) {
  return format(date, "yyyy-MM");
}

function formatPeriodLabel(date: Date) {
  return format(date, "MMM yyyy");
}

// Build 12 months of metrics from invoices data
function computeMetrics(
  invoices: any[],
  customers: any[]
): MonthlyMetrics[] {
  const now = new Date();
  const months = eachMonthOfInterval({
    start: subMonths(startOfMonth(now), 11),
    end: startOfMonth(now),
  });

  const customerMap = new Map(customers.map((c) => [c.id, c.name]));

  // Group invoice totals by customer by month
  const revenueByMonthCustomer: Record<string, Record<string, number>> = {};
  for (const inv of invoices) {
    if (inv.status !== "paid" && inv.status !== "sent") continue;
    const month = inv.issue_date?.slice(0, 7);
    if (!month) continue;
    if (!revenueByMonthCustomer[month]) revenueByMonthCustomer[month] = {};
    const cid = inv.customer_id;
    revenueByMonthCustomer[month][cid] =
      (revenueByMonthCustomer[month][cid] || 0) + Number(inv.total || 0);
  }

  const result: MonthlyMetrics[] = [];

  for (let i = 0; i < months.length; i++) {
    const month = months[i];
    const period = formatPeriod(month);
    const prevPeriod = i > 0 ? formatPeriod(months[i - 1]) : null;

    const currentRevByCustomer = revenueByMonthCustomer[period] || {};
    const prevRevByCustomer = prevPeriod
      ? (revenueByMonthCustomer[prevPeriod] || {})
      : {};

    const currentCustomers = new Set(Object.keys(currentRevByCustomer));
    const prevCustomers = new Set(Object.keys(prevRevByCustomer));

    let mrr = 0;
    let newMrr = 0;
    let churnedMrr = 0;
    let expansionMrr = 0;
    let contractionMrr = 0;
    let newCustomers = 0;
    let churnedCustomers = 0;

    // Current active customers
    for (const cid of currentCustomers) {
      const rev = currentRevByCustomer[cid] || 0;
      mrr += rev;
      if (!prevCustomers.has(cid)) {
        newMrr += rev;
        newCustomers++;
      } else {
        const prevRev = prevRevByCustomer[cid] || 0;
        const delta = rev - prevRev;
        if (delta > 0) expansionMrr += delta;
        if (delta < 0) contractionMrr += Math.abs(delta);
      }
    }

    // Churned customers (were active last month, not this month)
    for (const cid of prevCustomers) {
      if (!currentCustomers.has(cid)) {
        churnedMrr += prevRevByCustomer[cid] || 0;
        churnedCustomers++;
      }
    }

    const activeCustomers = currentCustomers.size;
    const prevActiveCusts = prevCustomers.size;
    const prevMrr = prevPeriod
      ? Object.values(prevRevByCustomer).reduce((s, v) => s + v, 0)
      : 0;

    const nrr =
      prevMrr > 0
        ? Math.round(((prevMrr - churnedMrr + expansionMrr - contractionMrr) / prevMrr) * 100)
        : 100;

    const grossChurnRate =
      prevActiveCusts > 0
        ? Math.round((churnedCustomers / prevActiveCusts) * 100 * 10) / 10
        : 0;

    result.push({
      period,
      periodLabel: formatPeriodLabel(month),
      mrr: Math.round(mrr),
      newMrr: Math.round(newMrr),
      churnedMrr: Math.round(churnedMrr),
      expansionMrr: Math.round(expansionMrr),
      contractionMrr: Math.round(contractionMrr),
      activeCustomers,
      newCustomers,
      churnedCustomers,
      nrr,
      grossChurnRate,
    });
  }

  return result;
}

export function useInvestorMetrics(): InvestorMetricsSummary {
  const { profile } = useAuth();
  const orgId = profile?.org_id;

  const { data: invoices = [], isLoading: invLoading } = useQuery({
    queryKey: ["investor-invoices", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const twelveMonthsAgo = format(subMonths(new Date(), 12), "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("invoices")
        .select("id, customer_id, total, status, issue_date")
        .eq("org_id", orgId!)
        .gte("issue_date", twelveMonthsAgo)
        .in("status", ["paid", "sent"]);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: customers = [], isLoading: custLoading } = useQuery({
    queryKey: ["investor-customers", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name")
        .eq("org_id", orgId!);
      if (error) throw error;
      return data || [];
    },
  });

  const isLoading = invLoading || custLoading;

  const waterfall = computeMetrics(invoices, customers);
  const current = waterfall[waterfall.length - 1];
  const prev = waterfall[waterfall.length - 2];

  const mrrGrowthRate =
    prev && prev.mrr > 0
      ? Math.round(((current.mrr - prev.mrr) / prev.mrr) * 100 * 10) / 10
      : 0;

  // Top customers by MRR (current month)
  const currentPeriod = formatPeriod(startOfMonth(new Date()));
  const customerMap = new Map(customers.map((c: any) => [c.id, c.name]));
  const currentRevByCustomer: Record<string, number> = {};
  for (const inv of invoices) {
    if (inv.issue_date?.slice(0, 7) !== currentPeriod) continue;
    currentRevByCustomer[inv.customer_id] =
      (currentRevByCustomer[inv.customer_id] || 0) + Number(inv.total || 0);
  }

  const topCustomers = Object.entries(currentRevByCustomer)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([cid, mrr]) => ({
      customerId: cid,
      customerName: (customerMap.get(cid) as string) || "Unknown",
      mrr: Math.round(mrr),
    }));

  return {
    currentMrr: current?.mrr ?? 0,
    arr: (current?.mrr ?? 0) * 12,
    nrr: current?.nrr ?? 100,
    grossChurnRate: current?.grossChurnRate ?? 0,
    activeCustomers: current?.activeCustomers ?? 0,
    mrrGrowthRate,
    waterfall,
    topCustomers,
    isLoading,
  };
}
