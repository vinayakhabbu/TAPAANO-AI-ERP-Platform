import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface TeamMember {
  id: string;
  display_name: string | null;
  role: string | null;
  created_at: string;
  email?: string;
}

interface TeamInvitation {
  id: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
  expires_at: string;
}

export function useTeamManagement() {
  const { profile, user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch current user's role - also check profile.role as fallback
  const { data: currentUserRole, isLoading: roleLoading } = useQuery({
    queryKey: ["user-role", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      
      // First check user_roles table
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .single();
      
      if (roleData?.role) {
        return roleData.role as string;
      }
      
      // Fallback to profile role
      const { data: profileData } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      
      return (profileData?.role as string) || "admin"; // First user defaults to admin
    },
    enabled: !!user?.id,
  });

  // Fetch team members for the organization
  const { data: teamMembers, isLoading: membersLoading } = useQuery({
    queryKey: ["team-members", profile?.org_id],
    queryFn: async () => {
      if (!profile?.org_id) return [];
      
      // Get profiles for the org
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, display_name, role, created_at")
        .eq("org_id", profile.org_id);
      
      if (profilesError) {
        console.error("Error fetching profiles:", profilesError);
        return [];
      }

      // Get roles for these users
      const userIds = profiles.map((p) => p.id);
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", userIds);

      // Merge profiles with roles
      return profiles.map((member) => {
        const userRole = roles?.find((r) => r.user_id === member.id);
        return {
          ...member,
          role: (userRole?.role as string) || member.role || "user",
        };
      });
    },
    enabled: !!profile?.org_id,
  });

  // Invitations - placeholder until types are regenerated
  const invitations: TeamInvitation[] = [];
  const invitationsLoading = false;

  // Invite team member
  const inviteMember = useMutation({
    mutationFn: async ({ email, role }: { email: string; role: string }) => {
      if (!profile?.org_id || !user?.id) {
        throw new Error("Organization not found");
      }

      // Direct insert using any type since table types not generated yet
      const { data, error } = await (supabase as any)
        .from("team_invitations")
        .insert({
          org_id: profile.org_id,
          email: email.toLowerCase(),
          role,
          invited_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-invitations"] });
      toast.success("Invitation sent successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to send invitation");
    },
  });

  // Cancel invitation
  const cancelInvitation = useMutation({
    mutationFn: async (invitationId: string) => {
      const { error } = await (supabase as any)
        .from("team_invitations")
        .update({ status: "cancelled" })
        .eq("id", invitationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-invitations"] });
      toast.success("Invitation cancelled");
    },
    onError: () => {
      toast.error("Failed to cancel invitation");
    },
  });

  // Update member role
  const updateMemberRole = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: string }) => {
      // Check if user already has a role entry
      const { data: existing } = await supabase
        .from("user_roles")
        .select("id")
        .eq("user_id", userId)
        .single();

      if (existing) {
        const { error } = await supabase
          .from("user_roles")
          .update({ role: newRole as "admin" | "moderator" | "user" | "viewer" })
          .eq("user_id", userId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("user_roles")
          .insert({ user_id: userId, role: newRole as "admin" | "moderator" | "user" | "viewer" });
        if (error) throw error;
      }

      // Also update profile role for display
      await supabase
        .from("profiles")
        .update({ role: newRole })
        .eq("id", userId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
      queryClient.invalidateQueries({ queryKey: ["user-role"] });
      toast.success("Role updated successfully");
    },
    onError: () => {
      toast.error("Failed to update role");
    },
  });

  // Remove team member
  const removeMember = useMutation({
    mutationFn: async (userId: string) => {
      // Remove from org by clearing org_id
      const { error } = await supabase
        .from("profiles")
        .update({ org_id: null })
        .eq("id", userId);

      if (error) throw error;

      // Also remove their role
      await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
      toast.success("Member removed from team");
    },
    onError: () => {
      toast.error("Failed to remove member");
    },
  });

  const isAdmin = currentUserRole === "admin";

  return {
    teamMembers: (teamMembers || []) as TeamMember[],
    invitations,
    currentUserRole,
    isAdmin,
    isLoading: membersLoading || invitationsLoading || roleLoading,
    inviteMember,
    cancelInvitation,
    updateMemberRole,
    removeMember,
  };
}
