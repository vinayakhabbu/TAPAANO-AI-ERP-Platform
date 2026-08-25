import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Banknote, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

interface ReceiptFormProps {
  invoiceId: string;
  invoiceNumber: string;
  invoiceIssueDate: string;
  currency: string;
  total: number;
}

const today = () => format(new Date(), "yyyy-MM-dd");

export function ReceiptForm({
  invoiceId,
  invoiceNumber,
  invoiceIssueDate,
  currency,
  total,
}: ReceiptFormProps) {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [receiptNumber, setReceiptNumber] = useState("");
  const [receiptDate, setReceiptDate] = useState(today);
  const [reference, setReference] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const reset = () => {
    setReceiptNumber("");
    setReceiptDate(today());
    setReference("");
    setIdempotencyKey(crypto.randomUUID());
  };

  useEffect(() => {
    setOpen(false);
    reset();
  }, [user?.id, profile?.org_id, invoiceId]);

  const postReceipt = useMutation({
    mutationFn: async () => {
      if (!user?.id || !profile?.org_id) throw new Error("A current tenant session is required.");
      if (!receiptNumber.trim() || !reference.trim()) {
        throw new Error("Receipt number and reference are required.");
      }
      const { data, error } = await supabase.rpc("post_customer_receipt", {
        p_invoice_id: invoiceId,
        p_receipt_number: receiptNumber.trim(),
        p_receipt_date: receiptDate,
        p_currency: currency,
        p_reference: reference.trim(),
        p_idempotency_key: idempotencyKey,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posted-customer-receipt-history", user?.id, profile?.org_id] });
      queryClient.invalidateQueries({ queryKey: ["posted-invoice-history", user?.id, profile?.org_id] });
      queryClient.invalidateQueries({ queryKey: ["journal-history", user?.id, profile?.org_id] });
      toast.success("Full customer receipt and AR journal posted atomically");
      setOpen(false);
      reset();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Banknote className="h-3.5 w-3.5" /> Full receipt
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" /> Full receipt for {invoiceNumber}
          </DialogTitle>
          <DialogDescription>
            PostgreSQL derives the exact full invoice amount and posts cash-clearing debit and AR
            credit in one OPEN-period transaction. This is a manual receipt record, not bank-match
            or reconciliation evidence. Partial, overpayment, refund, tax, and FX handling remain unavailable.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); postReceipt.mutate(); }}>
          <div className="space-y-2">
            <Label>Receipt number</Label>
            <Input
              value={receiptNumber}
              onChange={(event) => setReceiptNumber(event.target.value)}
              maxLength={80}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Receipt date</Label>
            <Input
              type="date"
              min={invoiceIssueDate}
              value={receiptDate}
              onChange={(event) => setReceiptDate(event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Full amount derived by the server</Label>
            <Input value={`${currency} ${total.toLocaleString()}`} readOnly />
          </div>
          <div className="space-y-2">
            <Label>Manual receipt reference</Label>
            <Input
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              maxLength={240}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={postReceipt.isPending}>
            {postReceipt.isPending ? "Posting…" : "Post full receipt and AR journal"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
