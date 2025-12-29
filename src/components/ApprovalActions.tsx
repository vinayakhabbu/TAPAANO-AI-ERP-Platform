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
import { RationaleDialog } from "@/components/RationaleDialog";

type DocumentType = "purchase_order" | "payment_run" | "journal_entry" | "bill";

interface ApprovalActionsProps {
  documentType: DocumentType;
  documentId: string;
  currentStatus: string;
  onSubmitForApproval?: () => void;
  onApprove?: (rationale?: string) => void;
  onReject?: (rationale?: string) => void;
  onPost?: (rationale?: string) => void;
  onReverse?: (rationale?: string) => void;
  onProcess?: (rationale?: string) => void;
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
  // Simple confirm dialog for non-rationale actions
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

  // Rationale dialog for approve/reject/post/reverse actions
  const [rationaleDialog, setRationaleDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    actionLabel: string;
    actionVariant: "default" | "destructive";
    onConfirm: (rationale: string) => void;
    decisionType?: string;
  }>({
    open: false,
    title: "",
    description: "",
    actionLabel: "",
    actionVariant: "default",
    onConfirm: () => {},
    decisionType: undefined,
  });

  const handleSimpleAction = (
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

  const handleRationaleAction = (
    title: string,
    description: string,
    actionLabel: string,
    onConfirm: (rationale: string) => void,
    actionVariant: "default" | "destructive" = "default",
    decisionType?: string
  ) => {
    setRationaleDialog({
      open: true,
      title,
      description,
      actionLabel,
      actionVariant,
      onConfirm,
      decisionType,
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
      // Submit for approval (only from draft) - simple confirm
      if (currentStatus === "draft" && onSubmitForApproval) {
        actions.push({
          label: "Submit for Approval",
          icon: Send,
          onClick: () =>
            handleSimpleAction(
              "submit",
              "Submit for Approval",
              "Are you sure you want to submit this document for approval?",
              onSubmitForApproval
            ),
          show: true,
        });
      }

      // Approve (only from pending_approval) - with rationale
      if (currentStatus === "pending_approval" && onApprove) {
        actions.push({
          label: "Approve",
          icon: CheckCircle2,
          onClick: () =>
            handleRationaleAction(
              "Approve Document",
              "Provide a reason for approving this document. This will be recorded in the decision ledger.",
              "Approve",
              (rationale) => onApprove(rationale)
            ),
          show: true,
        });
      }

      // Reject (only from pending_approval) - with rationale
      if (currentStatus === "pending_approval" && onReject) {
        actions.push({
          label: "Reject",
          icon: XCircle,
          onClick: () =>
            handleRationaleAction(
              "Reject Document",
              "Provide a reason for rejecting this document. It will be returned to draft status.",
              "Reject",
              (rationale) => onReject(rationale),
              "destructive"
            ),
          variant: "destructive",
          show: true,
        });
      }

      // Process payment run (only from approved) - with rationale
      if (documentType === "payment_run" && currentStatus === "approved" && onProcess) {
        actions.push({
          label: "Process Payment",
          icon: Play,
          onClick: () =>
            handleRationaleAction(
              "Process Payment Run",
              "This will execute the payments. Add any notes for the audit trail.",
              "Process",
              (rationale) => onProcess(rationale)
            ),
          show: true,
        });
      }
    }

    if (documentType === "journal_entry") {
      // Post journal entry (only from draft) - with rationale
      if (currentStatus === "draft" && onPost) {
        actions.push({
          label: "Post Entry",
          icon: FileCheck,
          onClick: () =>
            handleRationaleAction(
              "Post Journal Entry",
              "This will update account balances. Add any notes for the audit trail.",
              "Post",
              (rationale) => onPost(rationale)
            ),
          show: true,
        });
      }

      // Reverse journal entry (only from posted) - with rationale
      if (currentStatus === "posted" && onReverse) {
        actions.push({
          label: "Reverse Entry",
          icon: RotateCcw,
          onClick: () =>
            handleRationaleAction(
              "Reverse Journal Entry",
              "Provide a reason for reversing this entry. This will be recorded in the decision ledger.",
              "Reverse",
              (rationale) => onReverse(rationale),
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

      {/* Simple confirmation dialog */}
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

      {/* Rationale capture dialog */}
      <RationaleDialog
        open={rationaleDialog.open}
        onOpenChange={(open) => setRationaleDialog((prev) => ({ ...prev, open }))}
        title={rationaleDialog.title}
        description={rationaleDialog.description}
        actionLabel={rationaleDialog.actionLabel}
        actionVariant={rationaleDialog.actionVariant}
        onConfirm={(rationale) => {
          rationaleDialog.onConfirm(rationale);
          setRationaleDialog((prev) => ({ ...prev, open: false }));
        }}
        isLoading={isLoading}
        decisionType={rationaleDialog.decisionType as any}
        sourceType={documentType}
      />
    </>
  );
}
