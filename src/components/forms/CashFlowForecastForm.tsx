import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useControlling } from '@/hooks/useControlling';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const formSchema = z.object({
  entity_id: z.string().min(1, 'Entity is required'),
  forecast_date: z.string().min(1, 'Forecast date is required'),
  category: z.string().min(1, 'Category is required'),
  description: z.string().optional(),
  expected_inflow: z.coerce.number().min(0).default(0),
  expected_outflow: z.coerce.number().min(0).default(0),
  confidence_level: z.string().default('medium'),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface CashFlowForecastFormProps {
  onSuccess: () => void;
}

const CashFlowForecastForm = ({ onSuccess }: CashFlowForecastFormProps) => {
  const { createCashFlowForecast } = useControlling();

  const { data: entities = [] } = useQuery({
    queryKey: ['entities'],
    queryFn: async () => {
      const { data, error } = await supabase.from('entities').select('*');
      if (error) throw error;
      return data;
    },
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      forecast_date: new Date().toISOString().split('T')[0],
      category: '',
      description: '',
      expected_inflow: 0,
      expected_outflow: 0,
      confidence_level: 'medium',
      notes: '',
    },
  });

  const onSubmit = async (data: FormData) => {
    await createCashFlowForecast.mutateAsync(data);
    onSuccess();
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="entity_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Entity</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select entity" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {entities.map((entity) => (
                      <SelectItem key={entity.id} value={entity.id}>{entity.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="forecast_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Forecast Date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="category"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Category</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="sales">Sales Revenue</SelectItem>
                    <SelectItem value="collections">Customer Collections</SelectItem>
                    <SelectItem value="payroll">Payroll</SelectItem>
                    <SelectItem value="vendor_payments">Vendor Payments</SelectItem>
                    <SelectItem value="rent">Rent & Utilities</SelectItem>
                    <SelectItem value="taxes">Taxes</SelectItem>
                    <SelectItem value="loans">Loan Payments</SelectItem>
                    <SelectItem value="investments">Investments</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="confidence_level"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Confidence Level</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Input placeholder="Brief description" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="expected_inflow"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Expected Inflow</FormLabel>
                <FormControl>
                  <Input type="number" step="0.01" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="expected_outflow"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Expected Outflow</FormLabel>
                <FormControl>
                  <Input type="number" step="0.01" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Textarea placeholder="Additional notes..." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2">
          <Button type="submit" disabled={createCashFlowForecast.isPending}>
            {createCashFlowForecast.isPending ? 'Creating...' : 'Add Forecast'}
          </Button>
        </div>
      </form>
    </Form>
  );
};

export default CashFlowForecastForm;
