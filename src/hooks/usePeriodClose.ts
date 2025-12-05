import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const useCloseTasks = (periodId?: string) => {
  return useQuery({
    queryKey: ["close-tasks", periodId],
    queryFn: async () => {
      let query = supabase
        .from("close_tasks")
        .select("*")
        .order("created_at");

      if (periodId) {
        query = query.eq("period_id", periodId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data;
    },
  });
};

export const useUpdateCloseTask = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      taskId,
      status,
    }: {
      taskId: string;
      status: "pending" | "in_progress" | "complete" | "overdue";
    }) => {
      const updates: Record<string, unknown> = { status };
      
      if (status === "complete") {
        updates.completed_at = new Date().toISOString();
      } else {
        updates.completed_at = null;
      }

      const { data, error } = await supabase
        .from("close_tasks")
        .update(updates)
        .eq("id", taskId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["close-tasks"] });
      toast.success("Task updated");
    },
    onError: (error) => {
      toast.error("Failed to update task: " + error.message);
    },
  });
};

export const useClosePeriods = () => {
  return useQuery({
    queryKey: ["close-periods"],
    queryFn: async () => {
      // Get unique period_ids from close_tasks with their stats
      const { data: tasks, error } = await supabase
        .from("close_tasks")
        .select("period_id, status, due_date");

      if (error) throw error;

      // Group by period_id
      const periodMap: Record<string, { 
        total: number; 
        complete: number; 
        dueDate: string | null;
      }> = {};

      tasks?.forEach((task) => {
        if (!periodMap[task.period_id]) {
          periodMap[task.period_id] = { total: 0, complete: 0, dueDate: task.due_date };
        }
        periodMap[task.period_id].total++;
        if (task.status === "complete") {
          periodMap[task.period_id].complete++;
        }
        // Use the latest due date
        if (task.due_date && (!periodMap[task.period_id].dueDate || task.due_date > periodMap[task.period_id].dueDate)) {
          periodMap[task.period_id].dueDate = task.due_date;
        }
      });

      // Convert to array and sort by period_id desc
      return Object.entries(periodMap)
        .map(([periodId, stats]) => ({
          id: periodId,
          name: formatPeriodName(periodId),
          progress: stats.total > 0 ? Math.round((stats.complete / stats.total) * 100) : 0,
          status: stats.complete === stats.total && stats.total > 0 ? "complete" : "in_progress",
          dueDate: stats.dueDate,
          totalTasks: stats.total,
          completedTasks: stats.complete,
        }))
        .sort((a, b) => b.id.localeCompare(a.id));
    },
  });
};

function formatPeriodName(periodId: string): string {
  // Expects format like "2024-11" or "2024-Q4"
  const parts = periodId.split("-");
  if (parts.length === 2) {
    const year = parts[0];
    const month = parts[1];
    if (month.startsWith("Q")) {
      return `${month} ${year}`;
    }
    const monthNames = ["January", "February", "March", "April", "May", "June", 
      "July", "August", "September", "October", "November", "December"];
    const monthIndex = parseInt(month, 10) - 1;
    if (monthIndex >= 0 && monthIndex < 12) {
      return `${monthNames[monthIndex]} ${year}`;
    }
  }
  return periodId;
}
