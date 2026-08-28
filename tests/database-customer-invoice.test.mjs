import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const journalMigrationUrl = new URL(
  "../supabase/migrations/20260825010000_recovery_journal_periods.sql",
  import.meta.url,
);
const invoiceMigrationUrl = new URL(
  "../supabase/migrations/20260825020000_recovery_customer_invoice.sql",
  import.meta.url,
);
const creditMigrationUrl = new URL(
  "../supabase/migrations/20260825090000_recovery_customer_credit_note.sql",
  import.meta.url,
);
const receiptMigrationUrl = new URL(
  "../supabase/migrations/20260825100000_recovery_customer_receipt.sql",
  import.meta.url,
);
const receiptCorrectionMigrationUrl = new URL(
  "../supabase/migrations/20260825140000_recovery_customer_receipt_correction.sql",
  import.meta.url,
);
const receiptReplacementMigrationUrl = new URL(
  "../supabase/migrations/20260825160000_recovery_customer_receipt_replacement.sql",
  import.meta.url,
);

const ids = {
  orgA: "00000000-0000-4000-8000-000000000001",
  orgB: "00000000-0000-4000-8000-000000000002",
  entityA: "10000000-0000-4000-8000-000000000001",
  entityB: "10000000-0000-4000-8000-000000000002",
  adminA: "20000000-0000-4000-8000-000000000001",
  userA: "20000000-0000-4000-8000-000000000002",
  adminB: "20000000-0000-4000-8000-000000000003",
  arA: "30000000-0000-4000-8000-000000000001",
  revenueA: "30000000-0000-4000-8000-000000000002",
  expenseA: "30000000-0000-4000-8000-000000000003",
  arB: "30000000-0000-4000-8000-000000000004",
  cashA: "30000000-0000-4000-8000-000000000005",
  cashB: "30000000-0000-4000-8000-000000000006",
  revenueB: "30000000-0000-4000-8000-000000000007",
  customerA: "40000000-0000-4000-8000-000000000001",
  customerB: "40000000-0000-4000-8000-000000000002",
};

const fixture = `
  CREATE SCHEMA auth;
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN;
  CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user', 'viewer');
  CREATE TYPE public.account_type AS ENUM ('asset', 'liability', 'equity', 'revenue', 'expense');
  CREATE TYPE public.journal_status AS ENUM ('draft', 'posted', 'reversed');
  CREATE TYPE public.invoice_status AS ENUM ('draft', 'sent', 'paid', 'overdue', 'cancelled');
  CREATE TABLE auth.users (id uuid PRIMARY KEY);
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  CREATE TABLE public.organizations (id uuid PRIMARY KEY, name text NOT NULL);
  CREATE TABLE public.entities (
    id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES public.organizations(id),
    name text NOT NULL, currency text NOT NULL DEFAULT 'USD'
  );
  CREATE TABLE public.profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id), org_id uuid REFERENCES public.organizations(id), role text
  );
  CREATE TABLE public.user_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id),
    role public.app_role NOT NULL, UNIQUE (user_id, role)
  );
  CREATE TABLE public.accounts (
    id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES public.organizations(id),
    code text NOT NULL, name text NOT NULL, account_type public.account_type NOT NULL,
    is_active boolean NOT NULL DEFAULT true, UNIQUE (org_id, code)
  );
  CREATE TABLE public.customers (
    id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES public.organizations(id),
    name text NOT NULL, payment_terms integer DEFAULT 30
  );
  CREATE TABLE public.invoices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.organizations(id),
    entity_id uuid NOT NULL REFERENCES public.entities(id),
    customer_id uuid NOT NULL REFERENCES public.customers(id),
    invoice_number text NOT NULL,
    issue_date date NOT NULL DEFAULT CURRENT_DATE,
    due_date date NOT NULL,
    subtotal numeric(15,2) NOT NULL DEFAULT 0,
    tax numeric(15,2) NOT NULL DEFAULT 0,
    total numeric(15,2) NOT NULL DEFAULT 0,
    amount_paid numeric(15,2) NOT NULL DEFAULT 0,
    status public.invoice_status NOT NULL DEFAULT 'draft',
    notes text,
    currency varchar(3) DEFAULT 'USD',
    exchange_rate numeric(18,8) DEFAULT 1,
    functional_total numeric(18,4),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (org_id, invoice_number)
  );
  CREATE TABLE public.journal_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES public.organizations(id),
    entity_id uuid NOT NULL REFERENCES public.entities(id), entry_number text NOT NULL,
    entry_date date NOT NULL, memo text, status public.journal_status NOT NULL DEFAULT 'draft',
    created_by uuid REFERENCES auth.users(id), posted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (org_id, entry_number)
  );
  CREATE TABLE public.journal_lines (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_entry_id uuid NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
    account_id uuid NOT NULL REFERENCES public.accounts(id),
    debit numeric(15,2) NOT NULL DEFAULT 0, credit numeric(15,2) NOT NULL DEFAULT 0,
    memo text, created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE OR REPLACE FUNCTION public.get_user_org_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT org_id FROM public.profiles WHERE id = auth.uid()
  $$;
  CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
  $$;
  INSERT INTO public.organizations VALUES ('${ids.orgA}', 'Org A'), ('${ids.orgB}', 'Org B');
  INSERT INTO public.entities VALUES
    ('${ids.entityA}', '${ids.orgA}', 'Entity A', 'USD'),
    ('${ids.entityB}', '${ids.orgB}', 'Entity B', 'USD');
  INSERT INTO auth.users VALUES ('${ids.adminA}'), ('${ids.userA}'), ('${ids.adminB}');
  INSERT INTO public.profiles VALUES
    ('${ids.adminA}', '${ids.orgA}', 'admin'), ('${ids.userA}', '${ids.orgA}', 'user'),
    ('${ids.adminB}', '${ids.orgB}', 'admin');
  INSERT INTO public.user_roles (user_id, role) VALUES
    ('${ids.adminA}', 'admin'), ('${ids.userA}', 'user'), ('${ids.adminB}', 'admin');
  INSERT INTO public.accounts VALUES
    ('${ids.arA}', '${ids.orgA}', '1100', 'Accounts Receivable', 'asset', true),
    ('${ids.revenueA}', '${ids.orgA}', '4000', 'Revenue', 'revenue', true),
    ('${ids.expenseA}', '${ids.orgA}', '5000', 'Expense', 'expense', true),
    ('${ids.arB}', '${ids.orgB}', '1100', 'Accounts Receivable', 'asset', true),
    ('${ids.cashA}', '${ids.orgA}', '1000', 'Cash clearing', 'asset', true),
    ('${ids.cashB}', '${ids.orgB}', '1000', 'Cash clearing', 'asset', true),
    ('${ids.revenueB}', '${ids.orgB}', '4000', 'Revenue', 'revenue', true);
  INSERT INTO public.customers VALUES
    ('${ids.customerA}', '${ids.orgA}', 'Customer A', 30),
    ('${ids.customerB}', '${ids.orgB}', 'Customer B', 30);
`;

async function createDb({
  credit = false,
  receipt = false,
  receiptCorrection = false,
  receiptReplacement = false,
} = {}) {
  const db = new PGlite();
  await db.exec(fixture);
  await db.exec(await readFile(journalMigrationUrl, "utf8"));
  const invoiceMigration = await readFile(invoiceMigrationUrl, "utf8");
  await db.exec(invoiceMigration);
  let creditMigration = null;
  if (credit || receipt || receiptCorrection || receiptReplacement) {
    creditMigration = await readFile(creditMigrationUrl, "utf8");
    await db.exec(creditMigration);
  }
  let receiptMigration = null;
  if (receipt || receiptCorrection || receiptReplacement) {
    receiptMigration = await readFile(receiptMigrationUrl, "utf8");
    await db.exec(receiptMigration);
  }
  let receiptCorrectionMigration = null;
  if (receiptCorrection || receiptReplacement) {
    receiptCorrectionMigration = await readFile(receiptCorrectionMigrationUrl, "utf8");
    await db.exec(receiptCorrectionMigration);
  }
  let receiptReplacementMigration = null;
  if (receiptReplacement) {
    receiptReplacementMigration = await readFile(receiptReplacementMigrationUrl, "utf8");
    await db.exec(receiptReplacementMigration);
  }
  await db.exec(`SELECT set_config('request.jwt.claim.sub', '${ids.adminA}', false);`);
  return {
    db,
    invoiceMigration,
    creditMigration,
    receiptMigration,
    receiptCorrectionMigration,
    receiptReplacementMigration,
  };
}

