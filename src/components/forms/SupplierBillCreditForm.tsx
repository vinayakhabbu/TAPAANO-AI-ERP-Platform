import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { RotateCcw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

interface SupplierBillCreditFormProps {
  billId: string;
  billNumber: string;
  billIssueDate: string;
}

const today = () => format(new Date(), "yyyy-MM-dd");

export function SupplierBillCreditForm({ billId, billNumber, billIssueDate }: SupplierBillCreditFormProps) {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [creditNoteNumber, setCreditNoteNumber] = useState("");
  const [creditDate, setCreditDate] = useState(today);
  const [reason, setReason] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const reset = () => {
    setCreditNoteNumber("");
    setCreditDate(today());
    setReason("");
    setIdempotencyKey(crypto.randomUUID());
  };

  useEffect(() => {
    setOpen(false);
    reset();
  }, [user?.id, profile?.org_id, billId]);

  const postCredit = useMutation({
    mutationFn: async () => {
      if (!user?.id || !profile?.org_id) throw new Error("A current tenant session is required.");
      if (!creditNoteNumber.trim() || !reason.trim()) {
        throw new Error("Credit note number and reason are required.");
      }
      const { data, error } = await supabase.rpc("post_supplier_bill_credit", {
        p_bill_id: billId,
        p_credit_note_number: creditNoteNumber.trim(),
        p_credit_date: creditDate,
        p_reason: reason.trim(),
        p_idempotency_key: idempotencyKey,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posted-supplier-credit-history", user?.id, profile?.org_id] });
      queryClient.invalidateQueries({ queryKey: ["posted-supplier-bill-history", user?.id, profile?.org_id] });
      queryClient.invalidateQueries({ queryKey: ["journal-history", user?.id, profile?.org_id] });
      toast.success("Full supplier credit and exact reversal posted atomically");
      setOpen(false);
      reset();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <RotateCcw className="h-3.5 w-3.5" /> Full credit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" /> Full credit for {billNumber}
          </DialogTitle>
          <DialogDescription>
            PostgreSQL copies the immutable bill lines and posts an exact AP/expense offset
            in one OPEN-period transaction. Partial credits, refunds, payments, matching,
            tax, and FX remain unavailable.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); postCredit.mutate(); }}>
          <div className="space-y-2">
            <Label>Supplier credit number</Label>
            <Input value={creditNoteNumber} onChange={(event) => setCreditNoteNumber(event.target.value)} maxLength={80} required />
          </div>
          <div className="space-y-2">
            <Label>Credit date</Label>
            <Input type="date" min={billIssueDate} value={creditDate} onChange={(event) => setCreditDate(event.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Correction reason</Label>
            <Textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} required />
          </div>
          <Button type="submit" className="w-full" disabled={postCredit.isPending}>
            {postCredit.isPending ? "Posting…" : "Post full supplier credit"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
