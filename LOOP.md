# TAPAANO production-readiness loop

## Recovery note

The earlier cloud workspace was not committed or pushed. GitHub still pointed
to `555c1f5`, with no `LOOP.md`, containment migrations, or test suite. The
cycle transcript supplied by the project owner is therefore a recovery
specification, not evidence present in this checkout.

This branch reconstructs the work in dependency order. The recovery checkpoint
is published on `recovery/production-readiness`; no merge, production database
change, Edge deployment, or application deployment has been performed.

## Current state

- Production readiness: **NOT READY**
- Recovery branch: `recovery/production-readiness`
- Recovered checkpoints: privileged workflow containment; deterministic journal
  and period controls; authenticated-session isolation; atomic customer-invoice
  posting; credential/autonomy, AP/payment, banking and residual-schema
  containment; immutable accounting masters; tenant-bound identity/RBAC; exact
  full credits; server-derived manual full customer receipts; and atomic direct
  supplier-bill posting with exact full supplier credits.
- Next dependency: controlled full supplier payment and the remaining
  source-to-subledger-to-GL vertical slices.

## Acceptance rules

1. A cycle is complete only when its implementation and executable regressions
   exist in Git, focused and aggregate checks pass, and residual deployment
   evidence is documented.
2. Unsupported workflows fail closed and must not make success, accounting,
   audit, security, delivery, or AI-assurance claims.
3. Tenant isolation and accounting integrity are enforced in PostgreSQL; UI
   removal alone is not a security boundary.
4. No deployment or push occurs without explicit user authorization.

## Recovery checkpoint 1 — privileged workflow containment

### Scope

- Agent River and autonomous approval
- Global/precedent search and embedding
- Anomaly detection
- Scheduled report processing and direct notifications
- Generic browser Decision Ledger writes and precedent promotion

### Expected behavior

- Every Edge endpoint has gateway JWT verification enabled.
- Every endpoint is a deterministic 503 handler with no request-body, secret,
  database, or outbound-network access.
- Browser code has no Edge invocation route and makes no claim that these
  workflows executed.
- Generic Decision Ledger writes are disabled; historical reads are explicitly
  tenant/session scoped pending database immutability reconstruction.

### Status

### Verification

- 6/6 containment tests pass.
- TypeScript passes.
- All touched browser files pass ESLint.
- `git diff --check` passes.

### Residual deployment evidence

- Edge functions and JWT configuration are not deployed.
- Live 401/503 gateway behavior still requires staging verification.

### Result

Recovered locally. The next dependency is PostgreSQL tenant/RBAC and journal
integrity; this checkpoint is not a production-readiness claim.

## Recovery checkpoint 2 — journal and accounting periods

### Scope and result

- Added append-only accounting events and deterministic entity accounting periods.
- Added balanced, idempotent manual posting and exact-offset reversal RPCs.
- Posted journals and lines are immutable across browser, API, service-role,
  owner, delete, and truncate paths.
- Only OPEN periods accept posting; HARD_CLOSED is terminal; reversals post into
  a currently open period and preserve the original journal.
- Browser ledger and period history require a live user and organization and
  expose no physical-table write contract.

### Verification

- 5/5 disposable PostgreSQL scenarios pass, including replay, hostile grants,
  rollback, cross-tenant attempts, period transitions, and exact reversal.

## Recovery checkpoint 3 — authenticated-session isolation

- Private routes require a current user and organization.
- Sign-out unmounts private consumers, cancels active queries before and after
  session termination, clears the entire query cache, and rejects stale profile
  responses by identity epoch.
- Financial query keys in the recovered slices include the current user and
  organization.

## Recovery checkpoint 4 — atomic customer invoice posting

### Supported boundary

One admin/moderator RPC posts a direct customer invoice with exact line inputs,
zero tax, and the entity functional currency. It atomically creates immutable
invoice lines, a canonical accounting event, an OPEN-period link, and a balanced
AR/revenue journal using a one-time immutable entity account-control mapping.

