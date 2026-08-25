-- Recovery containment for tenant identity and role authorization.
-- Existing membership is preserved only when it is unambiguous. Self-service
-- onboarding and role administration remain unavailable until an audited,
-- tenant-bound workflow exists.

BEGIN;

LOCK TABLE public.profiles, public.user_roles IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.profiles profile
    LEFT JOIN public.organizations organization ON organization.id = profile.org_id
    WHERE profile.org_id IS NULL
       OR organization.id IS NULL
       OR profile.role IS NULL
       OR profile.role NOT IN ('admin', 'moderator', 'user', 'viewer')
       OR (profile.display_name IS NOT NULL AND (
         btrim(profile.display_name) = '' OR profile.display_name ~ '[[:cntrl:]]'
       ))
       OR profile.updated_at < profile.created_at
  ) THEN
    RAISE EXCEPTION 'identity authorization preflight: invalid profile membership';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_roles assigned_role
    LEFT JOIN public.profiles profile ON profile.id = assigned_role.user_id
    WHERE profile.id IS NULL OR profile.role::text IS DISTINCT FROM assigned_role.role::text
  ) OR EXISTS (
    SELECT profile.id
    FROM public.profiles profile
    LEFT JOIN public.user_roles assigned_role ON assigned_role.user_id = profile.id
    GROUP BY profile.id
    HAVING count(assigned_role.id) <> 1
  ) THEN
    RAISE EXCEPTION 'identity authorization preflight: ambiguous or mismatched role assignment';
  END IF;
END;
$$;

DO $$
DECLARE
  role_type text;
BEGIN
  SELECT type_info.typname INTO role_type
  FROM pg_attribute attribute_info
  JOIN pg_class relation ON relation.oid = attribute_info.attrelid
  JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
  JOIN pg_type type_info ON type_info.oid = attribute_info.atttypid
  WHERE namespace.nspname = 'public' AND relation.relname = 'profiles'
    AND attribute_info.attname = 'role' AND NOT attribute_info.attisdropped;

  IF role_type IS DISTINCT FROM 'app_role' THEN
    ALTER TABLE public.profiles ALTER COLUMN role DROP DEFAULT;
    ALTER TABLE public.profiles ALTER COLUMN role TYPE public.app_role
      USING role::public.app_role;
    ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'user'::public.app_role;
  END IF;
END;
$$;

ALTER TABLE public.profiles ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.profiles ALTER COLUMN role SET NOT NULL;

ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS org_id uuid;
UPDATE public.user_roles assigned_role
SET org_id = profile.org_id
FROM public.profiles profile
WHERE profile.id = assigned_role.user_id
  AND assigned_role.org_id IS DISTINCT FROM profile.org_id;
