import { AppLayout } from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, User, Shield, Users, Key } from "lucide-react";
import { ProfileSettings } from "@/components/settings/ProfileSettings";
import { OrganizationSettings } from "@/components/settings/OrganizationSettings";
import { TeamSettings } from "@/components/settings/TeamSettings";
import { SecuritySettings } from "@/components/settings/SecuritySettings";
import { APIKeysSettings } from "@/components/settings/APIKeysSettings";

const Settings = () => {
  return (
    <AppLayout title="Settings" subtitle="Manage your account and organization">
      <Tabs defaultValue="profile" className="space-y-6">
        <div className="overflow-x-auto scrollbar-hide -mx-1 px-1">
          <TabsList className="inline-flex h-10 w-auto bg-muted/50">
            <TabsTrigger value="profile" className="gap-2 whitespace-nowrap">
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">Profile</span>
              <span className="sm:hidden">Prof</span>
            </TabsTrigger>
            <TabsTrigger value="organization" className="gap-2 whitespace-nowrap">
              <Building2 className="h-4 w-4" />
              <span className="hidden sm:inline">Organization</span>
              <span className="sm:hidden">Org</span>
            </TabsTrigger>
            <TabsTrigger value="team" className="gap-2 whitespace-nowrap">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Team</span>
              <span className="sm:hidden">Team</span>
            </TabsTrigger>
            <TabsTrigger value="security" className="gap-2 whitespace-nowrap">
              <Shield className="h-4 w-4" />
              <span className="hidden sm:inline">Security</span>
              <span className="sm:hidden">Sec</span>
            </TabsTrigger>
            <TabsTrigger value="api-keys" className="gap-2 whitespace-nowrap">
              <Key className="h-4 w-4" />
              <span className="hidden sm:inline">API Keys</span>
              <span className="sm:hidden">API</span>
            </TabsTrigger>
          </TabsList>
        </div>

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

        <TabsContent value="api-keys">
          <APIKeysSettings />
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
};

export default Settings;
