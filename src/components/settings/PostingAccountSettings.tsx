import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/hooks/useAuth";
import { useReportEntities } from "@/hooks/useTrialBalance";
import { supabase } from "@/integrations/supabase/client";
import { readAllRows } from "@/lib/readAllRows";

type Account = { id: string; code: string; name: string; account_type: string; is_active: boolean };
type SetupKind = "invoice" | "receipt" | "bill" | "payment";
const titles = { invoice: "Invoice posting accounts", receipt: "Customer receipt account", bill: "Bill posting accounts", payment: "Supplier payment account" };
const fields: Record<SetupKind, { label: string; type: string }[]> = {
  invoice: [{ label: "AR control account", type: "asset" }, { label: "Invoice revenue account", type: "revenue" }],
  receipt: [{ label: "Customer receipt cash clearing", type: "asset" }],
  bill: [{ label: "AP control account", type: "liability" }, { label: "Bill expense account", type: "expense" }],
  payment: [{ label: "Supplier payment cash clearing", type: "asset" }],
};
type Saved = { ids: string[]; configuredAt: string; configuredBy: string } | null;

function AccountControl({ entityId, kind, accounts, saved, blocked, onSaved }: {
  entityId: string; kind: SetupKind; accounts: Account[]; saved: Saved; blocked: boolean; onSaved: () => Promise<unknown>;
}) {
  const [selected, setSelected] = useState<string[]>([]), [acknowledged, setAcknowledged] = useState(false);
  const [request, setRequest] = useState<{ ids: string[]; key: string } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const mutation = useMutation({ mutationFn: async (payload: { ids: string[]; key: string }) => {
    const args = { p_entity_id: entityId, p_idempotency_key: payload.key };
    const result = kind === "invoice" ? await supabase.rpc("configure_entity_invoice_accounts", { ...args, p_ar_account_id: payload.ids[0], p_revenue_account_id: payload.ids[1] })
      : kind === "bill" ? await supabase.rpc("configure_entity_supplier_bill_accounts", { ...args, p_ap_account_id: payload.ids[0], p_expense_account_id: payload.ids[1] })
      : kind === "receipt" ? await supabase.rpc("configure_entity_customer_receipt_accounts", { ...args, p_cash_account_id: payload.ids[0] })
      : await supabase.rpc("configure_entity_supplier_payment_accounts", { ...args, p_cash_account_id: payload.ids[0] });
    if (result.error) throw result.error;
    return result.data;
  }, onSuccess: async () => { setConfirmed(true); await onSaved(); } });
  const name = (id: string) => { const account = accounts.find(item => item.id === id); return account ? `${account.code} · ${account.name}${account.is_active ? "" : " (retired)"}` : id; };
  function submit(event: FormEvent) {
    event.preventDefault(); if (blocked || mutation.isPending || saved || confirmed) return;
    if (!request && (!acknowledged || fields[kind].some((_, index) => !selected[index]))) return;
    const payload = request ?? { ids: [...selected], key: "account-setup:" + crypto.randomUUID() };
    setRequest(payload); mutation.mutate(payload);
  }
  return <section className="space-y-3 rounded-lg border p-4" aria-label={titles[kind]}>
    <h3 className="font-semibold">{titles[kind]}</h3>
    {saved ? <><dl className="space-y-2 text-sm">{fields[kind].map((field, index) => <div key={field.label}><dt className="text-muted-foreground">{field.label}</dt><dd>{name(saved.ids[index])}</dd></div>)}</dl><p className="text-xs text-muted-foreground">Configured {saved.configuredAt} · by {saved.configuredBy}. These mappings are immutable.</p></>
      : confirmed ? <p role="status">Posting accounts saved. Refresh to view the recorded configuration.</p>
      : <form onSubmit={submit} className="space-y-3">
        <fieldset disabled={blocked || Boolean(request)} className="space-y-3">
          {fields[kind].map((field, index) => <div key={field.label} className="space-y-1"><Label htmlFor={`${kind}-account-${index}`}>{field.label}</Label><select id={`${kind}-account-${index}`} value={selected[index] ?? ""} onChange={event => setSelected(current => { const next = [...current]; next[index] = event.target.value; return next; })} required className="h-10 w-full rounded border bg-background px-3 text-sm"><option value="">Select account</option>{accounts.filter(account => account.is_active && account.account_type === field.type).map(account => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></div>)}
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)}/><span>I have reviewed these permanent posting accounts.</span></label>
        </fieldset>
        {blocked ? <p className="text-sm text-muted-foreground">Configure the related invoice or bill accounts first.</p> : null}
        <Button type="submit" disabled={blocked || mutation.isPending || (!request && (!acknowledged || fields[kind].some((_, index) => !selected[index])))}>{mutation.isPending ? "Saving accounts…" : request ? "Retry account setup" : "Save posting accounts"}</Button>
        {mutation.isError ? <Alert variant="destructive"><AlertTitle>Account setup not confirmed</AlertTitle><AlertDescription>Check that accounts are active, belong to this organization, and satisfy the selected roles. Cash clearing must differ from AR. Existing mappings cannot be changed. Retry the same request, or refresh the recorded configuration before editing.</AlertDescription><Button type="button" variant="outline" className="mt-3" onClick={async () => { await onSaved(); setRequest(null); mutation.reset(); }}>Refresh before editing</Button></Alert> : null}
      </form>}
  </section>;
}

