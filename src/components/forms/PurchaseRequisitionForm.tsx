import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Plus, Trash2, FileInput } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCreatePurchaseRequisition } from "@/hooks/usePurchaseRequisitions";
import { useVendors } from "@/hooks/usePayables";

interface LineItem {
  id: string;
  description: string;
  quantity: string;
  unitCost: string;
  suggestedVendorId: string;
}

interface PurchaseRequisitionFormProps {
  trigger?: React.ReactNode;
}

export function PurchaseRequisitionForm({ trigger }: PurchaseRequisitionFormProps) {
  const [open, setOpen] = useState(false);
  const [department, setDepartment] = useState("");
  const [priority, setPriority] = useState("normal");
  const [requiredDate, setRequiredDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineItem[]>([
    { id: "1", description: "", quantity: "1", unitCost: "0", suggestedVendorId: "" },
  ]);

  const { profile } = useAuth();
  const createRequisition = useCreatePurchaseRequisition();
  const { data: vendors = [] } = useVendors();

  const { data: entities = [] } = useQuery({
    queryKey: ["entities"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entities")
        .select("id, name");
      if (error) throw error;
      return data;
    },
  });

  const resetForm = () => {
    setDepartment("");
    setPriority("normal");
    setRequiredDate("");
    setNotes("");
    setLines([{ id: "1", description: "", quantity: "1", unitCost: "0", suggestedVendorId: "" }]);
  };

  const addLine = () => {
    setLines([
      ...lines,
      { id: Date.now().toString(), description: "", quantity: "1", unitCost: "0", suggestedVendorId: "" },
    ]);
  };

  const removeLine = (id: string) => {
    if (lines.length > 1) {
      setLines(lines.filter((line) => line.id !== id));
    }
  };

  const updateLine = (id: string, field: keyof LineItem, value: string) => {
    setLines(lines.map((line) => (line.id === id ? { ...line, [field]: value } : line)));
  };

  const calculateTotal = () => {
    return lines.reduce((sum, line) => {
      return sum + parseFloat(line.quantity || "0") * parseFloat(line.unitCost || "0");
    }, 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.org_id || entities.length === 0) return;

    const validLines = lines.filter((line) => line.description.trim());
    if (validLines.length === 0) return;

    await createRequisition.mutateAsync({
      org_id: profile.org_id,
      entity_id: entities[0].id,
      department: department || undefined,
      priority,
      required_date: requiredDate || undefined,
      notes: notes || undefined,
      lines: validLines.map((line) => ({
        description: line.description,
        quantity: parseFloat(line.quantity) || 1,
        estimated_unit_cost: parseFloat(line.unitCost) || 0,
        suggested_vendor_id: line.suggestedVendorId || undefined,
      })),
    });

    resetForm();
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="gap-2">
            <FileInput className="h-4 w-4" />
            New Requisition
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Purchase Requisition</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="department">Department</Label>
              <Input
                id="department"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="e.g., Engineering, Operations"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="requiredDate">Required By Date</Label>
            <Input
              id="requiredDate"
              type="date"
              value={requiredDate}
              onChange={(e) => setRequiredDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Line Items</Label>
              <Button type="button" variant="outline" size="sm" onClick={addLine}>
                <Plus className="h-4 w-4 mr-1" />
                Add Line
              </Button>
            </div>
            <div className="space-y-3">
              {lines.map((line, index) => (
                <div key={line.id} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-4 space-y-1">
                    {index === 0 && <Label className="text-xs">Description</Label>}
                    <Input
                      placeholder="Item description"
                      value={line.description}
                      onChange={(e) => updateLine(line.id, "description", e.target.value)}
                      required
                    />
                  </div>
                  <div className="col-span-2 space-y-1">
                    {index === 0 && <Label className="text-xs">Qty</Label>}
                    <Input
                      type="number"
                      min="1"
                      step="0.01"
                      value={line.quantity}
                      onChange={(e) => updateLine(line.id, "quantity", e.target.value)}
                    />
                  </div>
                  <div className="col-span-2 space-y-1">
                    {index === 0 && <Label className="text-xs">Est. Cost</Label>}
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.unitCost}
                      onChange={(e) => updateLine(line.id, "unitCost", e.target.value)}
                    />
                  </div>
                  <div className="col-span-3 space-y-1">
                    {index === 0 && <Label className="text-xs">Suggested Vendor</Label>}
                    <Select
                      value={line.suggestedVendorId}
                      onValueChange={(v) => updateLine(line.id, "suggestedVendorId", v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Optional" />
                      </SelectTrigger>
                      <SelectContent>
                        {vendors.map((vendor) => (
                          <SelectItem key={vendor.id} value={vendor.id}>
                            {vendor.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeLine(line.id)}
                      disabled={lines.length === 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional notes or justification..."
              rows={3}
            />
          </div>

          <div className="flex items-center justify-between pt-4 border-t">
            <div className="text-lg font-semibold">
              Estimated Total: ${calculateTotal().toFixed(2)}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createRequisition.isPending}>
                {createRequisition.isPending ? "Creating..." : "Create Requisition"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
