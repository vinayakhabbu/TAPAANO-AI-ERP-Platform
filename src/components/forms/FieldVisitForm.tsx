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
import { useCreateFieldVisit, useServiceCalls } from "@/hooks/useServiceManagement";
import { useReceivables } from "@/hooks/useReceivables";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  visit_number: z.string().min(1, "Visit number is required"),
  customer_id: z.string().min(1, "Customer is required"),
  service_call_id: z.string().optional(),
  visit_type: z.string().min(1, "Type is required"),
  scheduled_start: z.string().min(1, "Start time is required"),
  scheduled_end: z.string().optional(),
  location_address: z.string().optional(),
  location_notes: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface FieldVisitFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FieldVisitForm({ open, onOpenChange }: FieldVisitFormProps) {
  const { toast } = useToast();
  const createVisit = useCreateFieldVisit();
  const { customers } = useReceivables();
  const { data: serviceCalls } = useServiceCalls();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      visit_number: "",
      customer_id: "",
      service_call_id: "",
      visit_type: "scheduled",
      scheduled_start: "",
      scheduled_end: "",
      location_address: "",
      location_notes: "",
    },
  });

  useEffect(() => {
    if (open) {
      const num = `FSV-${Date.now().toString().slice(-6)}`;
      form.setValue("visit_number", num);
    }
  }, [open, form]);

  const selectedCustomerId = form.watch("customer_id");
  const customerCalls = serviceCalls?.filter(c => 
    c.customer_id === selectedCustomerId && 
    (c.status === "open" || c.status === "in_progress")
  );

  const onSubmit = async (data: FormData) => {
    try {
      await createVisit.mutateAsync({
        ...data,
        service_call_id: data.service_call_id || null,
        scheduled_end: data.scheduled_end || null,
        status: "scheduled",
      });
      toast({ title: "Success", description: "Field visit scheduled" });
      onOpenChange(false);
      form.reset();
    } catch {
      toast({ title: "Error", description: "Failed to schedule visit", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Schedule Field Visit</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="visit_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Visit #</FormLabel>
                    <FormControl>
                      <Input {...field} readOnly className="bg-muted" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="visit_type"
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
                        <SelectItem value="scheduled">Scheduled</SelectItem>
                        <SelectItem value="emergency">Emergency</SelectItem>
                        <SelectItem value="follow_up">Follow-up</SelectItem>
                        <SelectItem value="inspection">Inspection</SelectItem>
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

            <FormField
              control={form.control}
              name="service_call_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Related Service Call</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select service call (optional)" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {customerCalls?.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.call_number} - {c.subject}</SelectItem>
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
                name="scheduled_start"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Time</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="scheduled_end"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Time</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="location_address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Location Address</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={2} placeholder="Site address for the visit" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="location_notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Location Notes</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Entry instructions, parking, etc." />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createVisit.isPending}>
                {createVisit.isPending ? "Scheduling..." : "Schedule Visit"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
