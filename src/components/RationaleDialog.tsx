import { useState } from "react";
import { MessageSquare, History, CheckCircle, XCircle, Clock, AlertTriangle, Info } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useFindPrecedents, DecisionType } from "@/hooks/useDecisionLedger";
import { formatDistanceToNow } from "date-fns";

export interface PolicyWarning {
  level: "info" | "warning" | "error";
  title: string;
  message: string;
}

interface RationaleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  actionLabel: string;
  actionVariant?: "default" | "destructive";
  reasonCodes?: string[];
  onConfirm: (rationale: string, selectedReasons: string[]) => void;
  isLoading?: boolean;
  // For precedents lookup
  decisionType?: DecisionType;
  sourceType?: string;
  // Policy warnings
  policyWarnings?: PolicyWarning[];
}

const defaultReasonCodes: Record<string, string[]> = {
  approve: [
    "Within policy limits",
    "Verified documentation",
    "Manager override",
    "Strategic priority",
    "Budget approved",
  ],
  reject: [
    "Exceeds budget",
    "Missing documentation",
    "Policy violation",
    "Duplicate request",
    "Incorrect data",
  ],
};

function PrecedentCard({ precedent }: { precedent: any }) {
  const isApproved = precedent.approval_status === "approved";
  const snapshot = precedent.input_snapshot || {};
  
  return (
    <div className="rounded-md border border-border/50 bg-muted/30 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isApproved ? (
            <CheckCircle className="h-4 w-4 text-green-500" />
          ) : (
            <XCircle className="h-4 w-4 text-red-500" />
          )}
          <span className="text-sm font-medium capitalize">
            {precedent.approval_status}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(precedent.created_at), { addSuffix: true })}
        </span>
      </div>
      
      {precedent.reason_codes?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {precedent.reason_codes.slice(0, 3).map((code: string, i: number) => (
            <Badge key={i} variant="secondary" className="text-xs">
              {code}
            </Badge>
          ))}
          {precedent.reason_codes.length > 3 && (
            <Badge variant="secondary" className="text-xs">
              +{precedent.reason_codes.length - 3}
            </Badge>
          )}
        </div>
      )}
      
      {precedent.rationale_text && (
        <p className="text-xs text-muted-foreground line-clamp-2">
          {precedent.rationale_text}
        </p>
      )}
      
      {snapshot.total && (
        <p className="text-xs text-muted-foreground">
          Amount: ${Number(snapshot.total).toLocaleString()}
        </p>
      )}
    </div>
  );
}

export function RationaleDialog({
  open,
  onOpenChange,
  title,
  description,
  actionLabel,
  actionVariant = "default",
  reasonCodes,
  onConfirm,
  isLoading = false,
  decisionType,
  sourceType,
  policyWarnings = [],
}: RationaleDialogProps) {
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
  const [rationaleText, setRationaleText] = useState("");
  const [precedentsOpen, setPrecedentsOpen] = useState(false);

  const getWarningIcon = (level: PolicyWarning["level"]) => {
    switch (level) {
      case "error":
        return <XCircle className="h-4 w-4" />;
      case "warning":
        return <AlertTriangle className="h-4 w-4" />;
      default:
        return <Info className="h-4 w-4" />;
    }
  };

  const getWarningVariant = (level: PolicyWarning["level"]) => {
    switch (level) {
      case "error":
        return "destructive";
      case "warning":
        return "default";
      default:
        return "default";
    }
  };

  const codes = reasonCodes || (actionVariant === "destructive" ? defaultReasonCodes.reject : defaultReasonCodes.approve);

  // Fetch precedents if decision context is provided
  const { data: precedents = [], isLoading: loadingPrecedents } = useFindPrecedents({
    decision_type: decisionType || "po_approval",
    source_type: sourceType || "purchase_order",
    limit: 5,
  });

  const showPrecedents = decisionType && sourceType && precedents.length > 0;

  const toggleReason = (reason: string) => {
    setSelectedReasons((prev) =>
      prev.includes(reason)
        ? prev.filter((r) => r !== reason)
        : [...prev, reason]
    );
  };

  const handleConfirm = () => {
    const fullRationale = [
      ...selectedReasons,
      rationaleText.trim(),
    ].filter(Boolean).join(". ");
    
    onConfirm(fullRationale, selectedReasons);
    
    // Reset state
    setSelectedReasons([]);
    setRationaleText("");
  };

  const handleClose = () => {
    setSelectedReasons([]);
    setRationaleText("");
    setPrecedentsOpen(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Policy Warnings */}
          {policyWarnings.length > 0 && (
            <div className="space-y-2">
              {policyWarnings.map((warning, idx) => (
                <Alert key={idx} variant={getWarningVariant(warning.level)} className={
                  warning.level === "warning" 
                    ? "border-amber-500 bg-amber-50 dark:bg-amber-950/30" 
                    : warning.level === "info"
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
                    : ""
                }>
                  {getWarningIcon(warning.level)}
                  <AlertTitle className="text-sm font-medium">{warning.title}</AlertTitle>
                  <AlertDescription className="text-xs">{warning.message}</AlertDescription>
                </Alert>
              ))}
            </div>
          )}

          {/* Precedents Panel */}
          {showPrecedents && (
            <Collapsible open={precedentsOpen} onOpenChange={setPrecedentsOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm" className="w-full justify-between">
                  <span className="flex items-center gap-2">
                    <History className="h-4 w-4" />
                    Similar past decisions ({precedents.length})
                  </span>
                  <Badge variant="secondary" className="ml-2">
                    {precedentsOpen ? "Hide" : "Show"}
                  </Badge>
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3">
                <ScrollArea className="h-[180px] pr-4">
                  <div className="space-y-2">
                    {precedents.map((p) => (
                      <PrecedentCard key={p.id} precedent={p} />
                    ))}
                  </div>
                </ScrollArea>
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Reason Codes */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Quick reasons (optional)</Label>
            <div className="flex flex-wrap gap-2">
              {codes.map((reason) => (
                <Badge
                  key={reason}
                  variant={selectedReasons.includes(reason) ? "default" : "outline"}
                  className="cursor-pointer transition-colors"
                  onClick={() => toggleReason(reason)}
                >
                  {reason}
                </Badge>
              ))}
            </div>
          </div>

          {/* Free-form Rationale */}
          <div className="space-y-2">
            <Label htmlFor="rationale" className="text-sm font-medium">
              Additional notes (optional)
            </Label>
            <Textarea
              id="rationale"
              placeholder="Explain your decision..."
              value={rationaleText}
              onChange={(e) => setRationaleText(e.target.value)}
              className="min-h-[80px] resize-none"
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground text-right">
              {rationaleText.length}/500
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            variant={actionVariant}
            onClick={handleConfirm}
            disabled={isLoading}
          >
            {isLoading ? "Processing..." : actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
