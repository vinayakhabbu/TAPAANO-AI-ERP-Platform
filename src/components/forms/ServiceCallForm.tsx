import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { useCreateServiceCall, useServiceContracts, useWarranties } from "@/hooks/useServiceManagement";
import { useReceivables } from "@/hooks/useReceivables";
import { useProducts } from "@/hooks/useInventory";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  call_number: z.string().min(1, "Call number is required"),
  customer_id: z.string().min(1, "Customer is required"),
  contract_id: z.string().optional(),
  warranty_id: z.string().optional(),
  product_id: z.string().optional(),
  priority: z.string().min(1, "Priority is required"),
  call_type: z.string().min(1, "Type is required"),
  subject: z.string().min(1, "Subject is required"),
  description: z.string().optional(),
  reported_issue: z.string().optional(),
  scheduled_date: z.string().optional(),
  is_billable: z.boolean().default(true),
  estimated_duration_hours: z.coerce.number().min(0).default(1),
});

type FormData = z.infer<typeof formSchema>;

interface ServiceCallFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ServiceCallForm({ open, onOpenChange }: ServiceCallFormProps) {
  const { toast } = useToast();
  const createCall = useCreateServiceCall();
  const { customers } = useReceivables();
  const { data: products } = useProducts();
  const { data: contracts } = useServiceContracts();
  const { data: warranties } = useWarranties();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      call_number: "",
      customer_id: "",
      contract_id: "",
      warranty_id: "",
      product_id: "",
      priority: "medium",
      call_type: "repair",
      subject: "",
      description: "",
      reported_issue: "",
      scheduled_date: "",
      is_billable: true,
      estimated_duration_hours: 1,
    },
  });

  useEffect(() => {
    if (open) {
      const num = `SVC-${Date.now().toString().slice(-6)}`;
      form.setValue("call_number", num);
    }
  }, [open, form]);

  const selectedCustomerId = form.watch("customer_id");
  const customerContracts = contracts?.filter(c => c.customer_id === selectedCustomerId && c.status === "active");
  const customerWarranties = warranties?.filter(w => w.customer_id === selectedCustomerId && w.status === "active");

  const onSubmit = async (data: FormData) => {
    try {
      await createCall.mutateAsync({
        ...data,
        contract_id: data.contract_id || null,
        warranty_id: data.warranty_id || null,
        product_id: data.product_id || null,
        status: "open",
      });
      toast({ title: "Success", description: "Service call created" });
      onOpenChange(false);
      form.reset();
    } catch {
      toast({ title: "Error", description: "Failed to create service call", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Log Service Call</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="call_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Call #</FormLabel>
                    <FormControl>
                      <Input {...field} readOnly className="bg-muted" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="critical">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="call_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="repair">Repair</SelectItem>
                        <SelectItem value="maintenance">Maintenance</SelectItem>
                        <SelectItem value="installation">Installation</SelectItem>
                        <SelectItem value="inspection">Inspection</SelectItem>
                        <SelectItem value="consultation">Consultation</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="customer_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Customer</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select customer" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {customers?.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="contract_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Service Contract</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select contract (optional)" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="">None</SelectItem>
                        {customerContracts?.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.contract_number}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="warranty_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Warranty</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select warranty (optional)" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="">None</SelectItem>
                        {customerWarranties?.map((w) => (
                          <SelectItem key={w.id} value={w.id}>{w.warranty_number}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="product_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Product</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select product (optional)" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {products?.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="subject"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Subject</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Brief description of the issue" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="reported_issue"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reported Issue</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={3} placeholder="Detailed description of the problem" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="scheduled_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Scheduled Date</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="estimated_duration_hours"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Est. Duration (hours)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.5" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="is_billable"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <FormLabel className="text-sm">Billable</FormLabel>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createCall.isPending}>
                {createCall.isPending ? "Creating..." : "Create Service Call"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
