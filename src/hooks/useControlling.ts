import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

// Types
export interface CostCenter {
  id: string;
  org_id: string;
  code: string;
  name: string;
  description: string | null;
  parent_id: string | null;
  manager_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  org_id: string;
  project_number: string;
  name: string;
  description: string | null;
  cost_center_id: string | null;
  customer_id: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  budget_amount: number;
  actual_cost: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  cost_center?: CostCenter;
}

export interface FixedAsset {
  id: string;
  org_id: string;
  asset_number: string;
  name: string;
  description: string | null;
  category: string;
  acquisition_date: string;
  acquisition_cost: number;
  salvage_value: number;
  useful_life_months: number;
  depreciation_method: string;
  accumulated_depreciation: number;
  book_value: number;
  status: string;
  location: string | null;
  cost_center_id: string | null;
  disposed_date: string | null;
  disposal_amount: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Budget {
  id: string;
  org_id: string;
  entity_id: string;
  budget_number: string;
  name: string;
  fiscal_year: number;
  status: string;
  total_amount: number;
  approved_by: string | null;
  approved_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface BudgetLine {
  id: string;
  budget_id: string;
  account_id: string | null;
  cost_center_id: string | null;
  project_id: string | null;
  period_month: number;
  budgeted_amount: number;
  actual_amount: number;
  variance: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CashFlowForecast {
  id: string;
  org_id: string;
  entity_id: string;
  forecast_date: string;
  category: string;
  description: string | null;
  expected_inflow: number;
  expected_outflow: number;
  actual_inflow: number;
  actual_outflow: number;
  source_type: string | null;
  source_id: string | null;
  confidence_level: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export function useControlling() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const orgId = profile?.org_id;

  // Cost Centers
  const costCentersQuery = useQuery({
    queryKey: ['cost-centers', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cost_centers')
        .select('*')
        .order('code');
      if (error) throw error;
      return data as CostCenter[];
    },
    enabled: !!orgId,
  });

  const createCostCenter = useMutation({
    mutationFn: async (costCenter: Partial<CostCenter>) => {
      const { data, error } = await supabase
        .from('cost_centers')
        .insert({ ...costCenter, org_id: orgId } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cost-centers'] });
      toast.success('Cost center created');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Projects
  const projectsQuery = useQuery({
    queryKey: ['projects', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*, cost_center:cost_centers(*)')
        .order('project_number');
      if (error) throw error;
      return data as Project[];
    },
    enabled: !!orgId,
  });

  const createProject = useMutation({
    mutationFn: async (project: Partial<Project>) => {
      const { data, error } = await supabase
        .from('projects')
        .insert({ ...project, org_id: orgId } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Project created');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Fixed Assets
  const fixedAssetsQuery = useQuery({
    queryKey: ['fixed-assets', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fixed_assets')
        .select('*')
        .order('asset_number');
      if (error) throw error;
      return data as FixedAsset[];
    },
    enabled: !!orgId,
  });

  const createFixedAsset = useMutation({
    mutationFn: async (asset: Partial<FixedAsset>) => {
      const { data, error } = await supabase
        .from('fixed_assets')
        .insert({ ...asset, org_id: orgId, book_value: asset.acquisition_cost } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fixed-assets'] });
      toast.success('Fixed asset created');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Budgets
  const budgetsQuery = useQuery({
    queryKey: ['budgets', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('budgets')
        .select('*')
        .order('fiscal_year', { ascending: false });
      if (error) throw error;
      return data as Budget[];
    },
    enabled: !!orgId,
  });

  const createBudget = useMutation({
    mutationFn: async (budget: Partial<Budget>) => {
      const { data, error } = await supabase
        .from('budgets')
        .insert({ ...budget, org_id: orgId } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      toast.success('Budget created');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Cash Flow Forecasts
  const cashFlowForecastsQuery = useQuery({
    queryKey: ['cash-flow-forecasts', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cash_flow_forecasts')
        .select('*')
        .order('forecast_date');
      if (error) throw error;
      return data as CashFlowForecast[];
    },
    enabled: !!orgId,
  });

  const createCashFlowForecast = useMutation({
    mutationFn: async (forecast: Partial<CashFlowForecast>) => {
      const { data, error } = await supabase
        .from('cash_flow_forecasts')
        .insert({ ...forecast, org_id: orgId } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-flow-forecasts'] });
      toast.success('Cash flow forecast created');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return {
    // Cost Centers
    costCenters: costCentersQuery.data || [],
    costCentersLoading: costCentersQuery.isLoading,
    createCostCenter,

    // Projects
    projects: projectsQuery.data || [],
    projectsLoading: projectsQuery.isLoading,
    createProject,

    // Fixed Assets
    fixedAssets: fixedAssetsQuery.data || [],
    fixedAssetsLoading: fixedAssetsQuery.isLoading,
    createFixedAsset,

    // Budgets
    budgets: budgetsQuery.data || [],
    budgetsLoading: budgetsQuery.isLoading,
    createBudget,

    // Cash Flow Forecasts
    cashFlowForecasts: cashFlowForecastsQuery.data || [],
    cashFlowForecastsLoading: cashFlowForecastsQuery.isLoading,
    createCashFlowForecast,
  };
}
