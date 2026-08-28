import { useMemo, useRef, useState } from "react";
import { ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useIdentityAdministration, type TenantMemberRole } from "@/hooks/useIdentityAdministration";

const assignableRoles = ["moderator", "user", "viewer"] as const;

function roleLabel(role: TenantMemberRole) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function RoleAdministrationSettings() {
  const { user } = useAuth();
  const {
    isAdmin,
    members,
    membersError,
    membersLoading,
    changes,
    changesError,
    changesLoading,
    changeRole,
  } = useIdentityAdministration();
  const [targetUserId, setTargetUserId] = useState("");
  const [newRole, setNewRole] = useState<(typeof assignableRoles)[number]>("viewer");
  const [reason, setReason] = useState("");
  const pendingRequest = useRef<{ signature: string; idempotencyKey: string } | null>(null);

  const eligibleMembers = useMemo(
    () => members.filter((member) => member.userId !== user?.id && member.role !== "admin"),
    [members, user?.id],
  );
  const memberNames = useMemo(
    () => new Map(members.map((member) => [member.userId, member.displayName ?? member.userId])),
    [members],
  );
  const selectedMember = eligibleMembers.find((member) => member.userId === targetUserId);

  const submitRoleChange = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedReason = reason.trim();
    const signature = `${targetUserId}|${newRole}|${normalizedReason}`;
    if (!pendingRequest.current || pendingRequest.current.signature !== signature) {
      pendingRequest.current = { signature, idempotencyKey: crypto.randomUUID() };
    }
    try {
      await changeRole.mutateAsync({
        targetUserId,
        newRole,
        reason: normalizedReason,
        idempotencyKey: pendingRequest.current.idempotencyKey,
      });
      pendingRequest.current = null;
      setTargetUserId("");
      setReason("");
      toast.success("Member role changed and audited");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Role change failed closed");
    }
  };

  if (!isAdmin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" />Role administration</CardTitle>
          <CardDescription>Tenant-admin access required</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Membership and role administration are unavailable for your role.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Tenant members</CardTitle>
          <CardDescription>
            Change an existing non-admin member among moderator, user, and viewer. Admin roles and tenant membership remain immutable.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {membersError ? (
            <p className="text-sm text-destructive">Member history is unavailable; role administration is disabled.</p>
          ) : membersLoading ? (
            <p className="text-sm text-muted-foreground">Loading verified tenant membership…</p>
          ) : (
            <div className="space-y-2">
              {members.map((member) => (
                <div key={member.userId} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                  <span>{member.displayName ?? "Unnamed member"}</span>
                  <span className="text-muted-foreground">{roleLabel(member.role)}</span>
                </div>
              ))}
            </div>
          )}

          <form className="space-y-4 border-t border-border pt-5" onSubmit={submitRoleChange}>
            <div className="space-y-2">
              <Label htmlFor="role-member">Existing non-admin member</Label>
              <Select value={targetUserId} onValueChange={setTargetUserId}>
                <SelectTrigger id="role-member"><SelectValue placeholder="Select a member" /></SelectTrigger>
                <SelectContent>
                  {eligibleMembers.map((member) => (
                    <SelectItem key={member.userId} value={member.userId}>
                      {member.displayName ?? "Unnamed member"} — {roleLabel(member.role)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="member-role">New role</Label>
              <Select value={newRole} onValueChange={(value) => setNewRole(value as (typeof assignableRoles)[number])}>
                <SelectTrigger id="member-role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {assignableRoles.map((role) => <SelectItem key={role} value={role}>{roleLabel(role)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="role-reason">Audit reason</Label>
              <Textarea
                id="role-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={500}
                placeholder="Why this access change is approved"
                required
              />
            </div>
            <Button
              type="submit"
              disabled={
                changeRole.isPending
                || Boolean(membersError)
                || !targetUserId
                || !reason.trim()
                || selectedMember?.role === newRole
              }
            >
              {changeRole.isPending ? "Recording change…" : "Change role"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Role-change audit history</CardTitle>
          <CardDescription>Append-only changes recorded by PostgreSQL</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {changesError ? (
            <p className="text-sm text-destructive">Audit history is unavailable.</p>
          ) : changesLoading ? (
            <p className="text-sm text-muted-foreground">Loading audit history…</p>
          ) : changes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No controlled role changes have been recorded.</p>
          ) : changes.map((change) => (
            <div key={change.id} className="rounded-md border border-border px-3 py-2 text-sm">
              <p className="font-medium">
                {memberNames.get(change.targetUserId) ?? change.targetUserId}: {roleLabel(change.oldRole)} → {roleLabel(change.newRole)}
              </p>
              <p className="text-muted-foreground">{change.reason}</p>
              <p className="mt-1 text-xs text-muted-foreground">{new Date(change.changedAt).toLocaleString()}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
