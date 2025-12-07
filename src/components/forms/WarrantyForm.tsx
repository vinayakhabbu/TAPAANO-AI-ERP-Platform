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
import { useCreateWarranty } from "@/hooks/useServiceManagement";
import { useReceivables } from "@/hooks/useReceivables";
import { useProducts } from "@/hooks/useInventory";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  warranty_number: z.string().min(1, "Warranty number is required"),
  customer_id: z.string().min(1, "Customer is required"),
  product_id: z.string().optional(),
  serial_number: z.string().optional(),
  purchase_date: z.string().optional(),
  warranty_start_date: z.string().min(1, "Start date is required"),
  warranty_end_date: z.string().min(1, "End date is required"),
  warranty_type: z.string().min(1, "Type is required"),
  coverage_details: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface WarrantyFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WarrantyForm({ open, onOpenChange }: WarrantyFormProps) {
  const { toast } = useToast();
  const createWarranty = useCreateWarranty();
  const { customers } = useReceivables();
  const { data: products } = useProducts();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      warranty_number: "",
      customer_id: "",
      product_id: "",
      serial_number: "",
      purchase_date: "",
      warranty_start_date: new Date().toISOString().split("T")[0],
      warranty_end_date: "",
      warranty_type: "standard",
      coverage_details: "",
    },
  });

  useEffect(() => {
    if (open) {
      const num = `WRN-${Date.now().toString().slice(-6)}`;
      form.setValue("warranty_number", num);
    }
  }, [open, form]);

  const onSubmit = async (data: FormData) => {
    try {
      await createWarranty.mutateAsync({
        ...data,
        product_id: data.product_id || null,
        status: "active",
      });
      toast({ title: "Success", description: "Warranty registered" });
      onOpenChange(false);
      form.reset();
    } catch {
      toast({ title: "Error", description: "Failed to create warranty", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Register Warranty</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="warranty_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Warranty #</FormLabel>
                    <FormControl>
                      <Input {...field} readOnly className="bg-muted" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="warranty_type"
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
                        <SelectItem value="standard">Standard</SelectItem>
                        <SelectItem value="extended">Extended</SelectItem>
                        <SelectItem value="limited">Limited</SelectItem>
                        <SelectItem value="lifetime">Lifetime</SelectItem>
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
                name="product_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Product</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select product" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
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
                name="serial_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Serial Number</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Optional" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="purchase_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Purchase Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="warranty_start_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="warranty_end_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="coverage_details"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Coverage Details</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={2} placeholder="What's covered under this warranty" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createWarranty.isPending}>
                {createWarranty.isPending ? "Registering..." : "Register Warranty"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
