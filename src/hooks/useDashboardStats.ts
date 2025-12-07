import { useReceivables } from "./useReceivables";
import { usePayablesSummary } from "./usePayables";
import { useOpportunityStats } from "./useOpportunities";
import { useServiceContracts, useServiceCalls } from "./useServiceManagement";
import { useProducts, useWarehouses } from "./useInventory";
import { useProductionOrders } from "./useProduction";
import { useBankAccounts } from "./useBanking";
import { useControlling } from "./useControlling";

export function useDashboardStats() {
  const { stats: arStats, isLoading: arLoading } = useReceivables();
  const apStats = usePayablesSummary();
  const opportunityStats = useOpportunityStats();
  
  const { data: serviceContracts, isLoading: isLoadingContracts } = useServiceContracts();
  const { data: serviceCalls, isLoading: isLoadingCalls } = useServiceCalls();
  
  const { data: products, isLoading: isLoadingProducts } = useProducts();
  const { data: warehouses, isLoading: isLoadingWarehouses } = useWarehouses();
  
  const { data: productionOrders, isLoading: isLoadingOrders } = useProductionOrders();
  
  const { data: bankAccounts, isLoading: isLoadingAccounts } = useBankAccounts();
  
  const { 
    budgets, 
    costCenters, 
    budgetsLoading, 
    costCentersLoading 
  } = useControlling();

  // Calculate service stats
  const activeContracts = serviceContracts?.filter(c => c.status === 'active').length || 0;
  const openServiceCalls = serviceCalls?.filter(c => c.status === 'open' || c.status === 'in_progress').length || 0;

  // Calculate inventory stats
  const totalProducts = products?.length || 0;
  const totalWarehouses = warehouses?.length || 0;

  // Calculate production stats
  const activeOrders = productionOrders?.filter(o => 
    o.status === 'released' || o.status === 'in_progress'
  ).length || 0;
  const completedOrders = productionOrders?.filter(o => o.status === 'completed').length || 0;

  // Calculate banking stats
  const totalBankBalance = bankAccounts?.reduce((sum, acc) => sum + Number(acc.current_balance || 0), 0) || 0;
  const activeBankAccounts = bankAccounts?.filter(acc => acc.is_active).length || 0;

  // Calculate controlling stats
  const approvedBudgets = budgets?.filter(b => b.status === 'approved').length || 0;
  const totalBudgetAmount = budgets?.filter(b => b.status === 'approved')
    .reduce((sum, b) => sum + Number(b.total_amount || 0), 0) || 0;
  const activeCostCenters = costCenters?.filter(cc => cc.is_active).length || 0;

  const isLoading = arLoading || apStats.isLoading || isLoadingContracts || isLoadingCalls || 
    isLoadingProducts || isLoadingWarehouses || isLoadingOrders || 
    isLoadingAccounts || budgetsLoading || costCentersLoading;

  return {
    // CRM / Sales
    crm: {
      totalOpportunities: opportunityStats.total,
      openOpportunities: opportunityStats.open,
      wonOpportunities: opportunityStats.won,
      pipelineValue: opportunityStats.totalValue,
      weightedValue: opportunityStats.weightedValue,
    },
    // Receivables
    receivables: {
      totalAR: arStats.totalAR,
      overdueAR: arStats.overdueAR,
      customerCount: arStats.customerCount,
      invoiceCount: arStats.invoiceCount,
      salesOrderCount: arStats.salesOrderCount,
    },
    // Payables
    payables: {
      totalAP: apStats.totalAP || 0,
      dueThisWeek: apStats.dueThisWeek || 0,
      overdue: apStats.overdue || 0,
      vendorCount: apStats.vendorCount || 0,
      openPOs: apStats.openPOs || 0,
    },
    // Service Management
    service: {
      activeContracts,
      openServiceCalls,
      totalContracts: serviceContracts?.length || 0,
      totalCalls: serviceCalls?.length || 0,
    },
    // Inventory
    inventory: {
      totalProducts,
      totalWarehouses,
    },
    // Production
    production: {
      activeOrders,
      completedOrders,
      totalOrders: productionOrders?.length || 0,
    },
    // Banking
    banking: {
      totalBalance: totalBankBalance,
      activeAccounts: activeBankAccounts,
    },
    // Controlling
    controlling: {
      approvedBudgets,
      totalBudgetAmount,
      activeCostCenters,
    },
    isLoading,
  };
}
