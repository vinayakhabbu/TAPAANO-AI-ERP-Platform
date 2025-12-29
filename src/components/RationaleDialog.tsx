import { useState } from "react";
import { MessageSquare } from "lucide-react";
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
}: RationaleDialogProps) {
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
  const [rationaleText, setRationaleText] = useState("");

  const codes = reasonCodes || (actionVariant === "destructive" ? defaultReasonCodes.reject : defaultReasonCodes.approve);

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
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
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