const invoiceLines = JSON.stringify([
  { description: "Implementation", quantity: "2.0000", unit_price: "50.1250" },
  { description: "Support", quantity: "1.0000", unit_price: "24.7500" },
]);

async function expectReject(action, pattern) {
  await assert.rejects(action, pattern);
}

async function prepare(db) {
  await db.exec(`SELECT public.create_accounting_period('${ids.entityA}', '2026-08-01', '2026-08-31', 'aug-2026');`);
  await db.exec(`SELECT public.configure_entity_invoice_accounts('${ids.entityA}', '${ids.arA}', '${ids.revenueA}', 'ar-control-v1');`);
}

test("invoice migration replays and removes hostile invoice write grants", async () => {
  const { db, invoiceMigration } = await createDb();
  await db.exec(`GRANT INSERT, UPDATE, DELETE ON public.invoices TO authenticated, service_role;`);
  await db.exec(invoiceMigration);
  const privileges = await db.query(`
    SELECT has_table_privilege('authenticated', 'public.invoices', 'INSERT') AS auth_insert,
           has_table_privilege('service_role', 'public.invoices', 'UPDATE') AS service_update,
           has_table_privilege('authenticated', 'public.invoices', 'SELECT') AS auth_select
  `);
  assert.deepEqual(privileges.rows[0], { auth_insert: false, service_update: false, auth_select: true });
  await db.close();
});

test("atomic invoice posting creates an exact immutable invoice-event-journal graph", async () => {
  const { db } = await createDb();
  await prepare(db);
  const posted = await db.query(`
    SELECT public.post_customer_invoice(
      '${ids.entityA}', '${ids.customerA}', 'INV-1001', '2026-08-25', '2026-09-24',
      'USD', 0, 'Recovery invoice', '${invoiceLines}'::jsonb, 'invoice:1001'
    ) AS id
  `);
  const invoiceId = posted.rows[0].id;
  const graph = await db.query(`
    SELECT i.accounting_status, i.subtotal::text, i.tax::text, i.total::text,
           i.functional_total::text, i.journal_entry_id IS NOT NULL AS journal_linked,
           i.accounting_event_id IS NOT NULL AS event_linked,
           (SELECT count(*)::int FROM public.invoice_lines il WHERE il.invoice_id = i.id) AS line_count,
           je.status::text AS journal_status,
           (SELECT sum(jl.debit)::text FROM public.journal_lines jl WHERE jl.journal_entry_id = je.id) AS debit,
           (SELECT sum(jl.credit)::text FROM public.journal_lines jl WHERE jl.journal_entry_id = je.id) AS credit
    FROM public.invoices i
    JOIN public.journal_entries je ON je.id = i.journal_entry_id
    WHERE i.id = '${invoiceId}'
  `);
  assert.deepEqual(graph.rows[0], {
    accounting_status: "POSTED",
    subtotal: "125.00",
    tax: "0.00",
    total: "125.00",
    functional_total: "125.0000",
    journal_linked: true,
    event_linked: true,
    line_count: 2,
    journal_status: "posted",
    debit: "125.00",
    credit: "125.00",
  });
  await expectReject(
    () => db.exec(`UPDATE public.invoices SET total = 1 WHERE id = '${invoiceId}';`),
    /immutable|trusted accounting workflow/i,
  );
  await db.close();
});

test("invoice posting safely retries after period close and account retirement", async () => {
  const { db } = await createDb();
  await prepare(db);
  const sql = `SELECT public.post_customer_invoice(
    '${ids.entityA}', '${ids.customerA}', 'INV-RETRY', '2026-08-25', '2026-09-24',
    'USD', 0, null, '${invoiceLines}'::jsonb, 'invoice:retry'
  ) AS id;`;
  const first = await db.query(sql);
  const period = await db.query(`SELECT id FROM public.accounting_periods WHERE entity_id = '${ids.entityA}';`);
  await db.exec(`SELECT public.transition_accounting_period('${period.rows[0].id}', 'HARD_CLOSED', 'final');`);
  await db.exec(`UPDATE public.accounts SET is_active = false WHERE id IN ('${ids.arA}', '${ids.revenueA}');`);
  const second = await db.query(sql);
  assert.equal(first.rows[0].id, second.rows[0].id);
  await db.close();
});

test("unsupported tax/currency and cross-tenant lineage fail atomically", async () => {
  const { db } = await createDb();
  await prepare(db);
  await expectReject(
    () => db.query(`SELECT public.post_customer_invoice('${ids.entityA}', '${ids.customerA}', 'TAX', '2026-08-25', '2026-09-24', 'USD', 1, null, '${invoiceLines}'::jsonb, 'invoice:tax');`),
    /zero.tax|tax.*unsupported/i,
  );
  await expectReject(
    () => db.query(`SELECT public.post_customer_invoice('${ids.entityA}', '${ids.customerA}', 'FX', '2026-08-25', '2026-09-24', 'EUR', 0, null, '${invoiceLines}'::jsonb, 'invoice:fx');`),
    /functional currency|cross.currency/i,
  );
  await expectReject(
    () => db.query(`SELECT public.post_customer_invoice('${ids.entityA}', '${ids.customerB}', 'CROSS', '2026-08-25', '2026-09-24', 'USD', 0, null, '${invoiceLines}'::jsonb, 'invoice:cross');`),
    /customer|organization|tenant/i,
  );
  const residue = await db.query(`SELECT count(*)::int AS count FROM public.invoices;`);
  assert.equal(residue.rows[0].count, 0);
  await db.close();
});

test("invoice RPCs do not reveal whether a foreign entity exists", async () => {
  const { db } = await createDb();
  const missing = "ffffffff-ffff-4fff-8fff-ffffffffffff";
  for (const entityId of [ids.entityB, missing]) {
    await expectReject(
      () => db.query(`SELECT public.configure_entity_invoice_accounts('${entityId}','${ids.arA}','${ids.revenueA}','hidden:${entityId}')`),
      /entity not found or unavailable/,
    );
    await expectReject(
      () => db.query(`SELECT public.post_customer_invoice('${entityId}','${ids.customerA}','HIDDEN','2026-08-25','2026-09-24','USD',0,null,'${invoiceLines}'::jsonb,'hidden:${entityId}')`),
      /entity not found or unavailable/,
    );
  }
  await db.close();
});

test("AR controls require same-tenant purpose-specific accounts and an authorized actor", async () => {
  const { db } = await createDb();
  await expectReject(
    () => db.query(`SELECT public.configure_entity_invoice_accounts('${ids.entityA}', '${ids.arB}', '${ids.revenueA}', 'cross');`),
    /account|organization|tenant/i,
  );
  await expectReject(
    () => db.query(`SELECT public.configure_entity_invoice_accounts('${ids.entityA}', '${ids.expenseA}', '${ids.revenueA}', 'wrong-ar');`),
    /asset|receivable/i,
  );
  await db.exec(`SELECT set_config('request.jwt.claim.sub', '${ids.userA}', false);`);
  await expectReject(
    () => db.query(`SELECT public.configure_entity_invoice_accounts('${ids.entityA}', '${ids.arA}', '${ids.revenueA}', 'user');`),
    /admin|moderator|authorized/i,
  );
  await db.close();
});

