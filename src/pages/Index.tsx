import { AppLayout } from "@/components/layout/AppLayout";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { ARAgingChart } from "@/components/dashboard/ARAgingChart";
import { CloseStatusCard } from "@/components/dashboard/CloseStatusCard";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { ModuleSummaryCard } from "@/components/dashboard/ModuleSummaryCard";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { 
  DollarSign, 
  TrendingUp, 
  Wallet, 
  Clock,
  Target,
  Receipt,
  FileText,
  Package,
  Factory,
  Wrench,
  Building2,
  PieChart,
  Users,
  Calculator,
  Coins,
  LineChart
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const formatCurrency = (value: number) => {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
};

const Index = () => {
  const stats = useDashboardStats();

  return (
    <AppLayout title="Dashboard" subtitle="Enterprise overview across all modules">
      {/* Key Financial Metrics */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total Receivables"
          value={formatCurrency(stats.receivables.totalAR)}
          change={{ 
            value: stats.receivables.overdueAR > 0 ? `${formatCurrency(stats.receivables.overdueAR)} overdue` : "On track", 
            isPositive: stats.receivables.overdueAR === 0 
          }}
          icon={DollarSign}
          colorClass="text-revenue"
          description="accounts receivable"
        />
        <MetricCard
          title="Total Payables"
          value={formatCurrency(stats.payables.totalAP)}
          change={{ 
            value: stats.payables.overdue > 0 ? `${formatCurrency(stats.payables.overdue)} overdue` : "On track", 
            isPositive: stats.payables.overdue === 0 
          }}
          icon={TrendingUp}
          colorClass="text-primary"
          description="accounts payable"
        />
        <MetricCard
          title="Bank Balance"
          value={formatCurrency(stats.banking.totalBalance)}
          change={{ 
            value: `${stats.banking.activeAccounts} accounts`, 
            isPositive: true 
          }}
          icon={Wallet}
          colorClass="text-cash"
          description="total cash"
        />
        <MetricCard
          title="Pipeline Value"
          value={formatCurrency(stats.crm.pipelineValue)}
          change={{ 
            value: `${stats.crm.openOpportunities} open`, 
            isPositive: true 
          }}
          icon={Target}
          colorClass="text-warning"
          description="sales pipeline"
        />
      </div>

      {/* Module Summary Cards */}
      <div className="mt-6">
        <h2 className="mb-4 text-lg font-semibold text-foreground">Modules Overview</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ModuleSummaryCard
            title="CRM"
            href="/crm"
            icon={Target}
            accentColor="text-warning"
            stats={[
              { label: "Open Deals", value: stats.crm.openOpportunities, highlight: true },
              { label: "Won", value: stats.crm.wonOpportunities },
              { label: "Total", value: stats.crm.totalOpportunities },
              { label: "Weighted", value: formatCurrency(stats.crm.weightedValue) },
            ]}
          />
          <ModuleSummaryCard
            title="Order to Cash"
            href="/ar"
            icon={Receipt}
            accentColor="text-revenue"
            stats={[
              { label: "Invoices", value: stats.receivables.invoiceCount },
              { label: "Orders", value: stats.receivables.salesOrderCount },
              { label: "Customers", value: stats.receivables.customerCount },
              { label: "Total AR", value: formatCurrency(stats.receivables.totalAR), highlight: true },
            ]}
          />
          <ModuleSummaryCard
            title="Procure to Pay"
            href="/ap"
            icon={FileText}
            accentColor="text-overdue"
            stats={[
              { label: "Open POs", value: stats.payables.openPOs },
              { label: "Vendors", value: stats.payables.vendorCount },
              { label: "Due Soon", value: formatCurrency(stats.payables.dueThisWeek), highlight: true },
              { label: "Total AP", value: formatCurrency(stats.payables.totalAP) },
            ]}
          />
          <ModuleSummaryCard
            title="Service"
            href="/service"
            icon={Wrench}
            accentColor="text-success"
            stats={[
              { label: "Active Contracts", value: stats.service.activeContracts, highlight: true },
              { label: "Open Calls", value: stats.service.openServiceCalls },
              { label: "Total Contracts", value: stats.service.totalContracts },
              { label: "Total Calls", value: stats.service.totalCalls },
            ]}
          />
          <ModuleSummaryCard
            title="Inventory"
            href="/inventory"
            icon={Package}
            accentColor="text-cash"
            stats={[
              { label: "Products", value: stats.inventory.totalProducts, highlight: true },
              { label: "Warehouses", value: stats.inventory.totalWarehouses },
              { label: "", value: "" },
              { label: "", value: "" },
            ]}
          />
          <ModuleSummaryCard
            title="Production"
            href="/production"
            icon={Factory}
            accentColor="text-primary"
            stats={[
              { label: "Active Orders", value: stats.production.activeOrders, highlight: true },
              { label: "Completed", value: stats.production.completedOrders },
              { label: "Total Orders", value: stats.production.totalOrders },
              { label: "", value: "" },
            ]}
          />
          <ModuleSummaryCard
            title="Banking"
            href="/banking"
            icon={Building2}
            accentColor="text-cash"
            stats={[
              { label: "Total Balance", value: formatCurrency(stats.banking.totalBalance), highlight: true },
              { label: "Accounts", value: stats.banking.activeAccounts },
              { label: "", value: "" },
              { label: "", value: "" },
            ]}
          />
          <ModuleSummaryCard
            title="HR & Payroll"
            href="/hr"
            icon={Users}
            accentColor="text-primary"
            stats={[
              { label: "Active Staff", value: stats.hr.activeEmployees, highlight: true },
              { label: "Departments", value: stats.hr.totalDepartments },
              { label: "Total Employees", value: stats.hr.totalEmployees },
              { label: "Monthly Payroll", value: formatCurrency(stats.hr.monthlyPayroll) },
            ]}
          />
          <ModuleSummaryCard
            title="Tax Management"
            href="/tax"
            icon={Calculator}
            accentColor="text-overdue"
            stats={[
              { label: "Net Payable", value: formatCurrency(stats.tax.netPayable), highlight: true },
              { label: "Sales Tax", value: formatCurrency(stats.tax.salesTax) },
              { label: "Purchase Tax", value: formatCurrency(stats.tax.purchaseTax) },
              { label: "Pending Filings", value: stats.tax.pendingFilings },
            ]}
          />
          <ModuleSummaryCard
            title="Multi-Currency"
            href="/currency"
            icon={Coins}
            accentColor="text-warning"
            stats={[
              { label: "Currencies", value: stats.currency.activeCurrencies, highlight: true },
              { label: "Exchange Rates", value: stats.currency.rateCount },
              { label: "FX Gain/Loss", value: formatCurrency(stats.currency.totalGainLoss) },
              { label: "", value: "" },
            ]}
          />
          <ModuleSummaryCard
            title="Controlling"
            href="/controlling"
            icon={PieChart}
            accentColor="text-primary"
            stats={[
              { label: "Budgets", value: stats.controlling.approvedBudgets },
              { label: "Cost Centers", value: stats.controlling.activeCostCenters },
              { label: "Budget Total", value: formatCurrency(stats.controlling.totalBudgetAmount), highlight: true },
              { label: "", value: "" },
            ]}
          />
        </div>
      </div>

      {/* Charts Row */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <RevenueChart />
        <ARAgingChart />
      </div>

      {/* Bottom Row */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <CloseStatusCard />
        <RecentActivity />
        <QuickActions />
      </div>
    </AppLayout>
  );
};

export default Index;
