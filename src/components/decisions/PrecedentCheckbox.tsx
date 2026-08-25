import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PrecedentCheckboxProps {
  decisionId: string;
  isPrecedent: boolean;
  precedentScope?: string;
  precedentNotes?: string;
}

export function PrecedentCheckbox({
  decisionId,
  isPrecedent,
  precedentScope,
  precedentNotes,
}: PrecedentCheckboxProps) {
  void decisionId;
  void precedentScope;
  void precedentNotes;

  return (
    <Button variant="outline" size="sm" disabled title="Precedent controls are unavailable">
      <Star className="mr-1 h-4 w-4" />
      {isPrecedent ? "Historical flag" : "Precedent unavailable"}
    </Button>
  );
}
