-- Add role-based RLS policies for sensitive tables

-- 1. Bank Accounts - Restrict to admin and finance roles
DROP POLICY IF EXISTS "Users can manage bank accounts in their org" ON bank_accounts;

CREATE POLICY "Admins can manage bank accounts"
ON bank_accounts
FOR ALL
TO authenticated
USING (
  org_id = get_user_org_id() 
  AND (
    has_role(auth.uid(), 'admin') 
    OR has_role(auth.uid(), 'moderator')
  )
)
WITH CHECK (
  org_id = get_user_org_id() 
  AND (
    has_role(auth.uid(), 'admin') 
    OR has_role(auth.uid(), 'moderator')
  )
);

-- 2. Positive Pay Checks - Restrict to admin/moderator (finance team)
DROP POLICY IF EXISTS "Users can manage positive pay checks in their org" ON positive_pay_checks;

CREATE POLICY "Finance can manage positive pay checks"
ON positive_pay_checks
FOR ALL
TO authenticated
USING (
  org_id = get_user_org_id() 
  AND (
    has_role(auth.uid(), 'admin') 
    OR has_role(auth.uid(), 'moderator')
  )
)
WITH CHECK (
  org_id = get_user_org_id() 
  AND (
    has_role(auth.uid(), 'admin') 
    OR has_role(auth.uid(), 'moderator')
  )
);

-- 3. Bank Transactions - Restrict to admin/moderator
DROP POLICY IF EXISTS "Users can manage bank transactions in their org" ON bank_transactions;

CREATE POLICY "Finance can manage bank transactions"
ON bank_transactions
FOR ALL
TO authenticated
USING (
  org_id = get_user_org_id() 
  AND (
    has_role(auth.uid(), 'admin') 
    OR has_role(auth.uid(), 'moderator')
  )
)
WITH CHECK (
  org_id = get_user_org_id() 
  AND (
    has_role(auth.uid(), 'admin') 
    OR has_role(auth.uid(), 'moderator')
  )
);

-- 4. Payment Runs - Restrict to admin/moderator
DROP POLICY IF EXISTS "Users can manage payment runs in their org" ON payment_runs;

CREATE POLICY "Finance can manage payment runs"
ON payment_runs
FOR ALL
TO authenticated
USING (
  org_id = get_user_org_id() 
  AND (
    has_role(auth.uid(), 'admin') 
    OR has_role(auth.uid(), 'moderator')
  )
)
WITH CHECK (
  org_id = get_user_org_id() 
  AND (
    has_role(auth.uid(), 'admin') 
    OR has_role(auth.uid(), 'moderator')
  )
);

-- 5. Bills - Allow read for all org users, but restrict write to admin/moderator
DROP POLICY IF EXISTS "Users can manage bills in their org" ON bills;

CREATE POLICY "Users can view bills in their org"
ON bills
FOR SELECT
TO authenticated
USING (org_id = get_user_org_id());

CREATE POLICY "Finance can manage bills"
ON bills
FOR ALL
TO authenticated
USING (
  org_id = get_user_org_id() 
  AND (
    has_role(auth.uid(), 'admin') 
    OR has_role(auth.uid(), 'moderator')
  )
)
WITH CHECK (
  org_id = get_user_org_id() 
  AND (
    has_role(auth.uid(), 'admin') 
    OR has_role(auth.uid(), 'moderator')
  )
);

-- 6. Invoices - Allow read for all org users, restrict write to admin/moderator
DROP POLICY IF EXISTS "Users can manage invoices in their org" ON invoices;

CREATE POLICY "Users can view invoices in their org"
ON invoices
FOR SELECT
TO authenticated
USING (org_id = get_user_org_id());

CREATE POLICY "Finance can manage invoices"
ON invoices
FOR ALL
TO authenticated
USING (
  org_id = get_user_org_id() 
  AND (
    has_role(auth.uid(), 'admin') 
    OR has_role(auth.uid(), 'moderator')
  )
)
WITH CHECK (
  org_id = get_user_org_id() 
  AND (
    has_role(auth.uid(), 'admin') 
    OR has_role(auth.uid(), 'moderator')
  )
);