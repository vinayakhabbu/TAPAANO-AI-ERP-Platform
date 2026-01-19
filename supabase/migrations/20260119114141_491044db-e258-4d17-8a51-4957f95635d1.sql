-- Fix the SECURITY DEFINER view issue by converting to a regular view
-- Drop the problematic view
DROP VIEW IF EXISTS public.organizations_public;

-- Create a regular view without SECURITY DEFINER
-- This view relies on RLS of the underlying table
CREATE VIEW public.organizations_safe AS
SELECT id, name, created_at, updated_at
FROM public.organizations;

-- Grant access to the view  
GRANT SELECT ON public.organizations_safe TO authenticated;

-- The RLS policy on organizations table will filter the results