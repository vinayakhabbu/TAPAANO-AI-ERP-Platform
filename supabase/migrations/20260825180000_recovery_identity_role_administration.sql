-- Controlled, tenant-bound administration for existing non-admin memberships.
-- This deliberately does not create users, move tenants, or change admin roles.

BEGIN;

CREATE TABLE IF NOT EXISTS public.identity_role_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  target_user_id uuid NOT NULL,
  old_role public.app_role NOT NULL,
  new_role public.app_role NOT NULL,
  reason text NOT NULL,
  idempotency_key text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT identity_role_changes_actor_not_target_check
    CHECK (actor_id <> target_user_id),
  CONSTRAINT identity_role_changes_distinct_roles_check
    CHECK (old_role <> new_role),
  CONSTRAINT identity_role_changes_non_admin_roles_check
    CHECK (old_role <> 'admin'::public.app_role AND new_role <> 'admin'::public.app_role),
  CONSTRAINT identity_role_changes_reason_check
    CHECK (reason = btrim(reason) AND reason <> '' AND length(reason) <= 500
      AND reason !~ '[[:cntrl:]]'),
  CONSTRAINT identity_role_changes_idempotency_key_check
    CHECK (idempotency_key = btrim(idempotency_key) AND idempotency_key <> ''
      AND length(idempotency_key) <= 200 AND idempotency_key !~ '[[:cntrl:]]'),
  CONSTRAINT identity_role_changes_actor_profile_fkey
    FOREIGN KEY (org_id, actor_id) REFERENCES public.profiles (org_id, id),
  CONSTRAINT identity_role_changes_target_profile_fkey
    FOREIGN KEY (org_id, target_user_id) REFERENCES public.profiles (org_id, id),
  CONSTRAINT identity_role_changes_org_idempotency_uidx
    UNIQUE (org_id, idempotency_key)
);

LOCK TABLE public.profiles, public.user_roles,
  public.identity_role_changes IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.identity_role_changes change_record
    LEFT JOIN public.profiles actor
      ON (actor.org_id, actor.id) = (change_record.org_id, change_record.actor_id)
    LEFT JOIN public.profiles target
      ON (target.org_id, target.id) =
         (change_record.org_id, change_record.target_user_id)
    WHERE actor.id IS NULL OR target.id IS NULL
       OR actor.role <> 'admin'::public.app_role
       OR change_record.actor_id = change_record.target_user_id
       OR change_record.old_role = change_record.new_role
       OR change_record.old_role = 'admin'::public.app_role
       OR change_record.new_role = 'admin'::public.app_role
       OR change_record.reason <> btrim(change_record.reason)
       OR change_record.reason = ''
       OR length(change_record.reason) > 500
       OR change_record.reason ~ '[[:cntrl:]]'
       OR change_record.idempotency_key <> btrim(change_record.idempotency_key)
       OR change_record.idempotency_key = ''
       OR length(change_record.idempotency_key) > 200
       OR change_record.idempotency_key ~ '[[:cntrl:]]'
  ) THEN
    RAISE EXCEPTION 'identity role administration preflight: invalid audit history';
  END IF;
END;
$$;

ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_profile_identity_fkey;
ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_profile_identity_fkey
  FOREIGN KEY (org_id, user_id, role)
  REFERENCES public.profiles (org_id, id, role)
  DEFERRABLE INITIALLY IMMEDIATE;

CREATE OR REPLACE FUNCTION public.guard_identity_role_change_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, auth
AS $$
DECLARE
  v_actor_role public.app_role;
  v_target_role public.app_role;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'identity role-change audit is immutable';
  END IF;
  IF current_setting('tapaano.identity_role_write', true) IS DISTINCT FROM 'trusted'
     OR current_setting('tapaano.identity_role_change_id', true)
        IS DISTINCT FROM NEW.id::text
     OR auth.uid() IS DISTINCT FROM NEW.actor_id THEN
    RAISE EXCEPTION 'identity role-change audit is immutable';
  END IF;

  SELECT profile.role INTO v_actor_role
  FROM public.profiles profile
  JOIN public.user_roles assigned_role
    ON (assigned_role.org_id, assigned_role.user_id, assigned_role.role) =
       (profile.org_id, profile.id, profile.role)
  WHERE profile.id = NEW.actor_id AND profile.org_id = NEW.org_id;

  SELECT profile.role INTO v_target_role
  FROM public.profiles profile
  JOIN public.user_roles assigned_role
    ON (assigned_role.org_id, assigned_role.user_id, assigned_role.role) =
       (profile.org_id, profile.id, profile.role)
  WHERE profile.id = NEW.target_user_id AND profile.org_id = NEW.org_id;

  IF v_actor_role IS DISTINCT FROM 'admin'::public.app_role
     OR v_target_role IS DISTINCT FROM NEW.old_role
     OR NEW.actor_id = NEW.target_user_id
     OR NEW.old_role = 'admin'::public.app_role
     OR NEW.new_role = 'admin'::public.app_role
     OR NEW.old_role = NEW.new_role THEN
    RAISE EXCEPTION 'identity role-change evidence is invalid';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_identity_profile_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, auth
