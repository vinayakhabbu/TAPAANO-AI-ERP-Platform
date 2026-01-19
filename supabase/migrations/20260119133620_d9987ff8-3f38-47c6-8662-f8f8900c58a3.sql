-- Create table for Decision Desk tab configurations
CREATE TABLE public.decision_desk_tabs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tab_key TEXT NOT NULL,
  tab_label TEXT NOT NULL,
  icon_name TEXT NOT NULL,
  is_visible BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, tab_key)
);

-- Enable RLS
ALTER TABLE public.decision_desk_tabs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their org's tab configs
CREATE POLICY "Users can view their org's tab configs" ON decision_desk_tabs
FOR SELECT
USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- Policy: Admins can manage their org's tab configs
CREATE POLICY "Admins can manage their org's tab configs" ON decision_desk_tabs
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

-- Create trigger for updated_at
CREATE TRIGGER update_decision_desk_tabs_updated_at
BEFORE UPDATE ON decision_desk_tabs
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Insert default tab configurations for existing organizations
INSERT INTO decision_desk_tabs (org_id, tab_key, tab_label, icon_name, is_visible, display_order)
SELECT 
  o.id,
  t.tab_key,
  t.tab_label,
  t.icon_name,
  t.is_visible,
  t.display_order
FROM organizations o
CROSS JOIN (
  VALUES 
    ('decisions', 'Decision Log', 'FileText', true, 1),
    ('precedents', 'Precedents', 'Scale', true, 2),
    ('agent-runs', 'Agent Runs', 'Bot', true, 3),
    ('entity-graph', 'Entity Graph', 'Network', true, 4),
    ('autonomous', 'Autonomous Approver', 'Zap', true, 5),
    ('anomalies', 'Anomalies', 'AlertTriangle', true, 6),
    ('analytics', 'Analytics', 'BarChart3', true, 7)
) AS t(tab_key, tab_label, icon_name, is_visible, display_order);