import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { differenceInDays } from "date-fns";

export interface CustomerWithAging {
  id: string;
  name: string;
  email: string | null;
  totalOwed: number;
  current: number;
  overdue30: number;
  overdue60: number;
  overdue90: number;
  creditLimit: number | null;
}

export interface InvoiceWithCustomer {
  id: string;
  invoice_number: string;
  customer_name: string;
  total: number;
  due_date: string;
  status: string;
  days_overdue: number;
}

export interface SalesOrder {
  id: string;
  so_number: string;
  customer_name: string;
  order_date: string;
  status: string;
  total: number;
}

export interface Shipment {
  id: string;
  shipment_number: string;
  ship_date: string;
  carrier: string | null;
  tracking_number: string | null;
  sales_order_id: string;
}

export const useReceivables = () => {
  const customersQuery = useQuery({
    queryKey: ["customers-with-aging"],
    queryFn: async () => {
      const { data: customers, error: customersError } = await supabase
        .from("customers")
        .select("*");

      if (customersError) throw customersError;

      const { data: invoices, error: invoicesError } = await supabase
        .from("invoices")
        .select("*")
        .in("status", ["sent", "overdue"]);

      if (invoicesError) throw invoicesError;

      const today = new Date();
      
      const customersWithAging: CustomerWithAging[] = (customers || []).map((customer) => {
        const customerInvoices = (invoices || []).filter(
          (inv) => inv.customer_id === customer.id
        );

        let current = 0;
        let overdue30 = 0;
        let overdue60 = 0;
        let overdue90 = 0;

        customerInvoices.forEach((inv) => {
          const dueDate = new Date(inv.due_date);
          const daysOverdue = differenceInDays(today, dueDate);
          const outstanding = inv.total - inv.amount_paid;

          if (daysOverdue <= 0) {
            current += outstanding;
          } else if (daysOverdue <= 30) {
            overdue30 += outstanding;
          } else if (daysOverdue <= 60) {
            overdue60 += outstanding;
          } else {
            overdue90 += outstanding;
          }
        });

        return {
          id: customer.id,
          name: customer.name,
          email: customer.email,
          totalOwed: current + overdue30 + overdue60 + overdue90,
          current,
          overdue30,
          overdue60,
          overdue90,
          creditLimit: customer.credit_limit,
        };
      });

      return customersWithAging.filter((c) => c.totalOwed > 0);
    },
  });

  const invoicesQuery = useQuery({
    queryKey: ["invoices-with-customers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select(`
          *,
          customers (name)
        `)
        .in("status", ["draft", "sent", "overdue"])
        .order("due_date", { ascending: true });

      if (error) throw error;

      const today = new Date();

      return (data || []).map((inv): InvoiceWithCustomer => {
        const dueDate = new Date(inv.due_date);
        const daysOverdue = Math.max(0, differenceInDays(today, dueDate));

        return {
          id: inv.id,
          invoice_number: inv.invoice_number,
          customer_name: inv.customers?.name || "Unknown",
          total: inv.total,
          due_date: inv.due_date,
          status: inv.status,
          days_overdue: daysOverdue,
        };
      });
    },
  });

  const salesOrdersQuery = useQuery({
    queryKey: ["sales-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_orders")
        .select(`
          *,
          customers (name)
        `)
        .order("order_date", { ascending: false });

      if (error) throw error;

      return (data || []).map((so): SalesOrder => ({
        id: so.id,
        so_number: so.so_number,
        customer_name: so.customers?.name || "Unknown",
        order_date: so.order_date,
        status: so.status,
        total: so.total,
      }));
    },
  });

  const shipmentsQuery = useQuery({
    queryKey: ["shipments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shipments")
        .select("*")
        .order("ship_date", { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });

  const stats = {
    totalAR: customersQuery.data?.reduce((sum, c) => sum + c.totalOwed, 0) || 0,
    overdueAR:
      customersQuery.data?.reduce(
        (sum, c) => sum + c.overdue30 + c.overdue60 + c.overdue90,
        0
      ) || 0,
    customerCount: customersQuery.data?.length || 0,
    salesOrderCount: salesOrdersQuery.data?.length || 0,
    shipmentCount: shipmentsQuery.data?.length || 0,
    invoiceCount: invoicesQuery.data?.length || 0,
  };

  return {
    customers: customersQuery.data || [],
    invoices: invoicesQuery.data || [],
    salesOrders: salesOrdersQuery.data || [],
    shipments: shipmentsQuery.data || [],
    stats,
    isLoading: customersQuery.isLoading || invoicesQuery.isLoading || salesOrdersQuery.isLoading || shipmentsQuery.isLoading,
    error: customersQuery.error || invoicesQuery.error || salesOrdersQuery.error || shipmentsQuery.error,
  };
};
