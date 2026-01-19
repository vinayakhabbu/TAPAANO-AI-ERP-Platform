-- =====================================================
-- SECURITY FIX: Tax Tables RLS Policies
-- Drop overly permissive policies and add org-scoped ones
-- =====================================================

-- Drop existing overly permissive policies for tax_jurisdictions
DROP POLICY IF EXISTS "Users can view tax jurisdictions" ON tax_jurisdictions;
DROP POLICY IF EXISTS "Users can manage tax jurisdictions" ON tax_jurisdictions;

-- Drop existing overly permissive policies for tax_codes
DROP POLICY IF EXISTS "Users can view tax codes" ON tax_codes;
DROP POLICY IF EXISTS "Users can manage tax codes" ON tax_codes;

-- Drop existing overly permissive policies for tax_rates
DROP POLICY IF EXISTS "Users can view tax rates" ON tax_rates;
DROP POLICY IF EXISTS "Users can manage tax rates" ON tax_rates;

-- Drop existing overly permissive policies for tax_transactions
DROP POLICY IF EXISTS "Users can view tax transactions" ON tax_transactions;
DROP POLICY IF EXISTS "Users can manage tax transactions" ON tax_transactions;

-- Drop existing overly permissive policies for tax_filing_periods
DROP POLICY IF EXISTS "Users can view tax filing periods" ON tax_filing_periods;
DROP POLICY IF EXISTS "Users can manage tax filing periods" ON tax_filing_periods;

-- =====================================================
-- Create proper org-scoped RLS policies for tax tables
-- =====================================================

-- tax_jurisdictions: Org users can view, admins/moderators can manage
CREATE POLICY "Users can view their org tax jurisdictions"
ON tax_jurisdictions FOR SELECT
USING (org_id = get_user_org_id());

CREATE POLICY "Admins can insert tax jurisdictions"
ON tax_jurisdictions FOR INSERT
WITH CHECK (
  org_id = get_user_org_id() AND 
  (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'moderator'))
);

CREATE POLICY "Admins can update tax jurisdictions"
ON tax_jurisdictions FOR UPDATE
USING (
  org_id = get_user_org_id() AND 
  (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'moderator'))
);

CREATE POLICY "Admins can delete tax jurisdictions"
ON tax_jurisdictions FOR DELETE
USING (
  org_id = get_user_org_id() AND 
  (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'moderator'))
);

-- tax_codes: Org users can view, admins/moderators can manage
CREATE POLICY "Users can view their org tax codes"
ON tax_codes FOR SELECT
USING (org_id = get_user_org_id());

CREATE POLICY "Admins can insert tax codes"
ON tax_codes FOR INSERT
WITH CHECK (
  org_id = get_user_org_id() AND 
  (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'moderator'))
);

CREATE POLICY "Admins can update tax codes"
ON tax_codes FOR UPDATE
USING (
  org_id = get_user_org_id() AND 
  (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'moderator'))
);

CREATE POLICY "Admins can delete tax codes"
ON tax_codes FOR DELETE
USING (
  org_id = get_user_org_id() AND 
  (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'moderator'))
);

-- tax_rates: Org users can view, admins/moderators can manage
CREATE POLICY "Users can view their org tax rates"
ON tax_rates FOR SELECT
USING (org_id = get_user_org_id());

CREATE POLICY "Admins can insert tax rates"
ON tax_rates FOR INSERT
WITH CHECK (
  org_id = get_user_org_id() AND 
  (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'moderator'))
);

CREATE POLICY "Admins can update tax rates"
ON tax_rates FOR UPDATE
USING (
  org_id = get_user_org_id() AND 
  (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'moderator'))
);

CREATE POLICY "Admins can delete tax rates"
ON tax_rates FOR DELETE
USING (
  org_id = get_user_org_id() AND 
  (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'moderator'))
);

-- tax_transactions: Org users can view, admins/moderators can manage
CREATE POLICY "Users can view their org tax transactions"
ON tax_transactions FOR SELECT
USING (org_id = get_user_org_id());

CREATE POLICY "Admins can insert tax transactions"
ON tax_transactions FOR INSERT
WITH CHECK (
  org_id = get_user_org_id() AND 
  (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'moderator'))
);

