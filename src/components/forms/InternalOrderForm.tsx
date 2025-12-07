import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateInternalOrder } from '@/hooks/useCOIntegration';
import { toast } from 'sonner';

const formSchema = z.object({
  code: z.string().min(1, 'Code is required'),
  name: z.string().min(1, 'Name is required'),
  order_type: z.string().default('overhead'),
  status: z.string().default('open'),
  valid_from: z.string().optional(),
  valid_to: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface InternalOrderFormProps {
  onSuccess?: () => void;
}

const InternalOrderForm = ({ onSuccess }: InternalOrderFormProps) => {
  const createInternalOrder = useCreateInternalOrder();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      code: '',
      name: '',
      order_type: 'overhead',
      status: 'open',
      valid_from: new Date().toISOString().split('T')[0],
    },
  });

  const onSubmit = async (data: FormData) => {
    try {
      await createInternalOrder.mutateAsync({
        code: data.code,
        name: data.name,
        order_type: data.order_type,
        status: data.status,
        valid_from: data.valid_from || new Date().toISOString().split('T')[0],
        valid_to: data.valid_to || null,
      });
      toast.success('Internal order created successfully');
      form.reset();
      onSuccess?.();
    } catch (error: any) {
      toast.error(error.message || 'Failed to create internal order');
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="code"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Order Code</FormLabel>
                <FormControl>
                  <Input placeholder="IO-001" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Order Name</FormLabel>
                <FormControl>
                  <Input placeholder="Marketing Campaign Q1" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="order_type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Order Type</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="overhead">Overhead</SelectItem>
                    <SelectItem value="investment">Investment</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                    <SelectItem value="project">Project</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Status</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="valid_from"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Valid From</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="valid_to"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Valid To (Optional)</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <Button type="submit" className="w-full" disabled={createInternalOrder.isPending}>
          {createInternalOrder.isPending ? 'Creating...' : 'Create Internal Order'}
        </Button>
      </form>
    </Form>
  );
};

export default InternalOrderForm;
