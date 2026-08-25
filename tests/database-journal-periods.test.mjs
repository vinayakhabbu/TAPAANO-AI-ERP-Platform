import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migrationUrl = new URL(
  "../supabase/migrations/20260825010000_recovery_journal_periods.sql",
  import.meta.url,
);

const ids = {
  orgA: "00000000-0000-4000-8000-000000000001",
  orgB: "00000000-0000-4000-8000-000000000002",
  entityA: "10000000-0000-4000-8000-000000000001",
  entityB: "10000000-0000-4000-8000-000000000002",
  adminA: "20000000-0000-4000-8000-000000000001",
  userA: "20000000-0000-4000-8000-000000000002",
  cashA: "30000000-0000-4000-8000-000000000001",
  revenueA: "30000000-0000-4000-8000-000000000002",
  cashB: "30000000-0000-4000-8000-000000000003",
};

const fixture = `
  CREATE SCHEMA auth;
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN;
  CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user', 'viewer');
  CREATE TYPE public.account_type AS ENUM ('asset', 'liability', 'equity', 'revenue', 'expense');
  CREATE TYPE public.journal_status AS ENUM ('draft', 'posted', 'reversed');

  CREATE TABLE auth.users (id uuid PRIMARY KEY);
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
  LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;

  CREATE TABLE public.organizations (id uuid PRIMARY KEY, name text NOT NULL);
  CREATE TABLE public.entities (
    id uuid PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.organizations(id),
    name text NOT NULL,
    currency text NOT NULL DEFAULT 'USD'
  );
  CREATE TABLE public.profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id),
    org_id uuid REFERENCES public.organizations(id),
    role text
  );
  CREATE TABLE public.user_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id),
    role public.app_role NOT NULL,
    UNIQUE (user_id, role)
  );
  CREATE TABLE public.accounts (
    id uuid PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.organizations(id),
    code text NOT NULL,
    name text NOT NULL,
    account_type public.account_type NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    UNIQUE (org_id, code)
  );
  CREATE TABLE public.journal_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.organizations(id),
    entity_id uuid NOT NULL REFERENCES public.entities(id),
    entry_number text NOT NULL,
    entry_date date NOT NULL,
    memo text,
    status public.journal_status NOT NULL DEFAULT 'draft',
    created_by uuid REFERENCES auth.users(id),
    posted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (org_id, entry_number)
  );
  CREATE TABLE public.journal_lines (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_entry_id uuid NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
    account_id uuid NOT NULL REFERENCES public.accounts(id),
    debit numeric(15,2) NOT NULL DEFAULT 0,
    credit numeric(15,2) NOT NULL DEFAULT 0,
    memo text,
    created_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE OR REPLACE FUNCTION public.get_user_org_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT org_id FROM public.profiles WHERE id = auth.uid()
  $$;
  CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
    )
  $$;

  INSERT INTO public.organizations VALUES
    ('${ids.orgA}', 'Org A'), ('${ids.orgB}', 'Org B');
  INSERT INTO public.entities VALUES
    ('${ids.entityA}', '${ids.orgA}', 'Entity A', 'USD'),
    ('${ids.entityB}', '${ids.orgB}', 'Entity B', 'USD');
  INSERT INTO auth.users VALUES ('${ids.adminA}'), ('${ids.userA}');
  INSERT INTO public.profiles VALUES
    ('${ids.adminA}', '${ids.orgA}', 'admin'),
    ('${ids.userA}', '${ids.orgA}', 'user');
  INSERT INTO public.user_roles (user_id, role) VALUES
    ('${ids.adminA}', 'admin'), ('${ids.userA}', 'user');
  INSERT INTO public.accounts VALUES
    ('${ids.cashA}', '${ids.orgA}', '1000', 'Cash', 'asset', true),
    ('${ids.revenueA}', '${ids.orgA}', '4000', 'Revenue', 'revenue', true),
    ('${ids.cashB}', '${ids.orgB}', '1000', 'Cash', 'asset', true);
`;

async function createDb() {
  const db = new PGlite();
  await db.exec(fixture);
  const migration = await readFile(migrationUrl, "utf8");
  await db.exec(migration);
  await db.exec(`SELECT set_config('request.jwt.claim.sub', '${ids.adminA}', false);`);
  return { db, migration };
}

async function expectReject(action, pattern) {
  await assert.rejects(action, pattern);
}

