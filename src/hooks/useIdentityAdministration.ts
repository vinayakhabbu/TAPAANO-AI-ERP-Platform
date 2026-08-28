import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type TenantMemberRole = Database["public"]["Enums"]["app_role"];

export interface TenantMember {
  userId: string;
  displayName: string | null;
  role: TenantMemberRole;
  joinedAt: string;
}

export interface IdentityRoleChange {
  id: string;
  actorId: string;
  targetUserId: string;
  oldRole: TenantMemberRole;
  newRole: TenantMemberRole;
  reason: string;
  changedAt: string;
}

export interface TenantInvitation {
  id: string;
  email: string;
  displayName: string;
  role: Exclude<TenantMemberRole, "admin">;
  status: "PENDING" | "CONSUMED" | "CANCELLED" | "EXPIRED";
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  resolvedAt: string | null;
  cancelReason: string | null;
}

interface ChangeTenantMemberRoleInput {
  targetUserId: string;
  newRole: Exclude<TenantMemberRole, "admin">;
  reason: string;
  idempotencyKey: string;
}

interface InviteTenantMemberInput {
  email: string;
  displayName: string;
  role: Exclude<TenantMemberRole, "admin">;
  reason: string;
  idempotencyKey: string;
}

interface CancelTenantInvitationInput {
  invitationId: string;
  reason: string;
}

export function useIdentityAdministration() {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();
  const orgId = profile?.org_id;
  const isAdmin = profile?.role === "admin";
  const ready = Boolean(user?.id && orgId && isAdmin);

  const membersQuery = useQuery({
    queryKey: ["tenant-members", user?.id, orgId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_tenant_members");
      if (error) throw error;
      return (data ?? []).map((member): TenantMember => ({
        userId: member.user_id,
        displayName: member.display_name,
        role: member.role,
        joinedAt: member.joined_at,
      }));
    },
    enabled: ready,
  });

  const changesQuery = useQuery({
    queryKey: ["identity-role-change-history", user?.id, orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("identity_role_changes")
        .select("id, actor_id, target_user_id, old_role, new_role, reason, changed_at")
        .eq("org_id", orgId)
        .order("changed_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((change): IdentityRoleChange => ({
        id: change.id,
        actorId: change.actor_id,
        targetUserId: change.target_user_id,
        oldRole: change.old_role,
        newRole: change.new_role,
        reason: change.reason,
        changedAt: change.changed_at,
      }));
    },
    enabled: ready,
  });

  const invitationsQuery = useQuery({
    queryKey: ["tenant-invitations", user?.id, orgId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_tenant_invitations");
      if (error) throw error;
      return (data ?? []).map((invitation): TenantInvitation => ({
        id: invitation.invitation_id,
        email: invitation.email,
        displayName: invitation.display_name,
        role: invitation.role as Exclude<TenantMemberRole, "admin">,
        status: invitation.status as TenantInvitation["status"],
        createdBy: invitation.created_by,
        createdAt: invitation.created_at,
        expiresAt: invitation.expires_at,
        resolvedAt: invitation.resolved_at,
        cancelReason: invitation.cancel_reason,
      }));
    },
    enabled: ready,
  });

  const changeRole = useMutation({
    mutationFn: async (input: ChangeTenantMemberRoleInput) => {
      const { data, error } = await supabase.rpc("change_tenant_member_role", {
        p_target_user_id: input.targetUserId,
        p_new_role: input.newRole,
        p_reason: input.reason,
        p_idempotency_key: input.idempotencyKey,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tenant-members", user?.id, orgId] }),
        queryClient.invalidateQueries({ queryKey: ["identity-role-change-history", user?.id, orgId] }),
      ]);
    },
  });

  const inviteMember = useMutation({
    mutationFn: async (input: InviteTenantMemberInput) => {
      const { data, error } = await supabase.functions.invoke("invite-member", {
        body: {
          email: input.email,
          display_name: input.displayName,
          role: input.role,
          reason: input.reason,
          idempotency_key: input.idempotencyKey,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tenant-members", user?.id, orgId] }),
        queryClient.invalidateQueries({ queryKey: ["tenant-invitations", user?.id, orgId] }),
      ]);
    },
  });

  const cancelInvitation = useMutation({
    mutationFn: async (input: CancelTenantInvitationInput) => {
      const { data, error } = await supabase.rpc("cancel_tenant_invitation", {
        p_invitation_id: input.invitationId,
        p_reason: input.reason,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["tenant-invitations", user?.id, orgId] });
    },
  });

  return {
    isAdmin,
    members: membersQuery.data ?? [],
    membersError: membersQuery.error,
    membersLoading: membersQuery.isLoading,
    changes: changesQuery.data ?? [],
    changesError: changesQuery.error,
    changesLoading: changesQuery.isLoading,
    invitations: invitationsQuery.data ?? [],
    invitationsError: invitationsQuery.error,
    invitationsLoading: invitationsQuery.isLoading,
    changeRole,
    inviteMember,
    cancelInvitation,
  };
}
