import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCreateWorkCenter } from "@/hooks/useProduction";
import { useAuth } from "@/hooks/useAuth";

interface WorkCenterFormProps {
  onSuccess?: () => void;
}

export function WorkCenterForm({ onSuccess }: WorkCenterFormProps) {
  const { profile } = useAuth();
  const createWorkCenter = useCreateWorkCenter();
  
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    description: "",
    hourly_rate: "",
    capacity_per_day: "8",
    efficiency_rate: "100",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.org_id) return;

    await createWorkCenter.mutateAsync({
      org_id: profile.org_id,
      code: formData.code,
      name: formData.name,
      description: formData.description || undefined,
      hourly_rate: parseFloat(formData.hourly_rate) || 0,
      capacity_per_day: parseFloat(formData.capacity_per_day) || 8,
      efficiency_rate: parseFloat(formData.efficiency_rate) || 100,
    });

    setFormData({
      code: "",
      name: "",
      description: "",
      hourly_rate: "",
      capacity_per_day: "8",
      efficiency_rate: "100",
    });
    onSuccess?.();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="code">Code</Label>
          <Input
            id="code"
            value={formData.code}
            onChange={(e) => setFormData({ ...formData, code: e.target.value })}
            placeholder="WC-001"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Assembly Line 1"
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Work center description..."
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="hourly_rate">Hourly Rate ($)</Label>
          <Input
            id="hourly_rate"
            type="number"
            step="0.01"
            value={formData.hourly_rate}
            onChange={(e) => setFormData({ ...formData, hourly_rate: e.target.value })}
            placeholder="50.00"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="capacity_per_day">Capacity (hrs/day)</Label>
          <Input
            id="capacity_per_day"
            type="number"
            step="0.5"
            value={formData.capacity_per_day}
            onChange={(e) => setFormData({ ...formData, capacity_per_day: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="efficiency_rate">Efficiency (%)</Label>
          <Input
            id="efficiency_rate"
            type="number"
            step="1"
            value={formData.efficiency_rate}
            onChange={(e) => setFormData({ ...formData, efficiency_rate: e.target.value })}
          />
        </div>
      </div>

      <Button type="submit" disabled={createWorkCenter.isPending} className="w-full">
        {createWorkCenter.isPending ? "Creating..." : "Create Work Center"}
      </Button>
    </form>
  );
}
