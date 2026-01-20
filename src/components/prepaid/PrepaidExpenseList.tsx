import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Plus, Calendar, DollarSign } from 'lucide-react';
import { usePrepaidExpenses, useCreatePrepaidExpense, type PrepaidExpense } from '@/hooks/usePrepaidExpenses';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const PrepaidExpenseList = () => {
  const { data: expenses = [], isLoading } = usePrepaidExpenses();
  const createExpense = useCreatePrepaidExpense();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    description: '',
    original_amount: '',
    start_date: '',
    end_date: '',
    amortization_method: 'straight_line',
    entity_id: '',
  });

  // Fetch entities for the form
  const { data: entities = [] } = useQuery({
    queryKey: ['entities-for-prepaid'],
    queryFn: async () => {
      const { data } = await supabase.from('entities').select('id, name');
      return data || [];
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.entity_id) {
      return;
    }
    try {
      await createExpense.mutateAsync({
        entity_id: formData.entity_id,
        description: formData.description,
        original_amount: parseFloat(formData.original_amount),
        start_date: formData.start_date,
        end_date: formData.end_date,
        amortization_method: formData.amortization_method,
      });
      setDialogOpen(false);
      setFormData({
        description: '',
        original_amount: '',
        start_date: '',
        end_date: '',
        amortization_method: 'straight_line',
        entity_id: '',
      });
    } catch (error) {
      // Error handled by hook
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  const getAmortizationProgress = (expense: PrepaidExpense) => {
    const amortized = expense.original_amount - expense.remaining_amount;
    return (amortized / expense.original_amount) * 100;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="default">Active</Badge>;
      case 'fully_amortized':
        return <Badge variant="secondary">Fully Amortized</Badge>;
      case 'cancelled':
        return <Badge variant="outline">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Prepaid Expenses</h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />Add Prepaid</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Record Prepaid Expense</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="entity">Entity</Label>
                <Select
                  value={formData.entity_id}
                  onValueChange={(v) => setFormData({ ...formData, entity_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select entity" />
                  </SelectTrigger>
                  <SelectContent>
                    {entities.map((entity) => (
                      <SelectItem key={entity.id} value={entity.id}>{entity.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="e.g., Annual Software License"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Amount</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.original_amount}
                  onChange={(e) => setFormData({ ...formData, original_amount: e.target.value })}
                  placeholder="0.00"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="start_date">Start Date</Label>
                  <Input
                    id="start_date"
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end_date">End Date</Label>
                  <Input
                    id="end_date"
                    type="date"
                    value={formData.end_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Amortization Method</Label>
                <Select
                  value={formData.amortization_method}
                  onValueChange={(v) => setFormData({ ...formData, amortization_method: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="straight_line">Straight Line</SelectItem>
                    <SelectItem value="custom">Custom Schedule</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createExpense.isPending}>
                  {createExpense.isPending ? 'Creating...' : 'Create'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Prepaid</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(expenses.reduce((sum, e) => sum + e.original_amount, 0))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Remaining Balance</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(expenses.reduce((sum, e) => sum + e.remaining_amount, 0))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {expenses.filter(e => e.status === 'active').length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Prepaid Expense Register</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : expenses.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No prepaid expenses recorded. Add one to track amortization.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Original</TableHead>
                  <TableHead className="text-right">Remaining</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map((expense) => (
                  <TableRow key={expense.id}>
                    <TableCell className="font-medium">{expense.description}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(expense.start_date).toLocaleDateString()} - {new Date(expense.end_date).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(expense.original_amount)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(expense.remaining_amount)}</TableCell>
                    <TableCell className="w-32">
                      <div className="flex items-center gap-2">
                        <Progress value={getAmortizationProgress(expense)} className="h-2" />
                        <span className="text-xs text-muted-foreground w-10">
                          {Math.round(getAmortizationProgress(expense))}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(expense.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PrepaidExpenseList;
