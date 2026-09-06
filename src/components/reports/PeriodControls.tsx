import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/hooks/useAuth";
import { useReportEntities } from "@/hooks/useTrialBalance";
import { usePeriodEvents } from "@/hooks/usePeriodClose";
import { supabase } from "@/integrations/supabase/client";
import { isReportDate } from "@/lib/trialBalance";

type CreateRequest = { p_entity_id: string; p_period_start: string; p_period_end: string; p_idempotency_key: string };
type ChangeRequest = { p_period_id: string; p_expected_version: number; p_to_status: string; p_reason: string; p_idempotency_key: string };
export type SelectedPeriod = { id: string; version: number; status: string; period_start: string; period_end: string; entity_id: string };

function useRefreshPeriods() {
  const { user, profile } = useAuth(); const cache = useQueryClient();
  return () => Promise.all(["accounting-periods", "accounting-period-events", "operational-summary"].map(key => cache.invalidateQueries({ queryKey: [key, user?.id, profile?.org_id] })));
}

export function CreatePeriodForm() {
  const { profile } = useAuth(); const entities = useReportEntities(); const refresh = useRefreshPeriods();
  const [entityId, setEntityId] = useState(""), [from, setFrom] = useState(""), [through, setThrough] = useState("");
  const [request, setRequest] = useState<CreateRequest | null>(null), [created, setCreated] = useState(false);
  const allowed = profile?.role === "admin" || profile?.role === "moderator";
  const create = useMutation({
    mutationFn: async (payload: CreateRequest) => { const { data, error } = await supabase.rpc("create_accounting_period", payload); if (error) throw error; return data; },
    onSuccess: async () => { setCreated(true); setRequest(null); setFrom(""); setThrough(""); await refresh(); },
  });
  if (!allowed) return null;
  const valid = entityId && isReportDate(from) && isReportDate(through) && from <= through && !entities.isError && !entities.isPending;
  function submit(event: FormEvent) {
    event.preventDefault(); if ((!request && !valid) || create.isPending) return;
    const payload = request ?? { p_entity_id: entityId, p_period_start: from, p_period_end: through, p_idempotency_key: crypto.randomUUID() };
    setCreated(false); setRequest(payload); create.mutate(payload);
  }
  return <section className="space-y-4 rounded-xl border bg-card p-5" aria-label="Create accounting period">
    <h2 className="font-semibold">Create accounting period</h2><p className="text-sm text-muted-foreground">Create a posting window for one legal entity. Dates are inclusive and cannot overlap an existing period.</p>
    <form onSubmit={submit} className="grid items-end gap-4 md:grid-cols-4">
      <div className="space-y-2"><Label htmlFor="period-entity">Period entity</Label><select id="period-entity" required disabled={Boolean(request) || entities.isPending || entities.isError} value={entityId} onChange={event => setEntityId(event.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">Select an entity</option>{entities.data?.map(entity => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</select></div>
      <div className="space-y-2"><Label htmlFor="period-from">Period start</Label><Input id="period-from" type="date" min="0001-01-01" max="9999-12-31" required disabled={Boolean(request)} value={from} onChange={event => setFrom(event.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="period-through">Period end</Label><Input id="period-through" type="date" min="0001-01-01" max="9999-12-31" required disabled={Boolean(request)} value={through} onChange={event => setThrough(event.target.value)} /></div>
      <Button type="submit" disabled={create.isPending || (!request && !valid)}>{create.isPending ? "Creating…" : request ? "Retry period creation" : "Create period"}</Button>
    </form>
    {entities.isError ? <p className="text-sm text-destructive">Entities unavailable. Reload before creating a period.</p> : null}
    {created ? <p role="status" className="text-sm">Accounting period created.</p> : null}
    {create.isError ? <Alert variant="destructive"><AlertTitle>Period creation not confirmed</AlertTitle><AlertDescription>Check the dates and existing periods. Retry to confirm this same request, or refresh history before starting a different request.</AlertDescription><Button variant="outline" className="mt-3" onClick={async () => { await refresh(); setRequest(null); create.reset(); }}>Refresh and edit</Button></Alert> : null}
  </section>;
}

export function PeriodManagement({ period, entityName, onClose }: { period: SelectedPeriod; entityName: string; onClose: () => void }) {
  const { profile } = useAuth(); const refresh = useRefreshPeriods(); const events = usePeriodEvents(period.id);
  const [target, setTarget] = useState(period.status === "OPEN" ? "SOFT_CLOSED" : "OPEN"), [reason, setReason] = useState(""), [acknowledged, setAcknowledged] = useState(false);
  const [request, setRequest] = useState<ChangeRequest | null>(null);
  const change = useMutation({
    mutationFn: async (payload: ChangeRequest) => { const { data, error } = await supabase.rpc("change_accounting_period", payload); if (error) throw error; return data; },
    onSuccess: async () => { await refresh(); onClose(); },
  });
  const allowed = profile?.role === "admin" || profile?.role === "moderator";
  function submit(event: FormEvent) {
    event.preventDefault(); if (change.isPending || !allowed || reason.trim().length < 3 || (target === "HARD_CLOSED" && !acknowledged)) return;
    const payload = request ?? { p_period_id: period.id, p_expected_version: period.version, p_to_status: target, p_reason: reason.trim(), p_idempotency_key: crypto.randomUUID() };
    setRequest(payload); change.mutate(payload);
  }
  return <section className="space-y-4 rounded-xl border bg-card p-5" aria-label="Manage accounting period">
    <div className="flex flex-wrap justify-between gap-3"><div><h2 className="font-semibold">{entityName} · {period.period_start} through {period.period_end}</h2><p className="text-sm">Selected status {period.status.replace(/_/g, " ")} · version {period.version}</p></div><Button variant="outline" disabled={change.isPending} onClick={onClose}>Close period details</Button></div>
    {allowed && period.status !== "HARD_CLOSED" ? <form className="space-y-4" onSubmit={submit}>
      <div className="space-y-2"><Label htmlFor="period-next-status">New status</Label><select id="period-next-status" value={target} disabled={Boolean(request)} onChange={event => { setTarget(event.target.value); setAcknowledged(false); }} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
        {period.status === "OPEN" ? <option value="SOFT_CLOSED">Soft closed — pause posting</option> : <><option value="OPEN">Open — allow posting</option><option value="HARD_CLOSED">Hard closed — permanently close posting</option></>}
      </select></div>
      <div className="space-y-2"><Label htmlFor="period-reason">Reason for change</Label><Textarea id="period-reason" required minLength={3} maxLength={2000} disabled={Boolean(request)} value={reason} onChange={event => setReason(event.target.value)} /></div>
      {target === "HARD_CLOSED" ? <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={acknowledged} disabled={Boolean(request)} onChange={event => setAcknowledged(event.target.checked)} />I have completed the required close reviews and understand this period cannot be reopened.</label> : null}
      <p className="text-sm text-muted-foreground">A period lock controls posting. Reconciliations and financial close reviews must be completed separately.</p>
      <Button type="submit" disabled={change.isPending || reason.trim().length < 3 || (target === "HARD_CLOSED" && !acknowledged)}>{change.isPending ? "Applying…" : request ? "Retry same period change" : "Apply period change"}</Button>
    </form> : <p className="text-sm text-muted-foreground">{period.status === "HARD_CLOSED" ? "This period is permanently closed." : "Only administrators and moderators can change posting windows."}</p>}
    {change.isError ? <Alert variant="destructive"><AlertTitle>Period change not confirmed</AlertTitle><AlertDescription>The period may have changed or access may be unavailable. Retry this same request to confirm its outcome, or close these details and reload the current period before another change.</AlertDescription></Alert> : null}
    <h3 className="font-semibold">Period history</h3>
    {events.isError ? <p className="text-sm text-destructive">Period history unavailable.</p> : events.isFetching ? <p role="status">Loading period history…</p> : <ol className="space-y-3">{events.data?.map(event => <li key={event.id} className="rounded-md border p-3 text-sm"><p className="font-medium">Version {event.period_version}: {event.from_status?.replace(/_/g, " ") ?? "Created"} → {event.to_status.replace(/_/g, " ")}</p><p>{event.reason}</p><p className="text-xs text-muted-foreground">{new Date(event.created_at).toLocaleString()} · Actor {event.actor_id}</p></li>)}</ol>}
  </section>;
}
