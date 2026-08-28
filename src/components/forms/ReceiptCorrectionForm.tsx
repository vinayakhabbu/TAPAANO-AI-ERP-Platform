import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { RotateCcw, ShieldCheck } from "lucide-react";
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

interface ReceiptCorrectionFormProps {
  receiptId: string;
  receiptNumber: string;
  receiptDate: string;
  currency: string;
  amount: number;
}

const today = () => format(new Date(), "yyyy-MM-dd");

export function ReceiptCorrectionForm({
  receiptId,
  receiptNumber,
  receiptDate,
  currency,
  amount,
}: ReceiptCorrectionFormProps) {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [correctionNumber, setCorrectionNumber] = useState("");
  const [correctionDate, setCorrectionDate] = useState(today);
  const [reason, setReason] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const reset = () => {
    setCorrectionNumber("");
    setCorrectionDate(today());
    setReason("");
    setIdempotencyKey(crypto.randomUUID());
  };

  useEffect(() => {
    setOpen(false);
    reset();
  }, [user?.id, profile?.org_id, receiptId]);

  const postCorrection = useMutation({
    mutationFn: async () => {
      if (!user?.id || !profile?.org_id) throw new Error("A current tenant session is required.");
      if (!correctionNumber.trim() || !reason.trim()) {
        throw new Error("Correction number and reason are required.");
      }
      const { data, error } = await supabase.rpc("post_customer_receipt_correction", {
        p_receipt_id: receiptId,
        p_correction_number: correctionNumber.trim(),
        p_correction_date: correctionDate,
        p_reason: reason.trim(),
        p_idempotency_key: idempotencyKey,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["posted-customer-receipt-correction-history", user?.id, profile?.org_id],
      });
      queryClient.invalidateQueries({
        queryKey: ["posted-customer-receipt-history", user?.id, profile?.org_id],
      });
      queryClient.invalidateQueries({ queryKey: ["journal-history", user?.id, profile?.org_id] });
      toast.success("Customer receipt correction and exact-offset journal posted atomically");
      setOpen(false);
      reset();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <RotateCcw className="h-3.5 w-3.5" /> Correct receipt
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" /> Correct receipt {receiptNumber}
          </DialogTitle>
          <DialogDescription>
            PostgreSQL copies the original receipt evidence and posts its exact opposite in one
            OPEN-period transaction. This is an accounting correction, not a refund, bank action,
            match, or reconciliation record. One server-derived replacement is available after this
            correction; partial corrections and generic repeats remain unavailable.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); postCorrection.mutate(); }}>
          <div className="space-y-2">
            <Label>Correction number</Label>
            <Input
              value={correctionNumber}
              onChange={(event) => setCorrectionNumber(event.target.value)}
              maxLength={80}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Correction date</Label>
            <Input
              type="date"
              min={receiptDate}
              value={correctionDate}
              onChange={(event) => setCorrectionDate(event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Exact amount copied by PostgreSQL</Label>
            <Input value={`${currency} ${amount.toLocaleString()}`} readOnly />
          </div>
          <div className="space-y-2">
            <Label>Correction reason</Label>
            <Input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={240}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={postCorrection.isPending}>
            {postCorrection.isPending ? "Posting…" : "Post exact receipt correction"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
