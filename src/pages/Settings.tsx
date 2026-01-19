import { AppLayout } from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, User, Shield, Users, Key, Bot } from "lucide-react";
import { ProfileSettings } from "@/components/settings/ProfileSettings";
import { OrganizationSettings } from "@/components/settings/OrganizationSettings";
import { TeamSettings } from "@/components/settings/TeamSettings";
import { SecuritySettings } from "@/components/settings/SecuritySettings";
import { APIKeysSettings } from "@/components/settings/APIKeysSettings";
import { AutoApprovalSettings } from "@/components/settings/AutoApprovalSettings";

const Settings = () => {
  return (
    <AppLayout title="Settings" subtitle="Manage your account and organization">
      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="h-auto flex-wrap gap-1 p-1 bg-muted/50">
          <TabsTrigger value="profile" className="gap-2 text-xs sm:text-sm">
            <User className="h-4 w-4" />
            <span className="hidden sm:inline">Profile</span>
            <span className="sm:hidden">Prof</span>
          </TabsTrigger>
          <TabsTrigger value="organization" className="gap-2 text-xs sm:text-sm">
            <Building2 className="h-4 w-4" />
            <span className="hidden sm:inline">Organization</span>
            <span className="sm:hidden">Org</span>
          </TabsTrigger>
          <TabsTrigger value="team" className="gap-2 text-xs sm:text-sm">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Team</span>
            <span className="sm:hidden">Team</span>
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-2 text-xs sm:text-sm">
            <Shield className="h-4 w-4" />
            <span className="hidden sm:inline">Security</span>
            <span className="sm:hidden">Sec</span>
          </TabsTrigger>
          <TabsTrigger value="api-keys" className="gap-2 text-xs sm:text-sm">
            <Key className="h-4 w-4" />
            <span className="hidden sm:inline">API Keys</span>
            <span className="sm:hidden">API</span>
          </TabsTrigger>
          <TabsTrigger value="auto-approval" className="gap-2 text-xs sm:text-sm">
            <Bot className="h-4 w-4" />
            <span className="hidden sm:inline">Auto-Approval</span>
            <span className="sm:hidden">Auto</span>
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

        <TabsContent value="api-keys">
          <APIKeysSettings />
        </TabsContent>

        <TabsContent value="auto-approval">
          <AutoApprovalSettings />
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
};

export default Settings;
