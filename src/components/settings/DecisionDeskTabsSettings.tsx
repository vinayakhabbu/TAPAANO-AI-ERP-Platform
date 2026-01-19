import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useDecisionDeskTabs, useUpdateTabVisibility, useUpdateTabLabel } from "@/hooks/useDecisionDeskTabs";
import { toast } from "sonner";
import { Loader2, GripVertical, FileText, Scale, Bot, Network, Zap, AlertTriangle, BarChart3, Pencil, Check, X } from "lucide-react";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  FileText,
  Scale,
  Bot,
  Network,
  Zap,
  AlertTriangle,
  BarChart3,
};

export function DecisionDeskTabsSettings() {
  const { data: tabs, isLoading, error } = useDecisionDeskTabs();
  const updateVisibility = useUpdateTabVisibility();
  const updateLabel = useUpdateTabLabel();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-destructive">
          Failed to load tab configurations
        </CardContent>
      </Card>
    );
  }

  if (!tabs?.length) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No tab configurations found. Tab settings will be created when you first visit the Decision Desk.
        </CardContent>
      </Card>
    );
  }

  const handleToggle = async (tabId: string, currentValue: boolean) => {
    try {
      await updateVisibility.mutateAsync({ tabId, isVisible: !currentValue });
      toast.success("Tab visibility updated");
    } catch (err) {
      toast.error("Failed to update tab visibility");
    }
  };

  const startEditing = (tabId: string, currentLabel: string) => {
    setEditingId(tabId);
    setEditValue(currentLabel);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditValue("");
  };

  const saveLabel = async (tabId: string) => {
    if (!editValue.trim()) {
      toast.error("Label cannot be empty");
      return;
    }
    try {
      await updateLabel.mutateAsync({ tabId, label: editValue.trim() });
      toast.success("Tab label updated");
      setEditingId(null);
      setEditValue("");
    } catch (err) {
      toast.error("Failed to update tab label");
    }
  };

  const sortedTabs = [...tabs].sort((a, b) => a.display_order - b.display_order);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Decision Desk Tabs</CardTitle>
        <CardDescription>
          Configure which tabs are visible in the Decision Desk and customize their labels.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {sortedTabs.map((tab) => {
          const IconComponent = iconMap[tab.icon_name] || FileText;
          const isEditing = editingId === tab.id;

          return (
            <div
              key={tab.id}
              className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/5 transition-colors"
            >
              <div className="flex items-center gap-3 flex-1">
                <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                <IconComponent className="h-4 w-4 text-muted-foreground" />
                
                {isEditing ? (
                  <div className="flex items-center gap-2 flex-1">
                    <Input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="h-8 max-w-[200px]"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveLabel(tab.id);
                        if (e.key === 'Escape') cancelEditing();
                      }}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => saveLabel(tab.id)}
                      disabled={updateLabel.isPending}
                    >
                      <Check className="h-4 w-4 text-green-600" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={cancelEditing}
                    >
                      <X className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`tab-${tab.id}`} className="font-medium cursor-pointer">
                      {tab.tab_label}
                    </Label>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => startEditing(tab.id, tab.tab_label)}
                    >
                      <Pencil className="h-3 w-3 text-muted-foreground" />
                    </Button>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {tab.is_visible ? 'Visible' : 'Hidden'}
                </span>
                <Switch
                  id={`tab-${tab.id}`}
                  checked={tab.is_visible}
                  onCheckedChange={() => handleToggle(tab.id, tab.is_visible)}
                  disabled={updateVisibility.isPending}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
