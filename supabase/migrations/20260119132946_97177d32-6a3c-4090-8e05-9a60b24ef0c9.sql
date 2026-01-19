-- Drop the existing admin policy
DROP POLICY IF EXISTS "Admins can manage their org's configs" ON auto_approval_configs;

-- Create updated policy that checks both user_roles table AND profiles.role as fallback
CREATE POLICY "Admins can manage their org's configs" ON auto_approval_configs
FOR ALL
USING (
  org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'moderator')
    )
  )
)
WITH CHECK (
  org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'moderator')
    )
  )
);