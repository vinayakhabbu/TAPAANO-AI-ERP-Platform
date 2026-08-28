import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { RefreshCw, ShieldCheck } from "lucide-react";
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

interface ReceiptReplacementFormProps {
  correctionId: string;
  correctionNumber: string;
  correctionDate: string;
  currency: string;
  amount: number;
}

const today = () => format(new Date(), "yyyy-MM-dd");

export function ReceiptReplacementForm({
  correctionId,
  correctionNumber,
  correctionDate,
  currency,
  amount,
}: ReceiptReplacementFormProps) {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [replacementNumber, setReplacementNumber] = useState("");
  const [replacementDate, setReplacementDate] = useState(today);
  const [reference, setReference] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const reset = () => {
    setReplacementNumber("");
    setReplacementDate(today());
    setReference("");
    setIdempotencyKey(crypto.randomUUID());
  };

  useEffect(() => {
    setOpen(false);
    reset();
  }, [user?.id, profile?.org_id, correctionId]);

  const postReplacement = useMutation({
    mutationFn: async () => {
      if (!user?.id || !profile?.org_id) throw new Error("A current tenant session is required.");
      if (!replacementNumber.trim() || !reference.trim()) {
        throw new Error("Replacement number and reference are required.");
      }
      const { data, error } = await supabase.rpc("post_customer_receipt_replacement", {
        p_correction_id: correctionId,
        p_replacement_number: replacementNumber.trim(),
        p_replacement_date: replacementDate,
        p_reference: reference.trim(),
        p_idempotency_key: idempotencyKey,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["posted-customer-receipt-replacement-history", user?.id, profile?.org_id],
      });
      queryClient.invalidateQueries({
        queryKey: ["posted-customer-receipt-correction-history", user?.id, profile?.org_id],
      });
      queryClient.invalidateQueries({ queryKey: ["journal-history", user?.id, profile?.org_id] });
      toast.success("Replacement receipt and exact journal posted atomically");
      setOpen(false);
      reset();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <RefreshCw className="h-3.5 w-3.5" /> Replace receipt
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" /> Replace corrected receipt {correctionNumber}
          </DialogTitle>
          <DialogDescription>
            PostgreSQL copies the original verified settlement after its exact correction. The
            amount, currency, tenant lineage, accounts, and journal lines cannot be supplied by
            the browser. This is not evidence of a bank receipt or reconciliation.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); postReplacement.mutate(); }}>
          <div className="space-y-2">
            <Label>Replacement receipt number</Label>
            <Input value={replacementNumber} onChange={(event) => setReplacementNumber(event.target.value)} maxLength={80} required />
          </div>
          <div className="space-y-2">
            <Label>Replacement date</Label>
            <Input type="date" min={correctionDate} value={replacementDate} onChange={(event) => setReplacementDate(event.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Exact amount copied by PostgreSQL</Label>
            <Input value={`${currency} ${amount.toLocaleString()}`} readOnly />
          </div>
          <div className="space-y-2">
            <Label>Replacement reference</Label>
            <Input value={reference} onChange={(event) => setReference(event.target.value)} maxLength={240} required />
          </div>
          <Button type="submit" className="w-full" disabled={postReplacement.isPending}>
            {postReplacement.isPending ? "Posting…" : "Post one replacement receipt"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