Tax, FX, settlement, collections, aging, quotation/order/shipment conversion,
and legacy-header promotion remain unavailable. The browser shows
only tenant-scoped, journal-linked posted invoice history and makes no AR,
aging, revenue, or collection claim.

### Verification

- 6/6 invoice PostgreSQL scenarios pass, including replay and hostile grants,
  exact immutable graph validation, retry after close/account retirement,
  unsupported/cross-tenant rollback, account-purpose/role checks, and universal
  rejection of out-of-band invoice-journal reversal.
- 9/9 browser containment scenarios, 3/3 Edge scenarios, and 5/5 journal/period
  scenarios pass: **23/23 aggregate**.
- TypeScript, focused lint (one existing Fast Refresh warning in `useAuth.tsx`),
  and `git diff --check` pass.
- Repository-wide lint still reports 111 legacy errors and 9 warnings outside
  the recovered slice.
- Production build still fails after three transformed modules in the native
  Rollup/stacker parser before application code is transformed.

### Residual deployment evidence

- Migrations must be rehearsed on a disposable copy of the real Supabase schema.
- Managed PostgREST schema-cache, exact grants/RLS, Realtime publication, and
  real two-session concurrency/sign-out behavior require staging evidence.
- The recovery code is published only on its branch. No migration, function,
  merge, or application deployment has been performed.

## Recovery checkpoint 5 — credential and autonomy containment

- Legacy organization-held AI credentials are not exposed to browser or service
  roles and are immutable even through direct owner DML.
- Autonomous approval configuration is hidden, immutable, removed from
  Realtime, and unavailable in the browser.
- Migration replay removes hostile table- and column-level grants.

## Recovery checkpoint 6 — AP and payment containment

- Legacy bill, payment-run, and payment-item rows are tenant-readable historical
  metadata only. Direct creation, state change, payment execution, and accounting
  claims are unavailable.
- Payment-item organization/entity lineage is materialized and constrained to
  the same tenant; corrupt legacy lineage aborts migration.

## Recovery checkpoint 7 — banking containment

- Banking, feed, matching, import, connection, and positive-pay records are
  immutable across API, service, owner, and Realtime paths.
- Browser reads expose tenant-scoped non-secret metadata only—never account or
  routing numbers, stored balances, transaction amounts, or match assertions.
- Arbitrary transaction-matching routine overloads are removed.

## Recovery checkpoint 8 — residual financial lockdown

- Listed unsupported financial, inventory, production, tax, FX, payroll,
  planning, service, audit, and autonomous tables are frozen at the database
  boundary and removed from Realtime.
- Legacy side-effect triggers and known dangerous routine overloads are removed.
- This is containment, not an implementation of those workflows.

## Recovery checkpoint 9 — accounting master containment

- Entities, accounts, customers, and vendors are immutable preservation data
  with exact current-tenant read policies and grants.
- Account hierarchy is same-tenant, acyclic, and validated before migration.
- Controlled maintenance and retirement workflows remain unavailable.

## Recovery checkpoint 10 — identity and tenant-bound authorization

### Scope and result

- Reproduced the original organization-hop: an authenticated user could update
  their own `profiles.org_id`, retaining a globally assigned admin role.
- Each accepted profile now has exactly one same-tenant role assignment, backed
  by composite foreign keys and immutable row/truncate guards.
- Identity and role policies expose only the current user's rows. Hostile table,
  column, policy, Realtime, and function-overload state is removed on replay.
- `has_role` and `get_user_role` cannot enumerate another user, while
  `assert_accounting_actor` verifies the profile, tenant, and role in one graph.
- Self-service registration and browser team/role administration fail closed
  until a controlled onboarding workflow exists.

### Verification

- Identity database scenarios: **6/6**.
- Aggregate repository regressions: **58/58**.
- TypeScript, changed-file lint, and `git diff --check` pass. The auth hook keeps
  one existing Fast Refresh warning.
- Repository-wide lint still reports **86 legacy errors and 8 warnings** outside
  this bounded change.
