import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useCreateProductionOrder, useBOMs } from "@/hooks/useProduction";
import { useWarehouses } from "@/hooks/useInventory";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

interface ProductionOrderFormProps {
  onSuccess?: () => void;
}

export function ProductionOrderForm({ onSuccess }: ProductionOrderFormProps) {
  const { profile } = useAuth();
  const { data: boms } = useBOMs();
  const { data: warehouses } = useWarehouses();
  const createOrder = useCreateProductionOrder();

  const [entities, setEntities] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedProduct, setSelectedProduct] = useState<{ planning_strategy: string } | null>(null);
  
  const [formData, setFormData] = useState({
    entity_id: "",
    bom_id: "",
    warehouse_id: "",
    order_number: "",
    planned_quantity: "1",
    priority: "5",
    planned_start_date: "",
    planned_end_date: "",
    notes: "",
  });

  useEffect(() => {
    const fetchEntities = async () => {
      const { data } = await supabase.from("entities").select("id, name");
      if (data) setEntities(data);
    };
    fetchEntities();
  }, []);

  const selectedBOM = boms?.find(b => b.id === formData.bom_id);
  
  useEffect(() => {
    if (selectedBOM?.product_id) {
      const fetchProductStrategy = async () => {
        const { data } = await supabase
          .from("products")
          .select("planning_strategy")
          .eq("id", selectedBOM.product_id)
          .single();
        setSelectedProduct(data);
      };
      fetchProductStrategy();
    } else {
      setSelectedProduct(null);
    }
  }, [selectedBOM]);

  const isMTO = selectedProduct?.planning_strategy === 'mto';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.org_id || !selectedBOM) return;

    await createOrder.mutateAsync({
      org_id: profile.org_id,
      entity_id: formData.entity_id,
      order_number: formData.order_number,
      bom_id: formData.bom_id,
      product_id: selectedBOM.product_id,
      warehouse_id: formData.warehouse_id || undefined,
      planned_quantity: parseFloat(formData.planned_quantity) || 1,
      priority: parseInt(formData.priority) || 5,
      planned_start_date: formData.planned_start_date || undefined,
      planned_end_date: formData.planned_end_date || undefined,
      notes: formData.notes || undefined,
    });

    setFormData({
      entity_id: "",
      bom_id: "",
      warehouse_id: "",
      order_number: "",
      planned_quantity: "1",
      priority: "5",
      planned_start_date: "",
      planned_end_date: "",
      notes: "",
    });
    onSuccess?.();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="order_number">Order Number</Label>
          <Input
            id="order_number"
            value={formData.order_number}
            onChange={(e) => setFormData({ ...formData, order_number: e.target.value })}
            placeholder="PO-001"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="entity_id">Entity</Label>
          <Select
            value={formData.entity_id}
            onValueChange={(v) => setFormData({ ...formData, entity_id: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select entity" />
            </SelectTrigger>
            <SelectContent>
              {entities.map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="bom_id">Bill of Materials</Label>
          <Select
            value={formData.bom_id}
            onValueChange={(v) => setFormData({ ...formData, bom_id: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select BOM" />
            </SelectTrigger>
            <SelectContent>
              {boms?.filter(b => b.is_active).map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.bom_number} - {b.product?.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="warehouse_id">Output Warehouse</Label>
          <Select
            value={formData.warehouse_id}
            onValueChange={(v) => setFormData({ ...formData, warehouse_id: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select warehouse" />
            </SelectTrigger>
            <SelectContent>
              {warehouses?.map((w) => (
                <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {selectedBOM && (
        <div className="p-3 bg-muted rounded-lg text-sm space-y-2">
          <div className="flex items-center justify-between">
            <span><strong>Product:</strong> {selectedBOM.product?.name} ({selectedBOM.product?.sku})</span>
            <Badge variant={isMTO ? "default" : "secondary"}>
              {isMTO ? "Make-to-Order" : "Make-to-Stock"}
            </Badge>
          </div>
          <p><strong>Components:</strong> {selectedBOM.bom_lines?.length || 0} items</p>
          <p><strong>Operations:</strong> {selectedBOM.bom_operations?.length || 0} steps</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="planned_quantity">Quantity</Label>
          <Input
            id="planned_quantity"
            type="number"
            value={formData.planned_quantity}
            onChange={(e) => setFormData({ ...formData, planned_quantity: e.target.value })}
            min="1"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="priority">Priority (1-10)</Label>
          <Input
            id="priority"
            type="number"
            value={formData.priority}
            onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
            min="1"
            max="10"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="planned_start_date">Planned Start</Label>
          <Input
            id="planned_start_date"
            type="date"
            value={formData.planned_start_date}
            onChange={(e) => setFormData({ ...formData, planned_start_date: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="planned_end_date">Planned End</Label>
          <Input
            id="planned_end_date"
            type="date"
            value={formData.planned_end_date}
            onChange={(e) => setFormData({ ...formData, planned_end_date: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
        />
      </div>

      <Button type="submit" disabled={createOrder.isPending} className="w-full">
        {createOrder.isPending ? "Creating..." : "Create Production Order"}
      </Button>
    </form>
  );
}
