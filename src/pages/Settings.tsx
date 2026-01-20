import { AppLayout } from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, User, Shield, Users, Key, Bot, LayoutDashboard, ShieldCheck, Zap } from "lucide-react";
import { ProfileSettings } from "@/components/settings/ProfileSettings";
import { OrganizationSettings } from "@/components/settings/OrganizationSettings";
import { TeamSettings } from "@/components/settings/TeamSettings";
import { SecuritySettings } from "@/components/settings/SecuritySettings";
import { APIKeysSettings } from "@/components/settings/APIKeysSettings";
import { AutoApprovalSettings } from "@/components/settings/AutoApprovalSettings";
import { DecisionDeskTabsSettings } from "@/components/settings/DecisionDeskTabsSettings";
import { SOXControls } from "@/components/compliance/SOXControls";
import { NextDayMigration } from "@/components/migration/NextDayMigration";

const Settings = () => {
  return (
    <AppLayout title="Settings" subtitle="Manage your account and organization">
      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="h-auto flex-wrap gap-1 p-1 bg-muted/50">
          <TabsTrigger value="profile" className="gap-2 text-xs sm:text-sm">
            <User className="h-4 w-4" />
            <span className="hidden sm:inline">Profile</span>
          </TabsTrigger>
          <TabsTrigger value="organization" className="gap-2 text-xs sm:text-sm">
            <Building2 className="h-4 w-4" />
            <span className="hidden sm:inline">Organization</span>
          </TabsTrigger>
          <TabsTrigger value="team" className="gap-2 text-xs sm:text-sm">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Team</span>
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-2 text-xs sm:text-sm">
            <Shield className="h-4 w-4" />
            <span className="hidden sm:inline">Security</span>
          </TabsTrigger>
          <TabsTrigger value="api-keys" className="gap-2 text-xs sm:text-sm">
            <Key className="h-4 w-4" />
            <span className="hidden sm:inline">API Keys</span>
          </TabsTrigger>
          <TabsTrigger value="auto-approval" className="gap-2 text-xs sm:text-sm">
            <Bot className="h-4 w-4" />
            <span className="hidden sm:inline">Auto-Approval</span>
          </TabsTrigger>
          <TabsTrigger value="decision-desk" className="gap-2 text-xs sm:text-sm">
            <LayoutDashboard className="h-4 w-4" />
            <span className="hidden sm:inline">Decision Desk</span>
          </TabsTrigger>
          <TabsTrigger value="sox-controls" className="gap-2 text-xs sm:text-sm">
            <ShieldCheck className="h-4 w-4" />
            <span className="hidden sm:inline">SOX Controls</span>
          </TabsTrigger>
          <TabsTrigger value="migration" className="gap-2 text-xs sm:text-sm">
            <Zap className="h-4 w-4" />
            <span className="hidden sm:inline">Migration</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile"><ProfileSettings /></TabsContent>
        <TabsContent value="organization"><OrganizationSettings /></TabsContent>
        <TabsContent value="team"><TeamSettings /></TabsContent>
        <TabsContent value="security"><SecuritySettings /></TabsContent>
        <TabsContent value="api-keys"><APIKeysSettings /></TabsContent>
        <TabsContent value="auto-approval"><AutoApprovalSettings /></TabsContent>
        <TabsContent value="decision-desk"><DecisionDeskTabsSettings /></TabsContent>
        <TabsContent value="sox-controls"><SOXControls /></TabsContent>
        <TabsContent value="migration"><NextDayMigration /></TabsContent>
      </Tabs>
    </AppLayout>
  );
};

export default Settings;
