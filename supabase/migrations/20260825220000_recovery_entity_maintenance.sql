-- Controlled entity creation and rename for existing tenants.
-- Functional currency, tenant lineage, creation evidence, and history remain
-- immutable. No period or accounting-control configuration is inferred.

BEGIN;

LOCK TABLE public.profiles,public.user_roles,public.entities IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.entities
    WHERE name IS DISTINCT FROM btrim(name) OR name='' OR length(name)>200
      OR name~'[[:cntrl:]]' OR currency !~ '^[A-Z]{3}$') THEN
    RAISE EXCEPTION 'entity maintenance preflight: invalid entity name or currency';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='entities_master_fields_check') THEN
    ALTER TABLE public.entities ADD CONSTRAINT entities_master_fields_check CHECK(
      name=btrim(name) AND name<>'' AND length(name)<=200 AND name!~'[[:cntrl:]]'
      AND currency~'^[A-Z]{3}$'
    );
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.entity_master_events(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  entity_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  event_type text NOT NULL,
  reason text NOT NULL,
  idempotency_key text NOT NULL,
  old_snapshot jsonb,
  new_snapshot jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT entity_master_events_actor_profile_fkey
    FOREIGN KEY(org_id,actor_id) REFERENCES public.profiles(org_id,id),
  CONSTRAINT entity_master_events_entity_fkey
    FOREIGN KEY(org_id,entity_id) REFERENCES public.entities(org_id,id)
      DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT entity_master_events_org_idempotency_uidx UNIQUE(org_id,idempotency_key),
  CONSTRAINT entity_master_events_type_check CHECK(event_type IN('CREATE','RENAME')),
  CONSTRAINT entity_master_events_reason_check CHECK(
    reason=btrim(reason) AND reason<>'' AND length(reason)<=500 AND reason!~'[[:cntrl:]]'
  ),
  CONSTRAINT entity_master_events_key_check CHECK(
    idempotency_key=btrim(idempotency_key) AND idempotency_key<>''
      AND length(idempotency_key)<=200 AND idempotency_key!~'[[:cntrl:]]'
  ),
  CONSTRAINT entity_master_events_snapshot_check CHECK(
    jsonb_typeof(new_snapshot)='object'
    AND (old_snapshot IS NULL OR jsonb_typeof(old_snapshot)='object')
    AND new_snapshot->>'id' IS NOT DISTINCT FROM entity_id::text
    AND new_snapshot->>'org_id' IS NOT DISTINCT FROM org_id::text
    AND COALESCE(new_snapshot->>'name'=btrim(new_snapshot->>'name')
      AND new_snapshot->>'name'<>'' AND length(new_snapshot->>'name')<=200
      AND new_snapshot->>'name'!~'[[:cntrl:]]',false)
    AND COALESCE(new_snapshot->>'currency'~'^[A-Z]{3}$',false)
    AND ((event_type='CREATE' AND old_snapshot IS NULL)
      OR (event_type='RENAME' AND old_snapshot IS NOT NULL
        AND old_snapshot->>'id' IS NOT DISTINCT FROM entity_id::text
        AND old_snapshot->>'org_id' IS NOT DISTINCT FROM org_id::text
        AND old_snapshot->>'currency' IS NOT DISTINCT FROM new_snapshot->>'currency'
        AND old_snapshot->>'name' IS DISTINCT FROM new_snapshot->>'name'))
  )
);

LOCK TABLE public.entity_master_events IN SHARE ROW EXCLUSIVE MODE;

CREATE OR REPLACE FUNCTION public.entity_master_snapshot(p_entity public.entities)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT jsonb_build_object('id',p_entity.id,'org_id',p_entity.org_id,
    'name',p_entity.name,'currency',p_entity.currency)
$$;

CREATE OR REPLACE FUNCTION public.guard_entity_master_event_write()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,auth AS $$
DECLARE v_event_id uuid;v_role public.app_role;
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'entity master audit is immutable';END IF;
  BEGIN v_event_id:=NULLIF(current_setting('tapaano.entity_master_event_id',true),'')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN v_event_id:=NULL;END;
  SELECT assigned.role INTO v_role FROM public.profiles profile
  JOIN public.user_roles assigned
    ON(assigned.org_id,assigned.user_id,assigned.role)=(profile.org_id,profile.id,profile.role)
  WHERE profile.id=auth.uid() AND profile.org_id=NEW.org_id;
  IF current_setting('tapaano.entity_master_purpose',true) IS DISTINCT FROM lower(NEW.event_type)
    OR v_event_id IS DISTINCT FROM NEW.id OR auth.uid() IS DISTINCT FROM NEW.actor_id
    OR v_role IS DISTINCT FROM 'admin'::public.app_role THEN
    RAISE EXCEPTION 'entity master audit is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_controlled_entity_master()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,auth AS $$