test("invoice journals cannot be reversed outside a future credit-note workflow", async () => {
  const { db } = await createDb();
  await prepare(db);
  const posted = await db.query(`SELECT public.post_customer_invoice(
    '${ids.entityA}', '${ids.customerA}', 'INV-NOREV', '2026-08-25', '2026-09-24',
    'USD', 0, null, '${invoiceLines}'::jsonb, 'invoice:no-rev'
  ) AS id;`);
  const invoice = await db.query(`SELECT journal_entry_id FROM public.invoices WHERE id = '${posted.rows[0].id}';`);
  await expectReject(
    () => db.query(`SELECT public.reverse_posted_journal('${invoice.rows[0].journal_entry_id}', '2026-08-26', 'Bypass', 'reverse:invoice');`),
    /credit.note|invoice journal/i,
  );
  await db.close();
});

async function postInvoice(db, number, key) {
  const posted = await db.query(`SELECT public.post_customer_invoice(
    '${ids.entityA}', '${ids.customerA}', '${number}', '2026-08-25', '2026-09-24',
    'USD', 0, null, '${invoiceLines}'::jsonb, '${key}'
  ) AS id;`);
  return posted.rows[0].id;
}

test("credit-note migration replays and removes hostile grants, policies, and routine overloads", async () => {
  const { db, creditMigration } = await createDb({ credit: true });
  await db.exec(`
    GRANT INSERT,UPDATE,DELETE ON public.customer_credit_notes,public.customer_credit_note_lines
      TO authenticated,service_role;
    CREATE POLICY hostile_credit_all ON public.customer_credit_notes
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
    CREATE FUNCTION public.post_customer_credit_note(uuid,text) RETURNS uuid
      LANGUAGE sql SECURITY DEFINER AS 'SELECT $1';
    GRANT EXECUTE ON FUNCTION public.post_customer_credit_note(uuid,text) TO authenticated;
  `);
  await db.exec(creditMigration);
  for (const table of ["customer_credit_notes", "customer_credit_note_lines"]) {
    const grants = await db.query(`
      SELECT has_table_privilege('authenticated','public.${table}','SELECT') AS auth_read,
        has_table_privilege('authenticated','public.${table}','UPDATE') AS auth_update,
        has_table_privilege('service_role','public.${table}','INSERT') AS service_insert
    `);
    assert.deepEqual(grants.rows[0], { auth_read: true, auth_update: false, service_insert: false }, table);
    const policies = await db.query(`SELECT count(*)::int AS count FROM pg_policies WHERE schemaname='public' AND tablename='${table}'`);
    assert.equal(policies.rows[0].count, 1, table);
  }
  const overloads = await db.query(`
    SELECT count(*)::int AS count FROM pg_proc procedure_info
    JOIN pg_namespace namespace ON namespace.oid=procedure_info.pronamespace
    WHERE namespace.nspname='public' AND procedure_info.proname='post_customer_credit_note'
      AND oidvectortypes(procedure_info.proargtypes) <> 'uuid, text, date, text, text'
  `);
  assert.equal(overloads.rows[0].count, 0);
  await db.close();
});

test("full credit note atomically creates exact immutable invoice-line-event-journal reversal evidence", async () => {
  const { db } = await createDb({ credit: true });
  await prepare(db);
  const invoiceId = await postInvoice(db, "INV-CREDIT", "invoice:credit");
  const credit = await db.query(`SELECT public.post_customer_credit_note(
    '${invoiceId}', 'CN-1001', '2026-08-26', 'Customer cancellation', 'credit:1001'
  ) AS id;`);
  const graph = await db.query(`
    SELECT credit.total::text, credit.currency, credit.original_invoice_id,
      credit.accounting_event_id IS NOT NULL AS event_linked,
      credit.journal_entry_id IS NOT NULL AS journal_linked,
      (SELECT count(*)::int FROM public.customer_credit_note_lines line
       WHERE line.credit_note_id=credit.id) AS line_count,
      event.source_type, event.source_id=credit.id AS event_source_matches,
      journal.status::text AS journal_status,
      journal.reversal_of_id=invoice.journal_entry_id AS reverses_invoice_journal,
      invoice_journal.reversed_by_id=journal.id AS original_links_credit,
      (SELECT sum(line.debit)::text FROM public.journal_lines line
       WHERE line.journal_entry_id=journal.id) AS debit,
      (SELECT sum(line.credit)::text FROM public.journal_lines line
       WHERE line.journal_entry_id=journal.id) AS credit
    FROM public.customer_credit_notes credit
    JOIN public.invoices invoice ON invoice.id=credit.original_invoice_id
    JOIN public.accounting_events event ON event.id=credit.accounting_event_id
    JOIN public.journal_entries journal ON journal.id=credit.journal_entry_id
    JOIN public.journal_entries invoice_journal ON invoice_journal.id=invoice.journal_entry_id
    WHERE credit.id='${credit.rows[0].id}'
  `);
  assert.deepEqual(graph.rows[0], {
    total: "125.00",
    currency: "USD",
    original_invoice_id: invoiceId,
    event_linked: true,
    journal_linked: true,
    line_count: 2,
    source_type: "customer_credit_note",
    event_source_matches: true,
    journal_status: "posted",
    reverses_invoice_journal: true,
    original_links_credit: true,
    debit: "125.00",
    credit: "125.00",
  });
  await expectReject(
    () => db.exec(`UPDATE public.customer_credit_notes SET total=1 WHERE id='${credit.rows[0].id}'`),
    /credit note is immutable/,
  );
  const original = await db.query(`SELECT accounting_status,status::text,total::text FROM public.invoices WHERE id='${invoiceId}'`);
  assert.deepEqual(original.rows[0], { accounting_status: "POSTED", status: "sent", total: "125.00" });
  await db.close();
});

test("credit-note retry remains safe after period close and account retirement", async () => {
  const { db } = await createDb({ credit: true });
  await prepare(db);
  const invoiceId = await postInvoice(db, "INV-CREDIT-RETRY", "invoice:credit-retry");
  const sql = `SELECT public.post_customer_credit_note(
    '${invoiceId}', 'CN-RETRY', '2026-08-26', 'Retry proof', 'credit:retry'
  ) AS id;`;
  const first = await db.query(sql);
  const period = await db.query(`SELECT id FROM public.accounting_periods WHERE entity_id='${ids.entityA}'`);
  await db.exec(`SELECT public.transition_accounting_period('${period.rows[0].id}','HARD_CLOSED','closed after credit')`);
  await db.exec(`UPDATE public.accounts SET is_active=false WHERE id IN ('${ids.arA}','${ids.revenueA}')`);
  const second = await db.query(sql);
  assert.equal(first.rows[0].id, second.rows[0].id);
  await db.close();
});

test("credit note requires an authorized actor and open period with atomic rollback", async () => {
  const { db } = await createDb({ credit: true });
  await prepare(db);
  const invoiceId = await postInvoice(db, "INV-CREDIT-DENY", "invoice:credit-deny");
  await db.exec(`SELECT set_config('request.jwt.claim.sub','${ids.userA}',false)`);
  await expectReject(
    () => db.query(`SELECT public.post_customer_credit_note('${invoiceId}','CN-DENY','2026-08-26','Denied','credit:deny')`),
    /admin|moderator|authorized/i,
  );
  await db.exec(`SELECT set_config('request.jwt.claim.sub','${ids.adminA}',false)`);
  await expectReject(
    () => db.query(`SELECT public.post_customer_credit_note('${invoiceId}','CN-NOPERIOD','2026-09-01','No period','credit:no-period')`),
    /OPEN accounting period/i,
  );
  const residue = await db.query(`SELECT count(*)::int AS count FROM public.customer_credit_notes`);
  assert.equal(residue.rows[0].count, 0);
  const journal = await db.query(`SELECT reversed_by_id FROM public.journal_entries WHERE id=(SELECT journal_entry_id FROM public.invoices WHERE id='${invoiceId}')`);
  assert.equal(journal.rows[0].reversed_by_id, null);
  await db.close();
});

