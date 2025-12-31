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
import { useCreatePosition, useDepartments } from "@/hooks/useHRPayroll";

interface PositionFormProps {
  trigger?: React.ReactNode;
}

export function PositionForm({ trigger }: PositionFormProps) {
  const [open, setOpen] = useState(false);
  const createPosition = useCreatePosition();
  const { data: departments = [] } = useDepartments();

  const [formData, setFormData] = useState({
    code: "",
    title: "",
    description: "",
    department_id: "",
    min_salary: "",
    max_salary: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createPosition.mutateAsync({
      ...formData,
      department_id: formData.department_id || null,
      min_salary: formData.min_salary ? parseFloat(formData.min_salary) : null,
      max_salary: formData.max_salary ? parseFloat(formData.max_salary) : null,
    });
    setOpen(false);
    setFormData({ code: "", title: "", description: "", department_id: "", min_salary: "", max_salary: "" });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" className="gap-2">
            <Plus className="h-4 w-4" />
            Add Position
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Position</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Code *</Label>
              <Input
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                placeholder="e.g. MGR-01"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g. Sales Manager"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label>Department</Label>
            <Select
              value={formData.department_id}
              onValueChange={(v) => setFormData({ ...formData, department_id: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select department" />
              </SelectTrigger>
              <SelectContent>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Min Salary</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.min_salary}
                onChange={(e) => setFormData({ ...formData, min_salary: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Max Salary</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.max_salary}
                onChange={(e) => setFormData({ ...formData, max_salary: e.target.value })}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createPosition.isPending}>
              {createPosition.isPending ? "Creating..." : "Create Position"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
