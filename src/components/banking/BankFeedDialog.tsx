import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Rss, Plus, RefreshCw, Wifi, WifiOff, AlertCircle, Clock } from "lucide-react";
import { useBankAccounts } from "@/hooks/useBanking";
import { useBankFeedConnections, useCreateBankFeedConnection, useSyncBankFeed } from "@/hooks/useBankingReconciliation";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface BankFeedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BankFeedDialog({ open, onOpenChange }: BankFeedDialogProps) {
  const { data: bankAccounts } = useBankAccounts();
  const { data: connections, isLoading } = useBankFeedConnections();
  const createConnection = useCreateBankFeedConnection();
  const syncFeed = useSyncBankFeed();

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    bank_account_id: "",
    provider: "manual",
    sync_frequency: "daily",
    auto_import: true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createConnection.mutateAsync(formData);
    setFormData({
      bank_account_id: "",
      provider: "manual",
      sync_frequency: "daily",
      auto_import: true,
    });
    setShowForm(false);
  };

  const statusConfig = {
    connected: { icon: Wifi, label: "Connected", className: "text-success" },
    disconnected: { icon: WifiOff, label: "Disconnected", className: "text-muted-foreground" },
    error: { icon: AlertCircle, label: "Error", className: "text-destructive" },
    pending: { icon: Clock, label: "Pending", className: "text-warning" },
  };

  // Get accounts that don't have a connection yet
  const availableAccounts = bankAccounts?.filter(
    (acc) => !connections?.some((conn) => conn.bank_account_id === acc.id)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rss className="h-5 w-5 text-primary" />
            Bank Feed Connections
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!showForm && availableAccounts && availableAccounts.length > 0 && (
            <Button onClick={() => setShowForm(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Connect Account
            </Button>
          )}

          {showForm && (
            <form onSubmit={handleSubmit} className="space-y-4 p-4 rounded-lg border border-border bg-muted/30">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Bank Account</Label>
                  <Select
                    value={formData.bank_account_id}
                    onValueChange={(v) => setFormData({ ...formData, bank_account_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select account" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableAccounts?.map((acc) => (
                        <SelectItem key={acc.id} value={acc.id}>
                          {acc.name} - {acc.bank_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Connection Provider</Label>
                  <Select
                    value={formData.provider}
                    onValueChange={(v) => setFormData({ ...formData, provider: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Manual Import</SelectItem>
                      <SelectItem value="plaid">Plaid (Coming Soon)</SelectItem>
                      <SelectItem value="yodlee">Yodlee (Coming Soon)</SelectItem>
                      <SelectItem value="mx">MX (Coming Soon)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Sync Frequency</Label>
                  <Select
                    value={formData.sync_frequency}
                    onValueChange={(v) => setFormData({ ...formData, sync_frequency: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hourly">Hourly</SelectItem>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="manual">Manual Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end gap-2 pb-2">
                  <Switch
                    checked={formData.auto_import}
                    onCheckedChange={(v) => setFormData({ ...formData, auto_import: v })}
                  />
                  <Label>Auto-import transactions</Label>
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createConnection.isPending || !formData.bank_account_id}>
                  Connect
                </Button>
              </div>
            </form>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Frequency</TableHead>
                <TableHead>Last Sync</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : connections?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No bank feed connections configured
                  </TableCell>
                </TableRow>
              ) : (
                connections?.map((conn) => {
                  const status = statusConfig[conn.connection_status as keyof typeof statusConfig] || statusConfig.disconnected;
                  const StatusIcon = status.icon;
                  return (
                    <TableRow key={conn.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{conn.bank_account?.name}</p>
                          <p className="text-sm text-muted-foreground">{conn.bank_account?.bank_name}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">{conn.provider}</Badge>
                      </TableCell>
                      <TableCell className="capitalize">{conn.sync_frequency}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {conn.last_sync_at ? format(new Date(conn.last_sync_at), "yyyy-MM-dd HH:mm") : "Never"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <StatusIcon className={cn("h-4 w-4", status.className)} />
                          <span className={cn("text-sm", status.className)}>{status.label}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1"
                          onClick={() => syncFeed.mutate(conn.id)}
                          disabled={syncFeed.isPending}
                        >
                          <RefreshCw className={cn("h-4 w-4", syncFeed.isPending && "animate-spin")} />
                          Sync
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
            <p className="text-sm text-muted-foreground">
              <strong>Note:</strong> Direct bank connections via Plaid, Yodlee, or MX require additional configuration. 
              Currently, you can use manual import to upload bank statements in CSV, OFX, or QFX format.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