const lines = JSON.stringify([
  { account_id: ids.cashA, debit: "125.50", credit: "0.00", memo: "Cash" },
  { account_id: ids.revenueA, debit: "0.00", credit: "125.50", memo: "Revenue" },
]);

test("journal migration replays and installs an OPEN period", async () => {
  const { db, migration } = await createDb();
  await db.exec(`GRANT INSERT, UPDATE, DELETE ON public.journal_entries TO authenticated;`);
  await db.exec(migration);
  const result = await db.query(`
    SELECT public.create_accounting_period(
      '${ids.entityA}', DATE '2026-08-01', DATE '2026-08-31', 'aug-2026'
    ) AS id
  `);
  assert.equal(result.rows.length, 1);
  const privileges = await db.query(`
    SELECT has_table_privilege('authenticated', 'public.journal_entries', 'INSERT') AS can_insert,
           has_table_privilege('authenticated', 'public.journal_entries', 'SELECT') AS can_select
  `);
  assert.deepEqual(privileges.rows[0], { can_insert: false, can_select: true });
  await expectReject(
    () => db.exec(`UPDATE public.accounting_periods SET status = 'HARD_CLOSED' WHERE id = '${result.rows[0].id}';`),
    /immutable|trusted accounting workflow/i,
  );
  await db.close();
});

test("balanced posting is atomic, period-linked, immutable and idempotent", async () => {
  const { db } = await createDb();
  await db.exec(`SELECT public.create_accounting_period('${ids.entityA}', '2026-08-01', '2026-08-31', 'aug-2026');`);
  const first = await db.query(`
    SELECT public.post_manual_journal(
      '${ids.entityA}', 'JE-1001', '2026-08-25', 'Recovery test',
      '${lines}'::jsonb, 'manual:je-1001'
    ) AS id
  `);
  const second = await db.query(`
    SELECT public.post_manual_journal(
      '${ids.entityA}', 'JE-1001', '2026-08-25', 'Recovery test',
      '${lines}'::jsonb, 'manual:je-1001'
    ) AS id
  `);
  assert.equal(first.rows[0].id, second.rows[0].id);

  const graph = await db.query(`
    SELECT je.status::text, je.accounting_period_id IS NOT NULL AS period_linked,
           je.accounting_event_id IS NOT NULL AS event_linked,
           count(jl.id)::int AS line_count,
           sum(jl.debit)::text AS debit, sum(jl.credit)::text AS credit
    FROM public.journal_entries je
    JOIN public.journal_lines jl ON jl.journal_entry_id = je.id
    WHERE je.id = '${first.rows[0].id}'
    GROUP BY je.id
  `);
  assert.deepEqual(graph.rows[0], {
    status: "posted",
    period_linked: true,
    event_linked: true,
    line_count: 2,
    debit: "125.50",
    credit: "125.50",
  });

  await expectReject(
    () => db.exec(`UPDATE public.journal_entries SET memo = 'forged' WHERE id = '${first.rows[0].id}';`),
    /immutable|trusted accounting workflow/i,
  );
  await expectReject(
    () => db.exec(`DELETE FROM public.journal_lines WHERE journal_entry_id = '${first.rows[0].id}';`),
    /immutable|trusted accounting workflow/i,
  );
  await expectReject(
    () => db.exec(`DELETE FROM public.accounting_events WHERE journal_entry_id = '${first.rows[0].id}';`),
    /immutable|trusted accounting workflow/i,
  );
  await db.close();
});

test("unbalanced, cross-tenant and unauthorized postings fail without residue", async () => {
  const { db } = await createDb();
  await db.exec(`SELECT public.create_accounting_period('${ids.entityA}', '2026-08-01', '2026-08-31', 'aug-2026');`);

  const unbalanced = JSON.stringify([
    { account_id: ids.cashA, debit: "10.00", credit: "0.00" },
    { account_id: ids.revenueA, debit: "0.00", credit: "9.99" },
  ]);
  await expectReject(
    () => db.query(`SELECT public.post_manual_journal('${ids.entityA}', 'BAD-1', '2026-08-25', null, '${unbalanced}'::jsonb, 'bad:1');`),
    /balanced/i,
  );

  const crossTenant = JSON.stringify([
    { account_id: ids.cashB, debit: "10.00", credit: "0.00" },
    { account_id: ids.revenueA, debit: "0.00", credit: "10.00" },
  ]);
  await expectReject(
    () => db.query(`SELECT public.post_manual_journal('${ids.entityA}', 'BAD-2', '2026-08-25', null, '${crossTenant}'::jsonb, 'bad:2');`),
    /account|tenant|organization/i,
  );

  await db.exec(`SELECT set_config('request.jwt.claim.sub', '${ids.userA}', false);`);
  await expectReject(
    () => db.query(`SELECT public.post_manual_journal('${ids.entityA}', 'BAD-3', '2026-08-25', null, '${lines}'::jsonb, 'bad:3');`),
    /admin|moderator|authorized/i,
  );
  const residue = await db.query(`SELECT count(*)::int AS count FROM public.journal_entries;`);
  assert.equal(residue.rows[0].count, 0);
  await db.close();
});