- Production build still fails after three transformed modules in the native
  Rollup/stacker runtime, before application code is transformed.

### Residual deployment evidence

- All eight recovery migrations require ordered rehearsal against a disposable
  copy of the actual Supabase schema.
- Managed RLS/grants, PostgREST schema cache, Realtime membership, Auth trigger
  behavior, and real multi-session/concurrency behavior require staging proof.
- This checkpoint is included in the published recovery branch and remains
  unmerged and undeployed.

## Recovery checkpoint 11 — atomic full customer credit notes

### Supported boundary

One admin/moderator RPC fully credits a verified zero-tax,
functional-currency invoice. It copies every immutable invoice line, creates a
separate credit document and canonical accounting event, links an OPEN period,
posts an exact-offset AR/revenue journal, and links that journal as the original
invoice journal's one reversal. The original invoice remains unchanged.

Partial credits, refunds, settlement, payment application, tax, and FX remain
unavailable. Posted invoice totals remain gross historical totals and are not
presented as outstanding receivables.

### Verification

- Credit-note database scenarios: **6/6**, including migration replay and
  hostile grants/policies/overloads, exact line/event/journal reconciliation,
  retry after period close/account retirement, role and OPEN-period rollback,
  one-credit/idempotency enforcement, and out-of-band graph mutation rejection.
- Active accounting RPCs now bind target lookup to the caller's immutable tenant
  before reading it, so foreign and nonexistent entity identifiers produce the
  same unavailable result.
- Aggregate recovery regressions: **66/66** after the final rerun.
- TypeScript, changed-file lint, and `git diff --check` pass.

### Residual deployment evidence

- The nine recovery migrations require ordered production-like rehearsal.
- Real concurrent credit requests, managed constraint-trigger timing,
  PostgREST schema refresh, and period-close contention require staging proof.
- This checkpoint is included in the published recovery branch. No migration,
  function deployment, merge, or production action has occurred.

## Recovery checkpoint 12 — atomic full customer receipts

### Supported boundary

One admin/moderator RPC records a manual full receipt against a verified,
uncredited customer invoice. PostgreSQL derives the exact immutable invoice
total; the browser cannot submit an amount. In one transaction the workflow
creates an immutable receipt, canonical accounting event, OPEN-period link, and
balanced journal that debits the configured cash-clearing asset and credits the
invoice AR control account.

The one-time entity receipt control is purpose-specific, tenant-bound, and
immutable. A full receipt and a full credit note are mutually exclusive under
the same invoice lock. The original invoice remains unchanged; receipt status
is derived from the immutable receipt graph rather than a client-written invoice
status or amount-paid field.

Partial receipts, overpayments, refunds, receipt reversal, tax, FX, bank
matching, and reconciliation remain unavailable. A manual receipt is not
presented as bank-verified evidence.

### Verification

- Customer invoice/credit/receipt database scenarios: **20/20**, including
  migration replay, hostile grants/policies/overloads, owner immutability,
  exact receipt/event/period/journal reconciliation, server-derived decimal
  amount, retry after close/account retirement, tenant target non-enumeration,
  credit/receipt exclusion, and out-of-band reversal rejection.
- Aggregate recovery regressions: **73/73**.
- TypeScript, changed-file lint, and `git diff --check` pass.
- Repository-wide lint remains at the known **86 legacy errors and 8 warnings**
  outside this slice.
- Production build still fails after three transformed modules in the native
  Rollup/stacker runtime before application code is transformed.

### Residual deployment evidence

- All ten recovery migrations require ordered rehearsal against a disposable,
  production-like copy of the actual Supabase schema.
- Real concurrent credit/receipt requests, period-close contention, managed
  constraint-trigger timing, RLS/grants, PostgREST schema refresh, and Realtime
  publication require staging proof.
- No migration, function deployment, merge, or production action has occurred.

### Next dependency

