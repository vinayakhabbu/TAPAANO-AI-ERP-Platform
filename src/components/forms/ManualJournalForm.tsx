import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuth } from "@/hooks/useAuth";
import { useReportEntities } from "@/hooks/useTrialBalance";
import { useAccounts } from "@/hooks/useGeneralLedger";
import { useAccountingPeriods } from "@/hooks/usePeriodClose";
import { journalAmount, prepareManualJournal, type JournalLineInput } from "@/lib/manualJournal";
import { decimal, formatSignedAmount } from "@/lib/financeReports";
import { supabase } from "@/integrations/supabase/client";

const blank = (): JournalLineInput => ({ accountId: "", debit: "0.00", credit: "0.00", memo: "" });
export function ManualJournalForm() {
  const { user, profile } = useAuth(); const entities = useReportEntities(), accounts = useAccounts(), periods = useAccountingPeriods(); const cache = useQueryClient();
  const [entityId, setEntityId] = useState(""), [number, setNumber] = useState(""), [date, setDate] = useState(""), [memo, setMemo] = useState("");
  const [lines, setLines] = useState<JournalLineInput[]>(() => [blank(), blank()]);
  const [request, setRequest] = useState<ReturnType<typeof prepareManualJournal> | null>(null);
  const [posted, setPosted] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: async (payload: ReturnType<typeof prepareManualJournal>) => { const { data, error } = await supabase.rpc("post_manual_journal", payload); if (error) throw error; return data; },
    onSuccess: async (_id, payload) => {
      setPosted(payload.p_entry_number);
      await Promise.all(["journal-history", "trial-balance", "account-ledger", "operational-summary"].map(key => cache.invalidateQueries({ queryKey: [key, user?.id, profile?.org_id] })));
    },
  });
  if (profile?.role !== "admin" && profile?.role !== "moderator") return <p className="text-sm text-muted-foreground">Only administrators and moderators can post manual journals.</p>;
  const entity = entities.data?.find(item => item.id === entityId);
  const unavailable = entities.isError || accounts.isError || periods.isError || entities.isPending || accounts.isPending || periods.isPending;
  const open = periods.data?.some(period => period.entity_id === entityId && period.status === "OPEN" && period.period_start <= date && period.period_end >= date);
  let validation = "", debit = "", credit = "";
  try {
    debit = decimal(lines.reduce((sum, line) => sum + journalAmount(line.debit), 0n)); credit = decimal(lines.reduce((sum, line) => sum + journalAmount(line.credit), 0n));
    prepareManualJournal({ entityId, number, date, memo, lines, requestKey: "preview" });
  } catch (error) { validation = error instanceof Error ? error.message : "Review the journal inputs."; }
  const locked = Boolean(request);
  function update(index: number, key: keyof JournalLineInput, value: string) { setLines(current => current.map((line, i) => i === index ? { ...line, [key]: value } : line)); }
  function submit(event: FormEvent) {
    event.preventDefault(); if (mutation.isPending || posted || (!request && (validation || unavailable || !open))) return;
    const payload = request ?? prepareManualJournal({ entityId, number, date, memo, lines, requestKey: crypto.randomUUID() });
    setRequest(payload); mutation.mutate(payload);
  }
  function reset() { setRequest(null); setPosted(null); setNumber(""); setMemo(""); setLines([blank(), blank()]); mutation.reset(); }
  return <section className="space-y-4 rounded-xl border bg-card p-5" aria-label="Manual journal entry">
    <h2 className="text-lg font-semibold">Post manual journal</h2><p className="text-sm text-muted-foreground">Record an opening balance or adjustment in one entity's functional currency. Posting requires an open accounting period and balanced debit and credit lines.</p>
    {unavailable ? <p className="text-sm text-destructive">Accounts, entities or periods are unavailable. Reload before posting.</p> : null}
    <form className="space-y-5" onSubmit={submit}>
      <fieldset disabled={locked || unavailable} className="space-y-5">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2"><Label htmlFor="journal-entity">Journal entity</Label><select id="journal-entity" required value={entityId} onChange={event => setEntityId(event.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">Select an entity</option>{entities.data?.map(item => <option key={item.id} value={item.id}>{item.name} ({item.currency})</option>)}</select></div>
          <div className="space-y-2"><Label htmlFor="journal-number">Journal reference</Label><Input id="journal-number" required maxLength={100} value={number} onChange={event => setNumber(event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="journal-date">Journal date</Label><Input id="journal-date" type="date" min="0001-01-01" max="9999-12-31" required value={date} onChange={event => setDate(event.target.value)} /></div>
        </div>
        <div className="space-y-2"><Label htmlFor="journal-memo">Journal memo</Label><Textarea id="journal-memo" maxLength={2000} value={memo} onChange={event => setMemo(event.target.value)} /></div>
        {lines.map((line, index) => <div key={index} className="grid items-end gap-3 rounded-md border p-3 md:grid-cols-6">
          <div className="space-y-2 md:col-span-2"><Label htmlFor={`journal-account-${index}`}>Account line {index + 1}</Label><select id={`journal-account-${index}`} required value={line.accountId} onChange={event => update(index, "accountId", event.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">Select account</option>{accounts.data?.map(account => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></div>
          <div className="space-y-2"><Label htmlFor={`journal-debit-${index}`}>Debit line {index + 1}</Label><Input id={`journal-debit-${index}`} inputMode="decimal" required value={line.debit} onChange={event => update(index, "debit", event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor={`journal-credit-${index}`}>Credit line {index + 1}</Label><Input id={`journal-credit-${index}`} inputMode="decimal" required value={line.credit} onChange={event => update(index, "credit", event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor={`journal-line-memo-${index}`}>Memo line {index + 1}</Label><Input id={`journal-line-memo-${index}`} maxLength={1000} value={line.memo} onChange={event => update(index, "memo", event.target.value)} /></div>
          <Button type="button" variant="outline" disabled={lines.length <= 2} onClick={() => setLines(current => current.filter((_, i) => i !== index))}>Remove line {index + 1}</Button>
        </div>)}
        <Button type="button" variant="outline" disabled={lines.length >= 500} onClick={() => setLines(current => [...current, blank()])}>Add journal line</Button>
      </fieldset>
      {entity && debit && credit ? <p className="text-sm font-medium">Debit {formatSignedAmount(entity.currency, debit)} · Credit {formatSignedAmount(entity.currency, credit)}</p> : null}
      {!posted && !locked && validation ? <p className="text-sm text-muted-foreground">{validation}</p> : null}
      {!posted && entityId && date && !open && !unavailable ? <p className="text-sm text-destructive">No open accounting period covers this entity and date.</p> : null}
      {posted ? <div className="space-y-3"><p role="status">Journal {posted} posted.</p><Button type="button" variant="outline" onClick={reset}>Start another journal</Button></div> : <Button type="submit" disabled={mutation.isPending || (!request && Boolean(validation || unavailable || !open))}>{mutation.isPending ? "Posting…" : request ? "Retry same journal" : "Post balanced journal"}</Button>}
    </form>
    {mutation.isError ? <Alert variant="destructive"><AlertTitle>Journal posting not confirmed</AlertTitle><AlertDescription>Retry this same request to confirm whether it posted. If inputs need correction, check journal history before starting another journal.</AlertDescription><Button variant="outline" className="mt-3" onClick={reset}>Start another journal after checking history</Button></Alert> : null}
  </section>;
}