AS $$
DECLARE
  v_change_id uuid;
BEGIN
  IF TG_OP IN ('INSERT', 'DELETE') THEN
    RAISE EXCEPTION 'identity membership is immutable; controlled onboarding is unavailable';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.org_id IS DISTINCT FROM OLD.org_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'identity membership is immutable; controlled onboarding is unavailable';
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    BEGIN
      v_change_id := NULLIF(
        current_setting('tapaano.identity_role_change_id', true), ''
      )::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_change_id := NULL;
    END;
    IF current_setting('tapaano.identity_role_write', true) IS DISTINCT FROM 'trusted'
       OR v_change_id IS NULL
       OR NEW.display_name IS DISTINCT FROM OLD.display_name
       OR NOT EXISTS (
         SELECT 1
         FROM public.identity_role_changes change_record
         WHERE change_record.id = v_change_id
           AND change_record.org_id = OLD.org_id
           AND change_record.actor_id = auth.uid()
           AND change_record.target_user_id = OLD.id
           AND change_record.old_role = OLD.role
           AND change_record.new_role = NEW.role
       ) THEN
      RAISE EXCEPTION 'identity membership is immutable; use controlled role administration';
    END IF;
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
SET search_path = public, auth
AS $$
DECLARE
  v_change_id uuid;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'identity membership is immutable; use controlled role administration';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.org_id IS DISTINCT FROM OLD.org_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.role IS NOT DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'identity membership is immutable; use controlled role administration';
  END IF;
  BEGIN
    v_change_id := NULLIF(
      current_setting('tapaano.identity_role_change_id', true), ''
    )::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    v_change_id := NULL;
  END;
  IF current_setting('tapaano.identity_role_write', true) IS DISTINCT FROM 'trusted'
     OR v_change_id IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM public.identity_role_changes change_record
       WHERE change_record.id = v_change_id
         AND change_record.org_id = OLD.org_id
         AND change_record.actor_id = auth.uid()
         AND change_record.target_user_id = OLD.user_id
         AND change_record.old_role = OLD.role
         AND change_record.new_role = NEW.role
     ) THEN
    RAISE EXCEPTION 'identity membership is immutable; use controlled role administration';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  trigger_record record;
BEGIN
  FOR trigger_record IN
    SELECT trigger_info.tgname
    FROM pg_trigger trigger_info
    JOIN pg_class relation ON relation.oid = trigger_info.tgrelid
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = 'identity_role_changes'
      AND NOT trigger_info.tgisinternal
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS %I ON public.identity_role_changes',
      trigger_record.tgname
    );
  END LOOP;

  DROP TRIGGER IF EXISTS guard_identity_profile_write ON public.profiles;
  DROP TRIGGER IF EXISTS guard_identity_truncate ON public.profiles;
  DROP TRIGGER IF EXISTS guard_identity_profile_truncate ON public.profiles;
  DROP TRIGGER IF EXISTS guard_identity_role_write ON public.user_roles;
  DROP TRIGGER IF EXISTS guard_identity_truncate ON public.user_roles;
  DROP TRIGGER IF EXISTS guard_identity_role_truncate ON public.user_roles;

  CREATE TRIGGER guard_identity_profile_write
    BEFORE INSERT OR UPDATE OR DELETE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.guard_identity_profile_write();
  CREATE TRIGGER guard_identity_profile_truncate
    BEFORE TRUNCATE ON public.profiles
    FOR EACH STATEMENT EXECUTE FUNCTION public.guard_identity_membership_write();
  CREATE TRIGGER guard_identity_role_write
    BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
    FOR EACH ROW EXECUTE FUNCTION public.guard_identity_membership_write();
  CREATE TRIGGER guard_identity_role_truncate
    BEFORE TRUNCATE ON public.user_roles
    FOR EACH STATEMENT EXECUTE FUNCTION public.guard_identity_membership_write();
  CREATE TRIGGER guard_identity_role_change_write
    BEFORE INSERT OR UPDATE OR DELETE ON public.identity_role_changes
    FOR EACH ROW EXECUTE FUNCTION public.guard_identity_role_change_write();
  CREATE TRIGGER guard_identity_role_change_truncate
    BEFORE TRUNCATE ON public.identity_role_changes
    FOR EACH STATEMENT EXECUTE FUNCTION public.guard_identity_role_change_write();
