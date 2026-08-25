import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migrationUrl = new URL(
  "../supabase/migrations/20260825050000_recovery_banking_containment.sql",
  import.meta.url,
);
const a = "00000000-0000-4000-8000-000000000001";
const b = "00000000-0000-4000-8000-000000000002";
const entityA = "10000000-0000-4000-8000-000000000001";
const entityB = "10000000-0000-4000-8000-000000000002";
const accountA = "20000000-0000-4000-8000-000000000001";
const bankA = "30000000-0000-4000-8000-000000000001";
const bankB = "30000000-0000-4000-8000-000000000002";
const userA = "40000000-0000-4000-8000-000000000001";

const fixture = `
  CREATE SCHEMA auth;
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
  CREATE TABLE auth.users (id uuid PRIMARY KEY);
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  CREATE TABLE public.organizations (id uuid PRIMARY KEY, name text);
  CREATE TABLE public.entities (id uuid PRIMARY KEY, org_id uuid NOT NULL, name text);
  CREATE TABLE public.accounts (id uuid PRIMARY KEY, org_id uuid NOT NULL, name text);
  CREATE TABLE public.profiles (id uuid PRIMARY KEY, org_id uuid);
  CREATE OR REPLACE FUNCTION public.get_user_org_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT org_id FROM public.profiles WHERE id = auth.uid()
  $$;
  CREATE TABLE public.invoices (id uuid PRIMARY KEY, org_id uuid NOT NULL);
  CREATE TABLE public.bills (id uuid PRIMARY KEY, org_id uuid NOT NULL);
  CREATE TABLE public.payment_runs (id uuid PRIMARY KEY, org_id uuid NOT NULL);
  CREATE TABLE public.journal_entries (id uuid PRIMARY KEY, org_id uuid NOT NULL);
  CREATE TABLE public.bank_accounts (
    id uuid PRIMARY KEY, org_id uuid NOT NULL, entity_id uuid NOT NULL, account_id uuid,
    name text NOT NULL, bank_name text, account_number text, routing_number text,
    currency text NOT NULL DEFAULT 'USD', current_balance numeric NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
  );
  CREATE TABLE public.matching_rules (id uuid PRIMARY KEY, org_id uuid NOT NULL, name text);
  CREATE TABLE public.bank_statement_imports (
    id uuid PRIMARY KEY, org_id uuid NOT NULL, bank_account_id uuid NOT NULL, file_name text
  );
  CREATE TABLE public.bank_transactions (
    id uuid PRIMARY KEY, org_id uuid NOT NULL, bank_account_id uuid NOT NULL,
    transaction_date date NOT NULL, description text, amount numeric NOT NULL, status text DEFAULT 'pending',
    matched_invoice_id uuid, matched_bill_id uuid, suggested_account_id uuid,
    matched_rule_id uuid, import_id uuid, journal_entry_id uuid,
    created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
  );
  CREATE TABLE public.positive_pay_checks (
    id uuid PRIMARY KEY, org_id uuid NOT NULL, bank_account_id uuid NOT NULL,
    amount numeric NOT NULL, presented_amount numeric, bill_id uuid, payment_run_id uuid
  );
  CREATE TABLE public.bank_feed_connections (
    id uuid PRIMARY KEY, org_id uuid NOT NULL, bank_account_id uuid NOT NULL, connection_metadata jsonb
  );
  CREATE TABLE public.bank_connections (
    id uuid PRIMARY KEY, org_id uuid NOT NULL, bank_account_id uuid, access_token_encrypted text
  );
  CREATE FUNCTION public.apply_matching_rules(uuid) RETURNS uuid LANGUAGE sql AS $$ SELECT $1 $$;
  CREATE FUNCTION public.apply_matching_rules(text) RETURNS text LANGUAGE sql AS $$ SELECT $1 $$;
  DO $$ DECLARE t text; BEGIN
    FOREACH t IN ARRAY ARRAY['bank_accounts','bank_transactions','matching_rules','bank_statement_imports','positive_pay_checks','bank_feed_connections','bank_connections'] LOOP
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('CREATE POLICY hostile_all ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);
      EXECUTE format('GRANT ALL ON public.%I TO authenticated, service_role', t);
    END LOOP;
  END $$;
  INSERT INTO public.organizations VALUES ('${a}','A'),('${b}','B');
  INSERT INTO public.entities VALUES ('${entityA}','${a}','EA'),('${entityB}','${b}','EB');
  INSERT INTO public.accounts VALUES ('${accountA}','${a}','Cash');
  INSERT INTO auth.users VALUES ('${userA}'); INSERT INTO public.profiles VALUES ('${userA}','${a}');
  INSERT INTO public.invoices VALUES (gen_random_uuid(),'${a}');
  INSERT INTO public.bills VALUES (gen_random_uuid(),'${a}');
  INSERT INTO public.payment_runs VALUES (gen_random_uuid(),'${a}');
  INSERT INTO public.journal_entries VALUES (gen_random_uuid(),'${a}');
  INSERT INTO public.bank_accounts VALUES
    ('${bankA}','${a}','${entityA}','${accountA}','Operating A','Bank A','1234','5678','USD',900,true,now(),now()),
    ('${bankB}','${b}','${entityB}',NULL,'Operating B','Bank B','9999','0000','USD',800,true,now(),now());
  INSERT INTO public.matching_rules VALUES (gen_random_uuid(),'${a}','Legacy rule');
  INSERT INTO public.bank_statement_imports VALUES (gen_random_uuid(),'${a}','${bankA}','legacy.csv');
  INSERT INTO public.bank_transactions VALUES
    (gen_random_uuid(),'${a}','${bankA}','2026-08-25','Legacy transaction',25,'pending',NULL,NULL,NULL,NULL,NULL,NULL,now(),now());
  INSERT INTO public.positive_pay_checks VALUES (gen_random_uuid(),'${a}','${bankA}',25,NULL,NULL,NULL);
  INSERT INTO public.bank_feed_connections VALUES (gen_random_uuid(),'${a}','${bankA}','{"token":"hidden"}');
  INSERT INTO public.bank_connections VALUES (gen_random_uuid(),'${a}','${bankA}','encrypted-secret');
`;

