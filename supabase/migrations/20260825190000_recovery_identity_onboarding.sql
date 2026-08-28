-- Controlled, token-bound onboarding for existing tenants.
-- The invitation secret is supplied only as a SHA-256 hash to PostgreSQL;
-- browser-visible routines never return it. Admin roles and tenant creation
-- remain outside this workflow.

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('extensions.digest(text,text)') IS NULL THEN
    RAISE EXCEPTION 'identity onboarding preflight: extensions.digest(text,text) is required';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.identity_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  created_by uuid NOT NULL,
  email text NOT NULL,
  display_name text NOT NULL,
  role public.app_role NOT NULL,
  reason text NOT NULL,
  idempotency_key text NOT NULL,
  token_hash bytea NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  consumed_by uuid,
  consumed_at timestamptz,
  cancelled_by uuid,
  cancelled_at timestamptz,
  cancel_reason text,
  expired_at timestamptz,
  CONSTRAINT identity_invitations_creator_profile_fkey
    FOREIGN KEY (org_id, created_by) REFERENCES public.profiles (org_id, id),
  CONSTRAINT identity_invitations_consumed_profile_fkey
    FOREIGN KEY (org_id, consumed_by) REFERENCES public.profiles (org_id, id),
  CONSTRAINT identity_invitations_cancelled_profile_fkey
    FOREIGN KEY (org_id, cancelled_by) REFERENCES public.profiles (org_id, id),
  CONSTRAINT identity_invitations_org_idempotency_uidx
    UNIQUE (org_id, idempotency_key),
  CONSTRAINT identity_invitations_email_check
    CHECK (email = lower(btrim(email)) AND length(email) <= 320
      AND email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
      AND email !~ '[[:cntrl:]]'),
  CONSTRAINT identity_invitations_display_name_check
    CHECK (display_name = btrim(display_name) AND display_name <> ''
      AND length(display_name) <= 200 AND display_name !~ '[[:cntrl:]]'),
  CONSTRAINT identity_invitations_role_check
    CHECK (role <> 'admin'::public.app_role),
  CONSTRAINT identity_invitations_reason_check
    CHECK (reason = btrim(reason) AND reason <> '' AND length(reason) <= 500
      AND reason !~ '[[:cntrl:]]'),
  CONSTRAINT identity_invitations_idempotency_key_check
    CHECK (idempotency_key = btrim(idempotency_key) AND idempotency_key <> ''
      AND length(idempotency_key) <= 200 AND idempotency_key !~ '[[:cntrl:]]'),
  CONSTRAINT identity_invitations_token_hash_check
    CHECK (octet_length(token_hash) = 32),
  CONSTRAINT identity_invitations_chronology_check
    CHECK (expires_at > created_at),
  CONSTRAINT identity_invitations_status_check
    CHECK (status IN ('PENDING', 'CONSUMED', 'CANCELLED', 'EXPIRED')),
  CONSTRAINT identity_invitations_resolution_check CHECK (
    (status = 'PENDING'
      AND consumed_by IS NULL AND consumed_at IS NULL
      AND cancelled_by IS NULL AND cancelled_at IS NULL AND cancel_reason IS NULL
      AND expired_at IS NULL)
    OR (status = 'CONSUMED'
      AND consumed_by IS NOT NULL AND consumed_at IS NOT NULL
      AND consumed_at >= created_at AND consumed_at <= expires_at
      AND cancelled_by IS NULL AND cancelled_at IS NULL AND cancel_reason IS NULL
      AND expired_at IS NULL)
    OR (status = 'CANCELLED'
      AND consumed_by IS NULL AND consumed_at IS NULL
      AND cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL
      AND cancelled_at >= created_at AND cancelled_at <= expires_at
      AND cancel_reason IS NOT NULL AND cancel_reason = btrim(cancel_reason)
      AND cancel_reason <> '' AND length(cancel_reason) <= 500
      AND cancel_reason !~ '[[:cntrl:]]'
      AND expired_at IS NULL)
    OR (status = 'EXPIRED'
      AND consumed_by IS NULL AND consumed_at IS NULL
      AND cancelled_by IS NULL AND cancelled_at IS NULL AND cancel_reason IS NULL
      AND expired_at IS NOT NULL AND expired_at >= expires_at)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS identity_invitations_pending_email_uidx
  ON public.identity_invitations (org_id, email)
  WHERE status = 'PENDING';

LOCK TABLE public.profiles, public.user_roles, public.identity_invitations
  IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.identity_invitations invitation
    LEFT JOIN public.profiles creator
      ON (creator.org_id, creator.id) = (invitation.org_id, invitation.created_by)
    LEFT JOIN public.profiles consumer
      ON (consumer.org_id, consumer.id) = (invitation.org_id, invitation.consumed_by)
    LEFT JOIN public.profiles canceller
      ON (canceller.org_id, canceller.id) = (invitation.org_id, invitation.cancelled_by)
    WHERE creator.id IS NULL OR creator.role <> 'admin'::public.app_role
       OR (invitation.consumed_by IS NOT NULL AND consumer.id IS NULL)
       OR (invitation.cancelled_by IS NOT NULL AND (
         canceller.id IS NULL OR canceller.role <> 'admin'::public.app_role
       ))
       OR invitation.email <> lower(btrim(invitation.email))
       OR length(invitation.email) > 320
       OR invitation.email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
       OR invitation.email ~ '[[:cntrl:]]'
       OR invitation.display_name <> btrim(invitation.display_name)
       OR invitation.display_name = '' OR length(invitation.display_name) > 200
       OR invitation.display_name ~ '[[:cntrl:]]'
       OR invitation.role = 'admin'::public.app_role
       OR invitation.reason <> btrim(invitation.reason)
       OR invitation.reason = '' OR length(invitation.reason) > 500
       OR invitation.reason ~ '[[:cntrl:]]'
       OR invitation.idempotency_key <> btrim(invitation.idempotency_key)
       OR invitation.idempotency_key = '' OR length(invitation.idempotency_key) > 200
       OR invitation.idempotency_key ~ '[[:cntrl:]]'
       OR octet_length(invitation.token_hash) <> 32
       OR invitation.expires_at <= invitation.created_at
  ) THEN
    RAISE EXCEPTION 'identity onboarding preflight: invalid invitation history';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_identity_invitation_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, auth
