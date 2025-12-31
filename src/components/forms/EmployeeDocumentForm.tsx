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
import { useCreateEmployeeDocument, DOCUMENT_TYPES } from "@/hooks/useEmployeeDocuments";
import { useEmployees } from "@/hooks/useHRPayroll";

interface EmployeeDocumentFormProps {
  trigger?: React.ReactNode;
  employeeId?: string;
}

export function EmployeeDocumentForm({ trigger, employeeId }: EmployeeDocumentFormProps) {
  const [open, setOpen] = useState(false);
  const createDocument = useCreateEmployeeDocument();
  const { data: employees = [] } = useEmployees();

  const [formData, setFormData] = useState({
    employee_id: employeeId || "",
    document_type: "",
    document_name: "",
    file_url: "",
    expiry_date: "",
    notes: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createDocument.mutateAsync({
      ...formData,
      expiry_date: formData.expiry_date || undefined,
      file_url: formData.file_url || undefined,
    });
    setOpen(false);
    setFormData({
      employee_id: employeeId || "",
      document_type: "",
      document_name: "",
      file_url: "",
      expiry_date: "",
      notes: "",
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" className="gap-2">
            <Plus className="h-4 w-4" />
            Add Document
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Employee Document</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!employeeId && (
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
                  {employees.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.first_name} {emp.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Document Type *</Label>
              <Select
                value={formData.document_type}
                onValueChange={(v) => setFormData({ ...formData, document_type: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Expiry Date</Label>
              <Input
                type="date"
                value={formData.expiry_date}
                onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Document Name *</Label>
            <Input
              value={formData.document_name}
              onChange={(e) => setFormData({ ...formData, document_name: e.target.value })}
              placeholder="e.g., Employment Contract 2024"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>File URL</Label>
            <Input
              value={formData.file_url}
              onChange={(e) => setFormData({ ...formData, file_url: e.target.value })}
              placeholder="https://..."
            />
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Additional notes..."
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={createDocument.isPending || !formData.employee_id || !formData.document_type || !formData.document_name}
            >
              {createDocument.isPending ? "Adding..." : "Add Document"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