test("supported accounting RPCs do not reveal whether a foreign target exists", async () => {
  const { db } = await createDb();
  const missing = "ffffffff-ffff-4fff-8fff-ffffffffffff";
  for (const entityId of [ids.entityB, missing]) {
    await expectReject(
      () => db.query(`SELECT public.create_accounting_period('${entityId}','2026-08-01','2026-08-31','hidden:${entityId}')`),
      /entity not found or unavailable/,
    );
    await expectReject(
      () => db.query(`SELECT public.post_manual_journal('${entityId}','HIDDEN','2026-08-25',null,'${lines}'::jsonb,'hidden:${entityId}')`),
      /entity not found or unavailable/,
    );
  }
  await db.close();
});

test("period state machine blocks overlap and posting after close", async () => {
  const { db } = await createDb();
  const period = await db.query(`SELECT public.create_accounting_period('${ids.entityA}', '2026-08-01', '2026-08-31', 'aug-2026') AS id;`);
  await expectReject(
    () => db.query(`SELECT public.create_accounting_period('${ids.entityA}', '2026-08-15', '2026-09-15', 'overlap');`),
    /overlap/i,
  );
  await db.query(`SELECT public.transition_accounting_period('${period.rows[0].id}', 'SOFT_CLOSED', 'month-end');`);
  await expectReject(
    () => db.query(`SELECT public.post_manual_journal('${ids.entityA}', 'BAD-CLOSE', '2026-08-25', null, '${lines}'::jsonb, 'bad:close');`),
    /open accounting period/i,
  );
  await db.query(`SELECT public.transition_accounting_period('${period.rows[0].id}', 'OPEN', 'correction');`);
  await db.query(`SELECT public.transition_accounting_period('${period.rows[0].id}', 'HARD_CLOSED', 'final');`);
  await expectReject(
    () => db.query(`SELECT public.transition_accounting_period('${period.rows[0].id}', 'OPEN', 'forged reopen');`),
    /terminal|hard.closed/i,
  );
  await db.close();
});

test("reversal posts exact offsets in an open period and safely retries", async () => {
  const { db } = await createDb();
  const august = await db.query(`SELECT public.create_accounting_period('${ids.entityA}', '2026-08-01', '2026-08-31', 'aug-2026') AS id;`);
  await db.query(`SELECT public.create_accounting_period('${ids.entityA}', '2026-09-01', '2026-09-30', 'sep-2026');`);
  const posted = await db.query(`SELECT public.post_manual_journal('${ids.entityA}', 'JE-REV', '2026-08-25', null, '${lines}'::jsonb, 'manual:rev') AS id;`);
  await db.query(`SELECT public.transition_accounting_period('${august.rows[0].id}', 'HARD_CLOSED', 'final');`);
  const first = await db.query(`SELECT public.reverse_posted_journal('${posted.rows[0].id}', '2026-09-02', 'Correction', 'reverse:je-rev') AS id;`);
  const second = await db.query(`SELECT public.reverse_posted_journal('${posted.rows[0].id}', '2026-09-02', 'Correction', 'reverse:je-rev') AS id;`);
  assert.equal(first.rows[0].id, second.rows[0].id);

  const totals = await db.query(`
    SELECT je.reversal_of_id, original.status::text AS original_status,
           sum(jl.debit)::text AS debit, sum(jl.credit)::text AS credit
    FROM public.journal_entries je
    JOIN public.journal_entries original ON original.id = je.reversal_of_id
    JOIN public.journal_lines jl ON jl.journal_entry_id = je.id
    WHERE je.id = '${first.rows[0].id}'
    GROUP BY je.id, original.status
  `);
  assert.equal(totals.rows[0].reversal_of_id, posted.rows[0].id);
  assert.equal(totals.rows[0].original_status, "posted");
  assert.equal(totals.rows[0].debit, "125.50");
  assert.equal(totals.rows[0].credit, "125.50");
  await db.close();
});
