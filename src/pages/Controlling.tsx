import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, TrendingUp, TrendingDown, Building2, Landmark, Target, FolderKanban } from 'lucide-react';
import { useControlling } from '@/hooks/useControlling';
import CostCenterForm from '@/components/forms/CostCenterForm';
import ProjectCostForm from '@/components/forms/ProjectCostForm';
import FixedAssetForm from '@/components/forms/FixedAssetForm';
import BudgetForm from '@/components/forms/BudgetForm';
import CashFlowForecastForm from '@/components/forms/CashFlowForecastForm';
import CashFlowChart from '@/components/controlling/CashFlowChart';
import BudgetVarianceChart from '@/components/controlling/BudgetVarianceChart';

const Controlling = () => {
  const [activeTab, setActiveTab] = useState('cash-flow');
  const [costCenterDialogOpen, setCostCenterDialogOpen] = useState(false);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [assetDialogOpen, setAssetDialogOpen] = useState(false);
  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false);
  const [forecastDialogOpen, setForecastDialogOpen] = useState(false);

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

  // Calculate summary metrics
  const totalAssetValue = fixedAssets.reduce((sum, a) => sum + a.book_value, 0);
  const totalBudgeted = budgets.filter(b => b.status === 'approved').reduce((sum, b) => sum + b.total_amount, 0);
  const projectBudgetTotal = projects.reduce((sum, p) => sum + p.budget_amount, 0);
  const projectActualTotal = projects.reduce((sum, p) => sum + p.actual_cost, 0);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Controlling</h1>
          <p className="text-muted-foreground">Financial planning, budgeting, and cost management</p>
        </div>
      </div>

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
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="cash-flow">Cash Flow</TabsTrigger>
          <TabsTrigger value="budgets">Budgets</TabsTrigger>
          <TabsTrigger value="assets">Fixed Assets</TabsTrigger>
          <TabsTrigger value="projects">Projects</TabsTrigger>
          <TabsTrigger value="cost-centers">Cost Centers</TabsTrigger>
        </TabsList>

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
      </Tabs>
    </div>
  );
};

export default Controlling;
