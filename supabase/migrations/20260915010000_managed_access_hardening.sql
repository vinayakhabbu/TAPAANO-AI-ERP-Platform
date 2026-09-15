-- Views use their owner's privileges by default, even when their base table has
-- RLS. Preserve the existing safe-column projection but apply the caller's RLS.
ALTER VIEW public.organizations_safe SET (security_invoker = true);
REVOKE ALL ON TABLE public.organizations_safe FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.organizations_safe TO authenticated, service_role;

-- Timestamp maintenance needs no elevated privileges. Existing table triggers
-- continue to run; API roles must not be able to invoke this helper directly.
ALTER FUNCTION public.update_updated_at() SECURITY INVOKER;
ALTER FUNCTION public.update_updated_at() SET search_path = pg_catalog;
REVOKE ALL ON FUNCTION public.update_updated_at() FROM PUBLIC, anon, authenticated, service_role;

-- New hosted projects can contain this Supabase-provided event trigger helper.
-- Keep its DDL behavior and owner intact, but remove unnecessary API grants.
-- The local CLI stack and older managed projects may not have this function.
DO $$
BEGIN
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated, service_role;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
