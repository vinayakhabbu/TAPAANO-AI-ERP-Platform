import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  MoreHorizontal,
  Send,
  CheckCircle2,
  XCircle,
  Play,
  RotateCcw,
  FileCheck,
  Loader2,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

type DocumentType = "purchase_order" | "payment_run" | "journal_entry" | "bill";

interface ApprovalActionsProps {
  documentType: DocumentType;
  documentId: string;
  currentStatus: string;
  onSubmitForApproval?: () => void;
  onApprove?: () => void;
  onReject?: () => void;
  onPost?: () => void;
  onReverse?: () => void;
  onProcess?: () => void;
  isLoading?: boolean;
}

export function ApprovalActions({
  documentType,
  documentId,
  currentStatus,
  onSubmitForApproval,
  onApprove,
  onReject,
  onPost,
  onReverse,
  onProcess,
  isLoading = false,
}: ApprovalActionsProps) {
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    action: string;
    title: string;
    description: string;
    onConfirm: () => void;
    variant?: "default" | "destructive";
  }>({
    open: false,
    action: "",
    title: "",
    description: "",
    onConfirm: () => {},
  });

  const handleAction = (
    action: string,
    title: string,
    description: string,
    onConfirm: () => void,
    variant?: "default" | "destructive"
  ) => {
    setConfirmDialog({
      open: true,
      action,
      title,
      description,
      onConfirm,
      variant,
    });
  };

  const getAvailableActions = () => {
    const actions: Array<{
      label: string;
      icon: React.ComponentType<{ className?: string }>;
      onClick: () => void;
      variant?: "default" | "destructive";
      show: boolean;
    }> = [];

    if (documentType === "purchase_order" || documentType === "payment_run") {
      // Submit for approval (only from draft)
      if (currentStatus === "draft" && onSubmitForApproval) {
        actions.push({
          label: "Submit for Approval",
          icon: Send,
          onClick: () =>
            handleAction(
              "submit",
              "Submit for Approval",
              "Are you sure you want to submit this document for approval?",
              onSubmitForApproval
            ),
          show: true,
        });
      }

      // Approve (only from pending_approval)
      if (currentStatus === "pending_approval" && onApprove) {
        actions.push({
          label: "Approve",
          icon: CheckCircle2,
          onClick: () =>
            handleAction(
              "approve",
              "Approve Document",
              "Are you sure you want to approve this document?",
              onApprove
            ),
          show: true,
        });
      }

      // Reject (only from pending_approval)
      if (currentStatus === "pending_approval" && onReject) {
        actions.push({
          label: "Reject",
          icon: XCircle,
          onClick: () =>
            handleAction(
              "reject",
              "Reject Document",
              "Are you sure you want to reject this document? It will be returned to draft status.",
              onReject,
              "destructive"
            ),
          variant: "destructive",
          show: true,
        });
      }

      // Process payment run (only from approved)
      if (documentType === "payment_run" && currentStatus === "approved" && onProcess) {
        actions.push({
          label: "Process Payment",
          icon: Play,
          onClick: () =>
            handleAction(
              "process",
              "Process Payment Run",
              "Are you sure you want to process this payment run? This will execute the payments.",
              onProcess
            ),
          show: true,
        });
      }
    }

    if (documentType === "journal_entry") {
      // Post journal entry (only from draft)
      if (currentStatus === "draft" && onPost) {
        actions.push({
          label: "Post Entry",
          icon: FileCheck,
          onClick: () =>
            handleAction(
              "post",
              "Post Journal Entry",
              "Are you sure you want to post this journal entry? This will update account balances.",
              onPost
            ),
          show: true,
        });
      }

      // Reverse journal entry (only from posted)
      if (currentStatus === "posted" && onReverse) {
        actions.push({
          label: "Reverse Entry",
          icon: RotateCcw,
          onClick: () =>
            handleAction(
              "reverse",
              "Reverse Journal Entry",
              "Are you sure you want to reverse this journal entry?",
              onReverse,
              "destructive"
            ),
          variant: "destructive",
          show: true,
        });
      }
    }

    return actions.filter((a) => a.show);
  };

  const actions = getAvailableActions();

  if (actions.length === 0) {
    return (
      <Button variant="ghost" size="icon" className="h-8 w-8" disabled>
        <MoreHorizontal className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={isLoading}>
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MoreHorizontal className="h-4 w-4" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {actions.map((action, index) => (
            <div key={action.label}>
              {index > 0 && action.variant === "destructive" && <DropdownMenuSeparator />}
              <DropdownMenuItem
                onClick={action.onClick}
                className={cn(
                  "gap-2",
                  action.variant === "destructive" && "text-destructive focus:text-destructive"
                )}
              >
                <action.icon className="h-4 w-4" />
                {action.label}
              </DropdownMenuItem>
            </div>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmDialog.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                confirmDialog.onConfirm();
                setConfirmDialog((prev) => ({ ...prev, open: false }));
              }}
              className={cn(
                confirmDialog.variant === "destructive" &&
                  "bg-destructive text-destructive-foreground hover:bg-destructive/90"
              )}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
