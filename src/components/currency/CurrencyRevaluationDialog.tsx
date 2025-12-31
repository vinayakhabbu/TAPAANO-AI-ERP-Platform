import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRunRevaluation } from "@/hooks/useCurrency";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw } from "lucide-react";

interface CurrencyRevaluationDialogProps {
  trigger?: React.ReactNode;
}

export function CurrencyRevaluationDialog({
  trigger,
}: CurrencyRevaluationDialogProps) {
  const [open, setOpen] = useState(false);
  const [revaluationDate, setRevaluationDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [entityId, setEntityId] = useState("");

  const runRevaluation = useRunRevaluation();

  const { data: entities } = useQuery({
    queryKey: ["entities"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entities")
        .select("id, name");
      if (error) throw error;
      return data;
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    await runRevaluation.mutateAsync({
      revaluation_date: revaluationDate,
      entity_id: entityId,
    });

    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Run Revaluation
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Currency Revaluation</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This will calculate unrealized gains/losses on all open foreign
            currency receivables and payables based on current exchange rates.
          </p>

          <div className="space-y-2">
            <Label>Entity</Label>
            <Select value={entityId} onValueChange={setEntityId} required>
              <SelectTrigger>
                <SelectValue placeholder="Select entity" />
              </SelectTrigger>
              <SelectContent>
                {entities?.map((entity) => (
                  <SelectItem key={entity.id} value={entity.id}>
                    {entity.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Revaluation Date</Label>
            <Input
              type="date"
              value={revaluationDate}
              onChange={(e) => setRevaluationDate(e.target.value)}
              required
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={runRevaluation.isPending || !entityId}
            >
              {runRevaluation.isPending ? "Processing..." : "Run Revaluation"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