END;
$$;

CREATE OR REPLACE FUNCTION public.list_tenant_members()
RETURNS TABLE (
  user_id uuid,
  display_name text,
  role public.app_role,
  joined_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_org_id uuid;
  v_role public.app_role;
BEGIN
  SELECT profile.org_id, assigned_role.role INTO v_org_id, v_role
  FROM public.profiles profile
  JOIN public.user_roles assigned_role
    ON (assigned_role.org_id, assigned_role.user_id, assigned_role.role) =
       (profile.org_id, profile.id, profile.role)
  WHERE profile.id = v_actor;

  IF v_actor IS NULL OR v_role IS DISTINCT FROM 'admin'::public.app_role THEN
    RAISE EXCEPTION 'identity administration requires a tenant admin';
  END IF;

  RETURN QUERY
  SELECT profile.id, profile.display_name, profile.role, profile.created_at
  FROM public.profiles profile
  JOIN public.user_roles assigned_role
    ON (assigned_role.org_id, assigned_role.user_id, assigned_role.role) =
       (profile.org_id, profile.id, profile.role)
  WHERE profile.org_id = v_org_id
  ORDER BY profile.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.change_tenant_member_role(
  p_target_user_id uuid,
  p_new_role public.app_role,
  p_reason text,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_org_id uuid;
  v_actor_role public.app_role;
  v_old_role public.app_role;
  v_reason text := btrim(p_reason);
  v_idempotency_key text := btrim(p_idempotency_key);
  v_existing public.identity_role_changes%ROWTYPE;
  v_change_id uuid := gen_random_uuid();
BEGIN
  IF p_reason IS NULL OR v_reason = '' OR length(v_reason) > 500
     OR p_reason IS DISTINCT FROM v_reason OR p_reason ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'role-change reason must be trimmed, non-empty, and contain no control characters';
  END IF;
  IF p_idempotency_key IS NULL OR v_idempotency_key = ''
     OR length(v_idempotency_key) > 200
     OR p_idempotency_key IS DISTINCT FROM v_idempotency_key
     OR p_idempotency_key ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'role-change idempotency key must be trimmed, non-empty, and contain no control characters';
  END IF;
  IF p_new_role IS NULL OR p_new_role = 'admin'::public.app_role THEN
    RAISE EXCEPTION 'controlled role administration accepts only a non-admin role';
  END IF;

  SELECT profile.org_id, assigned_role.role INTO v_org_id, v_actor_role
  FROM public.profiles profile
  JOIN public.user_roles assigned_role
    ON (assigned_role.org_id, assigned_role.user_id, assigned_role.role) =
       (profile.org_id, profile.id, profile.role)
  WHERE profile.id = v_actor
  FOR UPDATE OF profile, assigned_role;

  IF v_actor IS NULL OR v_actor_role IS DISTINCT FROM 'admin'::public.app_role THEN
    RAISE EXCEPTION 'identity administration requires a tenant admin';
  END IF;

  SELECT * INTO v_existing
  FROM public.identity_role_changes change_record
  WHERE change_record.org_id = v_org_id
    AND change_record.idempotency_key = v_idempotency_key;
  IF FOUND THEN
    IF v_existing.actor_id IS DISTINCT FROM v_actor
       OR v_existing.target_user_id IS DISTINCT FROM p_target_user_id
       OR v_existing.new_role IS DISTINCT FROM p_new_role
       OR v_existing.reason IS DISTINCT FROM v_reason THEN
      RAISE EXCEPTION 'role-change idempotency key conflict';
    END IF;
    RETURN v_existing.id;
  END IF;

  SELECT profile.role INTO v_old_role
  FROM public.profiles profile
  JOIN public.user_roles assigned_role
    ON (assigned_role.org_id, assigned_role.user_id, assigned_role.role) =
       (profile.org_id, profile.id, profile.role)
  WHERE profile.org_id = v_org_id AND profile.id = p_target_user_id
  FOR UPDATE OF profile, assigned_role;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'member is unavailable for role administration';
  END IF;
  IF p_target_user_id = v_actor OR v_old_role = 'admin'::public.app_role THEN
    RAISE EXCEPTION 'controlled role administration requires another non-admin member';
  END IF;
  IF v_old_role = p_new_role THEN
    RAISE EXCEPTION 'new member role must differ from the current role';
  END IF;

  PERFORM set_config('tapaano.identity_role_write', 'trusted', true);
  PERFORM set_config('tapaano.identity_role_change_id', v_change_id::text, true);

  INSERT INTO public.identity_role_changes (
    id, org_id, actor_id, target_user_id, old_role, new_role,
    reason, idempotency_key
  ) VALUES (
    v_change_id, v_org_id, v_actor, p_target_user_id, v_old_role, p_new_role,
    v_reason, v_idempotency_key
  );

  SET CONSTRAINTS user_roles_profile_identity_fkey DEFERRED;
  UPDATE public.profiles
  SET role = p_new_role
  WHERE org_id = v_org_id AND id = p_target_user_id;
  UPDATE public.user_roles
  SET role = p_new_role
  WHERE org_id = v_org_id AND user_id = p_target_user_id;

  PERFORM set_config('tapaano.identity_role_change_id', '', true);
  PERFORM set_config('tapaano.identity_role_write', '', true);

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles profile
    JOIN public.user_roles assigned_role
      ON (assigned_role.org_id, assigned_role.user_id, assigned_role.role) =
         (profile.org_id, profile.id, profile.role)
    WHERE profile.org_id = v_org_id
      AND profile.id = p_target_user_id
      AND profile.role = p_new_role
  ) THEN
    RAISE EXCEPTION 'role administration reconciliation failed';
  END IF;
  RETURN v_change_id;
END;
$$;

DO $$
DECLARE
  function_record record;
  policy_record record;
  column_record record;
  role_name text;
BEGIN
  FOR function_record IN
    SELECT namespace.nspname, procedure_info.proname,
      pg_get_function_identity_arguments(procedure_info.oid) AS identity_arguments
    FROM pg_proc procedure_info
    JOIN pg_namespace namespace ON namespace.oid = procedure_info.pronamespace
    WHERE namespace.nspname = 'public' AND (
      (procedure_info.proname = 'list_tenant_members'
        AND oidvectortypes(procedure_info.proargtypes) <> '')
      OR (procedure_info.proname = 'change_tenant_member_role'
        AND oidvectortypes(procedure_info.proargtypes) <>
          'uuid, app_role, text, text')
    )
  LOOP
    EXECUTE format(
      'DROP FUNCTION %I.%I(%s)', function_record.nspname,
      function_record.proname, function_record.identity_arguments
    );
  END LOOP;

  ALTER TABLE public.identity_role_changes ENABLE ROW LEVEL SECURITY;
  FOR policy_record IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'identity_role_changes'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.identity_role_changes',
      policy_record.policyname
    );
  END LOOP;

  REVOKE ALL ON TABLE public.identity_role_changes
    FROM PUBLIC, anon, authenticated, service_role;
  FOR column_record IN
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'identity_role_changes'
  LOOP
    EXECUTE format(
      'REVOKE ALL PRIVILEGES (%I) ON TABLE public.identity_role_changes FROM PUBLIC',
      column_record.column_name
    );
    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      EXECUTE format(
        'REVOKE ALL PRIVILEGES (%I) ON TABLE public.identity_role_changes FROM %I',
        column_record.column_name, role_name
      );
    END LOOP;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'identity_role_changes'
  ) THEN
    ALTER PUBLICATION supabase_realtime
      DROP TABLE public.identity_role_changes;
  END IF;
END;
$$;

CREATE POLICY identity_role_changes_admin_read
  ON public.identity_role_changes FOR SELECT TO authenticated
  USING (
    org_id = public.get_user_org_id()
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

GRANT SELECT ON TABLE public.identity_role_changes TO authenticated;

REVOKE ALL ON FUNCTION public.guard_identity_role_change_write()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.list_tenant_members()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.change_tenant_member_role(uuid, public.app_role, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_tenant_members() TO authenticated;
GRANT EXECUTE ON FUNCTION public.change_tenant_member_role(uuid, public.app_role, text, text)
  TO authenticated;

COMMIT;
