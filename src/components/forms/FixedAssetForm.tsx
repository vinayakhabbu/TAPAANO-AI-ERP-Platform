import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useControlling } from '@/hooks/useControlling';

const formSchema = z.object({
  asset_number: z.string().min(1, 'Asset number is required'),
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  category: z.string().min(1, 'Category is required'),
  acquisition_date: z.string().min(1, 'Acquisition date is required'),
  acquisition_cost: z.coerce.number().positive('Acquisition cost must be positive'),
  salvage_value: z.coerce.number().min(0).default(0),
  useful_life_months: z.coerce.number().int().positive('Useful life must be positive'),
  depreciation_method: z.string().default('straight_line'),
  location: z.string().optional(),
  cost_center_id: z.string().optional(),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface FixedAssetFormProps {
  onSuccess: () => void;
}

const FixedAssetForm = ({ onSuccess }: FixedAssetFormProps) => {
  const { createFixedAsset, costCenters } = useControlling();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      asset_number: `FA-${Date.now().toString().slice(-6)}`,
      name: '',
      description: '',
      category: '',
      acquisition_date: new Date().toISOString().split('T')[0],
      acquisition_cost: 0,
      salvage_value: 0,
      useful_life_months: 60,
      depreciation_method: 'straight_line',
      location: '',
      notes: '',
    },
  });

  const onSubmit = async (data: FormData) => {
    await createFixedAsset.mutateAsync({
      ...data,
      cost_center_id: data.cost_center_id || null,
    });
    onSuccess();
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="asset_number"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Asset Number</FormLabel>
                <FormControl>
                  <Input {...field} />
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
                <FormLabel>Asset Name</FormLabel>
                <FormControl>
                  <Input placeholder="Office Computer" {...field} />
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
                    <SelectItem value="equipment">Equipment</SelectItem>
                    <SelectItem value="vehicles">Vehicles</SelectItem>
                    <SelectItem value="furniture">Furniture</SelectItem>
                    <SelectItem value="buildings">Buildings</SelectItem>
                    <SelectItem value="land">Land</SelectItem>
                    <SelectItem value="software">Software</SelectItem>
                    <SelectItem value="machinery">Machinery</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="acquisition_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Acquisition Date</FormLabel>
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
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea placeholder="Asset description..." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-3 gap-4">
          <FormField
            control={form.control}
            name="acquisition_cost"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Acquisition Cost</FormLabel>
                <FormControl>
                  <Input type="number" step="0.01" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="salvage_value"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Salvage Value</FormLabel>
                <FormControl>
                  <Input type="number" step="0.01" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="useful_life_months"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Useful Life (months)</FormLabel>
                <FormControl>
                  <Input type="number" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="depreciation_method"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Depreciation Method</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="straight_line">Straight Line</SelectItem>
                    <SelectItem value="declining_balance">Declining Balance</SelectItem>
                    <SelectItem value="sum_of_years">Sum of Years' Digits</SelectItem>
                    <SelectItem value="units_of_production">Units of Production</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="cost_center_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Cost Center</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select cost center" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {costCenters.map((cc) => (
                      <SelectItem key={cc.id} value={cc.id}>{cc.name}</SelectItem>
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
          name="location"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Location</FormLabel>
              <FormControl>
                <Input placeholder="Building A, Floor 2" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2">
          <Button type="submit" disabled={createFixedAsset.isPending}>
            {createFixedAsset.isPending ? 'Creating...' : 'Register Asset'}
          </Button>
        </div>
      </form>
    </Form>
  );
};

export default FixedAssetForm;
