import { useQuery } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export function OrganizationSettings() {
  const { user, profile } = useAuth();
  const orgId = profile?.org_id;
  const { data: organization, isLoading } = useQuery({
    queryKey: ["organization-metadata", user?.id, orgId],
    queryFn: async () => {
      if (!user?.id || !orgId) return null;
      const { data, error } = await supabase
        .from("organizations")
        .select("id, name")
        .eq("id", orgId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: Boolean(user?.id && orgId),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Organization
        </CardTitle>
        <CardDescription>Read-only tenant identity</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">Organization name</p>
        <p className="mt-1 font-medium">{isLoading ? "Loading…" : organization?.name ?? "Unavailable"}</p>
        <p className="mt-4 text-xs text-muted-foreground">
          Organization changes are unavailable until an audited administrator workflow is implemented.
        </p>
      </CardContent>
    </Card>
  );
}
