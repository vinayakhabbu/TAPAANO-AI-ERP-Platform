import { BotOff, Building2, KeyRound, LibraryBig, Users } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OrganizationSettings } from "@/components/settings/OrganizationSettings";
import { APIKeysSettings } from "@/components/settings/APIKeysSettings";
import { AutoApprovalSettings } from "@/components/settings/AutoApprovalSettings";
import { RoleAdministrationSettings } from "@/components/settings/RoleAdministrationSettings";
import { AccountMaintenanceSettings } from "@/components/settings/AccountMaintenanceSettings";

const Settings = () => (
  <AppLayout title="Settings" subtitle="Controlled tenant identity administration and disabled privileged configuration">
    <Tabs defaultValue="organization" className="space-y-6">
      <TabsList>
        <TabsTrigger value="organization" className="gap-2"><Building2 className="h-4 w-4" />Organization</TabsTrigger>
        <TabsTrigger value="members" className="gap-2"><Users className="h-4 w-4" />Members</TabsTrigger>
        <TabsTrigger value="accounts" className="gap-2"><LibraryBig className="h-4 w-4" />Accounts</TabsTrigger>
        <TabsTrigger value="credentials" className="gap-2"><KeyRound className="h-4 w-4" />Credentials</TabsTrigger>
        <TabsTrigger value="autonomy" className="gap-2"><BotOff className="h-4 w-4" />Autonomy</TabsTrigger>
      </TabsList>
      <TabsContent value="organization"><OrganizationSettings /></TabsContent>
      <TabsContent value="members"><RoleAdministrationSettings /></TabsContent>
      <TabsContent value="accounts"><AccountMaintenanceSettings /></TabsContent>
      <TabsContent value="credentials"><APIKeysSettings /></TabsContent>
      <TabsContent value="autonomy"><AutoApprovalSettings /></TabsContent>
    </Tabs>
  </AppLayout>
);

export default Settings;
