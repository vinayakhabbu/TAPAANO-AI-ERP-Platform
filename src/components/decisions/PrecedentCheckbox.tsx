import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Star,
  StarOff,
  Globe,
  Building2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface PrecedentCheckboxProps {
  decisionId: string;
  isPrecedent: boolean;
  precedentScope?: string;
  precedentNotes?: string;
}

export function PrecedentCheckbox({
  decisionId,
  isPrecedent: initialIsPrecedent,
  precedentScope: initialScope = "org",
  precedentNotes: initialNotes = "",
}: PrecedentCheckboxProps) {
  const [isPrecedent, setIsPrecedent] = useState(initialIsPrecedent);
  const [scope, setScope] = useState(initialScope);
  const [notes, setNotes] = useState(initialNotes);
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (data: {
      is_precedent: boolean;
      precedent_scope: string;
      precedent_notes: string;
    }) => {
      const { error } = await supabase
        .from("decision_traces")
        .update({
          is_precedent: data.is_precedent,
          precedent_scope: data.precedent_scope,
          precedent_notes: data.precedent_notes,
        } as any)
        .eq("id", decisionId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["decision-traces"] });
      queryClient.invalidateQueries({ queryKey: ["precedent-search"] });
      queryClient.invalidateQueries({ queryKey: ["recent-precedents"] });
      toast({
        title: isPrecedent ? "Marked as precedent" : "Removed precedent status",
        description: isPrecedent 
          ? "This decision will now be used as a reference for similar cases"
          : "This decision will no longer appear as a precedent",
      });
      setIsOpen(false);
    },
    onError: (error) => {
      console.error("Failed to update precedent status:", error);
      toast({
        title: "Failed to update",
        description: "Could not update the precedent status",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    mutation.mutate({
      is_precedent: isPrecedent,
      precedent_scope: scope,
      precedent_notes: notes,
    });
  };

  const handleQuickToggle = () => {
    if (isPrecedent) {
      // If already a precedent, just toggle it off
      setIsPrecedent(false);
      mutation.mutate({
        is_precedent: false,
        precedent_scope: scope,
        precedent_notes: notes,
      });
    } else {
      // Open popover to set scope and notes
      setIsPrecedent(true);
      setIsOpen(true);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={isPrecedent ? "default" : "outline"}
          size="sm"
          className={isPrecedent ? "bg-amber-500 hover:bg-amber-600" : ""}
          onClick={handleQuickToggle}
        >
          {isPrecedent ? (
            <>
              <Star className="h-4 w-4 mr-1 fill-current" />
              Precedent
            </>
          ) : (
            <>
              <StarOff className="h-4 w-4 mr-1" />
              Mark as Precedent
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-4">
          <div className="space-y-2">
            <h4 className="font-medium">Mark as Precedent</h4>
            <p className="text-sm text-muted-foreground">
              This decision will be used as a reference for similar future cases
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="is-precedent"
              checked={isPrecedent}
              onCheckedChange={(checked) => setIsPrecedent(!!checked)}
            />
            <Label htmlFor="is-precedent">This becomes a precedent</Label>
          </div>

          {isPrecedent && (
            <>
              <div className="space-y-2">
                <Label>Precedent Scope</Label>
                <Select value={scope} onValueChange={setScope}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="team">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Team Only
                      </div>
                    </SelectItem>
                    <SelectItem value="org">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        Organization
                      </div>
                    </SelectItem>
                    <SelectItem value="global">
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4" />
                        Global
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Notes (optional)</Label>
                <Textarea
                  placeholder="Why is this a good precedent? What makes it referenceable?"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button 
              size="sm" 
              onClick={handleSave}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}