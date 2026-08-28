import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";

export type AccountType = Database["public"]["Enums"]["account_type"];
export type MaintainedAccount = Database["public"]["Tables"]["accounts"]["Row"];

export interface AccountMasterEvent {
  id: string;
  accountId: string;
  actorId: string;
  eventType: "CREATE" | "RENAME" | "RETIRE";
  reason: string;
  oldName: string | null;
  newName: string | null;
  occurredAt: string;
}

interface CreateAccountInput {
  code: string;
  name: string;
  accountType: AccountType;
  parentId: string | null;
  reason: string;
  idempotencyKey: string;
}

interface RenameAccountInput {
  accountId: string;
  name: string;
  reason: string;
  idempotencyKey: string;
}

interface RetireAccountInput {
  accountId: string;
  reason: string;
  idempotencyKey: string;
}

function snapshotText(snapshot: Json | null, key: string) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  const value = snapshot[key];
  return typeof value === "string" ? value : null;
}

export function useAccountMaintenance() {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();
  const orgId = profile?.org_id;
  const isAdmin = profile?.role === "admin";
  const ready = Boolean(user?.id && orgId && isAdmin);

  const accountsQuery = useQuery({
    queryKey: ["account-master-maintenance", user?.id, orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("accounts")
        .select("id, org_id, code, name, account_type, parent_id, is_active, controlling_category, default_cost_center_id, default_internal_order_id, created_at, updated_at")
        .eq("org_id", orgId)
        .order("code");
      if (error) throw error;
      return data ?? [];
    },
    enabled: ready,
  });

  const eventsQuery = useQuery({
    queryKey: ["account-master-events", user?.id, orgId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_tenant_account_events");
      if (error) throw error;
      return (data ?? []).map((event): AccountMasterEvent => ({
        id: event.event_id,
        accountId: event.account_id,
        actorId: event.actor_id,
        eventType: event.event_type as AccountMasterEvent["eventType"],
        reason: event.reason,
        oldName: snapshotText(event.old_snapshot, "name"),
        newName: snapshotText(event.new_snapshot, "name"),
        occurredAt: event.occurred_at,
      }));
    },
    enabled: ready,
  });

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["account-master-maintenance", user?.id, orgId] }),
      queryClient.invalidateQueries({ queryKey: ["account-master-events", user?.id, orgId] }),
      queryClient.invalidateQueries({ queryKey: ["ledger-accounts", user?.id, orgId] }),
    ]);
  };

  const createAccount = useMutation({
    mutationFn: async (input: CreateAccountInput) => {
      const { data, error } = await supabase.rpc("create_tenant_account", {
        p_code: input.code,
        p_name: input.name,
        p_account_type: input.accountType,
        p_parent_id: input.parentId,
        p_reason: input.reason,
        p_idempotency_key: input.idempotencyKey,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });

  const renameAccount = useMutation({
    mutationFn: async (input: RenameAccountInput) => {
      const { data, error } = await supabase.rpc("rename_tenant_account", {
        p_account_id: input.accountId,
        p_name: input.name,
        p_reason: input.reason,
        p_idempotency_key: input.idempotencyKey,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });

  const retireAccount = useMutation({
    mutationFn: async (input: RetireAccountInput) => {
      const { data, error } = await supabase.rpc("retire_tenant_account", {
        p_account_id: input.accountId,
        p_reason: input.reason,
        p_idempotency_key: input.idempotencyKey,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });

  return {
    isAdmin,
    accounts: accountsQuery.data ?? [],
    accountsError: accountsQuery.error,
    accountsLoading: accountsQuery.isLoading,
    events: eventsQuery.data ?? [],
    eventsError: eventsQuery.error,
    eventsLoading: eventsQuery.isLoading,
    createAccount,
    renameAccount,
    retireAccount,
  };
}