test("one invoice permits only one full credit and conflicting idempotency is rejected", async () => {
  const { db } = await createDb({ credit: true });
  await prepare(db);
  const invoiceId = await postInvoice(db, "INV-ONE-CREDIT", "invoice:one-credit");
  await db.query(`SELECT public.post_customer_credit_note('${invoiceId}','CN-ONE','2026-08-26','Full credit','credit:one')`);
  await expectReject(
    () => db.query(`SELECT public.post_customer_credit_note('${invoiceId}','CN-TWO','2026-08-26','Second credit','credit:two')`),
    /already has a full credit note/i,
  );
  await expectReject(
    () => db.query(`SELECT public.post_customer_credit_note('${invoiceId}','CN-CHANGED','2026-08-26','Changed payload','credit:one')`),
    /idempotency key conflicts/i,
  );
  const count = await db.query(`SELECT count(*)::int AS count FROM public.customer_credit_notes`);
  assert.equal(count.rows[0].count, 1);
  await db.close();
});

test("credit-note graph rejects null or out-of-band event and journal changes", async () => {
  const { db } = await createDb({ credit: true });
  await prepare(db);
  const invoiceId = await postInvoice(db, "INV-CREDIT-GUARD", "invoice:credit-guard");
  const credit = await db.query(`SELECT public.post_customer_credit_note('${invoiceId}','CN-GUARD','2026-08-26','Guard proof','credit:guard') AS id`);
  const links = await db.query(`SELECT accounting_event_id,journal_entry_id FROM public.customer_credit_notes WHERE id='${credit.rows[0].id}'`);
  for (const sql of [
    `UPDATE public.accounting_events SET source_id=NULL WHERE id='${links.rows[0].accounting_event_id}'`,
    `UPDATE public.journal_entries SET accounting_event_id=NULL WHERE id='${links.rows[0].journal_entry_id}'`,
    `DELETE FROM public.customer_credit_note_lines WHERE credit_note_id='${credit.rows[0].id}'`,
  ]) await expectReject(() => db.exec(sql), /credit note|immutable|trusted/i);
  await db.close();
});

async function configureReceipt(db) {
  await db.exec(`SELECT public.configure_entity_customer_receipt_accounts(
    '${ids.entityA}', '${ids.cashA}', 'receipt-control-v1'
  );`);
}

async function postReceipt(db, invoiceId, number, key, overrides = {}) {
  const receiptDate = overrides.receiptDate ?? "2026-08-27";
  const currency = overrides.currency ?? "USD";
  const reference = overrides.reference ?? `Manual receipt ${number}`;
  const posted = await db.query(`SELECT public.post_customer_receipt(
    '${invoiceId}', '${number}', '${receiptDate}', '${currency}', '${reference}', '${key}'
  ) AS id;`);
  return posted.rows[0].id;
}

test("receipt migration replays and removes hostile grants, policies, and routine overloads", async () => {
  const { db, receiptMigration } = await createDb({ receipt: true });
  await db.exec(`
    GRANT INSERT,UPDATE,DELETE ON public.customer_receipts,public.entity_customer_receipt_controls
      TO authenticated,service_role;
    CREATE POLICY hostile_receipt_all ON public.customer_receipts
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
    CREATE FUNCTION public.post_customer_receipt(uuid,text) RETURNS uuid
      LANGUAGE sql SECURITY DEFINER AS 'SELECT $1';
    GRANT EXECUTE ON FUNCTION public.post_customer_receipt(uuid,text) TO authenticated;
  `);
  await db.exec(receiptMigration);
  for (const table of ["customer_receipts", "entity_customer_receipt_controls"]) {
    const grants = await db.query(`
      SELECT has_table_privilege('authenticated','public.${table}','SELECT') AS auth_read,
        has_table_privilege('authenticated','public.${table}','UPDATE') AS auth_update,
        has_table_privilege('service_role','public.${table}','INSERT') AS service_insert
    `);
    assert.deepEqual(grants.rows[0], { auth_read: true, auth_update: false, service_insert: false }, table);
    const policies = await db.query(`SELECT count(*)::int AS count FROM pg_policies WHERE schemaname='public' AND tablename='${table}'`);
    assert.equal(policies.rows[0].count, 1, table);
  }
  const overloads = await db.query(`
    SELECT count(*)::int AS count FROM pg_proc procedure_info
    JOIN pg_namespace namespace ON namespace.oid=procedure_info.pronamespace
    WHERE namespace.nspname='public' AND procedure_info.proname='post_customer_receipt'
      AND (procedure_info.prokind <> 'f'
        OR oidvectortypes(procedure_info.proargtypes) <> 'uuid, text, date, text, text, text')
  `);
  assert.equal(overloads.rows[0].count, 0);
  await db.close();
});

test("full customer receipt atomically creates exact immutable receipt-event-journal evidence", async () => {
  const { db, receiptMigration } = await createDb({ receipt: true });
  await prepare(db);
  await configureReceipt(db);
  const invoiceId = await postInvoice(db, "INV-RECEIPT", "invoice:receipt");
  const receiptId = await postReceipt(db, invoiceId, "RCPT-1001", "receipt:1001");
  const graph = await db.query(`
    SELECT receipt.amount::text, receipt.currency, receipt.invoice_id,
      event.source_type, event.source_id=receipt.id AS event_source_matches,
      journal.status::text AS journal_status, journal.source_module,
      invoice.amount_paid::text AS invoice_amount_paid, invoice.status::text AS invoice_status,
      (SELECT count(*)::int FROM public.journal_lines line WHERE line.journal_entry_id=journal.id) AS line_count,
      (SELECT count(*)::int FROM public.journal_lines line
       JOIN public.entity_customer_receipt_controls control ON control.id=receipt.account_control_id
       WHERE line.journal_entry_id=journal.id AND line.account_id=control.cash_account_id
         AND line.debit=receipt.amount AND line.credit=0) AS cash_debit_count,
      (SELECT count(*)::int FROM public.journal_lines line
       JOIN public.entity_customer_receipt_controls control ON control.id=receipt.account_control_id
       WHERE line.journal_entry_id=journal.id AND line.account_id=control.ar_account_id
         AND line.credit=receipt.amount AND line.debit=0) AS ar_credit_count
    FROM public.customer_receipts receipt
    JOIN public.invoices invoice ON invoice.id=receipt.invoice_id
    JOIN public.accounting_events event ON event.id=receipt.accounting_event_id
    JOIN public.journal_entries journal ON journal.id=receipt.journal_entry_id
    WHERE receipt.id='${receiptId}'
  `);
  assert.deepEqual(graph.rows[0], {
    amount: "125.00", currency: "USD", invoice_id: invoiceId,
    source_type: "customer_receipt", event_source_matches: true,
    journal_status: "posted", source_module: "ar_receipt",
    invoice_amount_paid: "0.00", invoice_status: "sent",
    line_count: 2, cash_debit_count: 1, ar_credit_count: 1,
  });
  await db.exec(receiptMigration);
  await db.query(`SELECT public.validate_customer_receipt_graph('${receiptId}')`);
  await expectReject(
    () => db.exec(`UPDATE public.customer_receipts SET amount=1 WHERE id='${receiptId}'`),
    /receipt is immutable|trusted/i,
  );
  await db.close();
});

