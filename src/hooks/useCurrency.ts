import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface ExchangeRate {
  id: string;
  org_id: string;
  from_currency: string;
  to_currency: string;
  rate: number;
  rate_date: string;
  rate_type: string;
  source: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CurrencyRevaluation {
  id: string;
  org_id: string;
  entity_id: string;
  revaluation_date: string;
  source_type: string;
  source_id: string;
  original_currency: string;
  original_amount: number;
  functional_currency: string;
  original_rate: number;
  current_rate: number;
  original_functional_amount: number;
  current_functional_amount: number;
  gain_loss_amount: number;
  gain_loss_type: string;
  journal_entry_id: string | null;
  notes: string | null;
  created_at: string;
}

// Common currencies
export const CURRENCIES = [
  { code: "USD", name: "US Dollar", symbol: "$" },
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "GBP", name: "British Pound", symbol: "£" },
  { code: "JPY", name: "Japanese Yen", symbol: "¥" },
  { code: "CAD", name: "Canadian Dollar", symbol: "C$" },
  { code: "AUD", name: "Australian Dollar", symbol: "A$" },
  { code: "CHF", name: "Swiss Franc", symbol: "Fr" },
  { code: "CNY", name: "Chinese Yuan", symbol: "¥" },
  { code: "INR", name: "Indian Rupee", symbol: "₹" },
  { code: "MXN", name: "Mexican Peso", symbol: "$" },
  { code: "BRL", name: "Brazilian Real", symbol: "R$" },
  { code: "SGD", name: "Singapore Dollar", symbol: "S$" },
  { code: "HKD", name: "Hong Kong Dollar", symbol: "HK$" },
  { code: "KRW", name: "South Korean Won", symbol: "₩" },
  { code: "SEK", name: "Swedish Krona", symbol: "kr" },
  { code: "NOK", name: "Norwegian Krone", symbol: "kr" },
  { code: "DKK", name: "Danish Krone", symbol: "kr" },
  { code: "NZD", name: "New Zealand Dollar", symbol: "NZ$" },
  { code: "ZAR", name: "South African Rand", symbol: "R" },
  { code: "AED", name: "UAE Dirham", symbol: "د.إ" },
];

export const useExchangeRates = () => {
  return useQuery({
    queryKey: ["exchange-rates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exchange_rates")
        .select("*")
        .order("rate_date", { ascending: false });

      if (error) throw error;
      return data as ExchangeRate[];
    },
  });
};

export const useLatestRates = (baseCurrency: string = "USD") => {
  return useQuery({
    queryKey: ["latest-rates", baseCurrency],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exchange_rates")
        .select("*")
        .eq("from_currency", baseCurrency)
        .eq("is_active", true)
        .order("rate_date", { ascending: false });

      if (error) throw error;

      // Get latest rate per currency pair
      const latestRates: Record<string, ExchangeRate> = {};
      data?.forEach((rate) => {
        const key = `${rate.from_currency}-${rate.to_currency}`;
        if (!latestRates[key]) {
          latestRates[key] = rate as ExchangeRate;
        }
      });

      return Object.values(latestRates);
    },
  });
};

