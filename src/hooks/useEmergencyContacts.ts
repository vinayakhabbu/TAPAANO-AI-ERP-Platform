import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface EmergencyContact {
  id: string;
  org_id: string;
  employee_id: string;
  contact_name: string;
  relationship: string;
  phone_primary: string;
  phone_secondary: string | null;
  email: string | null;
  address: string | null;
  is_primary: boolean;
  created_at: string;
}

export const useEmergencyContacts = (employeeId?: string) => {
  return useQuery({
    queryKey: ["emergency-contacts", employeeId],
    queryFn: async () => {
      let query = supabase
        .from("employee_emergency_contacts")
        .select("*")
        .order("is_primary", { ascending: false });
      
      if (employeeId) {
        query = query.eq("employee_id", employeeId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as EmergencyContact[];
    },
  });
};

export const useCreateEmergencyContact = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (contact: {
      employee_id: string;
      contact_name: string;
      relationship: string;
      phone_primary: string;
      phone_secondary?: string;
      email?: string;
      address?: string;
      is_primary?: boolean;
    }) => {
      const { data: profile } = await supabase.from("profiles").select("org_id").single();
      if (!profile?.org_id) throw new Error("No organization found");

      const { data, error } = await supabase
        .from("employee_emergency_contacts")
        .insert({
          org_id: profile.org_id,
          ...contact,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emergency-contacts"] });
      toast.success("Emergency contact added");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useDeleteEmergencyContact = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (contactId: string) => {
      const { error } = await supabase
        .from("employee_emergency_contacts")
        .delete()
        .eq("id", contactId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emergency-contacts"] });
      toast.success("Emergency contact deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};
