import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { 
  Building2, 
  User, 
  Shield, 
  Bell, 
  CreditCard,
  Users,
  LogOut
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";

const Settings = () => {
  const { user, profile, signOut } = useAuth();

  const { data: userRole, isLoading: roleLoading } = useQuery({
    queryKey: ['user-role', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();
      if (error) return null;
      return data?.role;
    },
    enabled: !!user?.id,
  });

  const { data: orgMembers, isLoading: membersLoading } = useQuery({
    queryKey: ['org-members', profile?.org_id],
    queryFn: async () => {
      if (!profile?.org_id) return [];
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, role, created_at')
        .eq('org_id', profile.org_id);
      if (error) return [];
      return data;
    },
    enabled: !!profile?.org_id,
  });

  const roleColors = {
    admin: "bg-primary/10 text-primary",
    moderator: "bg-warning/10 text-warning",
    user: "bg-muted text-muted-foreground",
    viewer: "bg-muted text-muted-foreground",
  };

  return (
    <AppLayout title="Settings" subtitle="Manage your account and organization">
      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="inline-flex h-10 w-auto">
          <TabsTrigger value="profile" className="gap-2">
            <User className="h-4 w-4" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="organization" className="gap-2">
            <Building2 className="h-4 w-4" />
            Organization
          </TabsTrigger>
          <TabsTrigger value="team" className="gap-2">
            <Users className="h-4 w-4" />
            Team
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-2">
            <Shield className="h-4 w-4" />
            Security
          </TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile">
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
                  ) : userRole && (
                    <Badge className={`mt-1 ${roleColors[userRole as keyof typeof roleColors] || roleColors.user}`}>
                      {userRole}
                    </Badge>
                  )}
                </div>
              </div>

              <Separator />

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="displayName">Display Name</Label>
                  <Input id="displayName" defaultValue={profile?.display_name || ""} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" defaultValue={user?.email || ""} disabled />
                </div>
              </div>

              <div className="flex justify-end">
                <Button>Save Changes</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Organization Tab */}
        <TabsContent value="organization">
          <Card>
            <CardHeader>
              <CardTitle>Organization Settings</CardTitle>
              <CardDescription>Manage your organization details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="orgName">Organization Name</Label>
                  <Input id="orgName" defaultValue={user?.user_metadata?.company_name || "My Organization"} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="currency">Default Currency</Label>
                  <Input id="currency" defaultValue="USD" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Business Address</Label>
                <Input id="address" placeholder="Enter business address" />
              </div>

              <div className="flex justify-end">
                <Button>Save Changes</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Team Tab */}
        <TabsContent value="team">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Team Members</CardTitle>
                <CardDescription>Manage users in your organization</CardDescription>
              </div>
              {userRole === 'admin' && (
                <Button className="gap-2">
                  <Users className="h-4 w-4" />
                  Invite Member
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {membersLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : orgMembers && orgMembers.length > 0 ? (
                <div className="space-y-3">
                  {orgMembers.map((member) => (
                    <div key={member.id} className="flex items-center justify-between rounded-lg border border-border p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-sm font-semibold">
                          {member.display_name?.charAt(0).toUpperCase() || "U"}
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{member.display_name || "Unknown"}</p>
                          <p className="text-sm text-muted-foreground">
                            Joined {new Date(member.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <Badge className={roleColors[member.role as keyof typeof roleColors] || roleColors.user}>
                        {member.role || "user"}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">No team members found</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle>Security Settings</CardTitle>
              <CardDescription>Manage your account security</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border border-border p-4">
                  <div>
                    <p className="font-medium text-foreground">Change Password</p>
                    <p className="text-sm text-muted-foreground">Update your password regularly for security</p>
                  </div>
                  <Button variant="outline">Change</Button>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border p-4">
                  <div>
                    <p className="font-medium text-foreground">Two-Factor Authentication</p>
                    <p className="text-sm text-muted-foreground">Add an extra layer of security</p>
                  </div>
                  <Button variant="outline">Enable</Button>
                </div>

                <Separator />

                <div className="flex items-center justify-between rounded-lg border border-destructive/20 bg-destructive/5 p-4">
                  <div>
                    <p className="font-medium text-foreground">Sign Out</p>
                    <p className="text-sm text-muted-foreground">Sign out of your account</p>
                  </div>
                  <Button variant="destructive" onClick={signOut} className="gap-2">
                    <LogOut className="h-4 w-4" />
                    Sign Out
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
};

export default Settings;
