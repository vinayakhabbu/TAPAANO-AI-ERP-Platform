import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface ServiceContract {
  id: string;
  contract_number: string;
  customer_id: string;
  description: string | null;
  contract_type: string;
  start_date: string;
  end_date: string;
  billing_frequency: string | null;
  contract_value: number;
  status: string;
  auto_renew: boolean | null;
  created_at: string;
  customers?: { name: string } | null;
}

export interface Warranty {
  id: string;
  warranty_number: string;
  customer_id: string;
  product_id: string | null;
  serial_number: string | null;
  warranty_start_date: string;
  warranty_end_date: string;
  warranty_type: string;
  coverage_details: string | null;
  status: string;
  created_at: string;
  customers?: { name: string } | null;
  products?: { name: string; sku: string } | null;
}

export interface ServiceCall {
  id: string;
  call_number: string;
  customer_id: string;
  contract_id: string | null;
  warranty_id: string | null;
  product_id: string | null;
  priority: string;
  status: string;
  call_type: string;
  subject: string;
  description: string | null;
  reported_issue: string | null;
  resolution: string | null;
  reported_at: string;
  scheduled_date: string | null;
  completed_at: string | null;
  is_billable: boolean | null;
  labor_cost: number | null;
  parts_cost: number | null;
  total_cost: number | null;
  created_at: string;
  customers?: { name: string } | null;
}

export interface FieldServiceVisit {
  id: string;
  visit_number: string;
  service_call_id: string | null;
  customer_id: string;
  status: string;
  visit_type: string;
  scheduled_start: string;
  scheduled_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  location_address: string | null;
  work_performed: string | null;
  travel_time_hours: number | null;
  work_time_hours: number | null;
  created_at: string;
  customers?: { name: string } | null;
  service_calls?: { call_number: string; subject: string } | null;
}

export function useServiceContracts() {
  const { profile } = useAuth();
  
  return useQuery({
    queryKey: ["service-contracts", profile?.org_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_contracts")
        .select("*, customers(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ServiceContract[];
    },
    enabled: !!profile?.org_id,
  });
}

export function useWarranties() {
  const { profile } = useAuth();
  
  return useQuery({
    queryKey: ["warranties", profile?.org_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warranties")
        .select("*, customers(name), products(name, sku)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Warranty[];
    },
    enabled: !!profile?.org_id,
  });
}

export function useServiceCalls() {
  const { profile } = useAuth();
  
  return useQuery({
    queryKey: ["service-calls", profile?.org_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_calls")
        .select("*, customers(name)")
        .order("reported_at", { ascending: false });
      if (error) throw error;
      return data as ServiceCall[];
    },
    enabled: !!profile?.org_id,
  });
}

export function useFieldServiceVisits() {
  const { profile } = useAuth();
  
  return useQuery({
    queryKey: ["field-service-visits", profile?.org_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("field_service_visits")
        .select("*, customers(name), service_calls(call_number, subject)")
        .order("scheduled_start", { ascending: false });
      if (error) throw error;
      return data as FieldServiceVisit[];
    },
    enabled: !!profile?.org_id,
  });
}

export function useCreateServiceContract() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (data: Partial<ServiceContract>) => {
      const { id, customers, ...insertData } = data as ServiceContract & { customers?: unknown };
      const { error } = await supabase.from("service_contracts").insert({
        ...insertData,
        org_id: profile?.org_id,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service-contracts"] });
    },
  });
}

export function useCreateWarranty() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (data: Partial<Warranty>) => {
      const { id, customers, products, ...insertData } = data as Warranty & { customers?: unknown; products?: unknown };
      const { error } = await supabase.from("warranties").insert({
        ...insertData,
        org_id: profile?.org_id,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warranties"] });
    },
  });
}

export function useCreateServiceCall() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (data: Partial<ServiceCall>) => {
      const { id, customers, ...insertData } = data as ServiceCall & { customers?: unknown };
      const { error } = await supabase.from("service_calls").insert({
        ...insertData,
        org_id: profile?.org_id,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service-calls"] });
    },
  });
}

export function useCreateFieldVisit() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (data: Partial<FieldServiceVisit>) => {
      const { id, customers, service_calls, ...insertData } = data as FieldServiceVisit & { customers?: unknown; service_calls?: unknown };
      const { error } = await supabase.from("field_service_visits").insert({
        ...insertData,
        org_id: profile?.org_id,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["field-service-visits"] });
    },
  });
}

export function useUpdateServiceCallStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status, resolution }: { id: string; status: string; resolution?: string }) => {
      const updates: Record<string, unknown> = { status };
      if (status === "completed") {
        updates.completed_at = new Date().toISOString();
      }
      if (resolution) {
        updates.resolution = resolution;
      }
      const { error } = await supabase.from("service_calls").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service-calls"] });
    },
  });
}

export function useServiceStats() {
  const { data: contracts } = useServiceContracts();
  const { data: warranties } = useWarranties();
  const { data: calls } = useServiceCalls();
  const { data: visits } = useFieldServiceVisits();

  const today = new Date();
  
  return {
    activeContracts: contracts?.filter(c => c.status === "active").length || 0,
    expiringContracts: contracts?.filter(c => {
      const endDate = new Date(c.end_date);
      const daysUntilExpiry = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return c.status === "active" && daysUntilExpiry <= 30 && daysUntilExpiry > 0;
    }).length || 0,
    activeWarranties: warranties?.filter(w => w.status === "active").length || 0,
    expiringWarranties: warranties?.filter(w => {
      const endDate = new Date(w.warranty_end_date);
      const daysUntilExpiry = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return w.status === "active" && daysUntilExpiry <= 30 && daysUntilExpiry > 0;
    }).length || 0,
    openCalls: calls?.filter(c => c.status === "open" || c.status === "in_progress").length || 0,
    highPriorityCalls: calls?.filter(c => c.priority === "high" && c.status !== "completed").length || 0,
    scheduledVisits: visits?.filter(v => v.status === "scheduled").length || 0,
    todayVisits: visits?.filter(v => {
      const visitDate = new Date(v.scheduled_start);
      return visitDate.toDateString() === today.toDateString();
    }).length || 0,
  };
}
