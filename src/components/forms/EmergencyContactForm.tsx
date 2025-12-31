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
import { Checkbox } from "@/components/ui/checkbox";
import { Plus } from "lucide-react";
import { useCreateEmergencyContact } from "@/hooks/useEmergencyContacts";
import { useEmployees } from "@/hooks/useHRPayroll";

interface EmergencyContactFormProps {
  trigger?: React.ReactNode;
  employeeId?: string;
}

const RELATIONSHIPS = [
  "Spouse",
  "Parent",
  "Sibling",
  "Child",
  "Friend",
  "Other",
];

export function EmergencyContactForm({ trigger, employeeId }: EmergencyContactFormProps) {
  const [open, setOpen] = useState(false);
  const createContact = useCreateEmergencyContact();
  const { data: employees = [] } = useEmployees();

  const [formData, setFormData] = useState({
    employee_id: employeeId || "",
    contact_name: "",
    relationship: "",
    phone_primary: "",
    phone_secondary: "",
    email: "",
    address: "",
    is_primary: false,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createContact.mutateAsync(formData);
    setOpen(false);
    setFormData({
      employee_id: employeeId || "",
      contact_name: "",
      relationship: "",
      phone_primary: "",
      phone_secondary: "",
      email: "",
      address: "",
      is_primary: false,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" className="gap-2">
            <Plus className="h-4 w-4" />
            Add Contact
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Emergency Contact</DialogTitle>
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
              <Label>Contact Name *</Label>
              <Input
                value={formData.contact_name}
                onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Relationship *</Label>
              <Select
                value={formData.relationship}
                onValueChange={(v) => setFormData({ ...formData, relationship: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select relationship" />
                </SelectTrigger>
                <SelectContent>
                  {RELATIONSHIPS.map((rel) => (
                    <SelectItem key={rel} value={rel}>{rel}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Primary Phone *</Label>
              <Input
                type="tel"
                value={formData.phone_primary}
                onChange={(e) => setFormData({ ...formData, phone_primary: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Secondary Phone</Label>
              <Input
                type="tel"
                value={formData.phone_secondary}
                onChange={(e) => setFormData({ ...formData, phone_secondary: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Email</Label>
            <Input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label>Address</Label>
            <Input
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="is_primary"
              checked={formData.is_primary}
              onCheckedChange={(checked) => 
                setFormData({ ...formData, is_primary: checked === true })
              }
            />
            <Label htmlFor="is_primary" className="font-normal">
              Primary emergency contact
            </Label>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={createContact.isPending || !formData.employee_id || !formData.contact_name}
            >
              {createContact.isPending ? "Adding..." : "Add Contact"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
