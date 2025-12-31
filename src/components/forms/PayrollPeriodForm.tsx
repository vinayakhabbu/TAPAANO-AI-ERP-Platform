import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useCreatePayrollPeriod, PAY_FREQUENCIES } from "@/hooks/useHRPayroll";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { addDays, format, startOfMonth, endOfMonth } from "date-fns";

interface PayrollPeriodFormProps {
  trigger?: React.ReactNode;
}

export function PayrollPeriodForm({ trigger }: PayrollPeriodFormProps) {
  const [open, setOpen] = useState(false);
  const createPeriod = useCreatePayrollPeriod();

  const { data: entities = [] } = useQuery({
    queryKey: ["entities"],
    queryFn: async () => {
      const { data, error } = await supabase.from("entities").select("id, name");
      if (error) throw error;
      return data || [];
    },
  });

  const today = new Date();
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);

  const [formData, setFormData] = useState({
    entity_id: "",
    period_name: format(today, "MMMM yyyy"),
    period_start: format(monthStart, "yyyy-MM-dd"),
    period_end: format(monthEnd, "yyyy-MM-dd"),
    pay_date: format(addDays(monthEnd, 5), "yyyy-MM-dd"),
    pay_frequency: "monthly",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createPeriod.mutateAsync(formData);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" className="gap-2">
            <Plus className="h-4 w-4" />
            New Period
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Payroll Period</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Period Name *</Label>
              <Input
                value={formData.period_name}
                onChange={(e) => setFormData({ ...formData, period_name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Entity *</Label>
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
              <Label>Period Start *</Label>
              <Input
                type="date"
                value={formData.period_start}
                onChange={(e) => setFormData({ ...formData, period_start: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Period End *</Label>
              <Input
                type="date"
                value={formData.period_end}
                onChange={(e) => setFormData({ ...formData, period_end: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Pay Date *</Label>
              <Input
                type="date"
                value={formData.pay_date}
                onChange={(e) => setFormData({ ...formData, pay_date: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Pay Frequency</Label>
              <Select
                value={formData.pay_frequency}
                onValueChange={(v) => setFormData({ ...formData, pay_frequency: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAY_FREQUENCIES.map((f) => (
                    <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createPeriod.isPending || !formData.entity_id}>
              {createPeriod.isPending ? "Creating..." : "Create Period"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
