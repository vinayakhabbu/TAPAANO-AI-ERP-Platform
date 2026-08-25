-- Recovery containment for accounting master data used by verified workflows.
-- Existing entities, accounts, customers and vendors remain tenant-readable but
-- cannot be created, renamed, reclassified, retired or deleted until controlled
-- audited maintenance workflows exist.

BEGIN;

LOCK TABLE public.organizations, public.entities, public.accounts,
  public.customers, public.vendors IN SHARE ROW EXCLUSIVE MODE;

CREATE UNIQUE INDEX IF NOT EXISTS entities_org_id_id_master_uidx ON public.entities (org_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS accounts_org_id_id_master_uidx ON public.accounts (org_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS customers_org_id_id_master_uidx ON public.customers (org_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS vendors_org_id_id_master_uidx ON public.vendors (org_id, id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.entities
    WHERE btrim(name) = '' OR name ~ '[[:cntrl:]]' OR currency IS NULL
       OR currency !~ '^[A-Z]{3}$'
  ) THEN
    RAISE EXCEPTION 'accounting master preflight: invalid entity identity or currency';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.accounts account
    LEFT JOIN public.accounts parent ON parent.id = account.parent_id
    WHERE account.code !~ '^[A-Za-z0-9][A-Za-z0-9._/-]*$'
       OR btrim(account.name) = '' OR account.name ~ '[[:cntrl:]]'
       OR (account.parent_id IS NOT NULL AND (
         parent.id IS NULL OR parent.org_id IS DISTINCT FROM account.org_id
         OR parent.id = account.id
       ))
  ) THEN
    RAISE EXCEPTION 'accounting master preflight: invalid account identity or hierarchy';
  END IF;

  IF EXISTS (
    WITH RECURSIVE account_chain AS (
      SELECT id AS origin_id, parent_id AS next_id, ARRAY[id] AS path, false AS cycle
      FROM public.accounts
      UNION ALL
      SELECT chain.origin_id, parent.parent_id, chain.path || parent.id,
        parent.id = ANY(chain.path)
      FROM account_chain chain
      JOIN public.accounts parent ON parent.id = chain.next_id
      WHERE chain.next_id IS NOT NULL AND NOT chain.cycle
    )
    SELECT 1 FROM account_chain WHERE cycle
  ) THEN
    RAISE EXCEPTION 'accounting master preflight: account hierarchy cycle';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.customers WHERE btrim(name) = '' OR name ~ '[[:cntrl:]]'
    UNION ALL
    SELECT 1 FROM public.vendors WHERE btrim(name) = '' OR name ~ '[[:cntrl:]]'
  ) THEN
    RAISE EXCEPTION 'accounting master preflight: invalid customer or vendor identity';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accounts_org_parent_master_fkey') THEN
    ALTER TABLE public.accounts ADD CONSTRAINT accounts_org_parent_master_fkey
      FOREIGN KEY (org_id, parent_id) REFERENCES public.accounts(org_id, id);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_frozen_accounting_master()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'accounting master data is immutable; controlled maintenance unavailable';
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
  FOREACH target_table IN ARRAY ARRAY['entities', 'accounts', 'customers', 'vendors'] LOOP
    FOR trigger_record IN
      SELECT trigger.tgname FROM pg_trigger trigger
      JOIN pg_class relation ON relation.oid = trigger.tgrelid
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public' AND relation.relname = target_table
        AND NOT trigger.tgisinternal
    LOOP
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', trigger_record.tgname, target_table);
    END LOOP;

    EXECUTE format(
      'CREATE TRIGGER guard_master_write BEFORE INSERT OR UPDATE OR DELETE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.guard_frozen_accounting_master()', target_table
    );
    EXECUTE format(
      'CREATE TRIGGER guard_master_truncate BEFORE TRUNCATE ON public.%I '
      'FOR EACH STATEMENT EXECUTE FUNCTION public.guard_frozen_accounting_master()', target_table
    );
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target_table);

    FOR policy_record IN
      SELECT policyname FROM pg_policies AS policy_info
      WHERE policy_info.schemaname = 'public' AND policy_info.tablename = target_table
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_record.policyname, target_table);
    END LOOP;
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated '
      'USING (org_id = public.get_user_org_id())',
      target_table || '_tenant_master_read', target_table
    );

    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated, service_role', target_table);
    FOR column_record IN
      SELECT column_info.column_name FROM information_schema.columns AS column_info
      WHERE column_info.table_schema = 'public' AND column_info.table_name = target_table
    LOOP
      EXECUTE format('REVOKE ALL PRIVILEGES (%I) ON TABLE public.%I FROM PUBLIC',
        column_record.column_name, target_table);
      FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
        EXECUTE format('REVOKE ALL PRIVILEGES (%I) ON TABLE public.%I FROM %I',
          column_record.column_name, target_table, role_name);
      END LOOP;
    END LOOP;
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated, service_role', target_table);

    IF EXISTS (
      SELECT 1 FROM pg_publication_tables AS publication_info
      WHERE publication_info.pubname = 'supabase_realtime'
        AND publication_info.schemaname = 'public'
        AND publication_info.tablename = target_table
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', target_table);
    END IF;
  END LOOP;
END;
$$;

COMMIT;
