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
import { Plus } from "lucide-react";
import { useCreateTimeOffRequest, useTimeOffTypes } from "@/hooks/useTimeOff";
import { useEmployees } from "@/hooks/useHRPayroll";
import { differenceInBusinessDays, parseISO } from "date-fns";

interface TimeOffRequestFormProps {
  trigger?: React.ReactNode;
}

export function TimeOffRequestForm({ trigger }: TimeOffRequestFormProps) {
  const [open, setOpen] = useState(false);
  const createRequest = useCreateTimeOffRequest();
  const { data: timeOffTypes = [] } = useTimeOffTypes();
  const { data: employees = [] } = useEmployees();

  const [formData, setFormData] = useState({
    employee_id: "",
    time_off_type_id: "",
    start_date: "",
    end_date: "",
    reason: "",
  });

  const calculateDays = () => {
    if (formData.start_date && formData.end_date) {
      const start = parseISO(formData.start_date);
      const end = parseISO(formData.end_date);
      return Math.max(1, differenceInBusinessDays(end, start) + 1);
    }
    return 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createRequest.mutateAsync({
      ...formData,
      days_requested: calculateDays(),
    });
    setOpen(false);
    setFormData({
      employee_id: "",
      time_off_type_id: "",
      start_date: "",
      end_date: "",
      reason: "",
    });
  };

  const activeEmployees = employees.filter(e => e.employment_status === "active");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" className="gap-2">
            <Plus className="h-4 w-4" />
            Request Time Off
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request Time Off</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Employee *</Label>
              <Select
                value={formData.employee_id}
                onValueChange={(v) => setFormData({ ...formData, employee_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {activeEmployees.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.first_name} {emp.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Leave Type *</Label>
              <Select
                value={formData.time_off_type_id}
                onValueChange={(v) => setFormData({ ...formData, time_off_type_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {timeOffTypes.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Start Date *</Label>
              <Input
                type="date"
                value={formData.start_date}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>End Date *</Label>
              <Input
                type="date"
                value={formData.end_date}
                onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                required
              />
            </div>
          </div>

          {formData.start_date && formData.end_date && (
            <div className="text-sm text-muted-foreground">
              Total days: <span className="font-medium">{calculateDays()}</span>
            </div>
          )}

          <div className="space-y-2">
            <Label>Reason</Label>
            <Textarea
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              placeholder="Optional reason for time off..."
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={createRequest.isPending || !formData.employee_id || !formData.time_off_type_id}
            >
              {createRequest.isPending ? "Submitting..." : "Submit Request"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
