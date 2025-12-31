import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TaxCodeWithRate {
  id: string;
  code: string;
  name: string;
  tax_type: string;
  currentRate: number;
}

// Fetch tax codes with their current effective rates
export const useTaxCodesWithRates = () => {
  return useQuery({
    queryKey: ["tax-codes-with-rates"],
    queryFn: async () => {
      const { data: taxCodes, error: codesError } = await supabase
        .from("tax_codes")
        .select("id, code, name, tax_type")
        .eq("is_active", true);

      if (codesError) throw codesError;

      const { data: rates, error: ratesError } = await supabase
        .from("tax_rates")
        .select("tax_code_id, rate, effective_from, effective_to")
        .eq("is_active", true)
        .order("effective_from", { ascending: false });

      if (ratesError) throw ratesError;

      const today = new Date().toISOString().split("T")[0];

      return taxCodes?.map((code) => {
        const currentRate = rates?.find(
          (r) =>
            r.tax_code_id === code.id &&
            r.effective_from <= today &&
            (!r.effective_to || r.effective_to >= today)
        );
        return {
          ...code,
          currentRate: currentRate?.rate || 0,
        } as TaxCodeWithRate;
      }) || [];
    },
  });
};

// Fetch latest exchange rate for a currency pair
export const useExchangeRate = (fromCurrency: string, toCurrency: string = "USD") => {
  return useQuery({
    queryKey: ["exchange-rate", fromCurrency, toCurrency],
    queryFn: async () => {
      if (fromCurrency === toCurrency) return 1;
      
      const { data, error } = await supabase
        .from("exchange_rates")
        .select("rate")
        .eq("from_currency", fromCurrency)
        .eq("to_currency", toCurrency)
        .eq("is_active", true)
        .order("rate_date", { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== "PGRST116") throw error;
      return data?.rate || 1;
    },
    enabled: !!fromCurrency && fromCurrency !== toCurrency,
  });
};

// Get rate from cache or return 1
export const getExchangeRateSync = (
  rates: Array<{ from_currency: string; to_currency: string; rate: number }> | undefined,
  fromCurrency: string,
  toCurrency: string = "USD"
): number => {
  if (fromCurrency === toCurrency) return 1;
  const rate = rates?.find(
    (r) => r.from_currency === fromCurrency && r.to_currency === toCurrency
  );
  return rate?.rate || 1;
};
