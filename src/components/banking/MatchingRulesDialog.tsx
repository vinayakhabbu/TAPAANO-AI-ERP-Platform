import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Trash2, Plus, Edit2, Zap } from "lucide-react";
import { useMatchingRules, useCreateMatchingRule, useUpdateMatchingRule, useDeleteMatchingRule } from "@/hooks/useBankingReconciliation";
import { useAccounts } from "@/hooks/useGeneralLedger";
import { cn } from "@/lib/utils";

interface MatchingRulesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MatchingRulesDialog({ open, onOpenChange }: MatchingRulesDialogProps) {
  const { data: rules, isLoading } = useMatchingRules();
  const { data: accounts } = useAccounts();
  const createRule = useCreateMatchingRule();
  const updateRule = useUpdateMatchingRule();
  const deleteRule = useDeleteMatchingRule();

  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    priority: 100,
    rule_type: "contains",
    field_to_match: "description",
    match_pattern: "",
    match_amount_min: "",
    match_amount_max: "",
    target_account_id: "",
    auto_reconcile: false,
  });

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      priority: 100,
      rule_type: "contains",
      field_to_match: "description",
      match_pattern: "",
      match_amount_min: "",
      match_amount_max: "",
      target_account_id: "",
      auto_reconcile: false,
    });
    setEditingRule(null);
    setShowForm(false);
  };

  const handleEdit = (rule: any) => {
    setFormData({
      name: rule.name,
      description: rule.description || "",
      priority: rule.priority,
      rule_type: rule.rule_type,
      field_to_match: rule.field_to_match,
      match_pattern: rule.match_pattern,
      match_amount_min: rule.match_amount_min?.toString() || "",
      match_amount_max: rule.match_amount_max?.toString() || "",
      target_account_id: rule.target_account_id || "",
      auto_reconcile: rule.auto_reconcile,
    });
    setEditingRule(rule);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const payload = {
      name: formData.name,
      description: formData.description || undefined,
      priority: formData.priority,
      rule_type: formData.rule_type,
      field_to_match: formData.field_to_match,
      match_pattern: formData.match_pattern,
      match_amount_min: formData.match_amount_min ? parseFloat(formData.match_amount_min) : undefined,
      match_amount_max: formData.match_amount_max ? parseFloat(formData.match_amount_max) : undefined,
      target_account_id: formData.target_account_id || undefined,
      auto_reconcile: formData.auto_reconcile,
    };

    if (editingRule) {
      await updateRule.mutateAsync({ id: editingRule.id, ...payload });
    } else {
      await createRule.mutateAsync(payload);
    }
    resetForm();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Auto-Matching Rules
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!showForm && (
            <Button onClick={() => setShowForm(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Rule
            </Button>
          )}

          {showForm && (
            <form onSubmit={handleSubmit} className="space-y-4 p-4 rounded-lg border border-border bg-muted/30">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Rule Name</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Payroll Deposits"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Priority (lower = higher priority)</Label>
                  <Input
                    type="number"
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) })}
                    min={1}
                    max={1000}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Match Type</Label>
                  <Select
                    value={formData.rule_type}
                    onValueChange={(v) => setFormData({ ...formData, rule_type: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contains">Contains</SelectItem>
                      <SelectItem value="exact">Exact Match</SelectItem>
                      <SelectItem value="amount_range">Amount Range</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Field to Match</Label>
                  <Select
                    value={formData.field_to_match}
                    onValueChange={(v) => setFormData({ ...formData, field_to_match: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="description">Description</SelectItem>
                      <SelectItem value="amount">Amount</SelectItem>
                      <SelectItem value="both">Both</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Match Pattern</Label>
                <Input
                  value={formData.match_pattern}
                  onChange={(e) => setFormData({ ...formData, match_pattern: e.target.value })}
                  placeholder="e.g., PAYROLL, AMAZON, STRIPE"
                  required={formData.field_to_match !== "amount"}
                />
              </div>

              {formData.rule_type === "amount_range" && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Min Amount</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.match_amount_min}
                      onChange={(e) => setFormData({ ...formData, match_amount_min: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Max Amount</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.match_amount_max}
                      onChange={(e) => setFormData({ ...formData, match_amount_max: e.target.value })}
                      placeholder="1000.00"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label>Target Account</Label>
                <Select
                  value={formData.target_account_id}
                  onValueChange={(v) => setFormData({ ...formData, target_account_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select account to assign" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts?.map((acc) => (
                      <SelectItem key={acc.id} value={acc.id}>
                        {acc.code} - {acc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.auto_reconcile}
                  onCheckedChange={(v) => setFormData({ ...formData, auto_reconcile: v })}
                />
                <Label>Auto-reconcile matched transactions</Label>
              </div>

              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createRule.isPending || updateRule.isPending}>
                  {editingRule ? "Update Rule" : "Create Rule"}
                </Button>
              </div>
            </form>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Priority</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Match Type</TableHead>
                <TableHead>Pattern</TableHead>
                <TableHead>Target Account</TableHead>
                <TableHead>Matches</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : rules?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No matching rules configured
                  </TableCell>
                </TableRow>
              ) : (
                rules?.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-mono">{rule.priority}</TableCell>
                    <TableCell className="font-medium">{rule.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{rule.rule_type}</Badge>
                    </TableCell>
                    <TableCell className="max-w-32 truncate">{rule.match_pattern}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {rule.target_account ? `${rule.target_account.code}` : "—"}
                    </TableCell>
                    <TableCell>{rule.match_count}</TableCell>
                    <TableCell>
                      <Badge className={cn(rule.is_active ? "bg-success/10 text-success" : "bg-muted text-muted-foreground")}>
                        {rule.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleEdit(rule)}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => deleteRule.mutate(rule.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
