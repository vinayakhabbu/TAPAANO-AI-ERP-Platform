import { useState, useRef } from "react";
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
import { Plus, Upload, FileText, X } from "lucide-react";
import { useUploadEmployeeDocument, DOCUMENT_TYPES } from "@/hooks/useEmployeeDocuments";
import { useEmployees } from "@/hooks/useHRPayroll";

interface EmployeeDocumentFormProps {
  trigger?: React.ReactNode;
  employeeId?: string;
}

const ALLOWED_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function EmployeeDocumentForm({ trigger, employeeId }: EmployeeDocumentFormProps) {
  const [open, setOpen] = useState(false);
  const uploadDocument = useUploadEmployeeDocument();
  const { data: employees = [] } = useEmployees();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    employee_id: employeeId || "",
    document_type: "",
    document_name: "",
    expiry_date: "",
    notes: "",
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setFileError(null);
    
    if (!file) {
      setSelectedFile(null);
      return;
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      setFileError("Invalid file type. Allowed: PDF, PNG, JPG, DOC, DOCX");
      setSelectedFile(null);
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setFileError("File too large. Maximum size is 10MB");
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
    // Auto-fill document name if empty
    if (!formData.document_name) {
      setFormData(prev => ({ ...prev, document_name: file.name.replace(/\.[^/.]+$/, "") }));
    }
  };

  const clearFile = () => {
    setSelectedFile(null);
    setFileError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedFile) {
      setFileError("Please select a file to upload");
      return;
    }

    await uploadDocument.mutateAsync({
      file: selectedFile,
      employee_id: formData.employee_id,
      document_type: formData.document_type,
      document_name: formData.document_name,
      expiry_date: formData.expiry_date || undefined,
      notes: formData.notes || undefined,
    });
    
    setOpen(false);
    setFormData({
      employee_id: employeeId || "",
      document_type: "",
      document_name: "",
      expiry_date: "",
      notes: "",
    });
    setSelectedFile(null);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" className="gap-2">
            <Plus className="h-4 w-4" />
            Upload Document
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload Employee Document</DialogTitle>
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

          {/* File Upload */}
          <div className="space-y-2">
            <Label>Document File *</Label>
            <div className="border-2 border-dashed border-border rounded-lg p-4 text-center">
              {selectedFile ? (
                <div className="flex items-center justify-between bg-muted rounded p-2">
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <div className="text-left">
                      <p className="text-sm font-medium truncate max-w-[200px]">{selectedFile.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(selectedFile.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={clearFile}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <label className="cursor-pointer">
                  <div className="flex flex-col items-center gap-2 py-4">
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Click to upload or drag and drop
                    </p>
                    <p className="text-xs text-muted-foreground">
                      PDF, PNG, JPG, DOC, DOCX (max 10MB)
                    </p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                    onChange={handleFileChange}
                  />
                </label>
              )}
            </div>
            {fileError && (
              <p className="text-sm text-destructive">{fileError}</p>
            )}
          </div>

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
              disabled={uploadDocument.isPending || !formData.employee_id || !formData.document_type || !formData.document_name || !selectedFile}
            >
              {uploadDocument.isPending ? "Uploading..." : "Upload Document"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}