export const useCreateExchangeRate = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (rateData: {
      from_currency: string;
      to_currency: string;
      rate: number;
      rate_date: string;
      rate_type?: string;
      source?: string;
    }) => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .single();

      if (!profile?.org_id) throw new Error("No organization found");

      const { data, error } = await supabase
        .from("exchange_rates")
        .insert({
          org_id: profile.org_id,
          ...rateData,
          rate_type: rateData.rate_type || "spot",
          source: rateData.source || "manual",
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exchange-rates"] });
      queryClient.invalidateQueries({ queryKey: ["latest-rates"] });
      toast({ title: "Exchange rate added successfully" });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to add exchange rate",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};

export const useCurrencyRevaluations = () => {
  return useQuery({
    queryKey: ["currency-revaluations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("currency_revaluations")
        .select("*")
        .order("revaluation_date", { ascending: false });

      if (error) throw error;
      return data as CurrencyRevaluation[];
    },
  });
};

export const useRunRevaluation = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: {
      revaluation_date: string;
      entity_id: string;
    }) => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .single();

      if (!profile?.org_id) throw new Error("No organization found");

      // Get open foreign currency invoices
      const { data: invoices, error: invError } = await supabase
        .from("invoices")
        .select("id, total, currency, exchange_rate")
        .neq("currency", "USD")
        .neq("status", "paid");

      if (invError) throw invError;

      // Get open foreign currency bills
      const { data: bills, error: billError } = await supabase
        .from("bills")
        .select("id, total, currency, exchange_rate")
        .neq("currency", "USD")
        .neq("status", "paid");

      if (billError) throw billError;

      const revaluations: CurrencyRevaluation[] = [];

      // Process invoices (AR)
      for (const invoice of invoices || []) {
        if (!invoice.currency || !invoice.exchange_rate) continue;

        // Get current rate
        const { data: currentRateData } = await supabase
          .from("exchange_rates")
          .select("rate")
          .eq("org_id", profile.org_id)
          .eq("from_currency", invoice.currency)
          .eq("to_currency", "USD")
          .lte("rate_date", params.revaluation_date)
          .order("rate_date", { ascending: false })
          .limit(1)
          .single();

        const currentRate = currentRateData?.rate || invoice.exchange_rate;
        const originalFunctional = invoice.total * invoice.exchange_rate;
        const currentFunctional = invoice.total * currentRate;
        const gainLoss = currentFunctional - originalFunctional;

        if (Math.abs(gainLoss) > 0.01) {
          const { data: reval, error: revalError } = await supabase
            .from("currency_revaluations")
            .insert({
              org_id: profile.org_id,
              entity_id: params.entity_id,
              revaluation_date: params.revaluation_date,
              source_type: "invoice",
              source_id: invoice.id,
              original_currency: invoice.currency,
              original_amount: invoice.total,
              functional_currency: "USD",
              original_rate: invoice.exchange_rate,
              current_rate: currentRate,
              original_functional_amount: originalFunctional,
              current_functional_amount: currentFunctional,
              gain_loss_amount: gainLoss,
              gain_loss_type: "unrealized",
            })
            .select()
            .single();

          if (!revalError && reval) {
            revaluations.push(reval as CurrencyRevaluation);
          }
        }
      }

      // Process bills (AP)
      for (const bill of bills || []) {
        if (!bill.currency || !bill.exchange_rate) continue;

        const { data: currentRateData } = await supabase
          .from("exchange_rates")
          .select("rate")
          .eq("org_id", profile.org_id)
          .eq("from_currency", bill.currency)
          .eq("to_currency", "USD")
          .lte("rate_date", params.revaluation_date)
          .order("rate_date", { ascending: false })
          .limit(1)
          .single();

        const currentRate = currentRateData?.rate || bill.exchange_rate;
        const originalFunctional = bill.total * bill.exchange_rate;
        const currentFunctional = bill.total * currentRate;
        // For liabilities, gain is when we owe less in functional currency
        const gainLoss = originalFunctional - currentFunctional;

        if (Math.abs(gainLoss) > 0.01) {
          const { data: reval, error: revalError } = await supabase
            .from("currency_revaluations")
            .insert({
              org_id: profile.org_id,
              entity_id: params.entity_id,
              revaluation_date: params.revaluation_date,
              source_type: "bill",
              source_id: bill.id,
              original_currency: bill.currency,
              original_amount: bill.total,
              functional_currency: "USD",
              original_rate: bill.exchange_rate,
              current_rate: currentRate,
              original_functional_amount: originalFunctional,
              current_functional_amount: currentFunctional,
              gain_loss_amount: gainLoss,
              gain_loss_type: "unrealized",
            })
            .select()
            .single();

          if (!revalError && reval) {
            revaluations.push(reval as CurrencyRevaluation);
          }
        }
      }

      return revaluations;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["currency-revaluations"] });
      toast({
        title: "Revaluation completed",
        description: `Created ${data.length} revaluation entries`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Revaluation failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};

// Utility function to convert amount
export const convertCurrency = (
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rate: number
): number => {
  if (fromCurrency === toCurrency) return amount;
  return amount * rate;
};

// Format currency with symbol
export const formatCurrency = (
  amount: number,
  currencyCode: string = "USD"
): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};
