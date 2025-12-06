import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Quotation {
  id: string;
  org_id: string;
  entity_id: string;
  customer_id: string;
  quote_number: string;
  quote_date: string;
  valid_until: string | null;
  subtotal: number;
  tax: number;
  total: number;
  status: "draft" | "sent" | "accepted" | "rejected" | "expired" | "converted";
  notes: string | null;
  converted_so_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  customers?: { name: string };
}

export interface QuotationLine {
  id: string;
  quotation_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  account_id: string | null;
  created_at: string;
}

export function useQuotations() {
  return useQuery({
    queryKey: ["quotations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotations")
        .select("*, customers(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Quotation[];
    },
  });
}

export function useQuotationLines(quotationId: string | null) {
  return useQuery({
    queryKey: ["quotation-lines", quotationId],
    queryFn: async () => {
      if (!quotationId) return [];
      const { data, error } = await supabase
        .from("quotation_lines")
        .select("*")
        .eq("quotation_id", quotationId);
      if (error) throw error;
      return data as QuotationLine[];
    },
    enabled: !!quotationId,
  });
}

export function useCreateQuotation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (quotation: {
      entity_id: string;
      customer_id: string;
      quote_number: string;
      quote_date: string;
      valid_until?: string;
      subtotal: number;
      tax: number;
      total: number;
      notes?: string;
      lines: { description: string; quantity: number; unit_price: number; amount: number }[];
    }) => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .single();
      if (!profile?.org_id) throw new Error("No org found");

      const { data: quote, error } = await supabase
        .from("quotations")
        .insert({
          org_id: profile.org_id,
          entity_id: quotation.entity_id,
          customer_id: quotation.customer_id,
          quote_number: quotation.quote_number,
          quote_date: quotation.quote_date,
          valid_until: quotation.valid_until || null,
          subtotal: quotation.subtotal,
          tax: quotation.tax,
          total: quotation.total,
          notes: quotation.notes || null,
        })
        .select()
        .single();
      if (error) throw error;

      if (quotation.lines.length > 0) {
        const { error: linesError } = await supabase
          .from("quotation_lines")
          .insert(
            quotation.lines.map((line) => ({
              quotation_id: quote.id,
              description: line.description,
              quantity: line.quantity,
              unit_price: line.unit_price,
              amount: line.amount,
            }))
          );
        if (linesError) throw linesError;
      }
      return quote;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotations"] });
    },
  });
}

export function useUpdateQuotationStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Quotation["status"] }) => {
      const { error } = await supabase
        .from("quotations")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotations"] });
    },
  });
}

export function useConvertToSalesOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (quotationId: string) => {
      // Get quotation
      const { data: quote, error: quoteError } = await supabase
        .from("quotations")
        .select("*")
        .eq("id", quotationId)
        .single();
      if (quoteError) throw quoteError;

      // Get quotation lines
      const { data: lines, error: linesError } = await supabase
        .from("quotation_lines")
        .select("*")
        .eq("quotation_id", quotationId);
      if (linesError) throw linesError;

      // Generate SO number
      const soNumber = `SO-${Date.now().toString().slice(-8)}`;

      // Create sales order
      const { data: salesOrder, error: soError } = await supabase
        .from("sales_orders")
        .insert({
          org_id: quote.org_id,
          entity_id: quote.entity_id,
          customer_id: quote.customer_id,
          so_number: soNumber,
          order_date: new Date().toISOString().split("T")[0],
          subtotal: quote.subtotal,
          tax: quote.tax,
          total: quote.total,
          notes: quote.notes,
          status: "draft",
        })
        .select()
        .single();
      if (soError) throw soError;

      // Create SO lines
      if (lines && lines.length > 0) {
        const { error: soLinesError } = await supabase
          .from("sales_order_lines")
          .insert(
            lines.map((line) => ({
              sales_order_id: salesOrder.id,
              description: line.description,
              quantity: line.quantity,
              unit_price: line.unit_price,
              amount: line.amount,
            }))
          );
        if (soLinesError) throw soLinesError;
      }

      // Update quotation status
      const { error: updateError } = await supabase
        .from("quotations")
        .update({ status: "converted", converted_so_id: salesOrder.id })
        .eq("id", quotationId);
      if (updateError) throw updateError;

      return salesOrder;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotations"] });
      queryClient.invalidateQueries({ queryKey: ["salesOrders"] });
    },
  });
}
