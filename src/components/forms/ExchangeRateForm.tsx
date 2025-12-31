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
import { useCreateExchangeRate, CURRENCIES } from "@/hooks/useCurrency";
import { Plus } from "lucide-react";

interface ExchangeRateFormProps {
  trigger?: React.ReactNode;
}

export function ExchangeRateForm({ trigger }: ExchangeRateFormProps) {
  const [open, setOpen] = useState(false);
  const [fromCurrency, setFromCurrency] = useState("EUR");
  const [toCurrency, setToCurrency] = useState("USD");
  const [rate, setRate] = useState("");
  const [rateDate, setRateDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [rateType, setRateType] = useState("spot");

  const createRate = useCreateExchangeRate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    await createRate.mutateAsync({
      from_currency: fromCurrency,
      to_currency: toCurrency,
      rate: parseFloat(rate),
      rate_date: rateDate,
      rate_type: rateType,
      source: "manual",
    });

    setOpen(false);
    resetForm();
  };

  const resetForm = () => {
    setFromCurrency("EUR");
    setToCurrency("USD");
    setRate("");
    setRateDate(new Date().toISOString().split("T")[0]);
    setRateType("spot");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Add Rate
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Exchange Rate</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>From Currency</Label>
              <Select value={fromCurrency} onValueChange={setFromCurrency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.code} - {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>To Currency</Label>
              <Select value={toCurrency} onValueChange={setToCurrency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.code} - {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Exchange Rate</Label>
            <Input
              type="number"
              step="0.00000001"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder="e.g., 1.0850"
              required
            />
            <p className="text-xs text-muted-foreground">
              1 {fromCurrency} = {rate || "?"} {toCurrency}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Rate Date</Label>
              <Input
                type="date"
                value={rateDate}
                onChange={(e) => setRateDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Rate Type</Label>
              <Select value={rateType} onValueChange={setRateType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="spot">Spot</SelectItem>
                  <SelectItem value="average">Average</SelectItem>
                  <SelectItem value="closing">Closing</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createRate.isPending}>
              {createRate.isPending ? "Adding..." : "Add Rate"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
