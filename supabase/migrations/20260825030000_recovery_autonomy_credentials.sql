-- Recovery containment: browser credential storage and autonomous-approval
-- configuration are disabled. Existing secret/configuration rows are preserved;
-- no destructive cleanup occurs in this migration.

BEGIN;

LOCK TABLE public.organizations, public.auto_approval_configs
  IN SHARE ROW EXCLUSIVE MODE;

CREATE OR REPLACE FUNCTION public.guard_organization_openai_secret()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.openai_api_key IS NOT NULL THEN
    RAISE EXCEPTION 'browser-managed OpenAI credentials are unavailable';
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.openai_api_key IS DISTINCT FROM NEW.openai_api_key THEN
    RAISE EXCEPTION 'legacy OpenAI credentials are preserved but immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_organization_openai_secret ON public.organizations;
CREATE TRIGGER guard_organization_openai_secret
  BEFORE INSERT OR UPDATE OF openai_api_key ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.guard_organization_openai_secret();

CREATE OR REPLACE FUNCTION public.guard_disabled_autonomy_configuration()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'autonomous approval configuration is unavailable and immutable';
END;
$$;

DROP TRIGGER IF EXISTS guard_auto_approval_configs_write ON public.auto_approval_configs;
CREATE TRIGGER guard_auto_approval_configs_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.auto_approval_configs
  FOR EACH ROW EXECUTE FUNCTION public.guard_disabled_autonomy_configuration();
DROP TRIGGER IF EXISTS guard_auto_approval_configs_truncate ON public.auto_approval_configs;
CREATE TRIGGER guard_auto_approval_configs_truncate
  BEFORE TRUNCATE ON public.auto_approval_configs
  FOR EACH STATEMENT EXECUTE FUNCTION public.guard_disabled_autonomy_configuration();

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auto_approval_configs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  policy_record record;
BEGIN
  FOR policy_record IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'auto_approval_configs'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.auto_approval_configs', policy_record.policyname);
  END LOOP;
END;
$$;

REVOKE ALL ON TABLE public.organizations, public.auto_approval_configs
  FROM PUBLIC, anon, authenticated, service_role;

DO $$
DECLARE
  column_record record;
  role_name text;
BEGIN
  FOR column_record IN
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('organizations', 'auto_approval_configs')
  LOOP
    EXECUTE format(
      'REVOKE ALL PRIVILEGES (%I) ON TABLE public.%I FROM PUBLIC',
      column_record.column_name, column_record.table_name
    );
    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role']
    LOOP
      EXECUTE format(
        'REVOKE ALL PRIVILEGES (%I) ON TABLE public.%I FROM %I',
        column_record.column_name, column_record.table_name, role_name
      );
    END LOOP;
  END LOOP;
END;
$$;

GRANT SELECT (id, name, created_at, updated_at)
  ON TABLE public.organizations TO authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'auto_approval_configs'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.auto_approval_configs;
  END IF;
END;
$$;

COMMIT;
