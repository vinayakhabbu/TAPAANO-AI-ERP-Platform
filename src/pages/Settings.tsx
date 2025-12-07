import { AppLayout } from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, User, Shield, Users } from "lucide-react";
import { ProfileSettings } from "@/components/settings/ProfileSettings";
import { OrganizationSettings } from "@/components/settings/OrganizationSettings";
import { TeamSettings } from "@/components/settings/TeamSettings";
import { SecuritySettings } from "@/components/settings/SecuritySettings";

const Settings = () => {
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

        <TabsContent value="profile">
          <ProfileSettings />
        </TabsContent>

        <TabsContent value="organization">
          <OrganizationSettings />
        </TabsContent>

        <TabsContent value="team">
          <TeamSettings />
        </TabsContent>

        <TabsContent value="security">
          <SecuritySettings />
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
};

export default Settings;