CREATE POLICY "Admins can update tax transactions"
ON tax_transactions FOR UPDATE
USING (
  org_id = get_user_org_id() AND 
  (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'moderator'))
);

CREATE POLICY "Admins can delete tax transactions"
ON tax_transactions FOR DELETE
USING (
  org_id = get_user_org_id() AND 
  (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'moderator'))
);

-- tax_filing_periods: Org users can view, admins/moderators can manage
CREATE POLICY "Users can view their org tax filing periods"
ON tax_filing_periods FOR SELECT
USING (org_id = get_user_org_id());

CREATE POLICY "Admins can insert tax filing periods"
ON tax_filing_periods FOR INSERT
WITH CHECK (
  org_id = get_user_org_id() AND 
  (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'moderator'))
);

CREATE POLICY "Admins can update tax filing periods"
ON tax_filing_periods FOR UPDATE
USING (
  org_id = get_user_org_id() AND 
  (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'moderator'))
);

CREATE POLICY "Admins can delete tax filing periods"
ON tax_filing_periods FOR DELETE
USING (
  org_id = get_user_org_id() AND 
  (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'moderator'))
);

-- =====================================================
-- SECURITY FIX: Employees PII Protection
-- Update employees table policies for field-level security
-- Only HR admins/moderators can see sensitive PII fields
-- =====================================================

-- Drop existing employees policies
DROP POLICY IF EXISTS "Users can view employees in their org" ON employees;
DROP POLICY IF EXISTS "Users can create employees in their org" ON employees;
DROP POLICY IF EXISTS "Users can update employees in their org" ON employees;
DROP POLICY IF EXISTS "Users can delete employees in their org" ON employees;

-- Create a view for non-sensitive employee data (all org users)
-- First, let's create stricter RLS policies for the employees table

-- Only HR admins/moderators can view full employee records
CREATE POLICY "HR admins can view all employee data"
ON employees FOR SELECT
USING (
  org_id = get_user_org_id() AND 
  (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'moderator'))
);

-- All org users can view their own employee record
CREATE POLICY "Users can view their own employee record"
ON employees FOR SELECT
USING (
  org_id = get_user_org_id() AND 
  user_id = auth.uid()
);

-- Only HR admins can insert employees
CREATE POLICY "HR admins can insert employees"
ON employees FOR INSERT
WITH CHECK (
  org_id = get_user_org_id() AND 
  (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'moderator'))
);

-- Only HR admins can update employees
CREATE POLICY "HR admins can update employees"
ON employees FOR UPDATE
USING (
  org_id = get_user_org_id() AND 
  (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'moderator'))
);

-- Only HR admins can delete employees
CREATE POLICY "HR admins can delete employees"
ON employees FOR DELETE
USING (
  org_id = get_user_org_id() AND 
  (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'moderator'))
);

-- =====================================================
-- SECURITY FIX: Improve handle_new_user function
-- Add input validation for company_name
-- =====================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_org_id UUID;
  new_entity_id UUID;
  company_name_raw TEXT;
  company_name_clean TEXT;
BEGIN
  -- Extract and sanitize company name from metadata
  company_name_raw := NEW.raw_user_meta_data->>'company_name';
  
  -- Sanitize: Remove special characters, limit length
  company_name_clean := COALESCE(
    LEFT(
      TRIM(REGEXP_REPLACE(company_name_raw, '[^a-zA-Z0-9 \-_'''']', '', 'g')),
      100
    ),
    NEW.email || '''s Organization'
  );
  
  -- Ensure non-empty name
  IF company_name_clean = '' OR company_name_clean IS NULL THEN
    company_name_clean := NEW.email || '''s Organization';
  END IF;

  -- Create a new organization for the user with sanitized name
  INSERT INTO public.organizations (name)
  VALUES (company_name_clean)
  RETURNING id INTO new_org_id;

  -- Create a default entity for the organization
  INSERT INTO public.entities (org_id, name, code, is_default)
  VALUES (new_org_id, 'Main Entity', 'MAIN', true)
  RETURNING id INTO new_entity_id;

  -- Create the user's profile
  INSERT INTO public.profiles (id, org_id, email, display_name)
  VALUES (
    NEW.id,
    new_org_id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  );

  -- Assign admin role to the new user
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'admin');

  RETURN NEW;
END;
$$;