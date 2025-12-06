import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateBOM, useWorkCenters } from "@/hooks/useProduction";
import { useProducts } from "@/hooks/useInventory";
import { useAuth } from "@/hooks/useAuth";
import { Plus, Trash2 } from "lucide-react";

interface BOMFormProps {
  onSuccess?: () => void;
}

interface BOMLine {
  component_product_id: string;
  quantity: number;
  unit_of_measure: string;
  scrap_rate: number;
}

interface BOMOperation {
  work_center_id: string;
  operation_number: number;
  operation_name: string;
  setup_time: number;
  run_time_per_unit: number;
}

export function BOMForm({ onSuccess }: BOMFormProps) {
  const { profile } = useAuth();
  const { data: products } = useProducts();
  const { data: workCenters } = useWorkCenters();
  const createBOM = useCreateBOM();

  const [formData, setFormData] = useState({
    product_id: "",
    bom_number: "",
    version: "1.0",
    description: "",
    standard_quantity: "1",
  });

  const [lines, setLines] = useState<BOMLine[]>([
    { component_product_id: "", quantity: 1, unit_of_measure: "EA", scrap_rate: 0 }
  ]);

  const [operations, setOperations] = useState<BOMOperation[]>([]);

  const addLine = () => {
    setLines([...lines, { component_product_id: "", quantity: 1, unit_of_measure: "EA", scrap_rate: 0 }]);
  };

  const removeLine = (index: number) => {
    setLines(lines.filter((_, i) => i !== index));
  };

  const updateLine = (index: number, field: keyof BOMLine, value: string | number) => {
    const updated = [...lines];
    updated[index] = { ...updated[index], [field]: value };
    setLines(updated);
  };

  const addOperation = () => {
    setOperations([...operations, {
      work_center_id: "",
      operation_number: operations.length + 1,
      operation_name: "",
      setup_time: 0,
      run_time_per_unit: 0,
    }]);
  };

  const removeOperation = (index: number) => {
    setOperations(operations.filter((_, i) => i !== index));
  };

  const updateOperation = (index: number, field: keyof BOMOperation, value: string | number) => {
    const updated = [...operations];
    updated[index] = { ...updated[index], [field]: value };
    setOperations(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.org_id) return;

    const validLines = lines.filter(l => l.component_product_id);
    const validOps = operations.filter(o => o.work_center_id && o.operation_name);

    await createBOM.mutateAsync({
      org_id: profile.org_id,
      product_id: formData.product_id,
      bom_number: formData.bom_number,
      version: formData.version,
      description: formData.description || undefined,
      standard_quantity: parseFloat(formData.standard_quantity) || 1,
      lines: validLines.map((l, i) => ({ ...l, position_number: i + 1 })),
      operations: validOps,
    });

    setFormData({ product_id: "", bom_number: "", version: "1.0", description: "", standard_quantity: "1" });
    setLines([{ component_product_id: "", quantity: 1, unit_of_measure: "EA", scrap_rate: 0 }]);
    setOperations([]);
    onSuccess?.();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="product_id">Finished Product</Label>
          <Select
            value={formData.product_id}
            onValueChange={(v) => setFormData({ ...formData, product_id: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select product" />
            </SelectTrigger>
            <SelectContent>
              {products?.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="bom_number">BOM Number</Label>
          <Input
            id="bom_number"
            value={formData.bom_number}
            onChange={(e) => setFormData({ ...formData, bom_number: e.target.value })}
            placeholder="BOM-001"
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="version">Version</Label>
          <Input
            id="version"
            value={formData.version}
            onChange={(e) => setFormData({ ...formData, version: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="standard_quantity">Standard Qty</Label>
          <Input
            id="standard_quantity"
            type="number"
            value={formData.standard_quantity}
            onChange={(e) => setFormData({ ...formData, standard_quantity: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
        />
      </div>

      {/* Components */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">Components</Label>
          <Button type="button" variant="outline" size="sm" onClick={addLine}>
            <Plus className="h-4 w-4 mr-1" /> Add Component
          </Button>
        </div>
        {lines.map((line, index) => (
          <div key={index} className="flex gap-2 items-end">
            <div className="flex-1">
              <Select
                value={line.component_product_id}
                onValueChange={(v) => updateLine(index, "component_product_id", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select component" />
                </SelectTrigger>
                <SelectContent>
                  {products?.filter(p => p.id !== formData.product_id).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Input
              type="number"
              className="w-20"
              placeholder="Qty"
              value={line.quantity}
              onChange={(e) => updateLine(index, "quantity", parseFloat(e.target.value) || 0)}
            />
            <Input
              className="w-16"
              placeholder="UOM"
              value={line.unit_of_measure}
              onChange={(e) => updateLine(index, "unit_of_measure", e.target.value)}
            />
            <Input
              type="number"
              className="w-20"
              placeholder="Scrap %"
              value={line.scrap_rate}
              onChange={(e) => updateLine(index, "scrap_rate", parseFloat(e.target.value) || 0)}
            />
            <Button type="button" variant="ghost" size="icon" onClick={() => removeLine(index)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>

      {/* Operations */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">Operations (Routing)</Label>
          <Button type="button" variant="outline" size="sm" onClick={addOperation}>
            <Plus className="h-4 w-4 mr-1" /> Add Operation
          </Button>
        </div>
        {operations.map((op, index) => (
          <div key={index} className="flex gap-2 items-end">
            <Input
              type="number"
              className="w-16"
              placeholder="#"
              value={op.operation_number}
              onChange={(e) => updateOperation(index, "operation_number", parseInt(e.target.value) || 0)}
            />
            <div className="flex-1">
              <Select
                value={op.work_center_id}
                onValueChange={(v) => updateOperation(index, "work_center_id", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Work Center" />
                </SelectTrigger>
                <SelectContent>
                  {workCenters?.map((wc) => (
                    <SelectItem key={wc.id} value={wc.id}>{wc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Input
              className="flex-1"
              placeholder="Operation Name"
              value={op.operation_name}
              onChange={(e) => updateOperation(index, "operation_name", e.target.value)}
            />
            <Input
              type="number"
              className="w-20"
              placeholder="Setup"
              value={op.setup_time}
              onChange={(e) => updateOperation(index, "setup_time", parseFloat(e.target.value) || 0)}
            />
            <Input
              type="number"
              className="w-20"
              placeholder="Run/unit"
              value={op.run_time_per_unit}
              onChange={(e) => updateOperation(index, "run_time_per_unit", parseFloat(e.target.value) || 0)}
            />
            <Button type="button" variant="ghost" size="icon" onClick={() => removeOperation(index)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>

      <Button type="submit" disabled={createBOM.isPending} className="w-full">
        {createBOM.isPending ? "Creating..." : "Create BOM"}
      </Button>
    </form>
  );
}
