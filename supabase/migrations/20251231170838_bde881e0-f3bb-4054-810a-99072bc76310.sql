-- Phase 1: Emergency Contacts, Payslips
-- Phase 2: Attendance, Expenses, Documents

-- Emergency Contacts
CREATE TABLE IF NOT EXISTS public.employee_emergency_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  contact_name TEXT NOT NULL,
  relationship TEXT NOT NULL,
  phone_primary TEXT NOT NULL,
  phone_secondary TEXT,
  email TEXT,
  address TEXT,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_emergency_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view emergency contacts in their org" ON public.employee_emergency_contacts;
DROP POLICY IF EXISTS "Users can manage emergency contacts in their org" ON public.employee_emergency_contacts;

CREATE POLICY "Users can view emergency contacts in their org"
ON public.employee_emergency_contacts FOR SELECT
USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can manage emergency contacts in their org"
ON public.employee_emergency_contacts FOR ALL
USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

-- Payslips
CREATE TABLE IF NOT EXISTS public.payslips (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  payroll_item_id UUID NOT NULL REFERENCES public.payroll_items(id) ON DELETE CASCADE,
  payroll_run_id UUID NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  payslip_number TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  pay_date DATE NOT NULL,
  gross_pay NUMERIC(15,2) NOT NULL,
  total_deductions NUMERIC(15,2) NOT NULL,
  net_pay NUMERIC(15,2) NOT NULL,
  earnings_breakdown JSONB DEFAULT '{}',
  deductions_breakdown JSONB DEFAULT '{}',
  ytd_gross NUMERIC(15,2) DEFAULT 0,
  ytd_deductions NUMERIC(15,2) DEFAULT 0,
  ytd_net NUMERIC(15,2) DEFAULT 0,
  generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.payslips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view payslips in their org" ON public.payslips;
DROP POLICY IF EXISTS "Users can manage payslips in their org" ON public.payslips;

CREATE POLICY "Users can view payslips in their org"
ON public.payslips FOR SELECT
USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can manage payslips in their org"
ON public.payslips FOR ALL
USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

-- Phase 2: Attendance Tracking
CREATE TABLE IF NOT EXISTS public.attendance_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL,
  clock_in TIMESTAMP WITH TIME ZONE,
  clock_out TIMESTAMP WITH TIME ZONE,
  break_minutes INTEGER DEFAULT 0,
  total_hours NUMERIC(5,2),
  overtime_hours NUMERIC(5,2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'present',
  notes TEXT,
  approved_by UUID REFERENCES public.employees(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view attendance in their org" ON public.attendance_records;
DROP POLICY IF EXISTS "Users can manage attendance in their org" ON public.attendance_records;

CREATE POLICY "Users can view attendance in their org"
ON public.attendance_records FOR SELECT
USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can manage attendance in their org"
ON public.attendance_records FOR ALL
USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

-- Expense Reimbursements
CREATE TABLE IF NOT EXISTS public.expense_claims (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  claim_number TEXT NOT NULL,
  claim_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  amount NUMERIC(15,2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  receipt_url TEXT,
  status TEXT NOT NULL DEFAULT 'submitted',
  approved_by UUID REFERENCES public.employees(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  paid_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.expense_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view expenses in their org" ON public.expense_claims;
DROP POLICY IF EXISTS "Users can manage expenses in their org" ON public.expense_claims;

CREATE POLICY "Users can view expenses in their org"
ON public.expense_claims FOR SELECT
USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can manage expenses in their org"
ON public.expense_claims FOR ALL
USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

-- Employee Documents
CREATE TABLE IF NOT EXISTS public.employee_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  document_name TEXT NOT NULL,
  file_url TEXT,
  file_size INTEGER,
  mime_type TEXT,
  expiry_date DATE,
  notes TEXT,
  uploaded_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view documents in their org" ON public.employee_documents;
DROP POLICY IF EXISTS "Users can manage documents in their org" ON public.employee_documents;

CREATE POLICY "Users can view documents in their org"
ON public.employee_documents FOR SELECT
USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can manage documents in their org"
ON public.employee_documents FOR ALL
USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_emergency_contacts_employee ON public.employee_emergency_contacts(employee_id);
CREATE INDEX IF NOT EXISTS idx_payslips_employee ON public.payslips(employee_id);
CREATE INDEX IF NOT EXISTS idx_payslips_payroll_run ON public.payslips(payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_attendance_employee_date ON public.attendance_records(employee_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_expense_claims_employee ON public.expense_claims(employee_id);
CREATE INDEX IF NOT EXISTS idx_expense_claims_status ON public.expense_claims(status);
CREATE INDEX IF NOT EXISTS idx_employee_documents_employee ON public.employee_documents(employee_id);