import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface AttendanceRecord {
  id: string;
  org_id: string;
  employee_id: string;
  attendance_date: string;
  clock_in: string | null;
  clock_out: string | null;
  break_minutes: number;
  total_hours: number | null;
  overtime_hours: number;
  status: "present" | "absent" | "late" | "half_day" | "remote";
  notes: string | null;
  approved_by: string | null;
  created_at: string;
  employee?: { first_name: string; last_name: string; employee_number: string };
}

export const ATTENDANCE_STATUSES = [
  { value: "present", label: "Present" },
  { value: "absent", label: "Absent" },
  { value: "late", label: "Late" },
  { value: "half_day", label: "Half Day" },
  { value: "remote", label: "Remote" },
];

export const useAttendanceRecords = (date?: string, employeeId?: string) => {
  return useQuery({
    queryKey: ["attendance-records", date, employeeId],
    queryFn: async () => {
      let query = supabase
        .from("attendance_records")
        .select("*, employee:employees!attendance_records_employee_id_fkey(first_name, last_name, employee_number)")
        .order("attendance_date", { ascending: false });
      
      if (date) {
        query = query.eq("attendance_date", date);
      }
      if (employeeId) {
        query = query.eq("employee_id", employeeId);
      }
      
      const { data, error } = await query.limit(100);
      if (error) throw error;
      return data as AttendanceRecord[];
    },
  });
};

export const useClockIn = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (employeeId: string) => {
      const { data: profile } = await supabase.from("profiles").select("org_id").single();
      if (!profile?.org_id) throw new Error("No organization found");

      const today = new Date().toISOString().split("T")[0];
      const now = new Date().toISOString();

      // Check if record exists for today
      const { data: existing } = await supabase
        .from("attendance_records")
        .select("id")
        .eq("employee_id", employeeId)
        .eq("attendance_date", today)
        .single();

      if (existing) {
        const { data, error } = await supabase
          .from("attendance_records")
          .update({ clock_in: now })
          .eq("id", existing.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from("attendance_records")
          .insert({
            org_id: profile.org_id,
            employee_id: employeeId,
            attendance_date: today,
            clock_in: now,
            status: "present",
          })
          .select()
          .single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance-records"] });
      toast.success("Clocked in");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useClockOut = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (employeeId: string) => {
      const today = new Date().toISOString().split("T")[0];
      const now = new Date().toISOString();

      const { data: existing, error: fetchError } = await supabase
        .from("attendance_records")
        .select("*")
        .eq("employee_id", employeeId)
        .eq("attendance_date", today)
        .single();

      if (fetchError) throw new Error("No clock-in record found for today");

      const clockIn = new Date(existing.clock_in);
      const clockOut = new Date(now);
      const totalHours = (clockOut.getTime() - clockIn.getTime()) / (1000 * 60 * 60) - (existing.break_minutes / 60);
      const overtimeHours = Math.max(0, totalHours - 8);

      const { data, error } = await supabase
        .from("attendance_records")
        .update({
          clock_out: now,
          total_hours: Math.round(totalHours * 100) / 100,
          overtime_hours: Math.round(overtimeHours * 100) / 100,
        })
        .eq("id", existing.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance-records"] });
      toast.success("Clocked out");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useCreateAttendanceRecord = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (record: {
      employee_id: string;
      attendance_date: string;
      status: string;
      clock_in?: string;
      clock_out?: string;
      total_hours?: number;
      notes?: string;
    }) => {
      const { data: profile } = await supabase.from("profiles").select("org_id").single();
      if (!profile?.org_id) throw new Error("No organization found");

      const { data, error } = await supabase
        .from("attendance_records")
        .insert({
          org_id: profile.org_id,
          ...record,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance-records"] });
      toast.success("Attendance record created");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};
