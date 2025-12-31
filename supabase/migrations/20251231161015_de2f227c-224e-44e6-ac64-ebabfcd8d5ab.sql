-- Departments table
CREATE TABLE public.departments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code VARCHAR(20) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  parent_id UUID REFERENCES public.departments(id),
  manager_id UUID,
  cost_center_id UUID REFERENCES public.cost_centers(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(org_id, code)
);

-- Positions/Job titles
CREATE TABLE public.positions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code VARCHAR(20) NOT NULL,
  title VARCHAR(100) NOT NULL,
  description TEXT,
  department_id UUID REFERENCES public.departments(id),
  min_salary NUMERIC(15,2),
  max_salary NUMERIC(15,2),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(org_id, code)
);

-- Employees table
CREATE TABLE public.employees (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_number VARCHAR(20) NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  first_name VARCHAR(50) NOT NULL,
  last_name VARCHAR(50) NOT NULL,
  email VARCHAR(100),
  phone VARCHAR(20),
  date_of_birth DATE,
  hire_date DATE NOT NULL,
  termination_date DATE,
  department_id UUID REFERENCES public.departments(id),
  position_id UUID REFERENCES public.positions(id),
  manager_id UUID REFERENCES public.employees(id),
  employment_type VARCHAR(20) NOT NULL DEFAULT 'full_time',
  employment_status VARCHAR(20) NOT NULL DEFAULT 'active',
  pay_frequency VARCHAR(20) NOT NULL DEFAULT 'monthly',
  base_salary NUMERIC(15,2),
  hourly_rate NUMERIC(10,2),
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  bank_account_number VARCHAR(50),
  bank_routing_number VARCHAR(20),
  tax_id VARCHAR(20),
  address_line1 VARCHAR(100),
  address_line2 VARCHAR(100),
  city VARCHAR(50),
  state_province VARCHAR(50),
  postal_code VARCHAR(20),
  country VARCHAR(50),
  emergency_contact_name VARCHAR(100),
  emergency_contact_phone VARCHAR(20),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(org_id, employee_number)
);

-- Add manager_id FK to departments after employees table exists
ALTER TABLE public.departments 
  ADD CONSTRAINT departments_manager_id_fkey 
  FOREIGN KEY (manager_id) REFERENCES public.employees(id);

-- Deduction/Benefit types
CREATE TABLE public.deduction_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code VARCHAR(20) NOT NULL,
  name VARCHAR(100) NOT NULL,
  category VARCHAR(30) NOT NULL,
  calculation_type VARCHAR(20) NOT NULL DEFAULT 'fixed',
  default_amount NUMERIC(15,2),
  default_percentage NUMERIC(5,2),
  is_pretax BOOLEAN NOT NULL DEFAULT false,
  is_employer_contribution BOOLEAN NOT NULL DEFAULT false,
  gl_account_id UUID REFERENCES public.accounts(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(org_id, code)
);

-- Employee-specific deductions/benefits
CREATE TABLE public.employee_deductions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  deduction_type_id UUID NOT NULL REFERENCES public.deduction_types(id),
  amount NUMERIC(15,2),
  percentage NUMERIC(5,2),
  effective_from DATE NOT NULL,
  effective_to DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Payroll periods
CREATE TABLE public.payroll_periods (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL REFERENCES public.entities(id),
  period_name VARCHAR(50) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  pay_date DATE NOT NULL,
  pay_frequency VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Payroll runs
CREATE TABLE public.payroll_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  payroll_period_id UUID NOT NULL REFERENCES public.payroll_periods(id),
  run_number VARCHAR(20) NOT NULL,
  run_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  total_gross NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_deductions NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_net NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_employer_cost NUMERIC(15,2) NOT NULL DEFAULT 0,
  employee_count INTEGER NOT NULL DEFAULT 0,
  approved_by UUID,
  approved_at TIMESTAMP WITH TIME ZONE,
  posted_by UUID,
  posted_at TIMESTAMP WITH TIME ZONE,
  journal_entry_id UUID REFERENCES public.journal_entries(id),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(org_id, run_number)
);

-- Individual payroll items (one per employee per run)
CREATE TABLE public.payroll_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  payroll_run_id UUID NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id),
  hours_worked NUMERIC(6,2),
  regular_hours NUMERIC(6,2),
  overtime_hours NUMERIC(6,2),
  gross_pay NUMERIC(15,2) NOT NULL DEFAULT 0,
  federal_tax NUMERIC(15,2) NOT NULL DEFAULT 0,
  state_tax NUMERIC(15,2) NOT NULL DEFAULT 0,
  local_tax NUMERIC(15,2) NOT NULL DEFAULT 0,
  social_security NUMERIC(15,2) NOT NULL DEFAULT 0,
  medicare NUMERIC(15,2) NOT NULL DEFAULT 0,
  other_deductions NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_deductions NUMERIC(15,2) NOT NULL DEFAULT 0,
  net_pay NUMERIC(15,2) NOT NULL DEFAULT 0,
  employer_ss NUMERIC(15,2) NOT NULL DEFAULT 0,
  employer_medicare NUMERIC(15,2) NOT NULL DEFAULT 0,
  employer_benefits NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_employer_cost NUMERIC(15,2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Payroll item deduction details
CREATE TABLE public.payroll_item_deductions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  payroll_item_id UUID NOT NULL REFERENCES public.payroll_items(id) ON DELETE CASCADE,
  deduction_type_id UUID NOT NULL REFERENCES public.deduction_types(id),
  employee_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  employer_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Time off types
CREATE TABLE public.time_off_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code VARCHAR(20) NOT NULL,
  name VARCHAR(50) NOT NULL,
  default_days_per_year NUMERIC(5,1) NOT NULL DEFAULT 0,
  is_paid BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(org_id, code)
);

