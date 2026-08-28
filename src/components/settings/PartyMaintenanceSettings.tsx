import { useRef, useState } from "react";
import { ContactRound, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  usePartyMaintenance, type CustomerDetails, type MaintainedCustomer,
  type MaintainedVendor, type VendorDetails,
} from "@/hooks/usePartyMaintenance";

type Party = MaintainedCustomer | MaintainedVendor;
type Kind = "customer" | "vendor";

function optional(value: string) {
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function PartySection({
  kind, parties, busy, onCreate, onUpdate, onRetire,
}: {
  kind: Kind;
  parties: Party[];
  busy: boolean;
  onCreate: (details: CustomerDetails) => Promise<unknown>;
  onUpdate: (id: string, details: CustomerDetails) => Promise<unknown>;
  onRetire: (id: string, reason: string, key: string) => Promise<unknown>;
}) {
  const label = kind === "customer" ? "Customer" : "Vendor";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [terms, setTerms] = useState("30");
  const [creditLimit, setCreditLimit] = useState("");
  const [reason, setReason] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [retireReason, setRetireReason] = useState("");
  const requestKeys = useRef<Record<string, { signature: string; key: string }>>({});

  const requestKey = (action: string, signature: string) => {
    const existing = requestKeys.current[action];
    if (existing?.signature === signature) return existing.key;
    const key = crypto.randomUUID();
    requestKeys.current[action] = { signature, key };
    return key;
  };

  const details = (auditReason: string, key: string): CustomerDetails => ({
    name: name.trim(), email: optional(email), phone: optional(phone), address: optional(address),
    paymentTerms: Number(terms), creditLimit: kind === "customer" && creditLimit.trim()
      ? Number(creditLimit) : null,
    reason: auditReason.trim(), idempotencyKey: key,
  });

  const resetFields = () => {
    setName(""); setEmail(""); setPhone(""); setAddress(""); setTerms("30"); setCreditLimit(""); setReason("");
  };

  const selectParty = (id: string) => {
    setSelectedId(id);
    const party = parties.find((candidate) => candidate.id === id);
    if (!party) return;
    setName(party.name); setEmail(party.email ?? ""); setPhone(party.phone ?? "");
    setAddress(party.address ?? ""); setTerms(String(party.payment_terms));
    setCreditLimit(kind === "customer" && "credit_limit" in party && party.credit_limit != null
      ? String(party.credit_limit) : "");
    setReason("");
  };

  const submitCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    const signature = [name.trim(), optional(email), optional(phone), optional(address), terms, creditLimit, reason.trim()].join("|");
    const key = requestKey("create", signature);
    try {
      await onCreate(details(reason, key));
      delete requestKeys.current.create;
      resetFields();
      toast.success(`${label} created with immutable audit evidence`);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : `${label} creation failed closed`);
    }
  };

  const submitUpdate = async (event: React.FormEvent) => {
    event.preventDefault();
    const signature = [selectedId, name.trim(), optional(email), optional(phone), optional(address), terms, creditLimit, reason.trim()].join("|");
    const key = requestKey("update", signature);
    try {
      await onUpdate(selectedId, details(reason, key));
      delete requestKeys.current.update;
      setSelectedId(""); resetFields();
      toast.success(`${label} profile updated and audited`);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : `${label} update failed closed`);
    }
  };

  const submitRetire = async (event: React.FormEvent) => {
    event.preventDefault();
    const signature = `${selectedId}|${retireReason.trim()}`;
    const key = requestKey("retire", signature);
    try {
      await onRetire(selectedId, retireReason.trim(), key);
      delete requestKeys.current.retire;
      setSelectedId(""); setRetireReason(""); resetFields();
      toast.success(`${label} retired; historical documents remain unchanged`);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : `${label} retirement failed closed`);
    }
  };

  const activeParties = parties.filter((party) => party.is_active);
  const fields = (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="space-y-2"><Label>{label} name</Label><Input value={name} onChange={(event) => setName(event.target.value)} maxLength={200} required /></div>
      <div className="space-y-2"><Label>Email</Label><Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={320} /></div>
      <div className="space-y-2"><Label>Phone</Label><Input value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={80} /></div>
      <div className="space-y-2"><Label>Payment terms (days)</Label><Input type="number" min="0" max="3650" value={terms} onChange={(event) => setTerms(event.target.value)} required /></div>
      <div className="space-y-2 md:col-span-2"><Label>Address</Label><Textarea value={address} onChange={(event) => setAddress(event.target.value)} maxLength={2000} /></div>
      {kind === "customer" && <div className="space-y-2"><Label>Credit limit (optional)</Label><Input type="number" min="0" step="0.01" value={creditLimit} onChange={(event) => setCreditLimit(event.target.value)} /></div>}
      <div className="space-y-2 md:col-span-2"><Label>Audit reason</Label><Textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} required /></div>
    </div>
  );

  return (
    <Card>
      <CardHeader><CardTitle>{label} lifecycle</CardTitle><CardDescription>
        Create or update normalized contact and payment metadata. Tenant identity and history remain immutable.
      </CardDescription></CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-2 md:grid-cols-2">
          {parties.map((party) => <div key={party.id} className="flex justify-between rounded-md border px-3 py-2 text-sm"><span>{party.name}</span><span className="text-muted-foreground">{party.is_active ? "Active" : "Retired"}</span></div>)}
        </div>
        <form className="space-y-4 border-t pt-5" onSubmit={submitCreate}>
          <h4 className="font-medium">Create {kind}</h4>{fields}
          <Button type="submit" disabled={busy || !name.trim() || !reason.trim()}>{busy ? "Saving…" : `Create ${kind}`}</Button>
        </form>
        <form className="space-y-4 border-t pt-5" onSubmit={submitUpdate}>
          <h4 className="font-medium">Update active {kind}</h4>
          <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={selectedId} onChange={(event) => selectParty(event.target.value)} required>
            <option value="">Select an active {kind}</option>{activeParties.map((party) => <option key={party.id} value={party.id}>{party.name}</option>)}
          </select>
          {selectedId && fields}
          <Button type="submit" variant="outline" disabled={busy || !selectedId || !name.trim() || !reason.trim()}>{busy ? "Saving…" : `Update ${kind}`}</Button>
        </form>
        <form className="space-y-4 border-t pt-5" onSubmit={submitRetire}>
          <h4 className="font-medium">Retire active {kind}</h4>
          <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={selectedId} onChange={(event) => setSelectedId(event.target.value)} required>
            <option value="">Select an active {kind}</option>{activeParties.map((party) => <option key={party.id} value={party.id}>{party.name}</option>)}
          </select>
          <div className="space-y-2"><Label>Retirement reason</Label><Textarea value={retireReason} onChange={(event) => setRetireReason(event.target.value)} maxLength={500} required /></div>
          <Button type="submit" variant="outline" disabled={busy || !selectedId || !retireReason.trim()}>{busy ? "Retiring…" : `Retire ${kind}`}</Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function PartyMaintenanceSettings() {
  const maintenance = usePartyMaintenance();
  if (!maintenance.isAdmin) return <Card><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" />Customer and vendor maintenance</CardTitle><CardDescription>Tenant-admin access required</CardDescription></CardHeader><CardContent className="text-sm text-muted-foreground">Party maintenance is unavailable for your role.</CardContent></Card>;
  if (maintenance.partiesError) return <Card><CardHeader><CardTitle>Customer and vendor maintenance</CardTitle></CardHeader><CardContent className="text-sm text-destructive">Tenant party history is unavailable; maintenance is disabled.</CardContent></Card>;
  const customerBusy = maintenance.createCustomer.isPending || maintenance.updateCustomer.isPending || maintenance.retireCustomer.isPending;
  const vendorBusy = maintenance.createVendor.isPending || maintenance.updateVendor.isPending || maintenance.retireVendor.isPending;
  return <div className="space-y-6">
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><ContactRound className="h-5 w-5" />Controlled party masters</CardTitle><CardDescription>Retirement is one-way. Retired parties remain on historical documents but cannot be used for new posted invoices or bills.</CardDescription></CardHeader></Card>
    <PartySection kind="customer" parties={maintenance.customers} busy={customerBusy}
      onCreate={(details) => maintenance.createCustomer.mutateAsync(details)}
      onUpdate={(customerId, details) => maintenance.updateCustomer.mutateAsync({ customerId, ...details })}
      onRetire={(customerId, reason, idempotencyKey) => maintenance.retireCustomer.mutateAsync({ customerId, reason, idempotencyKey })} />
    <PartySection kind="vendor" parties={maintenance.vendors} busy={vendorBusy}
      onCreate={(details) => maintenance.createVendor.mutateAsync(details as VendorDetails)}
      onUpdate={(vendorId, details) => maintenance.updateVendor.mutateAsync({ vendorId, ...(details as VendorDetails) })}
      onRetire={(vendorId, reason, idempotencyKey) => maintenance.retireVendor.mutateAsync({ vendorId, reason, idempotencyKey })} />
  </div>;
}