test("receipt workflow hides foreign targets and protects the complete graph from owner DML", async () => {
  const { db } = await createDb({ receipt: true });
  await prepare(db);
  await configureReceipt(db);
  const localInvoice = await postInvoice(db, "INV-RECEIPT-GUARD", "invoice:receipt-guard");
  const receiptId = await postReceipt(db, localInvoice, "RCPT-GUARD", "receipt:guard");
  const links = await db.query(`
    SELECT accounting_event_id,journal_entry_id FROM public.customer_receipts WHERE id='${receiptId}'
  `);
  for (const sql of [
    `UPDATE public.accounting_events SET source_id=NULL WHERE id='${links.rows[0].accounting_event_id}'`,
    `UPDATE public.journal_entries SET accounting_event_id=NULL WHERE id='${links.rows[0].journal_entry_id}'`,
    `UPDATE public.entity_customer_receipt_controls SET cash_account_id='${ids.arA}' WHERE entity_id='${ids.entityA}'`,
    `DELETE FROM public.customer_receipts WHERE id='${receiptId}'`,
    `TRUNCATE public.customer_receipts CASCADE`,
  ]) await expectReject(() => db.exec(sql), /receipt|immutable|trusted/i);

  await db.exec(`SELECT set_config('request.jwt.claim.sub','${ids.adminB}',false)`);
  await db.exec(`SELECT public.create_accounting_period('${ids.entityB}','2026-08-01','2026-08-31','org-b-aug')`);
  await db.exec(`SELECT public.configure_entity_invoice_accounts('${ids.entityB}','${ids.arB}','${ids.revenueB}','org-b-ar')`);
  await db.exec(`SELECT public.configure_entity_customer_receipt_accounts('${ids.entityB}','${ids.cashB}','org-b-cash')`);
  const foreignInvoice = await db.query(`SELECT public.post_customer_invoice(
    '${ids.entityB}','${ids.customerB}','INV-ORG-B','2026-08-25','2026-09-24',
    'USD',0,null,'${invoiceLines}'::jsonb,'invoice:org-b'
  ) AS id`);
  await db.exec(`SELECT set_config('request.jwt.claim.sub','${ids.adminA}',false)`);
  const missing = "ffffffff-ffff-4fff-8fff-ffffffffffff";
  for (const entityId of [ids.entityB, missing]) {
    await expectReject(
      () => db.query(`SELECT public.configure_entity_customer_receipt_accounts('${entityId}','${ids.cashA}','hidden:${entityId}')`),
      /entity not found or unavailable/,
    );
  }
  for (const invoiceId of [foreignInvoice.rows[0].id, missing]) {
    await expectReject(
      () => db.query(`SELECT public.post_customer_receipt('${invoiceId}','RCPT-HIDDEN','2026-08-27','USD','Hidden','hidden:${invoiceId}')`),
      /posted customer invoice not found or unavailable/,
    );
  }
  await db.close();
});

test("customer receipt retry remains safe after period close and account retirement", async () => {
  const { db } = await createDb({ receipt: true });
  await prepare(db);
  await configureReceipt(db);
  const invoiceId = await postInvoice(db, "INV-RECEIPT-RETRY", "invoice:receipt-retry");
  const first = await postReceipt(db, invoiceId, "RCPT-RETRY", "receipt:retry");
  const period = await db.query(`SELECT id FROM public.accounting_periods WHERE entity_id='${ids.entityA}'`);
  await db.exec(`SELECT public.transition_accounting_period('${period.rows[0].id}','HARD_CLOSED','closed after receipt')`);
  await db.exec(`UPDATE public.accounts SET is_active=false WHERE id IN ('${ids.arA}','${ids.cashA}')`);
  const second = await postReceipt(db, invoiceId, "RCPT-RETRY", "receipt:retry");
  assert.equal(first, second);
  await db.close();
});

test("receipt control requires a same-tenant active cash-purpose account and authorized actor", async () => {
  const { db } = await createDb({ receipt: true });
  await prepare(db);
  await expectReject(
    () => db.query(`SELECT public.configure_entity_customer_receipt_accounts('${ids.entityA}','${ids.cashB}','cross')`),
    /cash|organization|tenant/i,
  );
  await expectReject(
    () => db.query(`SELECT public.configure_entity_customer_receipt_accounts('${ids.entityA}','${ids.expenseA}','expense')`),
    /cash|asset/i,
  );
  await db.exec(`SELECT set_config('request.jwt.claim.sub','${ids.userA}',false)`);
  await expectReject(
    () => db.query(`SELECT public.configure_entity_customer_receipt_accounts('${ids.entityA}','${ids.cashA}','user')`),
    /admin|moderator|authorized/i,
  );
  await db.close();
});

test("amount is server-derived while FX, pre-invoice, credited, and duplicate receipts fail atomically", async () => {
  const { db } = await createDb({ receipt: true });
  await prepare(db);
  await configureReceipt(db);
  const invoiceId = await postInvoice(db, "INV-RECEIPT-DENY", "invoice:receipt-deny");
  for (const [number, key, overrides, pattern] of [
    ["RCPT-FX", "receipt:fx", { currency: "EUR" }, /functional currency|currency/i],
    ["RCPT-EARLY", "receipt:early", { receiptDate: "2026-08-24" }, /precede|date/i],
  ]) await expectReject(() => postReceipt(db, invoiceId, number, key, overrides), pattern);
  const signature = await db.query(`
    SELECT oidvectortypes(proargtypes) AS arguments
    FROM pg_proc procedure_info
    JOIN pg_namespace namespace ON namespace.oid=procedure_info.pronamespace
    WHERE namespace.nspname='public' AND procedure_info.proname='post_customer_receipt'
  `);
  assert.deepEqual(signature.rows, [{ arguments: "uuid, text, date, text, text, text" }]);
  const receiptId = await postReceipt(db, invoiceId, "RCPT-ONE", "receipt:one");
  await expectReject(
    () => postReceipt(db, invoiceId, "RCPT-TWO", "receipt:two"),
    /already has a full receipt|already resolved/i,
  );
  const count = await db.query(`SELECT count(*)::int AS count FROM public.customer_receipts`);
  assert.deepEqual(count.rows[0], { count: 1 });
  assert.ok(receiptId);
  await db.close();
});

test("full credit and full receipt are mutually exclusive and receipt journals cannot be reversed out of band", async () => {
  const { db } = await createDb({ receipt: true });
  await prepare(db);
  await configureReceipt(db);
  const settledInvoice = await postInvoice(db, "INV-SETTLED", "invoice:settled");
  const receiptId = await postReceipt(db, settledInvoice, "RCPT-SETTLED", "receipt:settled");
  await expectReject(
    () => db.query(`SELECT public.post_customer_credit_note('${settledInvoice}','CN-AFTER-RECEIPT','2026-08-28','Conflict','credit:after-receipt')`),
    /receipt|resolved/i,
  );
  const receipt = await db.query(`SELECT journal_entry_id FROM public.customer_receipts WHERE id='${receiptId}'`);
  await expectReject(
    () => db.query(`SELECT public.reverse_posted_journal('${receipt.rows[0].journal_entry_id}','2026-08-28','Bypass','reverse:receipt')`),
    /receipt reversal|customer receipt/i,
  );

  const creditedInvoice = await postInvoice(db, "INV-CREDITED-FIRST", "invoice:credited-first");
  await db.query(`SELECT public.post_customer_credit_note('${creditedInvoice}','CN-FIRST','2026-08-28','Full credit','credit:first')`);
  await expectReject(
    () => postReceipt(db, creditedInvoice, "RCPT-AFTER-CREDIT", "receipt:after-credit"),
    /credit|resolved/i,
  );
  await db.close();
});

async function postReceiptCorrection(db, receiptId, number, key, overrides = {}) {
  const correctionDate = overrides.correctionDate ?? "2026-08-28";
  const reason = overrides.reason ?? `Correct mistaken receipt ${number}`;
  const posted = await db.query(`SELECT public.post_customer_receipt_correction(
    '${receiptId}', '${number}', '${correctionDate}', '${reason}', '${key}'
  ) AS id;`);
  return posted.rows[0].id;
}

test("receipt-correction migration replays and removes hostile grants, policies, and overloads", async () => {
  const { db, receiptCorrectionMigration } = await createDb({ receiptCorrection: true });
  await db.exec(`
    GRANT INSERT,UPDATE,DELETE ON public.customer_receipt_corrections
      TO authenticated,service_role;
    CREATE POLICY hostile_receipt_correction_all ON public.customer_receipt_corrections
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
    CREATE FUNCTION public.post_customer_receipt_correction(uuid,text) RETURNS uuid
      LANGUAGE sql SECURITY DEFINER AS 'SELECT $1';
    GRANT EXECUTE ON FUNCTION public.post_customer_receipt_correction(uuid,text) TO authenticated;
  `);
  await db.exec(receiptCorrectionMigration);
  const grants = await db.query(`
    SELECT has_table_privilege('authenticated','public.customer_receipt_corrections','SELECT') AS auth_read,
      has_table_privilege('authenticated','public.customer_receipt_corrections','UPDATE') AS auth_update,
      has_table_privilege('service_role','public.customer_receipt_corrections','INSERT') AS service_insert
  `);
  assert.deepEqual(grants.rows[0], { auth_read: true, auth_update: false, service_insert: false });
  const policies = await db.query(`SELECT count(*)::int AS count FROM pg_policies
    WHERE schemaname='public' AND tablename='customer_receipt_corrections'`);
  assert.equal(policies.rows[0].count, 1);
  const overloads = await db.query(`
    SELECT count(*)::int AS count FROM pg_proc procedure_info
    JOIN pg_namespace namespace ON namespace.oid=procedure_info.pronamespace
    WHERE namespace.nspname='public'
      AND procedure_info.proname='post_customer_receipt_correction'
      AND (procedure_info.prokind <> 'f'
        OR oidvectortypes(procedure_info.proargtypes) <> 'uuid, text, date, text, text')
  `);
  assert.equal(overloads.rows[0].count, 0);
  await db.close();
});

