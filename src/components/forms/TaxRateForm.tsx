import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCreateTaxRate, useTaxCodes, useTaxJurisdictions } from "@/hooks/useTaxManagement";

interface TaxRateFormProps {
  trigger?: React.ReactNode;
}

export function TaxRateForm({ trigger }: TaxRateFormProps) {
  const [open, setOpen] = useState(false);
  const [taxCodeId, setTaxCodeId] = useState("");
  const [jurisdictionId, setJurisdictionId] = useState("");
  const [rate, setRate] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().split("T")[0]);
  const [effectiveTo, setEffectiveTo] = useState("");
  const [isCompound, setIsCompound] = useState(false);
  
  const { toast } = useToast();
  const createTaxRate = useCreateTaxRate();
  const { data: taxCodes = [] } = useTaxCodes();
  const { data: jurisdictions = [] } = useTaxJurisdictions();

  const { data: orgs = [] } = useQuery({
    queryKey: ["organizations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("id")
        .limit(1);
      if (error) throw error;
      return data;
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgs[0]?.id || !taxCodeId) return;

    try {
      await createTaxRate.mutateAsync({
        org_id: orgs[0].id,
        tax_code_id: taxCodeId,
        jurisdiction_id: jurisdictionId || null,
        rate: parseFloat(rate),
        effective_from: effectiveFrom,
        effective_to: effectiveTo || null,
        priority: 0,
        is_compound: isCompound,
        is_active: true,
      });
      toast({ title: "Tax rate created successfully" });
      setOpen(false);
      resetForm();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const resetForm = () => {
    setTaxCodeId("");
    setJurisdictionId("");
    setRate("");
    setEffectiveFrom(new Date().toISOString().split("T")[0]);
    setEffectiveTo("");
    setIsCompound(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline">
            <Plus className="h-4 w-4 mr-2" />
            Add Rate
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Tax Rate</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="taxCode">Tax Code</Label>
            <Select value={taxCodeId} onValueChange={setTaxCodeId} required>
              <SelectTrigger>
                <SelectValue placeholder="Select tax code" />
              </SelectTrigger>
              <SelectContent>
                {taxCodes.map((code) => (
                  <SelectItem key={code.id} value={code.id}>
                    {code.code} - {code.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="jurisdiction">Jurisdiction (Optional)</Label>
            <Select value={jurisdictionId} onValueChange={setJurisdictionId}>
              <SelectTrigger>
                <SelectValue placeholder="All jurisdictions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Jurisdictions</SelectItem>
                {jurisdictions.map((j) => (
                  <SelectItem key={j.id} value={j.id}>
                    {j.code} - {j.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="rate">Rate (%)</Label>
            <Input
              id="rate"
              type="number"
              step="0.0001"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder="20.00"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="effectiveFrom">Effective From</Label>
              <Input
                id="effectiveFrom"
                type="date"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="effectiveTo">Effective To</Label>
              <Input
                id="effectiveTo"
                type="date"
                value={effectiveTo}
                onChange={(e) => setEffectiveTo(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="compound"
              checked={isCompound}
              onCheckedChange={setIsCompound}
            />
            <Label htmlFor="compound">Compound tax (tax on tax)</Label>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createTaxRate.isPending || !taxCodeId}>
              {createTaxRate.isPending ? "Creating..." : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
