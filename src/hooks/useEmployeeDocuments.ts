import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface EmployeeDocument {
  id: string;
  org_id: string;
  employee_id: string;
  document_type: "contract" | "id" | "certification" | "performance_review" | "tax_form" | "other";
  document_name: string;
  file_url: string | null;
  file_size: number | null;
  mime_type: string | null;
  expiry_date: string | null;
  notes: string | null;
  uploaded_by: string | null;
  created_at: string;
  employee?: { first_name: string; last_name: string };
}

export const DOCUMENT_TYPES = [
  { value: "contract", label: "Contract" },
  { value: "id", label: "ID Document" },
  { value: "certification", label: "Certification" },
  { value: "performance_review", label: "Performance Review" },
  { value: "tax_form", label: "Tax Form" },
  { value: "other", label: "Other" },
];

export const useEmployeeDocuments = (employeeId?: string) => {
  return useQuery({
    queryKey: ["employee-documents", employeeId],
    queryFn: async () => {
      let query = supabase
        .from("employee_documents")
        .select("*, employee:employees(first_name, last_name)")
        .order("created_at", { ascending: false });
      
      if (employeeId) {
        query = query.eq("employee_id", employeeId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as EmployeeDocument[];
    },
  });
};

export const useCreateEmployeeDocument = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (doc: {
      employee_id: string;
      document_type: string;
      document_name: string;
      file_url?: string;
      file_size?: number;
      mime_type?: string;
      expiry_date?: string;
      notes?: string;
    }) => {
      const { data: profile } = await supabase.from("profiles").select("org_id, id").single();
      if (!profile?.org_id) throw new Error("No organization found");

      const { data, error } = await supabase
        .from("employee_documents")
        .insert({
          org_id: profile.org_id,
          uploaded_by: profile.id,
          ...doc,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employee-documents"] });
      toast.success("Document added");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useDeleteEmployeeDocument = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (documentId: string) => {
      const { error } = await supabase
        .from("employee_documents")
        .delete()
        .eq("id", documentId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employee-documents"] });
      toast.success("Document deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};
