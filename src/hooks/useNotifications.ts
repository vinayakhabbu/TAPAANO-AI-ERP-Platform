interface NotificationPayload {
  type: "approval" | "time_off_request" | "time_off_response";
  recipientEmail: string;
  recipientName: string;
  subject: string;
  details: Record<string, string>;
}

/**
 * Outbound delivery is intentionally unavailable. The helper remains while
 * callers are migrated so operational mutations never imply an email was sent.
 */
export const sendNotification = async (payload: NotificationPayload): Promise<void> => {
  void payload;
};

export const notifyTimeOffRequest = async (
  employeeName: string,
  managerEmail: string,
  managerName: string,
  startDate: string,
  endDate: string,
  leaveType: string,
  days: number,
): Promise<void> => {
  void [employeeName, managerEmail, managerName, startDate, endDate, leaveType, days];
};

export const notifyTimeOffResponse = async (
  employeeEmail: string,
  employeeName: string,
  status: "Approved" | "Rejected",
  startDate: string,
  endDate: string,
  leaveType: string,
): Promise<void> => {
  void [employeeEmail, employeeName, status, startDate, endDate, leaveType];
};

export const notifyApprovalRequired = async (
  approverEmail: string,
  approverName: string,
  documentType: string,
  documentNumber: string,
  amount: string,
  requestedBy: string,
): Promise<void> => {
  void [approverEmail, approverName, documentType, documentNumber, amount, requestedBy];
};
