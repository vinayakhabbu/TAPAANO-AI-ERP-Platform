import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Banknote, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

interface SupplierPaymentFormProps {
  billId: string;
  billNumber: string;
  billIssueDate: string;
  currency: string;
  total: number;
}

const today = () => format(new Date(), "yyyy-MM-dd");

export function SupplierPaymentForm({
  billId,
  billNumber,
  billIssueDate,
  currency,
  total,
}: SupplierPaymentFormProps) {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [paymentNumber, setPaymentNumber] = useState("");
  const [paymentDate, setPaymentDate] = useState(today);
  const [reference, setReference] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const reset = () => {
    setPaymentNumber("");
    setPaymentDate(today());
    setReference("");
    setIdempotencyKey(crypto.randomUUID());
  };

  useEffect(() => {
    setOpen(false);
    reset();
  }, [user?.id, profile?.org_id, billId]);

  const postPayment = useMutation({
    mutationFn: async () => {
      if (!user?.id || !profile?.org_id) throw new Error("A current tenant session is required.");
      if (!paymentNumber.trim() || !reference.trim()) {
        throw new Error("Payment number and manual reference are required.");
      }
      const { data, error } = await supabase.rpc("post_supplier_payment", {
        p_bill_id: billId,
        p_payment_number: paymentNumber.trim(),
        p_payment_date: paymentDate,
        p_currency: currency,
        p_reference: reference.trim(),
        p_idempotency_key: idempotencyKey,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posted-supplier-payment-history", user?.id, profile?.org_id] });
      queryClient.invalidateQueries({ queryKey: ["posted-supplier-bill-history", user?.id, profile?.org_id] });
      queryClient.invalidateQueries({ queryKey: ["journal-history", user?.id, profile?.org_id] });
      toast.success("Full supplier payment and AP journal posted atomically");
      setOpen(false);
      reset();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Banknote className="h-3.5 w-3.5" /> Full payment
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" /> Full payment for {billNumber}
          </DialogTitle>
          <DialogDescription>
            PostgreSQL derives the exact bill total and posts AP debit and cash-clearing credit
            in one OPEN-period transaction. This is a manual accounting record, not bank-match
            or reconciliation evidence. Partial and overpayments remain unavailable.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); postPayment.mutate(); }}>
          <div className="space-y-2">
            <Label>Payment number</Label>
            <Input value={paymentNumber} onChange={(event) => setPaymentNumber(event.target.value)} maxLength={80} required />
          </div>
          <div className="space-y-2">
            <Label>Payment date</Label>
            <Input type="date" min={billIssueDate} value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Full amount derived by the server</Label>
            <Input value={`${currency} ${total.toLocaleString()}`} readOnly />
          </div>
          <div className="space-y-2">
            <Label>Manual payment reference</Label>
            <Input value={reference} onChange={(event) => setReference(event.target.value)} maxLength={240} required />
          </div>
          <Button type="submit" className="w-full" disabled={postPayment.isPending}>
            {postPayment.isPending ? "Posting…" : "Post full supplier payment"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
