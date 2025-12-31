import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TaxJurisdiction {
  id: string;
  org_id: string;
  code: string;
  name: string;
  country_code: string;
  state_province: string | null;
  jurisdiction_type: string;
  parent_id: string | null;
  is_active: boolean;
  created_at: string;
}

export interface TaxCode {
  id: string;
  org_id: string;
  code: string;
  name: string;
  description: string | null;
  tax_type: string;
  is_recoverable: boolean;
  is_active: boolean;
  gl_account_id: string | null;
  created_at: string;
}

export interface TaxRate {
  id: string;
  org_id: string;
  tax_code_id: string;
  jurisdiction_id: string | null;
  rate: number;
  effective_from: string;
  effective_to: string | null;
  priority: number;
  is_compound: boolean;
  is_active: boolean;
  tax_code?: TaxCode;
  jurisdiction?: TaxJurisdiction;
}

export interface TaxTransaction {
  id: string;
  org_id: string;
  entity_id: string;
  tax_code_id: string;
  source_type: string;
  source_id: string;
  transaction_date: string;
  tax_period: string;
  base_amount: number;
  tax_rate: number;
  tax_amount: number;
  currency: string;
  status: string;
  tax_code?: TaxCode;
}

export interface TaxFilingPeriod {
  id: string;
  org_id: string;
  entity_id: string;
  jurisdiction_id: string;
  period_name: string;
  period_start: string;
  period_end: string;
  filing_due_date: string;
  status: string;
  total_sales_tax: number;
  total_purchase_tax: number;
  net_tax_payable: number;
  jurisdiction?: TaxJurisdiction;
}

export const TAX_TYPES = [
  { value: "sales", label: "Sales Tax" },
  { value: "purchase", label: "Purchase Tax" },
  { value: "vat_output", label: "VAT Output" },
  { value: "vat_input", label: "VAT Input" },
  { value: "withholding", label: "Withholding Tax" },
] as const;

export const JURISDICTION_TYPES = [
  { value: "country", label: "Country" },
  { value: "state", label: "State/Province" },
  { value: "city", label: "City/Local" },
  { value: "special", label: "Special District" },
] as const;

// Jurisdictions
export const useTaxJurisdictions = () => {
  return useQuery({
    queryKey: ["tax-jurisdictions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tax_jurisdictions")
        .select("*")
        .order("country_code", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return data as TaxJurisdiction[];
    },
  });
};

export const useCreateTaxJurisdiction = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (jurisdiction: Omit<TaxJurisdiction, "id" | "created_at">) => {
      const { data, error } = await supabase
        .from("tax_jurisdictions")
        .insert(jurisdiction)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tax-jurisdictions"] });
    },
  });
};

// Tax Codes
export const useTaxCodes = () => {
  return useQuery({
    queryKey: ["tax-codes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tax_codes")
        .select("*")
        .order("code", { ascending: true });
      if (error) throw error;
      return data as TaxCode[];
    },
  });
};

export const useCreateTaxCode = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (taxCode: Omit<TaxCode, "id" | "created_at">) => {
      const { data, error } = await supabase
        .from("tax_codes")
        .insert(taxCode)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tax-codes"] });
    },
  });
};

// Tax Rates
export const useTaxRates = () => {
  return useQuery({
    queryKey: ["tax-rates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tax_rates")
        .select(`
          *,
          tax_code:tax_codes(*),
          jurisdiction:tax_jurisdictions(*)
        `)
        .order("effective_from", { ascending: false });
      if (error) throw error;
      return data as TaxRate[];
    },
  });
};

export const useCreateTaxRate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rate: Omit<TaxRate, "id" | "tax_code" | "jurisdiction">) => {
      const { data, error } = await supabase
        .from("tax_rates")
        .insert(rate)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tax-rates"] });
    },
  });
};

// Tax Transactions
export const useTaxTransactions = (period?: string) => {
  return useQuery({
    queryKey: ["tax-transactions", period],
    queryFn: async () => {
      let query = supabase
        .from("tax_transactions")
        .select(`
          *,
          tax_code:tax_codes(*)
        `)
        .order("transaction_date", { ascending: false });
      
      if (period) {
        query = query.eq("tax_period", period);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as TaxTransaction[];
    },
  });
};

// Tax Filing Periods
export const useTaxFilingPeriods = () => {
  return useQuery({
    queryKey: ["tax-filing-periods"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tax_filing_periods")
        .select(`
          *,
          jurisdiction:tax_jurisdictions(*)
        `)
        .order("period_start", { ascending: false });
      if (error) throw error;
      return data as TaxFilingPeriod[];
    },
  });
};

// Tax Summary
export const useTaxSummary = () => {
  const { data: transactions = [] } = useTaxTransactions();
  const { data: filingPeriods = [] } = useTaxFilingPeriods();
  
  const currentMonth = new Date().toISOString().slice(0, 7);
  const currentMonthTx = transactions.filter(t => t.tax_period === currentMonth);
  
  const salesTax = currentMonthTx
    .filter(t => t.tax_code?.tax_type === "sales" || t.tax_code?.tax_type === "vat_output")
    .reduce((sum, t) => sum + Number(t.tax_amount), 0);
  
  const purchaseTax = currentMonthTx
    .filter(t => t.tax_code?.tax_type === "purchase" || t.tax_code?.tax_type === "vat_input")
    .reduce((sum, t) => sum + Number(t.tax_amount), 0);
  
  const pendingFilings = filingPeriods.filter(p => p.status === "open").length;
  const overdueFilings = filingPeriods.filter(p => 
    p.status === "open" && new Date(p.filing_due_date) < new Date()
  ).length;
  
  return {
    salesTax,
    purchaseTax,
    netTaxPayable: salesTax - purchaseTax,
    pendingFilings,
    overdueFilings,
    currentPeriod: currentMonth,
  };
};