-- Employee time off balances
CREATE TABLE public.time_off_balances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  time_off_type_id UUID NOT NULL REFERENCES public.time_off_types(id),
  year INTEGER NOT NULL,
  accrued_days NUMERIC(5,1) NOT NULL DEFAULT 0,
  used_days NUMERIC(5,1) NOT NULL DEFAULT 0,
  carried_over NUMERIC(5,1) NOT NULL DEFAULT 0,
  adjusted_days NUMERIC(5,1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(employee_id, time_off_type_id, year)
);

-- Time off requests
CREATE TABLE public.time_off_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  time_off_type_id UUID NOT NULL REFERENCES public.time_off_types(id),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days_requested NUMERIC(5,1) NOT NULL,
  reason TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  approved_by UUID REFERENCES public.employees(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deduction_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_item_deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_off_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_off_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_off_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies - using simpler org-based access
CREATE POLICY "Users can view departments in their org" ON public.departments
  FOR SELECT USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert departments in their org" ON public.departments
  FOR INSERT WITH CHECK (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update departments in their org" ON public.departments
  FOR UPDATE USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can delete departments in their org" ON public.departments
  FOR DELETE USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can view positions in their org" ON public.positions
  FOR SELECT USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert positions in their org" ON public.positions
  FOR INSERT WITH CHECK (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update positions in their org" ON public.positions
  FOR UPDATE USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can delete positions in their org" ON public.positions
  FOR DELETE USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can view employees in their org" ON public.employees
  FOR SELECT USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert employees in their org" ON public.employees
  FOR INSERT WITH CHECK (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update employees in their org" ON public.employees
  FOR UPDATE USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can delete employees in their org" ON public.employees
  FOR DELETE USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can view deduction types in their org" ON public.deduction_types
  FOR SELECT USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert deduction types in their org" ON public.deduction_types
  FOR INSERT WITH CHECK (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update deduction types in their org" ON public.deduction_types
  FOR UPDATE USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can delete deduction types in their org" ON public.deduction_types
  FOR DELETE USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can view employee deductions in their org" ON public.employee_deductions
  FOR SELECT USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert employee deductions in their org" ON public.employee_deductions
  FOR INSERT WITH CHECK (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update employee deductions in their org" ON public.employee_deductions
  FOR UPDATE USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can delete employee deductions in their org" ON public.employee_deductions
  FOR DELETE USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can view payroll periods in their org" ON public.payroll_periods
  FOR SELECT USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert payroll periods in their org" ON public.payroll_periods
  FOR INSERT WITH CHECK (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update payroll periods in their org" ON public.payroll_periods
  FOR UPDATE USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can delete payroll periods in their org" ON public.payroll_periods
  FOR DELETE USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can view payroll runs in their org" ON public.payroll_runs
  FOR SELECT USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert payroll runs in their org" ON public.payroll_runs
  FOR INSERT WITH CHECK (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update payroll runs in their org" ON public.payroll_runs
  FOR UPDATE USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can delete payroll runs in their org" ON public.payroll_runs
  FOR DELETE USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can view payroll items in their org" ON public.payroll_items
  FOR SELECT USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert payroll items in their org" ON public.payroll_items
  FOR INSERT WITH CHECK (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update payroll items in their org" ON public.payroll_items
  FOR UPDATE USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can delete payroll items in their org" ON public.payroll_items
  FOR DELETE USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can view payroll item deductions" ON public.payroll_item_deductions
  FOR SELECT USING (payroll_item_id IN (
    SELECT id FROM public.payroll_items WHERE org_id IN (
      SELECT org_id FROM public.profiles WHERE id = auth.uid()
    )
  ));

CREATE POLICY "Users can insert payroll item deductions" ON public.payroll_item_deductions
  FOR INSERT WITH CHECK (payroll_item_id IN (
    SELECT id FROM public.payroll_items WHERE org_id IN (
      SELECT org_id FROM public.profiles WHERE id = auth.uid()
    )
  ));

CREATE POLICY "Users can update payroll item deductions" ON public.payroll_item_deductions
  FOR UPDATE USING (payroll_item_id IN (
    SELECT id FROM public.payroll_items WHERE org_id IN (
      SELECT org_id FROM public.profiles WHERE id = auth.uid()
    )
  ));

CREATE POLICY "Users can delete payroll item deductions" ON public.payroll_item_deductions
  FOR DELETE USING (payroll_item_id IN (
    SELECT id FROM public.payroll_items WHERE org_id IN (
      SELECT org_id FROM public.profiles WHERE id = auth.uid()
    )
  ));

CREATE POLICY "Users can view time off types in their org" ON public.time_off_types
  FOR SELECT USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert time off types in their org" ON public.time_off_types
  FOR INSERT WITH CHECK (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update time off types in their org" ON public.time_off_types
  FOR UPDATE USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can delete time off types in their org" ON public.time_off_types
  FOR DELETE USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can view time off balances in their org" ON public.time_off_balances
  FOR SELECT USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert time off balances in their org" ON public.time_off_balances
  FOR INSERT WITH CHECK (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update time off balances in their org" ON public.time_off_balances
  FOR UPDATE USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can delete time off balances in their org" ON public.time_off_balances
  FOR DELETE USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can view time off requests in their org" ON public.time_off_requests
  FOR SELECT USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert time off requests in their org" ON public.time_off_requests
  FOR INSERT WITH CHECK (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update time off requests in their org" ON public.time_off_requests
  FOR UPDATE USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can delete time off requests in their org" ON public.time_off_requests
  FOR DELETE USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));