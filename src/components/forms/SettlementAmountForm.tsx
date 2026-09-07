import { useId, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { prepareSettlement } from "@/lib/settlementAmount";
import { formatSignedAmount } from "@/lib/financeReports";

type Props = { kind: "ar" | "ap"; documentId: string; documentNumber: string; issueDate: string; currency: string; outstanding: string; asOf: string };
export function SettlementAmountForm(props: Props) {
  const { user, profile } = useAuth();
  if (profile?.role !== "admin" && profile?.role !== "moderator") return null;
  return <SettlementEditor key={`${user?.id}:${profile.org_id}:${props.documentId}`} {...props} />;
}
function SettlementEditor({ kind, documentId, documentNumber, issueDate, currency, outstanding, asOf }: Props) {
  const { user, profile } = useAuth(), cache = useQueryClient(), id = useId();
  const [open, setOpen] = useState(false), [number, setNumber] = useState(""), [date, setDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [amount, setAmount] = useState(""), [reference, setReference] = useState("");
  const [request, setRequest] = useState<ReturnType<typeof prepareSettlement> | null>(null);
  const label = kind === "ar" ? "receipt" : "payment";
  const mutation = useMutation({
    mutationFn: async (payload: ReturnType<typeof prepareSettlement>) => {
      if (!user?.id || !profile?.org_id) throw new Error("A tenant session is required.");
      const { number: n, date: d, documentId: doc, ...common } = payload;
      const result = kind === "ar"
        ? await supabase.rpc("post_customer_receipt_amount", { ...common, p_invoice_id: doc, p_receipt_number: n, p_receipt_date: d })
        : await supabase.rpc("post_supplier_payment_amount", { ...common, p_bill_id: doc, p_payment_number: n, p_payment_date: d });
      if (result.error) throw result.error;
      if (!result.data) throw new Error("Posting confirmation is unavailable.");
      return result.data;
    },
    onSuccess: () => {
      toast.success(`${kind === "ar" ? "Receipt" : "Payment"} ${number} and journal posted`);
      setOpen(false); setRequest(null); setNumber(""); setAmount(""); setReference("");
      for (const key of ["subledger-aging", "trial-balance", "account-ledger", "journal-history", "operational-summary", "posted-customer-receipt-history", "posted-supplier-payment-history", "posted-invoice-history", "posted-supplier-bill-history"]) {
        void cache.invalidateQueries({ queryKey: [key, user?.id, profile?.org_id] });
      }
    },
  });
  let validation = "";
  try { prepareSettlement({ documentId, number, date, issueDate, currency, amount, reference, requestKey: "preview" }); }
  catch (error) { validation = error instanceof Error ? error.message : "Review the allocation."; }
  function submit(event: FormEvent) {
    event.preventDefault(); if (mutation.isPending || (!request && validation)) return;
    const payload = request ?? prepareSettlement({ documentId, number, date, issueDate, currency, amount, reference, requestKey: crypto.randomUUID() });
    setRequest(payload); mutation.mutate(payload);
  }
  return <Dialog open={open} onOpenChange={value => { if (!mutation.isPending) setOpen(value); }}>
    <DialogTrigger asChild><Button variant="outline" size="sm">Record {label}</Button></DialogTrigger>
    <DialogContent><DialogHeader><DialogTitle>Record {label} for {documentNumber}</DialogTitle>
      <DialogDescription>Enter a partial amount or the remaining balance. The server checks all dated settlements before posting in an open period. This records accounting; it does not move money or reconcile a bank account.</DialogDescription></DialogHeader>
      <p className="text-sm">Outstanding as of {asOf}: {formatSignedAmount(currency, outstanding)}. Later postings may change the available balance.</p>
      <form className="space-y-4" onSubmit={submit}>
        <fieldset disabled={Boolean(request)} className="space-y-4">
          <div className="space-y-2"><Label htmlFor={id + "-number"}>Settlement number</Label><Input id={id + "-number"} required maxLength={80} value={number} onChange={event => setNumber(event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor={id + "-date"}>Settlement date</Label><Input id={id + "-date"} type="date" min={issueDate} max="9999-12-31" required value={date} onChange={event => setDate(event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor={id + "-amount"}>Settlement amount ({currency})</Label><Input id={id + "-amount"} inputMode="decimal" required value={amount} onChange={event => setAmount(event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor={id + "-reference"}>Settlement reference</Label><Input id={id + "-reference"} required maxLength={240} value={reference} onChange={event => setReference(event.target.value)} /></div>
        </fieldset>
        {!request && validation ? <p className="text-sm text-muted-foreground">{validation}</p> : null}
        <Button type="submit" disabled={mutation.isPending || (!request && Boolean(validation))}>{mutation.isPending ? "Posting…" : request ? "Retry same settlement" : `Post ${label} and journal`}</Button>
      </form>
      {mutation.isError ? <Alert variant="destructive"><AlertTitle>Settlement posting not confirmed</AlertTitle><AlertDescription>Retry the same request to confirm the result. If the amount, period or account setup is invalid, check settlement history before starting another request.</AlertDescription>
        <Button variant="outline" className="mt-3" onClick={() => { setRequest(null); mutation.reset(); }}>Edit after checking history</Button>
      </Alert> : null}
    </DialogContent>
  </Dialog>;
}
