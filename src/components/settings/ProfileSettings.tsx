import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useTeamManagement } from "@/hooks/useTeamManagement";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const roleColors: Record<string, string> = {
  admin: "bg-primary/10 text-primary",
  moderator: "bg-amber-500/10 text-amber-600",
  user: "bg-muted text-muted-foreground",
  viewer: "bg-muted text-muted-foreground",
};

export function ProfileSettings() {
  const { user, profile } = useAuth();
  const { currentUserRole, isLoading: roleLoading } = useTeamManagement();
  const [displayName, setDisplayName] = useState(profile?.display_name || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!user?.id) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: displayName })
        .eq("id", user.id);

      if (error) throw error;
      toast.success("Profile updated successfully");
    } catch (error) {
      toast.error("Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile Information</CardTitle>
        <CardDescription>Update your personal details</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-2xl font-semibold text-primary-foreground">
            {profile?.display_name?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || "U"}
          </div>
          <div>
            <p className="text-lg font-medium text-foreground">{profile?.display_name || "User"}</p>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
            {roleLoading ? (
              <Skeleton className="h-5 w-16 mt-1" />
            ) : currentUserRole && (
              <Badge className={`mt-1 ${roleColors[currentUserRole] || roleColors.user}`}>
                {currentUserRole}
              </Badge>
            )}
          </div>
        </div>

        <Separator />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="displayName">Display Name</Label>
            <Input 
              id="displayName" 
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" defaultValue={user?.email || ""} disabled />
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
