// Minimal empty identity schema; migrations install every control under test.
export const emptyIdentityFixture = `
  CREATE SCHEMA auth;
  CREATE SCHEMA extensions;
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN;
  CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user', 'viewer');
  CREATE TABLE auth.users (
    id uuid PRIMARY KEY,
    email text,
    raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb
  );
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  CREATE OR REPLACE FUNCTION extensions.digest(value text, algorithm text)
  RETURNS bytea LANGUAGE sql IMMUTABLE AS $$
    SELECT decode(md5(value) || md5('tapaano:' || value), 'hex')
    WHERE algorithm = 'sha256'
  $$;
  CREATE TABLE public.organizations (id uuid PRIMARY KEY, name text NOT NULL);
  CREATE TABLE public.profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
    display_name text,
    role text DEFAULT 'user',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE public.user_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role public.app_role NOT NULL DEFAULT 'user',
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
  );
  CREATE OR REPLACE FUNCTION public.get_user_org_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,auth AS $$
    SELECT org_id FROM public.profiles WHERE id=auth.uid()
  $$;
  CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,auth AS $$
    SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role)
  $$;
  CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
  RETURNS public.app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,auth AS $$
    SELECT role FROM public.user_roles WHERE user_id=_user_id LIMIT 1
  $$;
  CREATE OR REPLACE FUNCTION public.assert_accounting_actor(p_org_id uuid)
  RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,auth AS $$
  BEGIN RETURN auth.uid(); END;
  $$;
  CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
  BEGIN RETURN NEW; END;
  $$;
  CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

`;
