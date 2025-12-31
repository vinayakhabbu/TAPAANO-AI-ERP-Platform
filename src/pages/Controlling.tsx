import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, TrendingUp, TrendingDown, Building2, Landmark, Target, FolderKanban, FileText, ClipboardList } from 'lucide-react';
import { useControlling } from '@/hooks/useControlling';
import { useCODocuments, useInternalOrders } from '@/hooks/useCOIntegration';
import CostCenterForm from '@/components/forms/CostCenterForm';
import ProjectCostForm from '@/components/forms/ProjectCostForm';
import FixedAssetForm from '@/components/forms/FixedAssetForm';
import BudgetForm from '@/components/forms/BudgetForm';
import CashFlowForecastForm from '@/components/forms/CashFlowForecastForm';
import InternalOrderForm from '@/components/forms/InternalOrderForm';
import CashFlowChart from '@/components/controlling/CashFlowChart';
import BudgetVarianceChart from '@/components/controlling/BudgetVarianceChart';
import { AppLayout } from '@/components/layout/AppLayout';

const Controlling = () => {
  const [activeTab, setActiveTab] = useState('cash-flow');
  const [costCenterDialogOpen, setCostCenterDialogOpen] = useState(false);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [assetDialogOpen, setAssetDialogOpen] = useState(false);
  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false);
  const [forecastDialogOpen, setForecastDialogOpen] = useState(false);
  const [internalOrderDialogOpen, setInternalOrderDialogOpen] = useState(false);

  const {
    costCenters,
    costCentersLoading,
    projects,
    projectsLoading,
    fixedAssets,
    fixedAssetsLoading,
    budgets,
    budgetsLoading,
    cashFlowForecasts,
    cashFlowForecastsLoading,
  } = useControlling();

  const { data: coDocuments, isLoading: coDocumentsLoading } = useCODocuments();
  const { data: internalOrders, isLoading: internalOrdersLoading } = useInternalOrders();

  // Calculate summary metrics
  const totalAssetValue = fixedAssets.reduce((sum, a) => sum + a.book_value, 0);
  const totalBudgeted = budgets.filter(b => b.status === 'approved').reduce((sum, b) => sum + b.total_amount, 0);
  const projectBudgetTotal = projects.reduce((sum, p) => sum + p.budget_amount, 0);
  const projectActualTotal = projects.reduce((sum, p) => sum + p.actual_cost, 0);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  return (
    <AppLayout title="Controlling" subtitle="Financial planning, budgeting, and cost management">
      <div className="space-y-6">

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Asset Value</CardTitle>
            <Landmark className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalAssetValue)}</div>
            <p className="text-xs text-muted-foreground">{fixedAssets.length} fixed assets</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Approved Budgets</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalBudgeted)}</div>
            <p className="text-xs text-muted-foreground">{budgets.filter(b => b.status === 'approved').length} approved</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Project Costs</CardTitle>
            <FolderKanban className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(projectActualTotal)}</div>
            <p className="text-xs text-muted-foreground">of {formatCurrency(projectBudgetTotal)} budgeted</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cost Centers</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{costCenters.filter(c => c.is_active).length}</div>
            <p className="text-xs text-muted-foreground">active cost centers</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="overflow-x-auto scrollbar-hide -mx-1 px-1">
          <TabsList className="inline-flex h-10 w-auto bg-muted/50">
            <TabsTrigger value="cash-flow" className="gap-2 whitespace-nowrap">
              <TrendingUp className="h-4 w-4" />
              <span className="hidden sm:inline">Cash Flow</span>
              <span className="sm:hidden">Cash</span>
            </TabsTrigger>
            <TabsTrigger value="budgets" className="gap-2 whitespace-nowrap">
              <Target className="h-4 w-4" />
              <span className="hidden sm:inline">Budgets</span>
              <span className="sm:hidden">Budg</span>
            </TabsTrigger>
            <TabsTrigger value="assets" className="gap-2 whitespace-nowrap">
              <Landmark className="h-4 w-4" />
              <span className="hidden sm:inline">Fixed Assets</span>
              <span className="sm:hidden">Assets</span>
            </TabsTrigger>
            <TabsTrigger value="projects" className="gap-2 whitespace-nowrap">
              <FolderKanban className="h-4 w-4" />
              <span className="hidden sm:inline">Projects</span>
              <span className="sm:hidden">Proj</span>
            </TabsTrigger>
            <TabsTrigger value="cost-centers" className="gap-2 whitespace-nowrap">
              <Building2 className="h-4 w-4" />
              <span className="hidden sm:inline">Cost Centers</span>
              <span className="sm:hidden">CC</span>
            </TabsTrigger>
            <TabsTrigger value="internal-orders" className="gap-2 whitespace-nowrap">
              <ClipboardList className="h-4 w-4" />
              <span className="hidden sm:inline">Internal Orders</span>
              <span className="sm:hidden">IO</span>
            </TabsTrigger>
            <TabsTrigger value="co-documents" className="gap-2 whitespace-nowrap">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">CO Documents</span>
              <span className="sm:hidden">CO</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Cash Flow Tab */}
        <TabsContent value="cash-flow" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Cash Flow Forecasting</h2>
            <Dialog open={forecastDialogOpen} onOpenChange={setForecastDialogOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="mr-2 h-4 w-4" />Add Forecast</Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>New Cash Flow Forecast</DialogTitle>
                </DialogHeader>
                <CashFlowForecastForm onSuccess={() => setForecastDialogOpen(false)} />
              </DialogContent>
            </Dialog>
          </div>
          
          <CashFlowChart forecasts={cashFlowForecasts} />

          <Card>
            <CardHeader>
              <CardTitle>Forecast Details</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Expected Inflow</TableHead>
                    <TableHead className="text-right">Expected Outflow</TableHead>
                    <TableHead>Confidence</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cashFlowForecasts.map((forecast) => (
                    <TableRow key={forecast.id}>
                      <TableCell>{new Date(forecast.forecast_date).toLocaleDateString()}</TableCell>
                      <TableCell>{forecast.category}</TableCell>
                      <TableCell>{forecast.description}</TableCell>
                      <TableCell className="text-right text-green-600">{formatCurrency(forecast.expected_inflow)}</TableCell>
                      <TableCell className="text-right text-red-600">{formatCurrency(forecast.expected_outflow)}</TableCell>
                      <TableCell>
                        <Badge variant={forecast.confidence_level === 'high' ? 'default' : forecast.confidence_level === 'medium' ? 'secondary' : 'outline'}>
                          {forecast.confidence_level}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {cashFlowForecasts.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No forecasts yet</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Budgets Tab */}
        <TabsContent value="budgets" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Budget Control</h2>
            <Dialog open={budgetDialogOpen} onOpenChange={setBudgetDialogOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="mr-2 h-4 w-4" />New Budget</Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Create Budget</DialogTitle>
                </DialogHeader>
                <BudgetForm onSuccess={() => setBudgetDialogOpen(false)} />
              </DialogContent>
            </Dialog>
          </div>

          <BudgetVarianceChart budgets={budgets} />

          <Card>
            <CardHeader>
              <CardTitle>Budget List</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Budget #</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Fiscal Year</TableHead>
                    <TableHead className="text-right">Total Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {budgets.map((budget) => (
                    <TableRow key={budget.id}>
                      <TableCell className="font-medium">{budget.budget_number}</TableCell>
                      <TableCell>{budget.name}</TableCell>
                      <TableCell>{budget.fiscal_year}</TableCell>
                      <TableCell className="text-right">{formatCurrency(budget.total_amount)}</TableCell>
                      <TableCell>
                        <Badge variant={budget.status === 'approved' ? 'default' : budget.status === 'draft' ? 'secondary' : 'outline'}>
                          {budget.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {budgets.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No budgets yet</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Fixed Assets Tab */}
        <TabsContent value="assets" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Fixed Asset Management</h2>
            <Dialog open={assetDialogOpen} onOpenChange={setAssetDialogOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="mr-2 h-4 w-4" />Add Asset</Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Register Fixed Asset</DialogTitle>
                </DialogHeader>
                <FixedAssetForm onSuccess={() => setAssetDialogOpen(false)} />
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Asset Register</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Asset #</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Acquisition Date</TableHead>
                    <TableHead className="text-right">Acquisition Cost</TableHead>
                    <TableHead className="text-right">Accum. Depreciation</TableHead>
                    <TableHead className="text-right">Book Value</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fixedAssets.map((asset) => (
                    <TableRow key={asset.id}>
                      <TableCell className="font-medium">{asset.asset_number}</TableCell>
                      <TableCell>{asset.name}</TableCell>
                      <TableCell>{asset.category}</TableCell>
                      <TableCell>{new Date(asset.acquisition_date).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right">{formatCurrency(asset.acquisition_cost)}</TableCell>
                      <TableCell className="text-right text-red-600">{formatCurrency(asset.accumulated_depreciation)}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(asset.book_value)}</TableCell>
                      <TableCell>
                        <Badge variant={asset.status === 'active' ? 'default' : 'secondary'}>{asset.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {fixedAssets.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No fixed assets registered</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Projects Tab */}
        <TabsContent value="projects" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Project Cost Monitoring</h2>
            <Dialog open={projectDialogOpen} onOpenChange={setProjectDialogOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="mr-2 h-4 w-4" />New Project</Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Create Project</DialogTitle>
                </DialogHeader>
                <ProjectCostForm onSuccess={() => setProjectDialogOpen(false)} />
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Project List</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Project #</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Cost Center</TableHead>
                    <TableHead className="text-right">Budget</TableHead>
                    <TableHead className="text-right">Actual Cost</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projects.map((project) => {
                    const variance = project.budget_amount - project.actual_cost;
                    return (
                      <TableRow key={project.id}>
                        <TableCell className="font-medium">{project.project_number}</TableCell>
                        <TableCell>{project.name}</TableCell>
                        <TableCell>{project.cost_center?.name || '-'}</TableCell>
                        <TableCell className="text-right">{formatCurrency(project.budget_amount)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(project.actual_cost)}</TableCell>
                        <TableCell className={`text-right ${variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {variance >= 0 ? <TrendingUp className="inline h-4 w-4 mr-1" /> : <TrendingDown className="inline h-4 w-4 mr-1" />}
                          {formatCurrency(Math.abs(variance))}
                        </TableCell>
                        <TableCell>
                          <Badge variant={project.status === 'active' ? 'default' : project.status === 'completed' ? 'secondary' : 'outline'}>
                            {project.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {projects.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No projects yet</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Cost Centers Tab */}
        <TabsContent value="cost-centers" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Cost Center Accounting</h2>
            <Dialog open={costCenterDialogOpen} onOpenChange={setCostCenterDialogOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="mr-2 h-4 w-4" />New Cost Center</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Cost Center</DialogTitle>
                </DialogHeader>
                <CostCenterForm onSuccess={() => setCostCenterDialogOpen(false)} />
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Cost Center List</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {costCenters.map((cc) => (
                    <TableRow key={cc.id}>
                      <TableCell className="font-medium">{cc.code}</TableCell>
                      <TableCell>{cc.name}</TableCell>
                      <TableCell>{cc.description || '-'}</TableCell>
                      <TableCell>
                        <Badge variant={cc.is_active ? 'default' : 'secondary'}>{cc.is_active ? 'Active' : 'Inactive'}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {costCenters.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No cost centers yet</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Internal Orders Tab */}
        <TabsContent value="internal-orders" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Internal Orders</h2>
            <Dialog open={internalOrderDialogOpen} onOpenChange={setInternalOrderDialogOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="mr-2 h-4 w-4" />New Internal Order</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Internal Order</DialogTitle>
                </DialogHeader>
                <InternalOrderForm onSuccess={() => setInternalOrderDialogOpen(false)} />
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Internal Order List</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Valid From</TableHead>
                    <TableHead>Valid To</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(internalOrders || []).map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium">{order.code}</TableCell>
                      <TableCell>{order.name}</TableCell>
                      <TableCell className="capitalize">{order.order_type}</TableCell>
                      <TableCell>{new Date(order.valid_from).toLocaleDateString()}</TableCell>
                      <TableCell>{order.valid_to ? new Date(order.valid_to).toLocaleDateString() : '-'}</TableCell>
                      <TableCell>
                        <Badge variant={order.status === 'open' ? 'default' : 'secondary'}>{order.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!internalOrders || internalOrders.length === 0) && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No internal orders yet</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* CO Documents Tab - Shows GL to CO Integration */}
        <TabsContent value="co-documents" className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-semibold">Controlling Documents</h2>
              <p className="text-sm text-muted-foreground">
                CO documents are automatically created from GL journal entries with cost-relevant accounts
              </p>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                CO Document List (GL → CO Integration)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>CO Doc #</TableHead>
                    <TableHead>Journal Entry</TableHead>
                    <TableHead>Posting Date</TableHead>
                    <TableHead>Source Module</TableHead>
                    <TableHead className="text-right">Lines</TableHead>
                    <TableHead className="text-right">Total Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(coDocuments || []).map((doc: any) => {
                    const totalAmount = (doc.co_document_lines || []).reduce(
                      (sum: number, line: any) => sum + (line.amount || 0), 0
                    );
                    return (
                      <TableRow key={doc.id}>
                        <TableCell className="font-medium">{doc.document_number}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {doc.journal_entry?.entry_number || '-'}
                          </Badge>
                        </TableCell>
                        <TableCell>{new Date(doc.posting_date).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="capitalize">{doc.source_module}</Badge>
                        </TableCell>
                        <TableCell className="text-right">{doc.co_document_lines?.length || 0}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(totalAmount)}</TableCell>
                      </TableRow>
                    );
                  })}
                  {(!coDocuments || coDocuments.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        No CO documents yet. Post a journal entry with a cost-relevant GL account to create one.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5" />
                Integration Rules
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="p-4 border rounded-lg">
                  <h4 className="font-medium mb-2">GL → CO Flow</h4>
                  <p className="text-sm text-muted-foreground">
                    When a journal entry is posted with expense/revenue accounts marked for controlling,
                    a CO document is automatically created with cost center and internal order assignments.
                  </p>
                </div>
                <div className="p-4 border rounded-lg">
                  <h4 className="font-medium mb-2">Banking → GL → CO Flow</h4>
                  <p className="text-sm text-muted-foreground">
                    Bank transactions (charges, interest) are posted through GL first, 
                    then automatically create CO documents for cost-relevant accounts.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      </div>
    </AppLayout>
  );
};

export default Controlling;