ALTER TABLE public.user_roles ALTER COLUMN org_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_org_id_id_identity_uidx
  ON public.profiles (org_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS profiles_org_id_id_role_identity_uidx
  ON public.profiles (org_id, id, role);
CREATE UNIQUE INDEX IF NOT EXISTS user_roles_user_id_identity_uidx
  ON public.user_roles (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS user_roles_org_id_user_id_identity_uidx
  ON public.user_roles (org_id, user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_roles_profile_identity_fkey'
  ) THEN
    ALTER TABLE public.user_roles
      ADD CONSTRAINT user_roles_profile_identity_fkey
      FOREIGN KEY (org_id, user_id, role)
      REFERENCES public.profiles (org_id, id, role);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_identity_profile_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'DELETE') THEN
    RAISE EXCEPTION 'identity membership is immutable; controlled onboarding is unavailable';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.org_id IS DISTINCT FROM OLD.org_id
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'identity membership is immutable; controlled onboarding is unavailable';
  END IF;
  IF NEW.display_name IS NOT NULL AND (
    btrim(NEW.display_name) = '' OR NEW.display_name ~ '[[:cntrl:]]'
  ) THEN
    RAISE EXCEPTION 'display name must be non-empty and contain no control characters';
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_identity_membership_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'identity membership is immutable; controlled onboarding is unavailable';
END;
$$;

DO $$
DECLARE
  target_table text;
  trigger_record record;
  policy_record record;
  column_record record;
  role_name text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY['profiles', 'user_roles'] LOOP
    FOR trigger_record IN
      SELECT trigger_info.tgname
      FROM pg_trigger trigger_info
      JOIN pg_class relation ON relation.oid = trigger_info.tgrelid
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public' AND relation.relname = target_table
        AND NOT trigger_info.tgisinternal
    LOOP
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', trigger_record.tgname, target_table);
    END LOOP;

    IF target_table = 'profiles' THEN
      EXECUTE 'CREATE TRIGGER guard_identity_profile_write '
        'BEFORE INSERT OR UPDATE OR DELETE ON public.profiles '
        'FOR EACH ROW EXECUTE FUNCTION public.guard_identity_profile_write()';
    ELSE
      EXECUTE 'CREATE TRIGGER guard_identity_role_write '
        'BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles '
        'FOR EACH ROW EXECUTE FUNCTION public.guard_identity_membership_write()';
    END IF;
    EXECUTE format(
      'CREATE TRIGGER guard_identity_truncate BEFORE TRUNCATE ON public.%I '
      'FOR EACH STATEMENT EXECUTE FUNCTION public.guard_identity_membership_write()',
      target_table
    );

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target_table);
    FOR policy_record IN
      SELECT policy_info.policyname
      FROM pg_policies policy_info
      WHERE policy_info.schemaname = 'public' AND policy_info.tablename = target_table
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_record.policyname, target_table);
    END LOOP;

    EXECUTE format(
      'REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated, service_role',
      target_table
    );
    FOR column_record IN
      SELECT column_info.column_name
      FROM information_schema.columns column_info
      WHERE column_info.table_schema = 'public' AND column_info.table_name = target_table
    LOOP
      EXECUTE format(
        'REVOKE ALL PRIVILEGES (%I) ON TABLE public.%I FROM PUBLIC',
        column_record.column_name, target_table
      );
      FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
        EXECUTE format(
          'REVOKE ALL PRIVILEGES (%I) ON TABLE public.%I FROM %I',
          column_record.column_name, target_table, role_name
        );
      END LOOP;
    END LOOP;

    IF EXISTS (
      SELECT 1 FROM pg_publication_tables publication_info
      WHERE publication_info.pubname = 'supabase_realtime'
        AND publication_info.schemaname = 'public'
        AND publication_info.tablename = target_table
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', target_table);
    END IF;
  END LOOP;
END;
$$;

CREATE POLICY profiles_self_read ON public.profiles
  FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY profiles_self_display_name_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
CREATE POLICY user_roles_self_read ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

GRANT SELECT ON TABLE public.profiles, public.user_roles TO authenticated;
GRANT UPDATE (display_name) ON TABLE public.profiles TO authenticated;

DO $$
DECLARE
  function_record record;
BEGIN
  FOR function_record IN
    SELECT namespace.nspname, procedure_info.proname,
      pg_get_function_identity_arguments(procedure_info.oid) AS identity_arguments
    FROM pg_proc procedure_info
    JOIN pg_namespace namespace ON namespace.oid = procedure_info.pronamespace
    WHERE namespace.nspname = 'public' AND (
      (procedure_info.proname = 'has_role'
        AND oidvectortypes(procedure_info.proargtypes) <> 'uuid, app_role')
      OR (procedure_info.proname = 'get_user_role'
        AND oidvectortypes(procedure_info.proargtypes) <> 'uuid')
      OR (procedure_info.proname = 'assert_accounting_actor'
        AND oidvectortypes(procedure_info.proargtypes) <> 'uuid')
    )
  LOOP
    EXECUTE format(
      'DROP FUNCTION %I.%I(%s)',
      function_record.nspname,
      function_record.proname,
      function_record.identity_arguments
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT profile.org_id
  FROM public.profiles profile
  WHERE profile.id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT _user_id = auth.uid() AND EXISTS (
    SELECT 1
    FROM public.user_roles assigned_role
    JOIN public.profiles profile
      ON (profile.org_id, profile.id, profile.role) =
         (assigned_role.org_id, assigned_role.user_id, assigned_role.role)
    WHERE assigned_role.user_id = _user_id AND assigned_role.role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT assigned_role.role
  FROM public.user_roles assigned_role
  JOIN public.profiles profile
    ON (profile.org_id, profile.id, profile.role) =
       (assigned_role.org_id, assigned_role.user_id, assigned_role.role)
  WHERE _user_id = auth.uid() AND assigned_role.user_id = _user_id
$$;

CREATE OR REPLACE FUNCTION public.assert_accounting_actor(p_org_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_org uuid;
  v_actor_role public.app_role;
BEGIN
  SELECT profile.org_id, assigned_role.role
    INTO v_actor_org, v_actor_role
  FROM public.profiles profile
  JOIN public.user_roles assigned_role
    ON (assigned_role.org_id, assigned_role.user_id, assigned_role.role) =
       (profile.org_id, profile.id, profile.role)
  WHERE profile.id = v_actor;

  IF v_actor IS NULL OR v_actor_org IS DISTINCT FROM p_org_id THEN
    RAISE EXCEPTION 'accounting actor is not authorized for this organization';
  END IF;
  IF v_actor_role NOT IN ('admin', 'moderator') THEN
    RAISE EXCEPTION 'accounting workflow requires admin or moderator';
  END IF;
  RETURN v_actor;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  RAISE EXCEPTION 'self-service registration is unavailable; use a controlled onboarding workflow';
END;
$$;

REVOKE ALL ON FUNCTION public.get_user_org_id() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_user_role(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assert_accounting_actor(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_org_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated;

COMMIT;
