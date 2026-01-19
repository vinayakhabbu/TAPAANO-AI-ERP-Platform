import { supabase } from "@/integrations/supabase/client";

interface NotificationPayload {
  type: "approval" | "time_off_request" | "time_off_response";
  recipientEmail: string;
  recipientName: string;
  subject: string;
  details: Record<string, string>;
}

export const sendNotification = async (payload: NotificationPayload): Promise<void> => {
  try {
    const { error } = await supabase.functions.invoke("send-notification", {
      body: payload,
    });
    
    if (error) {
      console.error("Failed to send notification:", error);
    }
  } catch (err) {
    // Silently fail - notifications are non-blocking
    console.error("Notification error:", err);
  }
};

export const notifyTimeOffRequest = async (
  employeeName: string,
  managerEmail: string,
  managerName: string,
  startDate: string,
  endDate: string,
  leaveType: string,
  days: number
): Promise<void> => {
  await sendNotification({
    type: "time_off_request",
    recipientEmail: managerEmail,
    recipientName: managerName,
    subject: `Time Off Request from ${employeeName}`,
    details: {
      "Employee": employeeName,
      "Type": leaveType,
      "Start Date": startDate,
      "End Date": endDate,
      "Days Requested": String(days),
    },
  });
};

export const notifyTimeOffResponse = async (
  employeeEmail: string,
  employeeName: string,
  status: "Approved" | "Rejected",
  startDate: string,
  endDate: string,
  leaveType: string
): Promise<void> => {
  await sendNotification({
    type: "time_off_response",
    recipientEmail: employeeEmail,
    recipientName: employeeName,
    subject: `Time Off Request ${status}`,
    details: {
      status,
      "Type": leaveType,
      "Start Date": startDate,
      "End Date": endDate,
    },
  });
};

export const notifyApprovalRequired = async (
  approverEmail: string,
  approverName: string,
  documentType: string,
  documentNumber: string,
  amount: string,
  requestedBy: string
): Promise<void> => {
  await sendNotification({
    type: "approval",
    recipientEmail: approverEmail,
    recipientName: approverName,
    subject: `${documentType} Requires Your Approval`,
    details: {
      "Document": documentNumber,
      "Amount": amount,
      "Requested By": requestedBy,
    },
  });
};
