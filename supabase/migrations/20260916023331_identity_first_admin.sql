-- Owner-only first administrator provisioning. Existing member invitations keep
-- their non-admin policy. No Auth users, secrets, or customer data are seeded.
BEGIN;

ALTER TABLE public.identity_invitations ADD COLUMN provisioned_by text;
ALTER TABLE public.identity_invitations ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.identity_invitations DROP CONSTRAINT identity_invitations_role_check;
ALTER TABLE public.identity_invitations ADD CONSTRAINT identity_invitations_role_check CHECK (
  (created_by IS NOT NULL AND provisioned_by IS NULL AND role <> 'admin'::public.app_role)
  OR (created_by IS NULL AND provisioned_by = 'postgres' AND role = 'admin'::public.app_role)
);
-- NULL must not let a CHECK expression evaluate to unknown for bootstrap rows.
ALTER TABLE public.identity_invitations ADD CONSTRAINT identity_bootstrap_provenance_check
  CHECK ((created_by IS NULL) = (provisioned_by IS NOT NULL));
CREATE UNIQUE INDEX identity_one_live_bootstrap ON public.identity_invitations ((true))
  WHERE created_by IS NULL AND status IN ('PENDING','CONSUMED');
REVOKE ALL (provisioned_by) ON public.identity_invitations FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.prepare_first_admin_invitation(
  p_company_name text, p_email text, p_display_name text,
  p_idempotency_key text, p_token_hash text
)
RETURNS TABLE (invitation_id uuid, org_id uuid, status text, expires_at timestamptz)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_existing public.identity_invitations%ROWTYPE;
  v_prior public.identity_invitations%ROWTYPE;
  v_org_id uuid;
  v_id uuid := gen_random_uuid();
  v_now timestamptz := clock_timestamp();
BEGIN
  IF current_user <> 'postgres' OR auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'first admin provisioning requires the database owner';
  END IF;
  IF p_company_name IS NULL OR p_company_name <> btrim(p_company_name)
     OR length(p_company_name) NOT BETWEEN 1 AND 200 OR p_company_name ~ '[[:cntrl:]]'
     OR p_email IS NULL OR p_email <> lower(btrim(p_email)) OR length(p_email) > 320
     OR p_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' OR p_email ~ '[[:cntrl:]]'
     OR p_display_name IS NULL OR p_display_name <> btrim(p_display_name)
     OR length(p_display_name) NOT BETWEEN 1 AND 200 OR p_display_name ~ '[[:cntrl:]]'
     OR p_idempotency_key IS NULL OR p_idempotency_key <> btrim(p_idempotency_key)
     OR length(p_idempotency_key) NOT BETWEEN 1 AND 200 OR p_idempotency_key ~ '[[:cntrl:]]'
     OR p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'invalid first admin provisioning request';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('tapaano:first-admin'));
  SELECT i.* INTO v_existing FROM public.identity_invitations i
    WHERE i.created_by IS NULL AND i.idempotency_key = p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF v_existing.email <> p_email OR v_existing.display_name <> p_display_name
       OR v_existing.token_hash <> decode(p_token_hash,'hex')
       OR NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.id=v_existing.org_id AND o.name=p_company_name) THEN
      RAISE EXCEPTION 'first admin request key conflicts with earlier request';
    END IF;
    IF v_existing.status='CONSUMED' OR (v_existing.status='PENDING' AND v_existing.expires_at>clock_timestamp()) THEN
      RETURN QUERY SELECT v_existing.id, v_existing.org_id, v_existing.status, v_existing.expires_at;
      RETURN;
    END IF;
    RAISE EXCEPTION 'first admin request expired; prepare a new request key and token';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users) OR EXISTS (SELECT 1 FROM public.profiles)
     OR EXISTS (SELECT 1 FROM public.user_roles)
     OR EXISTS (SELECT 1 FROM public.identity_invitations i WHERE i.created_by IS NULL AND i.status='CONSUMED') THEN
    RAISE EXCEPTION 'first admin provisioning is closed';
  END IF;
  SELECT i.* INTO v_prior FROM public.identity_invitations i WHERE i.created_by IS NULL
    ORDER BY i.created_at DESC,i.id DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    IF v_prior.status='PENDING' AND v_prior.expires_at>clock_timestamp() THEN
      RAISE EXCEPTION 'a first admin request is already pending';
    END IF;
    IF v_prior.email<>p_email OR v_prior.display_name<>p_display_name
       OR (SELECT count(*) FROM public.organizations)<>1
       OR NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.id=v_prior.org_id AND o.name=p_company_name) THEN
      RAISE EXCEPTION 'first admin retry does not match the reserved company and recipient';
    END IF;
    v_org_id := v_prior.org_id;
    IF v_prior.status='PENDING' THEN
      PERFORM set_config('tapaano.identity_invitation_purpose','expire',true);
      PERFORM set_config('tapaano.identity_invitation_id',v_prior.id::text,true);
      UPDATE public.identity_invitations SET status='EXPIRED',expired_at=clock_timestamp() WHERE id=v_prior.id;
    END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM public.organizations) OR EXISTS (SELECT 1 FROM public.identity_invitations) THEN
      RAISE EXCEPTION 'first admin provisioning requires an empty project';
    END IF;
    v_org_id := gen_random_uuid();
    INSERT INTO public.organizations(id,name) VALUES(v_org_id,p_company_name);
  END IF;
  PERFORM set_config('tapaano.identity_invitation_purpose','bootstrap',true);
  PERFORM set_config('tapaano.identity_invitation_id',v_id::text,true);
  INSERT INTO public.identity_invitations(id,org_id,created_by,provisioned_by,email,display_name,role,
    reason,idempotency_key,token_hash,created_at,expires_at)
  VALUES(v_id,v_org_id,NULL,current_user,p_email,p_display_name,'admin',
    'Owner-approved initial administrator',p_idempotency_key,decode(p_token_hash,'hex'),v_now,v_now+interval '24 hours');
  PERFORM set_config('tapaano.identity_invitation_purpose','',true);
  PERFORM set_config('tapaano.identity_invitation_id','',true);
  RETURN QUERY SELECT v_id,v_org_id,'PENDING'::text,v_now+interval '24 hours';
