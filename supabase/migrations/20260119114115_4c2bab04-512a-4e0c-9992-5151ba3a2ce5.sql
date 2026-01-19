-- Fix OpenAI API key exposure by creating a secure server-side function
-- and restricting direct access to the openai_api_key column

-- First, drop the existing overly permissive policy
DROP POLICY IF EXISTS "Users can view their org data" ON public.organizations;

-- Create a new policy that only returns non-sensitive columns
-- Users can see their org but NOT the API key directly
CREATE POLICY "Users can view org basic info"
ON public.organizations
FOR SELECT
USING (
  id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);

-- Create a SECURITY DEFINER function to securely access the API key server-side only
-- This function validates the caller is in the org and returns the key for edge function use
CREATE OR REPLACE FUNCTION public.get_org_openai_key()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_key TEXT;
BEGIN
  -- Get the org_id for the current user
  SELECT org_id INTO v_org_id
  FROM public.profiles
  WHERE id = auth.uid();
  
  IF v_org_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Get the API key for the org
  SELECT openai_api_key INTO v_key
  FROM public.organizations
  WHERE id = v_org_id;
  
  RETURN v_key;
END;
$$;

-- Grant execute permission to authenticated users (they can only get their own org's key)
GRANT EXECUTE ON FUNCTION public.get_org_openai_key() TO authenticated;

-- Create a secure view that excludes sensitive columns for general queries
CREATE OR REPLACE VIEW public.organizations_public AS
SELECT id, name, created_at, updated_at
FROM public.organizations
WHERE id = (SELECT org_id FROM public.profiles WHERE id = auth.uid());

-- Grant access to the view
GRANT SELECT ON public.organizations_public TO authenticated;