AS $$
DECLARE
  v_purpose text := current_setting('tapaano.identity_invitation_purpose', true);
  v_invitation_id uuid;
  v_onboarding_user_id uuid;
  v_actor_role public.app_role;
BEGIN
  BEGIN
    v_invitation_id := NULLIF(
      current_setting('tapaano.identity_invitation_id', true), ''
    )::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    v_invitation_id := NULL;
  END;
  BEGIN
    v_onboarding_user_id := NULLIF(
      current_setting('tapaano.identity_onboarding_user_id', true), ''
    )::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    v_onboarding_user_id := NULL;
  END;

  IF TG_OP = 'INSERT' THEN
    SELECT profile.role INTO v_actor_role
    FROM public.profiles profile
    JOIN public.user_roles assigned_role
      ON (assigned_role.org_id, assigned_role.user_id, assigned_role.role) =
         (profile.org_id, profile.id, profile.role)
    WHERE profile.id = NEW.created_by AND profile.org_id = NEW.org_id;
    IF v_purpose IS DISTINCT FROM 'create'
       OR v_invitation_id IS DISTINCT FROM NEW.id
       OR v_actor_role IS DISTINCT FROM 'admin'::public.app_role
       OR NEW.status <> 'PENDING'
       OR NEW.role = 'admin'::public.app_role THEN
      RAISE EXCEPTION 'identity invitation audit is immutable';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'identity invitation audit is immutable';
  END IF;
  IF v_invitation_id IS DISTINCT FROM OLD.id
     OR NEW.id IS DISTINCT FROM OLD.id
     OR NEW.org_id IS DISTINCT FROM OLD.org_id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.display_name IS DISTINCT FROM OLD.display_name
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.reason IS DISTINCT FROM OLD.reason
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.token_hash IS DISTINCT FROM OLD.token_hash
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR OLD.status <> 'PENDING' THEN
    RAISE EXCEPTION 'identity invitation audit is immutable';
  END IF;

  IF v_purpose = 'consume'
     AND v_onboarding_user_id IS NOT NULL
     AND NEW.status = 'CONSUMED'
     AND NEW.consumed_by = v_onboarding_user_id
     AND NEW.consumed_at IS NOT NULL
     AND NEW.consumed_at >= OLD.created_at AND NEW.consumed_at <= OLD.expires_at
     AND NEW.cancelled_by IS NULL AND NEW.cancelled_at IS NULL
     AND NEW.cancel_reason IS NULL AND NEW.expired_at IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_purpose = 'cancel'
     AND NEW.status = 'CANCELLED'
     AND NEW.consumed_by IS NULL AND NEW.consumed_at IS NULL
     AND NEW.cancelled_by = auth.uid() AND NEW.cancelled_at IS NOT NULL
     AND NEW.cancelled_at >= OLD.created_at AND NEW.cancelled_at <= OLD.expires_at
     AND NEW.cancel_reason IS NOT NULL AND NEW.cancel_reason = btrim(NEW.cancel_reason)
     AND NEW.cancel_reason <> '' AND length(NEW.cancel_reason) <= 500
     AND NEW.cancel_reason !~ '[[:cntrl:]]' AND NEW.expired_at IS NULL THEN
    SELECT profile.role INTO v_actor_role
    FROM public.profiles profile
    JOIN public.user_roles assigned_role
      ON (assigned_role.org_id, assigned_role.user_id, assigned_role.role) =
         (profile.org_id, profile.id, profile.role)
    WHERE profile.id = auth.uid() AND profile.org_id = OLD.org_id;
    IF v_actor_role = 'admin'::public.app_role THEN
      RETURN NEW;
    END IF;
  END IF;

  IF v_purpose = 'expire'
     AND NEW.status = 'EXPIRED'
     AND NEW.consumed_by IS NULL AND NEW.consumed_at IS NULL
     AND NEW.cancelled_by IS NULL AND NEW.cancelled_at IS NULL
     AND NEW.cancel_reason IS NULL AND NEW.expired_at IS NOT NULL
     AND NEW.expired_at >= OLD.expires_at THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'identity invitation audit is immutable';
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_identity_profile_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, auth
AS $$
DECLARE
  v_change_id uuid;
  v_invitation_id uuid;
  v_onboarding_user_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    BEGIN
      v_invitation_id := NULLIF(
        current_setting('tapaano.identity_invitation_id', true), ''
      )::uuid;
      v_onboarding_user_id := NULLIF(
        current_setting('tapaano.identity_onboarding_user_id', true), ''
      )::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_invitation_id := NULL;
      v_onboarding_user_id := NULL;
    END;
    IF current_setting('tapaano.identity_onboarding_write', true) IS DISTINCT FROM 'trusted'
       OR v_onboarding_user_id IS DISTINCT FROM NEW.id
       OR NOT EXISTS (
         SELECT 1 FROM public.identity_invitations invitation
         WHERE invitation.id = v_invitation_id
           AND invitation.status = 'PENDING'
           AND invitation.expires_at > clock_timestamp()
           AND invitation.org_id = NEW.org_id
           AND invitation.display_name = NEW.display_name
           AND invitation.role = NEW.role
       ) THEN
      RAISE EXCEPTION 'identity membership is immutable; controlled invitation required';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'identity membership is immutable; controlled removal is unavailable';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.org_id IS DISTINCT FROM OLD.org_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'identity membership is immutable; tenant reassignment is unavailable';
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
         SELECT 1 FROM public.identity_role_changes change_record
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
  v_invitation_id uuid;
  v_onboarding_user_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    BEGIN
      v_invitation_id := NULLIF(
        current_setting('tapaano.identity_invitation_id', true), ''
      )::uuid;
      v_onboarding_user_id := NULLIF(
        current_setting('tapaano.identity_onboarding_user_id', true), ''
      )::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_invitation_id := NULL;
      v_onboarding_user_id := NULL;
    END;
    IF current_setting('tapaano.identity_onboarding_write', true) IS DISTINCT FROM 'trusted'
       OR v_onboarding_user_id IS DISTINCT FROM NEW.user_id
       OR NOT EXISTS (
         SELECT 1 FROM public.identity_invitations invitation
         WHERE invitation.id = v_invitation_id
           AND invitation.status = 'PENDING'
           AND invitation.expires_at > clock_timestamp()
           AND invitation.org_id = NEW.org_id
           AND invitation.role = NEW.role
       ) THEN
      RAISE EXCEPTION 'identity membership is immutable; controlled invitation required';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP <> 'UPDATE'
     OR NEW.id IS DISTINCT FROM OLD.id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.org_id IS DISTINCT FROM OLD.org_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.role IS NOT DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'identity membership is immutable; use controlled administration';
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
       SELECT 1 FROM public.identity_role_changes change_record
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

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_invitation_id uuid;
  v_invitation public.identity_invitations%ROWTYPE;
  v_token text;