END;
$$;
REVOKE ALL ON FUNCTION public.prepare_first_admin_invitation(text,text,text,text,text)
  FROM PUBLIC, anon, authenticated, service_role;


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
    IF NEW.created_by IS NULL AND NEW.provisioned_by = 'postgres'
       AND current_user = 'postgres' AND auth.uid() IS NULL
       AND v_purpose = 'bootstrap' AND v_invitation_id = NEW.id
       AND NEW.status = 'PENDING' AND NEW.role = 'admin'::public.app_role
       AND NOT EXISTS (SELECT 1 FROM auth.users)
       AND NOT EXISTS (SELECT 1 FROM public.profiles)
       AND NOT EXISTS (SELECT 1 FROM public.user_roles)
       AND (SELECT count(*) FROM public.organizations) = 1 THEN
      RETURN NEW;
    END IF;
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
     OR NEW.provisioned_by IS DISTINCT FROM OLD.provisioned_by
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

  IF EXISTS (SELECT 1 FROM public.identity_invitations WHERE id=v_invitation_id AND created_by IS NULL) THEN
    PERFORM pg_advisory_xact_lock(hashtext('tapaano:first-admin'));
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

  -- First-admin admission shares the same one-time token/email verification as
  -- member invitations, but only the project owner can prepare its audit row.
  IF v_invitation.created_by IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('tapaano:first-admin'));
    IF v_invitation.provisioned_by IS DISTINCT FROM 'postgres'
       OR v_invitation.role <> 'admin'::public.app_role
       OR EXISTS (SELECT 1 FROM public.profiles)
       OR EXISTS (SELECT 1 FROM public.user_roles)
       OR (SELECT count(*) FROM auth.users) <> 1
       OR (SELECT count(*) FROM public.organizations) <> 1
       OR NOT EXISTS (SELECT 1 FROM public.organizations WHERE id=v_invitation.org_id) THEN
      RAISE EXCEPTION 'first admin provisioning is closed';
    END IF;
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

REVOKE ALL ON FUNCTION public.guard_identity_invitation_write(), public.handle_new_user() FROM PUBLIC, anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