test("customer receipt correction posts an exact immutable offset without mutating invoice or receipt", async () => {
  const { db, receiptCorrectionMigration } = await createDb({ receiptCorrection: true });
  await prepare(db);
  await configureReceipt(db);
  const invoiceId = await postInvoice(db, "INV-RC-CORRECT", "invoice:receipt-correction");
  const receiptId = await postReceipt(db, invoiceId, "RCPT-CORRECT", "receipt:correction-source");
  const correctionId = await postReceiptCorrection(
    db, receiptId, "RCC-1001", "receipt-correction:1001",
  );
  const graph = await db.query(`
    SELECT correction.amount::text,correction.currency,correction.original_receipt_id,
      event.source_type,event.source_id=correction.id AS event_source_matches,
      journal.status::text AS journal_status,journal.source_module,
      journal.reversal_of_id=receipt.journal_entry_id AS reverses_receipt,
      receipt_journal.reversed_by_id=journal.id AS receipt_links_correction,
      invoice.amount_paid::text AS invoice_amount_paid,invoice.status::text AS invoice_status,
      (SELECT count(*)::int FROM public.journal_lines line
       WHERE line.journal_entry_id=journal.id) AS line_count,
      (SELECT bool_and(offset_line.account_id=original_line.account_id
          AND offset_line.debit=original_line.credit
          AND offset_line.credit=original_line.debit)
       FROM public.journal_lines original_line
       JOIN public.journal_lines offset_line
         ON offset_line.journal_entry_id=journal.id
        AND offset_line.line_number=original_line.line_number
       WHERE original_line.journal_entry_id=receipt.journal_entry_id) AS exact_offset
    FROM public.customer_receipt_corrections correction
    JOIN public.customer_receipts receipt ON receipt.id=correction.original_receipt_id
    JOIN public.invoices invoice ON invoice.id=receipt.invoice_id
    JOIN public.accounting_events event ON event.id=correction.accounting_event_id
    JOIN public.journal_entries journal ON journal.id=correction.journal_entry_id
    JOIN public.journal_entries receipt_journal ON receipt_journal.id=receipt.journal_entry_id
    WHERE correction.id='${correctionId}'
  `);
  assert.deepEqual(graph.rows[0], {
    amount: "125.00", currency: "USD", original_receipt_id: receiptId,
    source_type: "customer_receipt_correction", event_source_matches: true,
    journal_status: "posted", source_module: "ar_receipt_correction",
    reverses_receipt: true, receipt_links_correction: true,
    invoice_amount_paid: "0.00", invoice_status: "sent", line_count: 2, exact_offset: true,
  });
  const signature = await db.query(`SELECT oidvectortypes(proargtypes) AS arguments
    FROM pg_proc procedure_info JOIN pg_namespace namespace ON namespace.oid=procedure_info.pronamespace
    WHERE namespace.nspname='public' AND procedure_info.proname='post_customer_receipt_correction'`);
  assert.deepEqual(signature.rows, [{ arguments: "uuid, text, date, text, text" }]);
  await db.exec(receiptCorrectionMigration);
  await db.query(`SELECT public.validate_customer_receipt_graph('${receiptId}')`);
  await db.query(`SELECT public.validate_customer_receipt_correction_graph('${correctionId}')`);
  await db.close();
});

test("customer receipt correction retry remains safe after close and account retirement", async () => {
  const { db } = await createDb({ receiptCorrection: true });
  await prepare(db);
  await configureReceipt(db);
  const invoiceId = await postInvoice(db, "INV-RC-RETRY", "invoice:receipt-correction-retry");
  const receiptId = await postReceipt(db, invoiceId, "RCPT-RC-RETRY", "receipt:correction-retry-source");
  const first = await postReceiptCorrection(db, receiptId, "RCC-RETRY", "receipt-correction:retry");
  const period = await db.query(`SELECT id FROM public.accounting_periods WHERE entity_id='${ids.entityA}'`);
  await db.exec(`SELECT public.transition_accounting_period('${period.rows[0].id}','HARD_CLOSED','closed after receipt correction')`);
  await db.exec(`UPDATE public.accounts SET is_active=false WHERE id IN ('${ids.arA}','${ids.cashA}')`);
  assert.equal(
    first,
    await postReceiptCorrection(db, receiptId, "RCC-RETRY", "receipt-correction:retry"),
  );
  await db.close();
});

test("customer receipt correction requires an authorized actor, valid chronology, and OPEN period", async () => {
  const { db } = await createDb({ receiptCorrection: true });
  await prepare(db);
  await configureReceipt(db);
  const invoiceId = await postInvoice(db, "INV-RC-DENY", "invoice:receipt-correction-deny");
  const receiptId = await postReceipt(db, invoiceId, "RCPT-RC-DENY", "receipt:correction-deny-source");
  await db.exec(`SELECT set_config('request.jwt.claim.sub','${ids.userA}',false)`);
  await expectReject(
    () => postReceiptCorrection(db, receiptId, "RCC-USER", "receipt-correction:user"),
    /admin|moderator|authorized/i,
  );
  await db.exec(`SELECT set_config('request.jwt.claim.sub','${ids.adminA}',false)`);
  await expectReject(
    () => postReceiptCorrection(db, receiptId, "RCC-EARLY", "receipt-correction:early", { correctionDate: "2026-08-26" }),
    /precede|chronology|date/i,
  );
  await expectReject(
    () => postReceiptCorrection(db, receiptId, "RCC-NOPERIOD", "receipt-correction:no-period", { correctionDate: "2026-09-25" }),
    /OPEN accounting period/i,
  );
  const residue = await db.query(`SELECT count(*)::int AS count FROM public.customer_receipt_corrections`);
  assert.equal(residue.rows[0].count, 0);
  await db.close();
});

test("one receipt permits one correction and the complete correction graph is owner-immutable", async () => {
  const { db } = await createDb({ receiptCorrection: true });
  await prepare(db);
  await configureReceipt(db);
  const invoiceId = await postInvoice(db, "INV-RC-GUARD", "invoice:receipt-correction-guard");
  const receiptId = await postReceipt(db, invoiceId, "RCPT-RC-GUARD", "receipt:correction-guard-source");
  const correctionId = await postReceiptCorrection(db, receiptId, "RCC-GUARD", "receipt-correction:guard");
  const links = await db.query(`SELECT accounting_event_id,journal_entry_id
    FROM public.customer_receipt_corrections WHERE id='${correctionId}'`);
  for (const sql of [
    `UPDATE public.customer_receipt_corrections SET amount=1 WHERE id='${correctionId}'`,
    `DELETE FROM public.customer_receipt_corrections WHERE id='${correctionId}'`,
    `UPDATE public.accounting_events SET source_id=NULL WHERE id='${links.rows[0].accounting_event_id}'`,
    `UPDATE public.journal_entries SET accounting_event_id=NULL WHERE id='${links.rows[0].journal_entry_id}'`,
    `TRUNCATE public.customer_receipt_corrections CASCADE`,
  ]) await expectReject(() => db.exec(sql), /receipt correction|immutable|trusted/i);
  await expectReject(
    () => postReceiptCorrection(db, receiptId, "RCC-TWO", "receipt-correction:two"),
    /already has a correction|already corrected/i,
  );
  await expectReject(
    () => postReceiptCorrection(db, receiptId, "RCC-CHANGED", "receipt-correction:guard"),
    /idempotency key conflicts/i,
  );
  await expectReject(
    () => db.query(`SELECT public.reverse_posted_journal('${links.rows[0].journal_entry_id}','2026-08-29','Bypass','reverse:receipt-correction')`),
    /receipt correction|reversal is unavailable|only an original posted journal/i,
  );
  await db.exec(`SELECT set_config('tapaano.accounting_write','trusted',false)`);
  await expectReject(
    () => db.exec(`INSERT INTO public.journal_entries(
      org_id,entity_id,entry_number,entry_date,status,created_by,reversal_of_id
    ) VALUES(
      '${ids.orgA}','${ids.entityA}','OWNER-RCC-BYPASS','2026-08-29','posted',
      '${ids.adminA}','${links.rows[0].journal_entry_id}'
    )`),
    /customer receipt correction reversal is unavailable/i,
  );
  await expectReject(
    () => db.query(`SELECT public.post_customer_credit_note('${invoiceId}','CN-AFTER-CORRECTION','2026-08-29','Still unsupported','credit:after-receipt-correction')`),
    /receipt|resolved/i,
  );
  await db.close();
});

