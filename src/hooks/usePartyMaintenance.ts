import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type MaintainedCustomer = Database["public"]["Tables"]["customers"]["Row"];
export type MaintainedVendor = Database["public"]["Tables"]["vendors"]["Row"];

export interface PartyMasterEvent {
  id: string;
  partyType: "customer" | "vendor";
  partyId: string;
  actorId: string;
  eventType: "CREATE" | "UPDATE" | "RETIRE";
  reason: string;
  oldName: string | null;
  newName: string;
  occurredAt: string;
}

export interface CustomerDetails {
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  paymentTerms: number;
  creditLimit: number | null;
  reason: string;
  idempotencyKey: string;
}

export type VendorDetails = Omit<CustomerDetails, "creditLimit">;

export function usePartyMaintenance() {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();
  const orgId = profile?.org_id;
  const isAdmin = profile?.role === "admin";
  const ready = Boolean(user?.id && orgId && isAdmin);

  const customersQuery = useQuery({
    queryKey: ["customer-master-maintenance", user?.id, orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase.from("customers")
        .select("id,org_id,name,email,phone,address,payment_terms,credit_limit,is_active,created_at,updated_at")
        .eq("org_id", orgId).order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: ready,
  });

  const vendorsQuery = useQuery({
    queryKey: ["vendor-master-maintenance", user?.id, orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase.from("vendors")
        .select("id,org_id,name,email,phone,address,payment_terms,is_active,created_at,updated_at")
        .eq("org_id", orgId).order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: ready,
  });

  const eventsQuery = useQuery({
    queryKey: ["party-master-events", user?.id, orgId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_tenant_party_events");
      if (error) throw error;
      return (data ?? []).map((event): PartyMasterEvent => ({
        id: event.event_id,
        partyType: event.party_type as PartyMasterEvent["partyType"],
        partyId: event.party_id,
        actorId: event.actor_id,
        eventType: event.event_type as PartyMasterEvent["eventType"],
        reason: event.reason,
        oldName: event.old_name,
        newName: event.new_name,
        occurredAt: event.occurred_at,
      }));
    },
    enabled: ready,
  });

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["customer-master-maintenance", user?.id, orgId] }),
      queryClient.invalidateQueries({ queryKey: ["vendor-master-maintenance", user?.id, orgId] }),
      queryClient.invalidateQueries({ queryKey: ["party-master-events", user?.id, orgId] }),
      queryClient.invalidateQueries({ queryKey: ["invoice-customers", user?.id, orgId] }),
      queryClient.invalidateQueries({ queryKey: ["supplier-bill-vendors", user?.id, orgId] }),
      queryClient.invalidateQueries({ queryKey: ["receivables-customers", user?.id, orgId] }),
      queryClient.invalidateQueries({ queryKey: ["vendors", user?.id, orgId] }),
    ]);
  };

  const createCustomer = useMutation({
    mutationFn: async (input: CustomerDetails) => {
      const { data, error } = await supabase.rpc("create_tenant_customer", {
        p_name: input.name, p_email: input.email, p_phone: input.phone, p_address: input.address,
        p_payment_terms: input.paymentTerms, p_credit_limit: input.creditLimit,
        p_reason: input.reason, p_idempotency_key: input.idempotencyKey,
      });
      if (error) throw error;
      return data;
    }, onSuccess: invalidate,
  });

  const updateCustomer = useMutation({
    mutationFn: async (input: CustomerDetails & { customerId: string }) => {
      const { data, error } = await supabase.rpc("update_tenant_customer", {
        p_customer_id: input.customerId, p_name: input.name, p_email: input.email,
        p_phone: input.phone, p_address: input.address, p_payment_terms: input.paymentTerms,
        p_credit_limit: input.creditLimit, p_reason: input.reason,
        p_idempotency_key: input.idempotencyKey,
      });
      if (error) throw error;
      return data;
    }, onSuccess: invalidate,
  });

  const retireCustomer = useMutation({
    mutationFn: async (input: { customerId: string; reason: string; idempotencyKey: string }) => {
      const { data, error } = await supabase.rpc("retire_tenant_customer", {
        p_customer_id: input.customerId, p_reason: input.reason,
        p_idempotency_key: input.idempotencyKey,
      });
      if (error) throw error;
      return data;
    }, onSuccess: invalidate,
  });

  const createVendor = useMutation({
    mutationFn: async (input: VendorDetails) => {
      const { data, error } = await supabase.rpc("create_tenant_vendor", {
        p_name: input.name, p_email: input.email, p_phone: input.phone, p_address: input.address,
        p_payment_terms: input.paymentTerms, p_reason: input.reason,
        p_idempotency_key: input.idempotencyKey,
      });
      if (error) throw error;
      return data;
    }, onSuccess: invalidate,
  });

  const updateVendor = useMutation({
    mutationFn: async (input: VendorDetails & { vendorId: string }) => {
      const { data, error } = await supabase.rpc("update_tenant_vendor", {
        p_vendor_id: input.vendorId, p_name: input.name, p_email: input.email,
        p_phone: input.phone, p_address: input.address, p_payment_terms: input.paymentTerms,
        p_reason: input.reason, p_idempotency_key: input.idempotencyKey,
      });
      if (error) throw error;
      return data;
    }, onSuccess: invalidate,
  });

  const retireVendor = useMutation({
    mutationFn: async (input: { vendorId: string; reason: string; idempotencyKey: string }) => {
      const { data, error } = await supabase.rpc("retire_tenant_vendor", {
        p_vendor_id: input.vendorId, p_reason: input.reason,
        p_idempotency_key: input.idempotencyKey,
      });
      if (error) throw error;
      return data;
    }, onSuccess: invalidate,
  });

  return {
    isAdmin,
    customers: customersQuery.data ?? [], vendors: vendorsQuery.data ?? [],
    partiesLoading: customersQuery.isLoading || vendorsQuery.isLoading,
    partiesError: customersQuery.error ?? vendorsQuery.error,
    events: eventsQuery.data ?? [], eventsLoading: eventsQuery.isLoading, eventsError: eventsQuery.error,
    createCustomer, updateCustomer, retireCustomer, createVendor, updateVendor, retireVendor,
  };
}
