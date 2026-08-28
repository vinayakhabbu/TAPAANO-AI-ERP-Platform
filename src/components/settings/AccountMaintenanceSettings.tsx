import { useMemo, useRef, useState } from "react";
import { BookOpenCheck, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAccountMaintenance, type AccountType } from "@/hooks/useAccountMaintenance";

const accountTypes: AccountType[] = ["asset", "liability", "equity", "revenue", "expense"];
const rootAccount = "__root__";

function label(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function AccountMaintenanceSettings() {
  const {
    isAdmin, accounts, accountsError, accountsLoading, events, eventsError, eventsLoading,
    createAccount, renameAccount, retireAccount,
  } = useAccountMaintenance();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [accountType, setAccountType] = useState<AccountType>("asset");
  const [parentId, setParentId] = useState(rootAccount);
  const [createReason, setCreateReason] = useState("");
  const createRequest = useRef<{ signature: string; key: string } | null>(null);
  const [renameId, setRenameId] = useState("");
  const [renamedName, setRenamedName] = useState("");
  const [renameReason, setRenameReason] = useState("");
  const renameRequest = useRef<{ signature: string; key: string } | null>(null);
  const [retireId, setRetireId] = useState("");
  const [retireReason, setRetireReason] = useState("");
  const retireRequest = useRef<{ signature: string; key: string } | null>(null);

  const activeAccounts = accounts.filter((account) => account.is_active);
  const eligibleParents = activeAccounts.filter((account) => account.account_type === accountType);
  const accountNames = useMemo(
    () => new Map(accounts.map((account) => [account.id, `${account.code} — ${account.name}`])),
    [accounts],
  );

  const submitCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedCode = code.trim();
    const normalizedName = name.trim();
    const normalizedReason = createReason.trim();
    const selectedParent = parentId === rootAccount ? null : parentId;
    const signature = `${normalizedCode}|${normalizedName}|${accountType}|${selectedParent ?? ""}|${normalizedReason}`;
    if (!createRequest.current || createRequest.current.signature !== signature) {
      createRequest.current = { signature, key: crypto.randomUUID() };
    }
    try {
      await createAccount.mutateAsync({
        code: normalizedCode, name: normalizedName, accountType, parentId: selectedParent,
        reason: normalizedReason, idempotencyKey: createRequest.current.key,
      });
      createRequest.current = null;
      setCode("");
      setName("");
      setCreateReason("");
      toast.success("Account created with immutable audit evidence");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Account creation failed closed");
    }
  };

  const submitRename = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedName = renamedName.trim();
    const normalizedReason = renameReason.trim();
    const signature = `${renameId}|${normalizedName}|${normalizedReason}`;
    if (!renameRequest.current || renameRequest.current.signature !== signature) {
      renameRequest.current = { signature, key: crypto.randomUUID() };
    }
    try {
      await renameAccount.mutateAsync({
        accountId: renameId, name: normalizedName, reason: normalizedReason,
        idempotencyKey: renameRequest.current.key,
      });
      renameRequest.current = null;
      setRenameId("");
      setRenamedName("");
      setRenameReason("");
      toast.success("Account renamed and audited");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Account rename failed closed");
    }
  };

  const submitRetire = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedReason = retireReason.trim();
    const signature = `${retireId}|${normalizedReason}`;
    if (!retireRequest.current || retireRequest.current.signature !== signature) {
      retireRequest.current = { signature, key: crypto.randomUUID() };
    }
    try {
      await retireAccount.mutateAsync({
        accountId: retireId, reason: normalizedReason,
        idempotencyKey: retireRequest.current.key,
      });
      retireRequest.current = null;
      setRetireId("");
      setRetireReason("");
      toast.success("Account retired and audited");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Account retirement failed closed");
    }
  };

  if (!isAdmin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" />Account maintenance</CardTitle>
          <CardDescription>Tenant-admin access required</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Chart-of-accounts maintenance is unavailable for your role.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><BookOpenCheck className="h-5 w-5" />Chart of accounts</CardTitle>
          <CardDescription>
            Account code, type, and parent are immutable after creation. Every supported change records an append-only snapshot.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {accountsError ? (
            <p className="text-sm text-destructive">Account history is unavailable; maintenance is disabled.</p>
          ) : accountsLoading ? (
            <p className="text-sm text-muted-foreground">Loading tenant accounts…</p>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {accounts.map((account) => (
                <div key={account.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                  <span>{account.code} — {account.name}</span>
                  <span className="text-muted-foreground">{account.is_active ? label(account.account_type) : "Retired"}</span>
                </div>
              ))}
            </div>
          )}

          <form className="grid gap-4 border-t border-border pt-5 md:grid-cols-2" onSubmit={submitCreate}>
            <div className="space-y-2">
              <Label htmlFor="account-code">New account code</Label>
              <Input id="account-code" value={code} onChange={(event) => setCode(event.target.value)} maxLength={50} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-name">Name</Label>
              <Input id="account-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={200} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-type">Type</Label>
              <Select value={accountType} onValueChange={(value) => { setAccountType(value as AccountType); setParentId(rootAccount); }}>
                <SelectTrigger id="account-type"><SelectValue /></SelectTrigger>
                <SelectContent>{accountTypes.map((type) => <SelectItem key={type} value={type}>{label(type)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-parent">Parent of the same type</Label>
              <Select value={parentId} onValueChange={setParentId}>
                <SelectTrigger id="account-parent"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={rootAccount}>No parent</SelectItem>
                  {eligibleParents.map((account) => <SelectItem key={account.id} value={account.id}>{account.code} — {account.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="account-create-reason">Audit reason</Label>
              <Textarea id="account-create-reason" value={createReason} onChange={(event) => setCreateReason(event.target.value)} maxLength={500} required />
            </div>
            <Button className="md:col-span-2 md:w-fit" type="submit" disabled={createAccount.isPending || Boolean(accountsError) || !code.trim() || !name.trim() || !createReason.trim()}>
              {createAccount.isPending ? "Creating account…" : "Create account"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rename an active account</CardTitle>
          <CardDescription>Only the display name changes; code, type, parent, and prior audit evidence remain fixed.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submitRename}>
            <div className="space-y-2"><Label htmlFor="rename-account">Account</Label><Select value={renameId} onValueChange={setRenameId}><SelectTrigger id="rename-account"><SelectValue placeholder="Select an active account" /></SelectTrigger><SelectContent>{activeAccounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.code} — {account.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label htmlFor="renamed-account-name">New name</Label><Input id="renamed-account-name" value={renamedName} onChange={(event) => setRenamedName(event.target.value)} maxLength={200} required /></div>
            <div className="space-y-2"><Label htmlFor="rename-account-reason">Audit reason</Label><Textarea id="rename-account-reason" value={renameReason} onChange={(event) => setRenameReason(event.target.value)} maxLength={500} required /></div>
            <Button type="submit" disabled={renameAccount.isPending || !renameId || !renamedName.trim() || !renameReason.trim()}>{renameAccount.isPending ? "Renaming account…" : "Rename account"}</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Retire an account</CardTitle>
          <CardDescription>
            Retirement is one-way. Accounts with active children or immutable invoice, bill, receipt, or payment controls cannot be retired.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submitRetire}>
            <div className="space-y-2"><Label htmlFor="retire-account">Active account</Label><Select value={retireId} onValueChange={setRetireId}><SelectTrigger id="retire-account"><SelectValue placeholder="Select an account" /></SelectTrigger><SelectContent>{activeAccounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.code} — {account.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label htmlFor="retire-account-reason">Audit reason</Label><Textarea id="retire-account-reason" value={retireReason} onChange={(event) => setRetireReason(event.target.value)} maxLength={500} required /></div>
            <Button type="submit" variant="outline" disabled={retireAccount.isPending || !retireId || !retireReason.trim()}>{retireAccount.isPending ? "Retiring account…" : "Retire account"}</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Account-maintenance audit</CardTitle><CardDescription>Append-only before/after evidence from PostgreSQL</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {eventsError ? <p className="text-sm text-destructive">Account audit history is unavailable.</p>
            : eventsLoading ? <p className="text-sm text-muted-foreground">Loading account audit…</p>
              : events.length === 0 ? <p className="text-sm text-muted-foreground">No controlled account changes have been recorded.</p>
                : events.map((event) => <div key={event.id} className="rounded-md border border-border px-3 py-2 text-sm"><p className="font-medium">{event.eventType} — {accountNames.get(event.accountId) ?? event.newName ?? event.accountId}</p>{event.oldName && event.newName && event.oldName !== event.newName ? <p className="text-muted-foreground">{event.oldName} → {event.newName}</p> : null}<p className="text-muted-foreground">{event.reason}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(event.occurredAt).toLocaleString()}</p></div>)}
        </CardContent>
      </Card>
    </div>
  );
}