test("customer receipt correction hides foreign and nonexistent targets identically", async () => {
  const { db } = await createDb({ receiptCorrection: true });
  await db.exec(`SELECT set_config('request.jwt.claim.sub','${ids.adminB}',false)`);
  await db.exec(`SELECT public.create_accounting_period('${ids.entityB}','2026-08-01','2026-08-31','org-b-correction-period')`);
  await db.exec(`SELECT public.configure_entity_invoice_accounts('${ids.entityB}','${ids.arB}','${ids.revenueB}','org-b-correction-ar')`);
  await db.exec(`SELECT public.configure_entity_customer_receipt_accounts('${ids.entityB}','${ids.cashB}','org-b-correction-cash')`);
  const foreignInvoice = await db.query(`SELECT public.post_customer_invoice(
    '${ids.entityB}','${ids.customerB}','INV-RC-ORG-B','2026-08-25','2026-09-24',
    'USD',0,null,'${invoiceLines}'::jsonb,'invoice:receipt-correction-org-b'
  ) AS id`);
  const foreignReceipt = await postReceipt(
    db, foreignInvoice.rows[0].id, "RCPT-RC-ORG-B", "receipt:correction-org-b",
  );
  await db.exec(`SELECT set_config('request.jwt.claim.sub','${ids.adminA}',false)`);
  const missing = "ffffffff-ffff-4fff-8fff-ffffffffffff";
  for (const target of [foreignReceipt, missing]) {
    await expectReject(
      () => postReceiptCorrection(db, target, "RCC-HIDDEN", `receipt-correction:hidden:${target}`),
      /posted customer receipt not found or unavailable/,
    );
  }
  await db.close();
});

async function postReceiptReplacement(db, correctionId, number, key, overrides = {}) {
  const replacementDate = overrides.replacementDate ?? "2026-08-29";
  const reference = overrides.reference ?? `Replacement receipt ${number}`;
  const posted = await db.query(`SELECT public.post_customer_receipt_replacement(
    '${correctionId}', '${number}', '${replacementDate}', '${reference}', '${key}'
  ) AS id;`);
  return posted.rows[0].id;
}

test("receipt-replacement migration replays and removes hostile grants, policies, and overloads", async () => {
  const { db, receiptReplacementMigration } = await createDb({ receiptReplacement: true });
  await db.exec(`
    GRANT INSERT,UPDATE,DELETE ON public.customer_receipt_replacements
      TO authenticated,service_role;
    CREATE POLICY hostile_receipt_replacement_all ON public.customer_receipt_replacements
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
    CREATE FUNCTION public.post_customer_receipt_replacement(uuid,text) RETURNS uuid
      LANGUAGE sql SECURITY DEFINER AS 'SELECT $1';
    GRANT EXECUTE ON FUNCTION public.post_customer_receipt_replacement(uuid,text)
      TO authenticated;
  `);
  await db.exec(receiptReplacementMigration);
  const grants = await db.query(`SELECT
    has_table_privilege('authenticated','public.customer_receipt_replacements','SELECT') AS auth_read,
    has_table_privilege('authenticated','public.customer_receipt_replacements','UPDATE') AS auth_update,
    has_table_privilege('service_role','public.customer_receipt_replacements','INSERT') AS service_insert`);
  assert.deepEqual(grants.rows[0], { auth_read: true, auth_update: false, service_insert: false });
  const policies = await db.query(`SELECT count(*)::int AS count FROM pg_policies
    WHERE schemaname='public' AND tablename='customer_receipt_replacements'`);
  assert.equal(policies.rows[0].count, 1);
  const overloads = await db.query(`SELECT count(*)::int AS count FROM pg_proc procedure_info
    JOIN pg_namespace namespace ON namespace.oid=procedure_info.pronamespace
    WHERE namespace.nspname='public'
      AND procedure_info.proname='post_customer_receipt_replacement'
      AND (procedure_info.prokind<>'f'
        OR oidvectortypes(procedure_info.proargtypes)<>'uuid, text, date, text, text')`);
  assert.equal(overloads.rows[0].count, 0);
  await db.close();
});

test("customer receipt replacement copies the exact immutable settlement after correction", async () => {
  const { db, receiptReplacementMigration } = await createDb({ receiptReplacement: true });
  await prepare(db);
  await configureReceipt(db);
  const invoiceId = await postInvoice(db, "INV-RR-POST", "invoice:receipt-replacement");
  const receiptId = await postReceipt(db, invoiceId, "RCPT-RR-ORIGINAL", "receipt:replacement-source");
  const correctionId = await postReceiptCorrection(
    db, receiptId, "RCC-RR-ORIGINAL", "receipt-correction:replacement-source",
  );
  const replacementId = await postReceiptReplacement(
    db, correctionId, "RCPT-RR-REPLACEMENT", "receipt-replacement:1001",
  );
  const graph = await db.query(`SELECT replacement.amount::text,replacement.currency,
    replacement.invoice_id,replacement.original_receipt_id,replacement.original_correction_id,
    event.source_type,event.source_id=replacement.id AS event_source_matches,
    journal.status::text AS journal_status,journal.source_module,
    journal.reversal_of_id IS NULL AS independent_journal,
    invoice.amount_paid::text AS invoice_amount_paid,invoice.status::text AS invoice_status,
    (SELECT count(*)::int FROM public.journal_lines line
      WHERE line.journal_entry_id=journal.id) AS line_count,
    (SELECT bool_and(replacement_line.account_id=original_line.account_id
        AND replacement_line.debit=original_line.debit
        AND replacement_line.credit=original_line.credit)
     FROM public.journal_lines original_line
     JOIN public.journal_lines replacement_line
       ON replacement_line.journal_entry_id=journal.id
      AND replacement_line.line_number=original_line.line_number
     WHERE original_line.journal_entry_id=receipt.journal_entry_id) AS exact_copy
    FROM public.customer_receipt_replacements replacement
    JOIN public.customer_receipts receipt ON receipt.id=replacement.original_receipt_id
    JOIN public.invoices invoice ON invoice.id=replacement.invoice_id
    JOIN public.accounting_events event ON event.id=replacement.accounting_event_id
    JOIN public.journal_entries journal ON journal.id=replacement.journal_entry_id
    WHERE replacement.id='${replacementId}'`);
  assert.deepEqual(graph.rows[0], {
    amount: "125.00", currency: "USD", invoice_id: invoiceId,
    original_receipt_id: receiptId, original_correction_id: correctionId,
    source_type: "customer_receipt_replacement", event_source_matches: true,
    journal_status: "posted", source_module: "ar_receipt_replacement",
    independent_journal: true, invoice_amount_paid: "0.00",
    invoice_status: "sent", line_count: 2, exact_copy: true,
  });
  const signature = await db.query(`SELECT oidvectortypes(proargtypes) AS arguments
    FROM pg_proc procedure_info JOIN pg_namespace namespace ON namespace.oid=procedure_info.pronamespace
    WHERE namespace.nspname='public' AND procedure_info.proname='post_customer_receipt_replacement'`);
  assert.deepEqual(signature.rows, [{ arguments: "uuid, text, date, text, text" }]);
  await db.exec(receiptReplacementMigration);
  await db.query(`SELECT public.validate_customer_receipt_replacement_graph('${replacementId}')`);
  await db.close();
});

