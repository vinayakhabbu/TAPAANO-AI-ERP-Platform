import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, Save, Bot, DollarSign, Users, FileCheck } from "lucide-react";

interface AutoApprovalConfig {
  id: string;
  org_id: string;
  decision_type: string;
  min_precedent_similarity: number;
  min_precedent_count: number;
  max_auto_approval_amount: number;
  enabled: boolean;
}

const DECISION_TYPE_LABELS: Record<string, { label: string; icon: React.ReactNode; description: string }> = {
  po_approval: {
    label: "Purchase Orders",
    icon: <FileCheck className="h-5 w-5" />,
    description: "Auto-approve purchase orders meeting criteria",
  },
  payment_approval: {
    label: "Payment Runs",
    icon: <DollarSign className="h-5 w-5" />,
    description: "Auto-approve payment runs meeting criteria",
  },
  requisition_approval: {
    label: "Purchase Requisitions",
    icon: <Users className="h-5 w-5" />,
    description: "Auto-approve requisitions meeting criteria",
  },
  journal_post: {
    label: "Journal Entries",
    icon: <Bot className="h-5 w-5" />,
    description: "Auto-post journal entries meeting criteria",
  },
};

export function AutoApprovalSettings() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [editedConfigs, setEditedConfigs] = useState<Record<string, Partial<AutoApprovalConfig>>>({});

  const { data: configs, isLoading } = useQuery({
    queryKey: ["auto-approval-configs", profile?.org_id],
    queryFn: async () => {
      if (!profile?.org_id) return [];
      const { data, error } = await supabase
        .from("auto_approval_configs")
        .select("*")
        .eq("org_id", profile.org_id);
      if (error) throw error;
      return data as AutoApprovalConfig[];
    },
    enabled: !!profile?.org_id,
  });

  const updateConfig = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<AutoApprovalConfig> }) => {
      const { error } = await supabase
        .from("auto_approval_configs")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auto-approval-configs"] });
      toast.success("Configuration saved");
    },
    onError: (error) => {
      toast.error("Failed to save configuration: " + error.message);
    },
  });

  const handleFieldChange = (configId: string, field: keyof AutoApprovalConfig, value: unknown) => {
    setEditedConfigs((prev) => ({
      ...prev,
      [configId]: {
        ...prev[configId],
        [field]: value,
      },
    }));
  };

  const handleSave = (config: AutoApprovalConfig) => {
    const updates = editedConfigs[config.id];
    if (!updates || Object.keys(updates).length === 0) return;

    updateConfig.mutate({ id: config.id, updates });
    setEditedConfigs((prev) => {
      const next = { ...prev };
      delete next[config.id];
      return next;
    });
  };

  const getConfigValue = <K extends keyof AutoApprovalConfig>(
    config: AutoApprovalConfig,
    field: K
  ): AutoApprovalConfig[K] => {
    const edited = editedConfigs[config.id]?.[field];
    return edited !== undefined ? (edited as AutoApprovalConfig[K]) : config[field];
  };

  const hasChanges = (configId: string) => {
    return editedConfigs[configId] && Object.keys(editedConfigs[configId]).length > 0;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!configs || configs.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No auto-approval configurations found. Contact support to initialize defaults.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="mb-6">
        <h3 className="text-lg font-medium">Auto-Approval Thresholds</h3>
        <p className="text-sm text-muted-foreground">
          Configure when the AI can automatically approve documents without human review.
        </p>
      </div>

      <div className="grid gap-4">
        {configs.map((config) => {
          const typeInfo = DECISION_TYPE_LABELS[config.decision_type] || {
            label: config.decision_type,
            icon: <Bot className="h-5 w-5" />,
            description: "Configure auto-approval settings",
          };

          return (
            <Card key={config.id} className={hasChanges(config.id) ? "ring-2 ring-primary/20" : ""}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                      {typeInfo.icon}
                    </div>
                    <div>
                      <CardTitle className="text-base">{typeInfo.label}</CardTitle>
                      <CardDescription className="text-xs">{typeInfo.description}</CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={getConfigValue(config, "enabled")}
                      onCheckedChange={(checked) => handleFieldChange(config.id, "enabled", checked)}
                    />
                    <span className="text-xs text-muted-foreground w-16">
                      {getConfigValue(config, "enabled") ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor={`${config.id}-amount`} className="text-xs">
                      Max Amount ($)
                    </Label>
                    <Input
                      id={`${config.id}-amount`}
                      type="number"
                      min="0"
                      step="100"
                      value={getConfigValue(config, "max_auto_approval_amount")}
                      onChange={(e) =>
                        handleFieldChange(config.id, "max_auto_approval_amount", parseFloat(e.target.value) || 0)
                      }
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`${config.id}-similarity`} className="text-xs">
                      Min Precedent Similarity (%)
                    </Label>
                    <Input
                      id={`${config.id}-similarity`}
                      type="number"
                      min="0"
                      max="100"
                      step="5"
                      value={Math.round(getConfigValue(config, "min_precedent_similarity") * 100)}
                      onChange={(e) =>
                        handleFieldChange(config.id, "min_precedent_similarity", (parseFloat(e.target.value) || 0) / 100)
                      }
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`${config.id}-count`} className="text-xs">
                      Min Precedent Count
                    </Label>
                    <Input
                      id={`${config.id}-count`}
                      type="number"
                      min="1"
                      max="10"
                      value={getConfigValue(config, "min_precedent_count")}
                      onChange={(e) =>
                        handleFieldChange(config.id, "min_precedent_count", parseInt(e.target.value) || 1)
                      }
                      className="h-9"
                    />
                  </div>
                </div>

                {hasChanges(config.id) && (
                  <div className="flex justify-end pt-2">
                    <Button
                      size="sm"
                      onClick={() => handleSave(config)}
                      disabled={updateConfig.isPending}
                    >
                      {updateConfig.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Save className="h-4 w-4 mr-2" />
                      )}
                      Save Changes
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="mt-6 bg-muted/30">
        <CardContent className="py-4">
          <p className="text-xs text-muted-foreground">
            <strong>Note:</strong> Auto-approval also requires: policy check must pass, precedent strength ≥70%, 
            risk level must be low, and overall confidence ≥75%. These thresholds are system defaults.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
