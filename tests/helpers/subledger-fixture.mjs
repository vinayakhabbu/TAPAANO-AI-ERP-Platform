// Synthetic tenant/account/document schema; real recovery migrations supply posting behavior.
export const ids = {
  apA: "30000000-0000-4000-8000-000000000008",
  vendorA: "40000000-0000-4000-8000-000000000003",
  vendorB: "40000000-0000-4000-8000-000000000004",
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

export const fixture = `
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
  CREATE TYPE public.bill_status AS ENUM ('draft','pending','paid','overdue','cancelled');
  CREATE TABLE public.vendors (id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES public.organizations(id), name text NOT NULL, payment_terms integer DEFAULT 30);
  CREATE TABLE public.bills (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES public.organizations(id),
    entity_id uuid NOT NULL REFERENCES public.entities(id), vendor_id uuid NOT NULL REFERENCES public.vendors(id),
    bill_number text NOT NULL, issue_date date NOT NULL, due_date date NOT NULL,
    subtotal numeric(15,2) NOT NULL DEFAULT 0, tax numeric(15,2) NOT NULL DEFAULT 0,
    total numeric(15,2) NOT NULL DEFAULT 0, amount_paid numeric(15,2) NOT NULL DEFAULT 0,
    status public.bill_status NOT NULL DEFAULT 'draft', notes text, currency varchar(3) DEFAULT 'USD',
    exchange_rate numeric(18,8) DEFAULT 1, functional_total numeric(18,4),
    purchase_order_id uuid, goods_receipt_id uuid, match_status text DEFAULT 'unmatched', tax_code_id uuid,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(org_id,bill_number)
  );
  CREATE TABLE public.bank_accounts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, entity_id uuid NOT NULL, name text NOT NULL);
  CREATE TABLE public.payment_runs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, entity_id uuid NOT NULL, bank_account_id uuid, run_number text NOT NULL, run_date date NOT NULL, total_amount numeric NOT NULL, status text NOT NULL DEFAULT 'draft');
  CREATE TABLE public.payment_run_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payment_run_id uuid NOT NULL, bill_id uuid NOT NULL, amount numeric NOT NULL);
  INSERT INTO public.accounts VALUES ('${ids.apA}','${ids.orgA}','2000','AP','liability',true);
  INSERT INTO public.vendors VALUES ('${ids.vendorA}','${ids.orgA}','Vendor A',30),('${ids.vendorB}','${ids.orgB}','Vendor B',30);
`;