test("customer receipt replacement retry remains safe after close and account retirement", async () => {
  const { db } = await createDb({ receiptReplacement: true });
  await prepare(db); await configureReceipt(db);
  const invoiceId = await postInvoice(db, "INV-RR-RETRY", "invoice:receipt-replacement-retry");
  const receiptId = await postReceipt(db, invoiceId, "RCPT-RR-RETRY", "receipt:replacement-retry");
  const correctionId = await postReceiptCorrection(
    db, receiptId, "RCC-RR-RETRY", "receipt-correction:replacement-retry",
  );
  const first = await postReceiptReplacement(
    db, correctionId, "RCPT-RR-RETRY-NEW", "receipt-replacement:retry",
  );
  const period = await db.query(`SELECT id FROM public.accounting_periods WHERE entity_id='${ids.entityA}'`);
  await db.exec(`SELECT public.transition_accounting_period('${period.rows[0].id}','HARD_CLOSED','closed after receipt replacement')`);
  await db.exec(`UPDATE public.accounts SET is_active=false WHERE id IN ('${ids.arA}','${ids.cashA}')`);
  assert.equal(first, await postReceiptReplacement(
    db, correctionId, "RCPT-RR-RETRY-NEW", "receipt-replacement:retry",
  ));
  await db.close();
});

test("customer receipt replacement requires an authorized actor, chronology, and OPEN period", async () => {
  const { db } = await createDb({ receiptReplacement: true });
  await prepare(db); await configureReceipt(db);
  const invoiceId = await postInvoice(db, "INV-RR-DENY", "invoice:receipt-replacement-deny");
  const receiptId = await postReceipt(db, invoiceId, "RCPT-RR-DENY", "receipt:replacement-deny");
  const correctionId = await postReceiptCorrection(
    db, receiptId, "RCC-RR-DENY", "receipt-correction:replacement-deny",
  );
  await db.exec(`SELECT set_config('request.jwt.claim.sub','${ids.userA}',false)`);
  await expectReject(
    () => postReceiptReplacement(db, correctionId, "RR-USER", "receipt-replacement:user"),
    /admin|moderator|authorized/i,
  );
  await db.exec(`SELECT set_config('request.jwt.claim.sub','${ids.adminA}',false)`);
  await expectReject(
    () => postReceiptReplacement(db, correctionId, "RR-EARLY", "receipt-replacement:early", { replacementDate: "2026-08-27" }),
    /precede|chronology|date/i,
  );
  await expectReject(
    () => postReceiptReplacement(db, correctionId, "RR-NOPERIOD", "receipt-replacement:no-period", { replacementDate: "2026-09-25" }),
    /OPEN accounting period/i,
  );
  const residue = await db.query(`SELECT count(*)::int AS count FROM public.customer_receipt_replacements`);
  assert.equal(residue.rows[0].count, 0);
  await db.close();
});

test("one correction permits one customer receipt replacement and the graph is owner-immutable", async () => {
  const { db } = await createDb({ receiptReplacement: true });
  await prepare(db); await configureReceipt(db);
  const invoiceId = await postInvoice(db, "INV-RR-GUARD", "invoice:receipt-replacement-guard");
  const receiptId = await postReceipt(db, invoiceId, "RCPT-RR-GUARD", "receipt:replacement-guard");
  const correctionId = await postReceiptCorrection(
    db, receiptId, "RCC-RR-GUARD", "receipt-correction:replacement-guard",
  );
  const replacementId = await postReceiptReplacement(
    db, correctionId, "RR-GUARD", "receipt-replacement:guard",
  );
  const links = await db.query(`SELECT accounting_event_id,journal_entry_id
    FROM public.customer_receipt_replacements WHERE id='${replacementId}'`);
  await expectReject(
    () => postReceiptReplacement(db, correctionId, "RR-TWO", "receipt-replacement:two"),
    /already has a replacement|already replaced/i,
  );
  await expectReject(
    () => postReceiptReplacement(db, correctionId, "RR-CHANGED", "receipt-replacement:guard"),
    /idempotency key conflicts/i,
  );
  for (const sql of [
    `UPDATE public.customer_receipt_replacements SET amount=1 WHERE id='${replacementId}'`,
    `DELETE FROM public.customer_receipt_replacements WHERE id='${replacementId}'`,
    `TRUNCATE public.customer_receipt_replacements CASCADE`,
  ]) await expectReject(() => db.exec(sql), /receipt replacement|immutable|trusted/i);
  await db.exec(`SELECT set_config('tapaano.accounting_write','trusted',false)`);
  for (const sql of [
    `UPDATE public.accounting_events SET source_id=NULL WHERE id='${links.rows[0].accounting_event_id}'`,
    `UPDATE public.journal_entries SET accounting_event_id=NULL WHERE id='${links.rows[0].journal_entry_id}'`,
    `UPDATE public.journal_lines SET debit=1 WHERE journal_entry_id='${links.rows[0].journal_entry_id}' AND line_number=1`,
    `TRUNCATE public.journal_lines`,
  ]) await expectReject(() => db.exec(sql), /receipt replacement|immutable/i);
  await expectReject(
    () => db.query(`SELECT public.reverse_posted_journal('${links.rows[0].journal_entry_id}','2026-08-30','Bypass','reverse:receipt-replacement')`),
    /receipt replacement reversal is unavailable/i,
  );
  await expectReject(
    () => db.exec(`INSERT INTO public.journal_entries(
      org_id,entity_id,entry_number,entry_date,status,created_by,reversal_of_id
    ) VALUES('${ids.orgA}','${ids.entityA}','OWNER-RR-BYPASS','2026-08-30','posted',
      '${ids.adminA}','${links.rows[0].journal_entry_id}')`),
    /receipt replacement reversal is unavailable/i,
  );
  await db.close();
});

test("customer receipt replacement hides foreign, uncorrected, and nonexistent targets identically", async () => {
  const { db } = await createDb({ receiptReplacement: true });
  await db.exec(`SELECT set_config('request.jwt.claim.sub','${ids.adminB}',false)`);
  await db.exec(`SELECT public.create_accounting_period('${ids.entityB}','2026-08-01','2026-08-31','org-b-replacement-period')`);
  await db.exec(`SELECT public.configure_entity_invoice_accounts('${ids.entityB}','${ids.arB}','${ids.revenueB}','org-b-replacement-ar')`);
  await db.exec(`SELECT public.configure_entity_customer_receipt_accounts('${ids.entityB}','${ids.cashB}','org-b-replacement-cash')`);
  const foreignInvoice = await db.query(`SELECT public.post_customer_invoice(
    '${ids.entityB}','${ids.customerB}','INV-RR-ORG-B','2026-08-25','2026-09-24',
    'USD',0,null,'${invoiceLines}'::jsonb,'invoice:receipt-replacement-org-b'
  ) AS id`);
  const foreignReceipt = await postReceipt(
    db, foreignInvoice.rows[0].id, "RCPT-RR-ORG-B", "receipt:replacement-org-b",
  );
  const foreignCorrection = await postReceiptCorrection(
    db, foreignReceipt, "RCC-RR-ORG-B", "receipt-correction:replacement-org-b",
  );
  await db.exec(`SELECT set_config('request.jwt.claim.sub','${ids.adminA}',false)`);
  const missing = "ffffffff-ffff-4fff-8fff-ffffffffffff";
  for (const target of [foreignCorrection, foreignReceipt, missing]) await expectReject(
    () => postReceiptReplacement(db, target, "RR-HIDDEN", `receipt-replacement:hidden:${target}`),
    /corrected customer receipt not found or unavailable/,
  );
  await db.close();
});
