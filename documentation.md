# TAPAANO recovery documentation

## Status

TAPAANO is an ERP prototype under accounting and authorization reconstruction.
It is **not production-ready** and must not be used as authoritative financial,
tax, payroll, inventory, banking, audit, or compliance software.

`LOOP.md` is the canonical engineering record for recovered controls, executable
evidence, remaining risks, and the no-deployment boundary.

## Locally verified behavior

The current recovery branch supports only these authoritative workflows:

1. Tenant- and entity-scoped accounting periods with OPEN, SOFT_CLOSED, and
   terminal HARD_CLOSED states.
2. Balanced, idempotent manual journal posting into an OPEN period.
3. Immutable posted journals and exact-offset reversal into an OPEN period.
4. One narrow customer-invoice workflow: admin/moderator, zero tax, entity
   functional currency, exact lines, immutable entity AR/revenue controls, and
   atomic invoice → event → period → posted-journal creation.
5. One full customer-credit workflow: exact copied invoice lines, a separate
   immutable credit document/event, and an exact-offset journal in an OPEN
   period while preserving the original invoice.
6. One manual full-receipt workflow: the server derives the exact invoice total
   and atomically posts cash-clearing debit and AR credit in an OPEN period.
   This is not bank-match or reconciliation evidence.
7. One customer-receipt correction workflow: the server copies the immutable
   receipt amount, currency, accounts, and journal lines into an exact offset in
   an OPEN period. The original receipt and invoice remain unchanged. This is
   not a refund or bank-action record.
8. One customer-receipt replacement after that verified correction: the server
   copies the original receipt amount, currency, lineage, accounts, and journal
   lines into a new OPEN-period entry. This is not bank receipt evidence.
9. One direct supplier-bill workflow: admin/moderator, zero tax, entity
   functional currency, exact lines, immutable entity AP/expense controls, and
   atomic bill → event → period → posted-journal creation.
10. One full supplier-credit workflow: exact copied bill lines, a separate
   immutable correction document/event, and an exact AP/expense offset in an
   OPEN period while preserving the original bill.
11. One manual full supplier-payment workflow: the server derives the exact
   uncredited bill total and atomically posts AP debit and cash-clearing credit
   in an OPEN period. This is not bank-match or reconciliation evidence.
12. One supplier-payment correction workflow: the server copies the immutable
   payment amount, currency, accounts, and journal lines into an exact offset in
   an OPEN period. The original payment and bill remain unchanged. This is not
   a refund, recall, or bank-action record.
13. One supplier-payment replacement after that verified correction: the
   server copies the original payment amount, currency, lineage, accounts, and
   journal lines into a new OPEN-period entry. This is not bank execution.
14. Existing-user authentication with immutable tenant membership and one
   tenant-bound role assignment.
15. Existing-member role administration: a tenant admin can change another
   non-admin member among moderator, user, and viewer through an atomic,
   idempotent RPC with append-only audit evidence.
16. Controlled non-admin onboarding: a tenant admin can deliver one 24-hour,
   single-use invitation through the JWT-protected `invite-member` Edge
   boundary. PostgreSQL derives the tenant, display name, and role from the
   immutable invitation and rejects missing, expired, cancelled, wrong-email,
   or wrong-token Auth creation atomically.
17. Controlled chart-of-accounts maintenance: a tenant admin can create an
   active account, rename an active account, or retire one account exactly once
   through idempotent RPCs with append-only before/after evidence. Account code,
   type, parent, tenant lineage, and historical references remain immutable.
18. Controlled customer/vendor maintenance: a tenant admin can create, update,
   or one-way retire normalized party profiles through idempotent RPCs with
   append-only before/after evidence. Retirement preserves prior documents and
   rejects new posted invoices or bills.
19. Controlled entity maintenance: a tenant admin can create an entity with one
   immutable uppercase three-letter functional currency or rename an existing
   entity through idempotent RPCs with append-only before/after evidence. No
   period or accounting-control configuration is created implicitly.

All verified accounting writes occur through controlled PostgreSQL routines.
The browser has no physical-table write contract for journals, periods,
invoices, invoice/bill lines, bills, accounting events, identity/role/invitation
tables, account audit rows, or party audit rows. Supported account and party
maintenance uses controlled routines only.

## Fail-closed and preservation boundaries

The following are unavailable or read-only preservation metadata:

- Agent River, embeddings, global/precedent search, anomaly detection,
  autonomous approval, scheduled report delivery, and direct notifications.
- Generic repeat or partial replacement receipts, partial receipts or receipt
  corrections, overpayments, refunds, aging, collections, tax and
  cross-currency invoice posting, and
  bank-verified settlement evidence.
- Partial supplier credits/payments, generic repeat or partial replacement
  payments, partial payment corrections, refunds, AP approval/matching,
  PO/receipt conversion, payment
  runs, bank execution, and payment matching. Legacy
  bill/payment-run rows remain unverified preservation metadata.
- Bank connections, imports, matching, reconciliation, positive pay, balances,
  and bank-account credentials.
- Organization maintenance, entity currency/lifecycle changes, and entity
  deletion. Account maintenance is limited to controlled create, rename, and
  one-way retirement; customer/vendor
  maintenance is limited to controlled create, update, and one-way retirement.
- Tax, FX/revaluation, inventory, production, payroll, controlling, planning,
  service, forecast, generic Decision Ledger, and unsupported reporting paths.

The residual database lockdown freezes the listed legacy tables and removes
known side-effect routines. That is containment, not proof those workflows are
implemented.

## Identity and authorization

- Private routes require a live Supabase user and a loaded organization profile.
- Session changes reject stale profile responses, cancel in-flight queries, and
  clear the full query cache during sign-out.
- A profile must have exactly one matching `user_roles` row in the same tenant.
- Profiles and roles reject direct API, service-role, and owner DML; only the
  current profile can be read through browser table policies.
- A tenant admin can list same-tenant members through a controlled routine and
  change another non-admin member among moderator, user, and viewer. The
  profile and matching role row update atomically and an immutable audit record
  captures actor, target, old/new role, reason, and idempotency key.
- A tenant admin can request a normalized non-admin invitation through the sole
  active Edge workflow, inspect token-free tenant-scoped status, and cancel a
  pending invitation. Only the Edge service role can create the invitation;
  the browser never receives or types the secret/hash. Auth creation consumes
  the exact email/token invitation before profile and role creation commit.
- Admin-role changes, self-role changes, tenant moves, removal, and open
  self-service signup remain unavailable.

## Accounting-master maintenance

- Tenant admins can list tenant accounts and safe account audit evidence.
- New accounts require a normalized unique code/name, exact account type, and
  an optional active same-tenant parent of the same type.
- Rename changes only the display name. Code, type, parent, tenant, controlling
  classification, defaults, and creation evidence remain immutable.
- Retirement is one-way and preserves every historical reference. PostgreSQL
  rejects retirement when an active child or immutable AR/AP/cash control still
  depends on the account.
- Tenant admins can create, update, and retire customers and vendors only
  through controlled routines. Names/contact/payment metadata are normalized;
  tenant identity, creation evidence, and historical references never change.
- Party retirement locks the target row. New posted invoices and bills take a
  conflicting key-share lock and require an active same-tenant party, so a
  concurrent post deterministically commits before retirement or fails after
  retirement. Existing idempotent document retries remain safe.
- Tenant admins can create and rename entities only through controlled routines.
  Tenant identity, functional currency, creation evidence, deletion, and
  retirement remain immutable or unavailable. New entities have no posting
  period or account controls until each supported boundary is configured.

## Verification

Run:

```bash
npm test
npm run typecheck
./node_modules/.bin/eslint <changed files>
git diff --check
```

Current local evidence is recorded in `LOOP.md`. Disposable PostgreSQL tests do
not replace ordered rehearsal against a copy of the real Supabase schema.

## Deployment gates

Do not deploy until all of the following are complete:

- Rehearse all recovery migrations in order against a disposable production-like
  database and resolve every preflight failure without inventing data.
- Verify managed Supabase RLS, grants, Auth triggers, PostgREST schema cache,
  Realtime publication, Edge JWT behavior, and two-session concurrency.
- Complete the missing accounting vertical slices.
- Resolve repository-wide lint failures and obtain a successful production build
  in a supported build environment.
- Perform finance/security review, backup and rollback rehearsal, and explicit
  release approval.

Recovery checkpoints are published through reviewed pull requests on
`recovery/production-readiness`; inspect Git history for exact merge status. No
recovery migration, Edge function, or application deployment has been
performed.
