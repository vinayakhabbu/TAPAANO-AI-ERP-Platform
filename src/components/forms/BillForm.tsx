import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { Plus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

const today = () => format(new Date(), "yyyy-MM-dd");
const defaultDueDate = () => format(addDays(new Date(), 30), "yyyy-MM-dd");

export function BillForm({ trigger }: { trigger?: React.ReactNode }) {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [entityId, setEntityId] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [billNumber, setBillNumber] = useState("");
  const [issueDate, setIssueDate] = useState(today);
  const [dueDate, setDueDate] = useState(defaultDueDate);
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1.0000");
  const [unitPrice, setUnitPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const ready = Boolean(user?.id && profile?.org_id);

  const { data: entities = [] } = useQuery({
    queryKey: ["supplier-bill-entities", user?.id, profile?.org_id],
    queryFn: async () => {
      if (!user?.id || !profile?.org_id) return [];
      const { data, error } = await supabase.from("entities")
        .select("id, name, currency").eq("org_id", profile.org_id).order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: ready,
  });
  const { data: vendors = [] } = useQuery({
    queryKey: ["supplier-bill-vendors", user?.id, profile?.org_id],
    queryFn: async () => {
      if (!user?.id || !profile?.org_id) return [];
      const { data, error } = await supabase.from("vendors")
        .select("id, name").eq("org_id", profile.org_id).order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: ready,
  });
  const selectedEntity = entities.find((entity) => entity.id === entityId);
  const lineTotal = useMemo(() => {
    const quantityNumber = Number(quantity);
    const priceNumber = Number(unitPrice);
    return Number.isFinite(quantityNumber) && Number.isFinite(priceNumber)
      ? (quantityNumber * priceNumber).toFixed(2) : "0.00";
  }, [quantity, unitPrice]);

  const reset = () => {
    setEntityId(""); setVendorId(""); setBillNumber(""); setIssueDate(today());
    setDueDate(defaultDueDate()); setDescription(""); setQuantity("1.0000");
    setUnitPrice(""); setNotes(""); setIdempotencyKey(crypto.randomUUID());
  };
  useEffect(() => { setOpen(false); reset(); }, [user?.id, profile?.org_id]);

  const postBill = useMutation({
    mutationFn: async () => {
      if (!ready || !selectedEntity) throw new Error("A current user, organization, and entity are required.");
      if (!vendorId || !billNumber.trim() || !description.trim()) {
        throw new Error("Entity, vendor, bill number, and description are required.");
      }
      const exactDecimal = /^\d+(?:\.\d{1,4})?$/;
      if (!exactDecimal.test(quantity) || !exactDecimal.test(unitPrice)) {
        throw new Error("Quantity and unit price must be positive decimals with at most four places.");
      }
      const lines: Json = [{ description: description.trim(), quantity, unit_price: unitPrice }];
      const { data, error } = await supabase.rpc("post_supplier_bill", {
        p_entity_id: selectedEntity.id,
        p_vendor_id: vendorId,
        p_bill_number: billNumber.trim(),
        p_issue_date: issueDate,
        p_due_date: dueDate,
        p_currency: selectedEntity.currency,
        p_tax: 0,
        p_notes: notes.trim() || null,
        p_lines: lines,
        p_idempotency_key: idempotencyKey,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posted-supplier-bill-history", user?.id, profile?.org_id] });
      queryClient.invalidateQueries({ queryKey: ["journal-history", user?.id, profile?.org_id] });
      toast.success("Supplier bill and AP journal posted atomically");
      setOpen(false); reset();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger || (
        <Button className="gap-2"><Plus className="h-4 w-4" />Post supported bill</Button>
      )}</DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" />Post supplier bill</DialogTitle>
          <DialogDescription>
            Supported boundary: one direct line, zero tax, entity functional currency. Bill,
            line, event, OPEN-period link, and balanced expense/AP journal commit together.
            Approval, matching, payment, PO/receipt conversion, tax, and FX remain unavailable.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); postBill.mutate(); }}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label>Entity</Label><Select value={entityId} onValueChange={setEntityId}>
              <SelectTrigger><SelectValue placeholder="Select entity" /></SelectTrigger>
              <SelectContent>{entities.map((entity) => <SelectItem key={entity.id} value={entity.id}>{entity.name} ({entity.currency})</SelectItem>)}</SelectContent>
            </Select></div>
            <div className="space-y-2"><Label>Vendor</Label><Select value={vendorId} onValueChange={setVendorId}>
              <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
              <SelectContent>{vendors.map((vendor) => <SelectItem key={vendor.id} value={vendor.id}>{vendor.name}</SelectItem>)}</SelectContent>
            </Select></div>
          </div>
          <div className="space-y-2"><Label>Bill number</Label><Input value={billNumber} onChange={(event) => setBillNumber(event.target.value)} maxLength={80} required /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label>Issue date</Label><Input type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} required /></div>
            <div className="space-y-2"><Label>Due date</Label><Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required /></div>
          </div>
          <div className="space-y-2"><Label>Description</Label><Input value={description} onChange={(event) => setDescription(event.target.value)} required /></div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2"><Label>Quantity</Label><Input inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} required /></div>
            <div className="space-y-2"><Label>Unit price</Label><Input inputMode="decimal" value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} required /></div>
            <div className="space-y-2"><Label>Calculated total</Label><Input value={`${selectedEntity?.currency ?? "—"} ${lineTotal}`} readOnly /></div>
          </div>
          <div className="space-y-2"><Label>Notes</Label><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></div>
          <Button type="submit" className="w-full" disabled={!ready || postBill.isPending}>
            {postBill.isPending ? "Posting…" : "Post bill and AP journal"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