function EntityPostingAccounts({ entityId }: { entityId: string }) {
  const { user, profile } = useAuth(); const cache = useQueryClient();
  const query = useQuery({ queryKey: ["finance-account-controls", user?.id, profile?.org_id, entityId], retry: false,
    enabled: Boolean(user?.id && profile?.org_id && entityId), queryFn: async ({ signal }) => {
      const org = profile!.org_id!;
      const results = await Promise.all([
        supabase.from("entity_invoice_account_controls").select("*").eq("org_id", org).eq("entity_id", entityId).abortSignal(signal).maybeSingle(),
        supabase.from("entity_customer_receipt_controls").select("*").eq("org_id", org).eq("entity_id", entityId).abortSignal(signal).maybeSingle(),
        supabase.from("entity_supplier_bill_account_controls").select("*").eq("org_id", org).eq("entity_id", entityId).abortSignal(signal).maybeSingle(),
        supabase.from("entity_supplier_payment_controls").select("*").eq("org_id", org).eq("entity_id", entityId).abortSignal(signal).maybeSingle(),
      ]);
      for (const result of results) if (result.error) throw result.error;
      const accounts = await readAllRows((from, to) => supabase.from("accounts").select("id,code,name,account_type,is_active", { count: "exact" })
        .eq("org_id", org).order("code").order("id").range(from, to).abortSignal(signal));
      const [invoice, receipt, bill, payment] = results.map(result => result.data);
      // Each select is independently tenant/entity scoped. Return only the fields displayed here.
      const saved = (record: typeof invoice, keys: string[]): Saved => record ? { ids: keys.map(key => (record as unknown as Record<string, string>)[key]), configuredAt: record.configured_at, configuredBy: record.configured_by } : null;
      return { accounts, invoice: saved(invoice, ["ar_account_id", "revenue_account_id"]), receipt: saved(receipt, ["cash_account_id"]),
        bill: saved(bill, ["ap_account_id", "expense_account_id"]), payment: saved(payment, ["cash_account_id"]) };
    } });
  const refresh = async () => { await cache.invalidateQueries({ queryKey: ["finance-account-controls", user?.id, profile?.org_id, entityId] }); await cache.invalidateQueries({ queryKey: ["subledger-aging", user?.id, profile?.org_id] }); };
  if (query.isError) return <Alert variant="destructive"><AlertTitle>Posting-account configuration unavailable</AlertTitle><AlertDescription>Configuration is disabled until accounts and existing mappings can be read.</AlertDescription><Button variant="outline" className="mt-3" onClick={() => void query.refetch()}>Refresh posting accounts</Button></Alert>;
  if (query.isPending || query.isFetching || !query.data) return <p role="status">Loading posting accounts…</p>;
  const data = query.data;
  return <div className="grid gap-4 md:grid-cols-2">{(["invoice", "receipt", "bill", "payment"] as const).map(kind => <AccountControl key={kind} entityId={entityId} kind={kind} accounts={data.accounts} saved={data[kind]}
    blocked={kind === "receipt" && !data.invoice || kind === "payment" && !data.bill} onSaved={refresh}/>)}</div>;
}

export function PostingAccountSettings() {
  const { profile } = useAuth(); const entities = useReportEntities(); const [entityId, setEntityId] = useState("");
  if (profile?.role !== "admin" && profile?.role !== "moderator") return <p>Only administrators and moderators can configure posting accounts.</p>;
  return <section className="space-y-5 rounded-xl border bg-card p-5"><h2 className="text-lg font-semibold">Posting accounts</h2>
    <p className="text-sm text-muted-foreground">Connect each entity's invoices, bills and manually recorded settlements to its ledger. Each configuration is saved separately and cannot be changed. Create the chart of accounts first; posting also requires an open period. This setup does not connect a bank or payment provider.</p>
    <div className="space-y-1"><Label htmlFor="posting-entity">Posting entity</Label><select id="posting-entity" className="h-10 w-full rounded border bg-background px-3 text-sm" disabled={entities.isFetching || entities.isError} value={entityId} onChange={event => setEntityId(event.target.value)}><option value="">Select entity</option>{entities.data?.map(entity => <option key={entity.id} value={entity.id}>{entity.name} · {entity.currency}</option>)}</select></div>
    {entities.isError ? <p role="alert">Entity list unavailable. Refresh to continue.</p> : entityId ? <EntityPostingAccounts key={entityId} entityId={entityId}/> : null}
  </section>;
}
