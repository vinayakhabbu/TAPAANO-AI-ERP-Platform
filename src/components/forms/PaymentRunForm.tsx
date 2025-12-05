import { useState } from "react";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface PaymentRunFormProps {
  trigger?: React.ReactNode;
}

export function PaymentRunForm({ trigger }: PaymentRunFormProps) {
  const [open, setOpen] = useState(false);
  const [runDate, setRunDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [paymentMethod, setPaymentMethod] = useState("ach");
  const [selectedBills, setSelectedBills] = useState<string[]>([]);
  const queryClient = useQueryClient();

  const { data: unpaidBills = [] } = useQuery({
    queryKey: ["unpaid-bills"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bills")
        .select(`
          id, 
          bill_number, 
          total, 
          amount_paid,
          vendors (name)
        `)
        .in("status", ["pending", "overdue"]);
      if (error) throw error;
      return (data || []).map((b) => ({
        ...b,
        balance: b.total - b.amount_paid,
      }));
    },
  });

  const { data: entities = [] } = useQuery({
    queryKey: ["entities"],
    queryFn: async () => {
      const { data, error } = await supabase.from("entities").select("id, name");
      if (error) throw error;
      return data || [];
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const { data: profile } = await supabase.from("profiles").select("org_id").single();
      if (!profile?.org_id) throw new Error("No organization found");

      const entityId = entities[0]?.id;
      if (!entityId) throw new Error("No entity found");

      const selectedBillData = unpaidBills.filter((b) => selectedBills.includes(b.id));
      const totalAmount = selectedBillData.reduce((sum, b) => sum + b.balance, 0);

      const runNumber = `PR-${Date.now().toString().slice(-6)}`;

      const { data: paymentRun, error: prError } = await supabase
        .from("payment_runs")
        .insert({
          org_id: profile.org_id,
          entity_id: entityId,
          run_number: runNumber,
          run_date: runDate,
          payment_method: paymentMethod,
          total_amount: totalAmount,
          status: "draft",
        })
        .select()
        .single();

      if (prError) throw prError;

      const items = selectedBillData.map((bill) => ({
        payment_run_id: paymentRun.id,
        bill_id: bill.id,
        amount: bill.balance,
      }));

      const { error: itemsError } = await supabase
        .from("payment_run_items")
        .insert(items);

      if (itemsError) throw itemsError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment-runs"] });
      toast.success("Payment run created successfully");
      setOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error("Failed to create payment run: " + error.message);
    },
  });

  const resetForm = () => {
    setRunDate(format(new Date(), "yyyy-MM-dd"));
    setPaymentMethod("ach");
    setSelectedBills([]);
  };

  const toggleBill = (billId: string) => {
    setSelectedBills((prev) =>
      prev.includes(billId)
        ? prev.filter((id) => id !== billId)
        : [...prev, billId]
    );
  };

  const totalSelected = unpaidBills
    .filter((b) => selectedBills.includes(b.id))
    .reduce((sum, b) => sum + b.balance, 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New Payment Run</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Payment Run</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Payment Date *</Label>
              <Input
                type="date"
                value={runDate}
                onChange={(e) => setRunDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ach">ACH Transfer</SelectItem>
                  <SelectItem value="wire">Wire Transfer</SelectItem>
                  <SelectItem value="check">Check</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Select Bills to Pay</Label>
            <div className="border rounded-lg max-h-60 overflow-y-auto">
              {unpaidBills.length === 0 ? (
                <p className="p-4 text-center text-muted-foreground">No unpaid bills</p>
              ) : (
                unpaidBills.map((bill) => (
                  <div
                    key={bill.id}
                    className="flex items-center gap-3 p-3 border-b last:border-b-0 hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={selectedBills.includes(bill.id)}
                      onCheckedChange={() => toggleBill(bill.id)}
                    />
                    <div className="flex-1">
                      <p className="font-medium">{bill.bill_number}</p>
                      <p className="text-sm text-muted-foreground">
                        {bill.vendors?.name || "Unknown vendor"}
                      </p>
                    </div>
                    <p className="font-medium">${bill.balance.toFixed(2)}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="border-t pt-4">
            <div className="flex justify-between items-center">
              <p className="text-muted-foreground">
                {selectedBills.length} bill(s) selected
              </p>
              <p className="text-lg font-semibold">
                Total: ${totalSelected.toFixed(2)}
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={selectedBills.length === 0 || mutation.isPending}
            >
              {mutation.isPending ? "Creating..." : "Create Payment Run"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