async function createDb({ migrate = true } = {}) {
  const db = new PGlite();
  await db.exec(fixture);
  const migration = await readFile(migrationUrl, "utf8");
  if (migrate) await db.exec(migration);
  return { db, migration };
}

test("banking migration replays, strips hostile grants, and erases matcher overloads", async () => {
  const { db, migration } = await createDb();
  await db.exec(`
    GRANT ALL ON public.bank_transactions, public.matching_rules TO authenticated, service_role;
    GRANT SELECT (current_balance), UPDATE (account_number) ON public.bank_accounts TO authenticated, service_role;
    CREATE FUNCTION public.apply_matching_rules(integer) RETURNS integer LANGUAGE sql AS $$ SELECT $1 $$;
  `);
  await db.exec(migration);
  const privileges = await db.query(`
    SELECT has_column_privilege('authenticated','public.bank_accounts','name','SELECT') AS safe_name,
      has_column_privilege('authenticated','public.bank_accounts','current_balance','SELECT') AS balance,
      has_column_privilege('service_role','public.bank_accounts','account_number','SELECT') AS service_number,
      has_column_privilege('authenticated','public.bank_transactions','description','SELECT') AS safe_description,
      has_column_privilege('authenticated','public.bank_transactions','amount','SELECT') AS amount,
      has_table_privilege('authenticated','public.matching_rules','SELECT') AS rules
  `);
  assert.deepEqual(privileges.rows[0], {
    safe_name: true, balance: false, service_number: false,
    safe_description: true, amount: false, rules: false,
  });
  const functions = await db.query(`SELECT count(*)::int AS count FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='apply_matching_rules'`);
  assert.equal(functions.rows[0].count, 0);
  await db.close();
});

test("banking tables are immutable even to the table owner", async () => {
  const { db } = await createDb();
  for (const sql of [
    `UPDATE public.bank_accounts SET current_balance = 1 WHERE id = '${bankA}'`,
    `DELETE FROM public.bank_transactions`,
    `TRUNCATE public.bank_feed_connections`,
  ]) await assert.rejects(db.exec(sql), /legacy banking history is immutable/);
  await db.close();
});

test("authenticated client receives tenant-safe metadata but no secret or amount columns", async () => {
  const { db } = await createDb();
  await db.exec(`SELECT set_config('request.jwt.claim.sub','${userA}',false); SET ROLE authenticated;`);
  const accounts = await db.query(`SELECT id,name,bank_name,currency FROM public.bank_accounts`);
  assert.deepEqual(accounts.rows, [{ id: bankA, name: "Operating A", bank_name: "Bank A", currency: "USD" }]);
  const transactions = await db.query(`SELECT description,transaction_date::text FROM public.bank_transactions`);
  assert.equal(transactions.rows.length, 1);
  await assert.rejects(db.query(`SELECT current_balance FROM public.bank_accounts`), /permission denied/);
  await assert.rejects(db.query(`SELECT amount FROM public.bank_transactions`), /permission denied/);
  await assert.rejects(db.query(`SELECT connection_metadata FROM public.bank_feed_connections`), /permission denied/);
  await db.close();
});

test("persistent composite constraints reject cross-tenant transaction lineage", async () => {
  const { db } = await createDb();
  await db.exec(`ALTER TABLE public.bank_transactions DISABLE TRIGGER guard_bank_transactions_write`);
  await assert.rejects(db.exec(`
    INSERT INTO public.bank_transactions (id,org_id,bank_account_id,transaction_date,amount)
    VALUES (gen_random_uuid(),'${a}','${bankB}','2026-08-25',10)
  `), /foreign key constraint/);
  await db.close();
});

test("cross-tenant legacy banking data aborts migration atomically", async () => {
  const { db, migration } = await createDb({ migrate: false });
  await db.exec(`UPDATE public.bank_transactions SET bank_account_id='${bankB}' WHERE org_id='${a}'`);
  await assert.rejects(db.exec(migration), /invalid transaction lineage or amount/);
  await db.exec(`ROLLBACK`);
  const guard = await db.query(`SELECT count(*)::int AS count FROM pg_trigger WHERE tgname='guard_bank_transactions_write'`);
  assert.equal(guard.rows[0].count, 0);
  await db.close();
});