BEGIN
  BEGIN
    v_invitation_id := NULLIF(
      NEW.raw_user_meta_data->>'tapaano_invitation_id', ''
    )::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'controlled invitation is invalid or unavailable';
  END;
  v_token := NEW.raw_user_meta_data->>'tapaano_invitation_token';

  IF v_invitation_id IS NULL OR v_token IS NULL OR length(v_token) < 32
     OR NEW.email IS NULL THEN
    RAISE EXCEPTION 'controlled invitation is invalid or unavailable';
  END IF;

  SELECT * INTO v_invitation
  FROM public.identity_invitations invitation
  WHERE invitation.id = v_invitation_id
    AND invitation.status = 'PENDING'
    AND invitation.expires_at > clock_timestamp()
    AND invitation.email = lower(btrim(NEW.email))
    AND invitation.token_hash = extensions.digest(v_token, 'sha256')
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'controlled invitation is invalid or unavailable';
  END IF;

  PERFORM set_config('tapaano.identity_onboarding_write', 'trusted', true);
  PERFORM set_config('tapaano.identity_invitation_purpose', 'consume', true);
  PERFORM set_config('tapaano.identity_invitation_id', v_invitation.id::text, true);
  PERFORM set_config('tapaano.identity_onboarding_user_id', NEW.id::text, true);

  INSERT INTO public.profiles (id, org_id, display_name, role)
  VALUES (NEW.id, v_invitation.org_id, v_invitation.display_name, v_invitation.role);
  INSERT INTO public.user_roles (user_id, org_id, role)
  VALUES (NEW.id, v_invitation.org_id, v_invitation.role);
  UPDATE public.identity_invitations
  SET status = 'CONSUMED', consumed_by = NEW.id, consumed_at = clock_timestamp()
  WHERE id = v_invitation.id;

  PERFORM set_config('tapaano.identity_onboarding_user_id', '', true);
  PERFORM set_config('tapaano.identity_invitation_id', '', true);
  PERFORM set_config('tapaano.identity_invitation_purpose', '', true);
  PERFORM set_config('tapaano.identity_onboarding_write', '', true);

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles profile
    JOIN public.user_roles assigned_role
      ON (assigned_role.org_id, assigned_role.user_id, assigned_role.role) =
         (profile.org_id, profile.id, profile.role)
    JOIN public.identity_invitations invitation
      ON invitation.org_id = profile.org_id
      AND invitation.consumed_by = profile.id
      AND invitation.status = 'CONSUMED'
    WHERE profile.id = NEW.id AND invitation.id = v_invitation.id
  ) THEN
    RAISE EXCEPTION 'identity onboarding reconciliation failed';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_tenant_invitation(
  p_actor_id uuid,
  p_email text,
  p_display_name text,
  p_role public.app_role,
  p_reason text,
  p_idempotency_key text,
  p_token_hash text
)
RETURNS TABLE (
  invitation_id uuid,
  email text,
  display_name text,
  role public.app_role,
  status text,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor uuid := p_actor_id;
  v_org_id uuid;
  v_actor_role public.app_role;
  v_email text := lower(btrim(p_email));
  v_display_name text := btrim(p_display_name);
  v_reason text := btrim(p_reason);
  v_idempotency_key text := btrim(p_idempotency_key);
  v_token_hash bytea;
  v_existing public.identity_invitations%ROWTYPE;
  v_invitation_id uuid := gen_random_uuid();
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_email IS NULL OR p_email IS DISTINCT FROM v_email OR length(v_email) > 320
     OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
     OR v_email ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'invitation email must be normalized and valid';
  END IF;
  IF p_display_name IS NULL OR p_display_name IS DISTINCT FROM v_display_name
     OR v_display_name = '' OR length(v_display_name) > 200
     OR v_display_name ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'invitation display name must be trimmed and valid';
  END IF;
  IF p_role IS NULL OR p_role = 'admin'::public.app_role THEN
    RAISE EXCEPTION 'controlled onboarding accepts only a non-admin role';
  END IF;
  IF p_reason IS NULL OR p_reason IS DISTINCT FROM v_reason OR v_reason = ''
     OR length(v_reason) > 500 OR v_reason ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'invitation reason must be trimmed and valid';
  END IF;
  IF p_idempotency_key IS NULL OR p_idempotency_key IS DISTINCT FROM v_idempotency_key
     OR v_idempotency_key = '' OR length(v_idempotency_key) > 200
     OR v_idempotency_key ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'invitation idempotency key must be trimmed and valid';
  END IF;
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invitation token hash must be a lowercase SHA-256 value';
  END IF;
  v_token_hash := decode(p_token_hash, 'hex');

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

  LOCK TABLE public.identity_invitations IN SHARE ROW EXCLUSIVE MODE;
  PERFORM set_config('tapaano.identity_invitation_purpose', 'expire', true);
  UPDATE public.identity_invitations AS expired_invitation
  SET status = 'EXPIRED', expired_at = v_now
  WHERE expired_invitation.org_id = v_org_id
    AND expired_invitation.status = 'PENDING'
    AND expired_invitation.expires_at <= v_now;
  PERFORM set_config('tapaano.identity_invitation_purpose', '', true);

  SELECT * INTO v_existing
  FROM public.identity_invitations invitation
  WHERE invitation.org_id = v_org_id
    AND invitation.idempotency_key = v_idempotency_key;
  IF FOUND THEN
    IF v_existing.created_by IS DISTINCT FROM v_actor
       OR v_existing.email IS DISTINCT FROM v_email
       OR v_existing.display_name IS DISTINCT FROM v_display_name
       OR v_existing.role IS DISTINCT FROM p_role
       OR v_existing.reason IS DISTINCT FROM v_reason
       OR v_existing.token_hash IS DISTINCT FROM v_token_hash THEN
      RAISE EXCEPTION 'invitation idempotency key conflict';
    END IF;
    RETURN QUERY SELECT v_existing.id, v_existing.email, v_existing.display_name,
      v_existing.role, v_existing.status, v_existing.expires_at;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.identity_invitations invitation
    WHERE invitation.org_id = v_org_id AND invitation.email = v_email
      AND invitation.status = 'PENDING'
  ) THEN
    RAISE EXCEPTION 'an active invitation already exists for this email';
  END IF;

  PERFORM set_config('tapaano.identity_invitation_purpose', 'create', true);
  PERFORM set_config('tapaano.identity_invitation_id', v_invitation_id::text, true);
  INSERT INTO public.identity_invitations (
    id, org_id, created_by, email, display_name, role, reason,
    idempotency_key, token_hash, status, created_at, expires_at
  ) VALUES (
    v_invitation_id, v_org_id, v_actor, v_email, v_display_name, p_role, v_reason,
    v_idempotency_key, v_token_hash, 'PENDING', v_now, v_now + interval '24 hours'
  );
  PERFORM set_config('tapaano.identity_invitation_id', '', true);
  PERFORM set_config('tapaano.identity_invitation_purpose', '', true);

  RETURN QUERY SELECT v_invitation_id, v_email, v_display_name, p_role,
    'PENDING'::text, v_now + interval '24 hours';
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_tenant_invitation(
  p_invitation_id uuid,
  p_reason text
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
  v_reason text := btrim(p_reason);
  v_invitation public.identity_invitations%ROWTYPE;
BEGIN
  IF p_reason IS NULL OR p_reason IS DISTINCT FROM v_reason OR v_reason = ''
     OR length(v_reason) > 500 OR v_reason ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'invitation cancellation reason must be trimmed and valid';
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

  SELECT * INTO v_invitation
  FROM public.identity_invitations invitation
  WHERE invitation.id = p_invitation_id AND invitation.org_id = v_org_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation is unavailable for cancellation';
  END IF;
  IF v_invitation.status = 'CANCELLED'
     AND v_invitation.cancelled_by = v_actor
     AND v_invitation.cancel_reason = v_reason THEN
    RETURN v_invitation.id;
  END IF;
  IF v_invitation.status <> 'PENDING' OR v_invitation.expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'invitation is unavailable for cancellation';
  END IF;

  PERFORM set_config('tapaano.identity_invitation_purpose', 'cancel', true);
  PERFORM set_config('tapaano.identity_invitation_id', v_invitation.id::text, true);
  UPDATE public.identity_invitations
  SET status = 'CANCELLED', cancelled_by = v_actor,
    cancelled_at = clock_timestamp(), cancel_reason = v_reason
  WHERE id = v_invitation.id;
  PERFORM set_config('tapaano.identity_invitation_id', '', true);
  PERFORM set_config('tapaano.identity_invitation_purpose', '', true);
  RETURN v_invitation.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_tenant_invitations()
RETURNS TABLE (
  invitation_id uuid,
  email text,
  display_name text,
  role public.app_role,
  status text,
  created_by uuid,
  created_at timestamptz,
  expires_at timestamptz,
  resolved_at timestamptz,
  cancel_reason text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_org_id uuid;
  v_actor_role public.app_role;
BEGIN
  SELECT profile.org_id, assigned_role.role INTO v_org_id, v_actor_role
  FROM public.profiles profile
  JOIN public.user_roles assigned_role
    ON (assigned_role.org_id, assigned_role.user_id, assigned_role.role) =
       (profile.org_id, profile.id, profile.role)
  WHERE profile.id = v_actor;
  IF v_actor IS NULL OR v_actor_role IS DISTINCT FROM 'admin'::public.app_role THEN
    RAISE EXCEPTION 'identity administration requires a tenant admin';
  END IF;

  RETURN QUERY
  SELECT invitation.id, invitation.email, invitation.display_name,
    invitation.role,
    CASE WHEN invitation.status = 'PENDING'
      AND invitation.expires_at <= clock_timestamp()
      THEN 'EXPIRED'::text ELSE invitation.status END,
    invitation.created_by, invitation.created_at, invitation.expires_at,
    COALESCE(invitation.consumed_at, invitation.cancelled_at, invitation.expired_at),
    invitation.cancel_reason
  FROM public.identity_invitations invitation
  WHERE invitation.org_id = v_org_id
  ORDER BY invitation.created_at DESC, invitation.id;
END;
$$;

DO $$
DECLARE
  trigger_record record;
  policy_record record;
  column_record record;
  function_record record;
  role_name text;
BEGIN
  FOR trigger_record IN
    SELECT trigger_info.tgname
    FROM pg_trigger trigger_info
    JOIN pg_class relation ON relation.oid = trigger_info.tgrelid
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = 'identity_invitations'
      AND NOT trigger_info.tgisinternal
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.identity_invitations',
      trigger_record.tgname);
  END LOOP;
  CREATE TRIGGER guard_identity_invitation_write
    BEFORE INSERT OR UPDATE OR DELETE ON public.identity_invitations
    FOR EACH ROW EXECUTE FUNCTION public.guard_identity_invitation_write();
  CREATE TRIGGER guard_identity_invitation_truncate
    BEFORE TRUNCATE ON public.identity_invitations
    FOR EACH STATEMENT EXECUTE FUNCTION public.guard_identity_invitation_write();

  ALTER TABLE public.identity_invitations ENABLE ROW LEVEL SECURITY;
  FOR policy_record IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'identity_invitations'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.identity_invitations',
      policy_record.policyname);
  END LOOP;

  REVOKE ALL ON TABLE public.identity_invitations
    FROM PUBLIC, anon, authenticated, service_role;
  FOR column_record IN
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'identity_invitations'
  LOOP
    EXECUTE format(
      'REVOKE ALL PRIVILEGES (%I) ON TABLE public.identity_invitations FROM PUBLIC',
      column_record.column_name);
    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      EXECUTE format(
        'REVOKE ALL PRIVILEGES (%I) ON TABLE public.identity_invitations FROM %I',
        column_record.column_name, role_name);
    END LOOP;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename = 'identity_invitations'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.identity_invitations;
  END IF;

  FOR function_record IN
    SELECT namespace.nspname, procedure_info.proname,
      pg_get_function_identity_arguments(procedure_info.oid) AS identity_arguments
    FROM pg_proc procedure_info
    JOIN pg_namespace namespace ON namespace.oid = procedure_info.pronamespace
    WHERE namespace.nspname = 'public' AND (
      (procedure_info.proname = 'create_tenant_invitation'
        AND oidvectortypes(procedure_info.proargtypes) <>
          'uuid, text, text, app_role, text, text, text')
      OR (procedure_info.proname = 'cancel_tenant_invitation'
        AND oidvectortypes(procedure_info.proargtypes) <> 'uuid, text')
      OR (procedure_info.proname = 'list_tenant_invitations'
        AND oidvectortypes(procedure_info.proargtypes) <> '')
    )
  LOOP
    EXECUTE format('DROP FUNCTION %I.%I(%s)', function_record.nspname,
      function_record.proname, function_record.identity_arguments);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_identity_invitation_write()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.handle_new_user()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_tenant_invitation(
  uuid, text, text, public.app_role, text, text, text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cancel_tenant_invitation(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.list_tenant_invitations()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_tenant_invitation(
  uuid, text, text, public.app_role, text, text, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_tenant_invitation(uuid, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_tenant_invitations() TO authenticated;

COMMIT;
