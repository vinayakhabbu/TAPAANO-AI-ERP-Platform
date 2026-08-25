import { BotOff, Building2, KeyRound } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OrganizationSettings } from "@/components/settings/OrganizationSettings";
import { APIKeysSettings } from "@/components/settings/APIKeysSettings";
import { AutoApprovalSettings } from "@/components/settings/AutoApprovalSettings";

const Settings = () => (
  <AppLayout title="Settings containment" subtitle="Read-only tenant identity and disabled privileged configuration">
    <Tabs defaultValue="organization" className="space-y-6">
      <TabsList>
        <TabsTrigger value="organization" className="gap-2"><Building2 className="h-4 w-4" />Organization</TabsTrigger>
        <TabsTrigger value="credentials" className="gap-2"><KeyRound className="h-4 w-4" />Credentials</TabsTrigger>
        <TabsTrigger value="autonomy" className="gap-2"><BotOff className="h-4 w-4" />Autonomy</TabsTrigger>
      </TabsList>
      <TabsContent value="organization"><OrganizationSettings /></TabsContent>
      <TabsContent value="credentials"><APIKeysSettings /></TabsContent>
      <TabsContent value="autonomy"><AutoApprovalSettings /></TabsContent>
    </Tabs>
  </AppLayout>
);

export default Settings;