Build the first controlled supplier-bill posting slice: zero tax, entity
functional currency, immutable AP/expense controls, exact lines, and one atomic
bill → event → OPEN period → balanced journal graph. Approval, matching,
payment execution, tax, FX, and legacy-bill promotion remain fail closed.

## Recovery checkpoint 13 — atomic supplier-bill posting

### Supported boundary

One admin/moderator RPC posts a direct supplier bill with exact line inputs,
zero tax, and the entity functional currency. It atomically creates immutable
bill lines, a canonical accounting event, an OPEN-period link, and a balanced
expense/AP journal using a one-time immutable entity account-control mapping.

Approval, matching, PO/goods-receipt conversion, tax, FX, credits, aging,
payment, and settlement remain unavailable. Legacy bill and payment rows remain
frozen `UNVERIFIED_LEGACY` preservation metadata and are never mixed into the
verified, journal-linked posted-bill view.

### Verification

- Supplier-bill database scenarios: **6/6**, including replay and hostile
  grants/policies/overloads, exact immutable bill-line-event-period-journal
  reconciliation, retry after close/account retirement, tenant non-enumeration,
  account-purpose/role checks, unsupported tax/FX rollback, and owner-level
  graph/reversal protection.
- Aggregate recovery regressions: **79/79**.
- TypeScript, changed-file lint, and `git diff --check` pass.
- Repository-wide lint remains at the known **86 legacy errors and 8 warnings**
  outside this slice.
- Production build still fails after three transformed modules in the native
  Rollup/stacker runtime before application code is transformed.

### Residual deployment evidence

- All eleven recovery migrations require ordered rehearsal against a
  disposable, production-like copy of the actual Supabase schema.
- Real concurrent posting/retry, period-close contention, managed constraint
  trigger timing, RLS/grants, PostgREST schema refresh, and Realtime publication
  require staging proof.
- No migration, function deployment, merge, or production action has occurred.

### Next dependency

Build a controlled full supplier-bill correction workflow that copies the
immutable bill evidence and posts an exact-offset vendor credit in an OPEN
period. Partial credits, refunds, supplier payments, matching, tax, and FX remain
fail closed.

## Recovery checkpoint 14 — atomic full supplier credits

### Supported boundary

One admin/moderator RPC fully credits a verified zero-tax,
functional-currency supplier bill. PostgreSQL copies every immutable bill line,
creates a separate credit document and canonical accounting event, links an OPEN
period, and posts an exact AP-debit/expense-credit offset while linking it as the
original bill journal's only reversal. The original bill remains unchanged.

The browser submits no amount, line, or account. Partial credits, refunds,
supplier payments, approval, matching, tax, FX, and bank reconciliation remain
unavailable. Posted bill totals remain gross historical totals and are not
presented as outstanding payables.

### Verification

- Supplier bill/credit database scenarios: **12/12**, including hostile replay,
  exact copied-line/event/period/reversal reconciliation, safe retry after close
  and account retirement, authorized-actor and OPEN-period rollback, one-credit
  enforcement, tenant target non-enumeration, owner immutability, and rejection
  of generic or direct second reversals.
- Aggregate recovery regressions: **85/85**.
- TypeScript, changed-file lint, and `git diff --check` pass.
- Repository-wide lint remains at the known **86 legacy errors and 8 warnings**
  outside this slice.
- Production build still fails after three transformed modules in the native
  Rollup/stacker runtime before application code is transformed.

### Residual deployment evidence

- All twelve recovery migrations require ordered rehearsal against a
  disposable, production-like copy of the actual Supabase schema.
- Real concurrent credit requests, period-close contention, managed constraint
  trigger timing, RLS/grants, PostgREST schema refresh, and Realtime publication
  require staging proof.
- No migration, function deployment, merge, or production action has occurred.

### Next dependency

Build a manual full supplier-payment workflow where PostgreSQL derives the exact
uncorrected bill total, posts AP debit and a purpose-specific cash-clearing
credit atomically in an OPEN period, and presents no bank-reconciliation claim.
Partial payments, overpayments, refunds, payment runs, matching, tax, and FX
remain fail closed.