DECLARE v_event_id uuid;v_purpose text:=current_setting('tapaano.entity_master_purpose',true);
BEGIN
  IF TG_OP IN('DELETE','TRUNCATE') THEN
    RAISE EXCEPTION 'entity data is immutable; use controlled entity maintenance';
  END IF;
  BEGIN v_event_id:=NULLIF(current_setting('tapaano.entity_master_event_id',true),'')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN v_event_id:=NULL;END;
  IF TG_OP='INSERT' THEN
    IF v_purpose IS DISTINCT FROM 'create' OR v_event_id IS NULL OR NOT EXISTS(
      SELECT 1 FROM public.entity_master_events event WHERE event.id=v_event_id
        AND event.org_id=NEW.org_id AND event.entity_id=NEW.id AND event.actor_id=auth.uid()
        AND event.event_type='CREATE' AND event.old_snapshot IS NULL
        AND event.new_snapshot=public.entity_master_snapshot(NEW)
    ) THEN RAISE EXCEPTION 'entity data is immutable; use controlled entity maintenance';END IF;
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.org_id IS DISTINCT FROM OLD.org_id
    OR NEW.currency IS DISTINCT FROM OLD.currency OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.updated_at<=OLD.updated_at OR v_purpose IS DISTINCT FROM 'rename'
    OR NEW.name IS NOT DISTINCT FROM OLD.name OR v_event_id IS NULL OR NOT EXISTS(
      SELECT 1 FROM public.entity_master_events event WHERE event.id=v_event_id
        AND event.org_id=OLD.org_id AND event.entity_id=OLD.id AND event.actor_id=auth.uid()
        AND event.event_type='RENAME' AND event.old_snapshot=public.entity_master_snapshot(OLD)
        AND event.new_snapshot=public.entity_master_snapshot(NEW)
    ) THEN RAISE EXCEPTION 'entity data is immutable; use controlled entity maintenance';END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_master_write ON public.entities;
DROP TRIGGER IF EXISTS guard_master_truncate ON public.entities;
DROP TRIGGER IF EXISTS guard_entity_write ON public.entities;
DROP TRIGGER IF EXISTS guard_entity_truncate ON public.entities;
CREATE TRIGGER guard_entity_write BEFORE INSERT OR UPDATE OR DELETE ON public.entities
  FOR EACH ROW EXECUTE FUNCTION public.guard_controlled_entity_master();
CREATE TRIGGER guard_entity_truncate BEFORE TRUNCATE ON public.entities
  FOR EACH STATEMENT EXECUTE FUNCTION public.guard_controlled_entity_master();

DROP TRIGGER IF EXISTS guard_entity_event_write ON public.entity_master_events;
DROP TRIGGER IF EXISTS guard_entity_event_truncate ON public.entity_master_events;
CREATE TRIGGER guard_entity_event_write BEFORE INSERT OR UPDATE OR DELETE ON public.entity_master_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_entity_master_event_write();
CREATE TRIGGER guard_entity_event_truncate BEFORE TRUNCATE ON public.entity_master_events
  FOR EACH STATEMENT EXECUTE FUNCTION public.guard_entity_master_event_write();

