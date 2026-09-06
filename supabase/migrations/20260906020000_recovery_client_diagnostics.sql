BEGIN;

-- Sanitized operational counters only. These are not financial/audit evidence.
CREATE TABLE public.client_diagnostic_buckets (
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  actor_id uuid NOT NULL REFERENCES public.profiles(id),
  event_code text NOT NULL CHECK (event_code IN ('render_failed','profile_failed','session_failed','authentication_failed','read_failed','write_failed')),
  bucket_start timestamptz NOT NULL,
  release_sha text NOT NULL CHECK (release_sha='unversioned' OR release_sha ~ '^[a-f0-9]{40}$'),
  occurrences integer NOT NULL CHECK (occurrences BETWEEN 1 AND 1000),
  last_seen_at timestamptz NOT NULL,
  PRIMARY KEY (org_id, actor_id, event_code, bucket_start)
);
CREATE INDEX client_diagnostic_retention ON public.client_diagnostic_buckets(bucket_start);
ALTER TABLE public.client_diagnostic_buckets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_diagnostic_buckets FROM PUBLIC, anon, authenticated, service_role;
CREATE POLICY diagnostic_admin_read ON public.client_diagnostic_buckets
  FOR SELECT TO authenticated USING (
    org_id=public.get_user_org_id() AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );
GRANT SELECT ON public.client_diagnostic_buckets TO authenticated;

CREATE OR REPLACE FUNCTION public.record_client_diagnostic(p_event_code text, p_release_sha text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_org uuid:=public.get_user_org_id(); v_actor uuid:=auth.uid(); v_now timestamptz:=clock_timestamp(); v_recorded integer;
BEGIN
  IF v_actor IS NULL OR v_org IS NULL THEN
    RAISE EXCEPTION 'tenant membership is unavailable' USING ERRCODE='42501';
  END IF;
  IF p_event_code IS NULL OR p_event_code NOT IN ('render_failed','profile_failed','session_failed','authentication_failed','read_failed','write_failed')
    OR p_release_sha IS NULL OR NOT (p_release_sha='unversioned' OR p_release_sha ~ '^[a-f0-9]{40}$') THEN
    RAISE EXCEPTION 'invalid diagnostic event';
  END IF;
  INSERT INTO public.client_diagnostic_buckets(org_id,actor_id,event_code,bucket_start,release_sha,occurrences,last_seen_at)
    VALUES(v_org,v_actor,p_event_code,date_trunc('hour',v_now),p_release_sha,1,v_now)
  ON CONFLICT (org_id,actor_id,event_code,bucket_start) DO UPDATE
    SET occurrences=LEAST(public.client_diagnostic_buckets.occurrences+1,1000),
        release_sha=EXCLUDED.release_sha,last_seen_at=EXCLUDED.last_seen_at
    WHERE public.client_diagnostic_buckets.last_seen_at <= EXCLUDED.last_seen_at-interval '1 minute';
  GET DIAGNOSTICS v_recorded = ROW_COUNT;
  IF v_recorded=0 THEN RETURN; END IF;
  -- Bounded cleanup keeps only the recent diagnostic window during normal use.
  DELETE FROM public.client_diagnostic_buckets WHERE ctid IN (
    SELECT ctid FROM public.client_diagnostic_buckets
    WHERE bucket_start<v_now-interval '7 days' ORDER BY bucket_start LIMIT 250
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_client_diagnostic(text,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_client_diagnostic(text,text) TO authenticated;

COMMIT;