CREATE OR REPLACE FUNCTION public.assert_entity_maintenance_admin()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE v_org_id uuid;v_role public.app_role;
BEGIN
  SELECT profile.org_id,assigned.role INTO v_org_id,v_role FROM public.profiles profile
  JOIN public.user_roles assigned
    ON(assigned.org_id,assigned.user_id,assigned.role)=(profile.org_id,profile.id,profile.role)
  WHERE profile.id=auth.uid() FOR UPDATE OF profile,assigned;
  IF auth.uid() IS NULL OR v_role IS DISTINCT FROM 'admin'::public.app_role THEN
    RAISE EXCEPTION 'entity maintenance requires a tenant admin';
  END IF;
  RETURN v_org_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_entity_maintenance_text(
  p_name text,p_reason text,p_idempotency_key text
) RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
BEGIN
  IF p_name IS NULL OR p_name IS DISTINCT FROM btrim(p_name) OR p_name=''
    OR length(p_name)>200 OR p_name~'[[:cntrl:]]' THEN
    RAISE EXCEPTION 'entity name must be normalized and valid';
  END IF;
  IF p_reason IS NULL OR p_reason IS DISTINCT FROM btrim(p_reason) OR p_reason=''
    OR length(p_reason)>500 OR p_reason~'[[:cntrl:]]' THEN
    RAISE EXCEPTION 'entity maintenance reason must be normalized and valid';
  END IF;
  IF p_idempotency_key IS NULL OR p_idempotency_key IS DISTINCT FROM btrim(p_idempotency_key)
    OR p_idempotency_key='' OR length(p_idempotency_key)>200
    OR p_idempotency_key~'[[:cntrl:]]' THEN
    RAISE EXCEPTION 'entity maintenance idempotency key must be normalized and valid';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_tenant_entity(
  p_name text,p_currency text,p_reason text,p_idempotency_key text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE
  v_org_id uuid:=public.assert_entity_maintenance_admin();v_actor uuid:=auth.uid();
  v_existing public.entity_master_events%ROWTYPE;v_entity_id uuid:=gen_random_uuid();
  v_event_id uuid:=gen_random_uuid();v_now timestamptz:=clock_timestamp();v_snapshot jsonb;
BEGIN
  PERFORM public.validate_entity_maintenance_text(p_name,p_reason,p_idempotency_key);
  IF p_currency IS NULL OR p_currency IS DISTINCT FROM btrim(p_currency)
    OR p_currency!~'^[A-Z]{3}$' THEN RAISE EXCEPTION 'entity currency must be an uppercase three-letter code';END IF;
  LOCK TABLE public.entity_master_events,public.entities IN SHARE ROW EXCLUSIVE MODE;
  SELECT * INTO v_existing FROM public.entity_master_events
    WHERE org_id=v_org_id AND idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF v_existing.actor_id IS DISTINCT FROM v_actor OR v_existing.event_type<>'CREATE'
      OR v_existing.reason IS DISTINCT FROM p_reason
      OR v_existing.new_snapshot->>'name' IS DISTINCT FROM p_name
      OR v_existing.new_snapshot->>'currency' IS DISTINCT FROM p_currency THEN
      RAISE EXCEPTION 'entity maintenance idempotency key conflict';
    END IF;
    RETURN v_existing.entity_id;
  END IF;
  v_snapshot:=jsonb_build_object('id',v_entity_id,'org_id',v_org_id,'name',p_name,'currency',p_currency);
  PERFORM set_config('tapaano.entity_master_purpose','create',true);
  PERFORM set_config('tapaano.entity_master_event_id',v_event_id::text,true);
  INSERT INTO public.entity_master_events(id,org_id,entity_id,actor_id,event_type,reason,
    idempotency_key,old_snapshot,new_snapshot)
  VALUES(v_event_id,v_org_id,v_entity_id,v_actor,'CREATE',p_reason,p_idempotency_key,NULL,v_snapshot);
  INSERT INTO public.entities(id,org_id,name,currency,created_at,updated_at)
    VALUES(v_entity_id,v_org_id,p_name,p_currency,v_now,v_now);
  RETURN v_entity_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.rename_tenant_entity(
  p_entity_id uuid,p_name text,p_reason text,p_idempotency_key text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE
  v_org_id uuid:=public.assert_entity_maintenance_admin();v_actor uuid:=auth.uid();
  v_existing public.entity_master_events%ROWTYPE;v_entity public.entities%ROWTYPE;
  v_event_id uuid:=gen_random_uuid();v_now timestamptz:=clock_timestamp();v_old jsonb;v_new jsonb;
BEGIN
  PERFORM public.validate_entity_maintenance_text(p_name,p_reason,p_idempotency_key);
  IF p_entity_id IS NULL THEN RAISE EXCEPTION 'entity not found or unavailable';END IF;
  LOCK TABLE public.entity_master_events,public.entities IN SHARE ROW EXCLUSIVE MODE;
  SELECT * INTO v_existing FROM public.entity_master_events
    WHERE org_id=v_org_id AND idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF v_existing.actor_id IS DISTINCT FROM v_actor OR v_existing.event_type<>'RENAME'
      OR v_existing.entity_id IS DISTINCT FROM p_entity_id OR v_existing.reason IS DISTINCT FROM p_reason
      OR v_existing.new_snapshot->>'name' IS DISTINCT FROM p_name THEN
      RAISE EXCEPTION 'entity maintenance idempotency key conflict';
    END IF;
    RETURN v_existing.entity_id;
  END IF;
  SELECT * INTO v_entity FROM public.entities WHERE id=p_entity_id AND org_id=v_org_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'entity not found or unavailable';END IF;
  IF v_entity.name=p_name THEN RAISE EXCEPTION 'entity rename must change the name';END IF;
  v_old:=public.entity_master_snapshot(v_entity);
  v_new:=jsonb_build_object('id',v_entity.id,'org_id',v_entity.org_id,'name',p_name,'currency',v_entity.currency);
  PERFORM set_config('tapaano.entity_master_purpose','rename',true);
  PERFORM set_config('tapaano.entity_master_event_id',v_event_id::text,true);
  INSERT INTO public.entity_master_events(id,org_id,entity_id,actor_id,event_type,reason,
    idempotency_key,old_snapshot,new_snapshot)
  VALUES(v_event_id,v_org_id,v_entity.id,v_actor,'RENAME',p_reason,p_idempotency_key,v_old,v_new);
  UPDATE public.entities SET name=p_name,updated_at=v_now WHERE id=v_entity.id;
  RETURN v_entity.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_tenant_entity_events()
RETURNS TABLE(event_id uuid,entity_id uuid,actor_id uuid,event_type text,reason text,
  old_name text,new_name text,currency text,occurred_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE v_org_id uuid:=public.assert_entity_maintenance_admin();
BEGIN
  RETURN QUERY SELECT event.id,event.entity_id,event.actor_id,event.event_type,event.reason,
    event.old_snapshot->>'name',event.new_snapshot->>'name',event.new_snapshot->>'currency',event.occurred_at
  FROM public.entity_master_events event WHERE event.org_id=v_org_id ORDER BY event.occurred_at,event.id;
END;
$$;

DO $$
DECLARE routine record;policy_record record;column_record record;role_name text;
BEGIN
  FOR routine IN SELECT p.oid::regprocedure AS signature,p.proname,oidvectortypes(p.proargtypes) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN('create_tenant_entity','rename_tenant_entity','list_tenant_entity_events')
  LOOP
    IF NOT((routine.proname='create_tenant_entity' AND routine.args='text, text, text, text')
      OR(routine.proname='rename_tenant_entity' AND routine.args='uuid, text, text, text')
      OR(routine.proname='list_tenant_entity_events' AND routine.args='')) THEN
      EXECUTE format('DROP FUNCTION %s CASCADE',routine.signature);
    END IF;
  END LOOP;
  ALTER TABLE public.entity_master_events ENABLE ROW LEVEL SECURITY;
  FOR policy_record IN SELECT policyname FROM pg_policies
    WHERE schemaname='public' AND tablename='entity_master_events'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.entity_master_events',policy_record.policyname);END LOOP;
  FOREACH role_name IN ARRAY ARRAY['PUBLIC','anon','authenticated','service_role'] LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.entity_master_events FROM %s',role_name);
  END LOOP;
  FOR column_record IN SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='entity_master_events'
  LOOP
    FOREACH role_name IN ARRAY ARRAY['PUBLIC','anon','authenticated','service_role'] LOOP
      EXECUTE format('REVOKE ALL PRIVILEGES (%I) ON TABLE public.entity_master_events FROM %s',column_record.column_name,role_name);
    END LOOP;
  END LOOP;
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    EXECUTE format('REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.entities FROM %I',role_name);
  END LOOP;
  FOR column_record IN SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='entities'
  LOOP
    FOREACH role_name IN ARRAY ARRAY['PUBLIC','anon','authenticated','service_role'] LOOP
      EXECUTE format('REVOKE ALL PRIVILEGES (%I) ON TABLE public.entities FROM %s',column_record.column_name,role_name);
    END LOOP;
  END LOOP;
  GRANT SELECT ON public.entities TO authenticated,service_role;
END;
$$;

REVOKE ALL ON FUNCTION public.entity_master_snapshot(public.entities) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.guard_entity_master_event_write() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.guard_controlled_entity_master() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.assert_entity_maintenance_admin() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.validate_entity_maintenance_text(text,text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.create_tenant_entity(text,text,text,text) FROM PUBLIC,anon,service_role;
REVOKE ALL ON FUNCTION public.rename_tenant_entity(uuid,text,text,text) FROM PUBLIC,anon,service_role;
REVOKE ALL ON FUNCTION public.list_tenant_entity_events() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.create_tenant_entity(text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rename_tenant_entity(uuid,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_tenant_entity_events() TO authenticated;

COMMIT;
