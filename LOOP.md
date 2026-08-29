# TAPAANO production-readiness loop

## Recovery note

The earlier cloud workspace was not committed or pushed. GitHub still pointed
to `555c1f5`, with no `LOOP.md`, containment migrations, or test suite. The
cycle transcript supplied by the project owner is therefore a recovery
specification, not evidence present in this checkout.

This branch reconstructs the work in dependency order. Recovery checkpoints
are published and integrated through reviewed pull requests; inspect Git
history for exact branch status. No production database change, Edge
deployment, or application deployment has been performed.

## Current state

- Production readiness: **NOT READY**
- Recovery branch: `recovery/production-readiness`
- Recovered checkpoints: privileged workflow containment; deterministic journal
  and period controls; authenticated-session isolation; atomic customer-invoice
  posting; credential/autonomy, AP/payment, banking and residual-schema
  containment; immutable accounting masters; tenant-bound identity/RBAC; exact
  full credits; server-derived manual full customer receipts; and atomic direct
  supplier-bill posting with exact full supplier credits and server-derived
  manual full supplier payments; immutable exact-offset corrections for manual
  customer receipts and supplier payments; and one server-derived replacement
  after each verified correction; and audited tenant-bound administration of
  existing non-admin roles; and short-lived, token-bound onboarding of new
  non-admin members through one JWT-protected delivery boundary; and audited
  create/rename/one-way-retire maintenance for chart-of-account rows; and
  audited create/update/one-way-retire customer and vendor lifecycle controls;
  and audited entity creation/rename with immutable functional currency; a
  read-only Node 22 CI gate; and deterministic full-chain rehearsal in a
  disposable local Supabase stack.
- Next dependency: rehearse against a sanitized data-bearing copy, then run
  managed-service, concurrency, security, finance, backup, and rollback gates.

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

## Recovery checkpoint 15 — atomic full supplier payments

### Supported boundary

One admin/moderator RPC records a manual full payment against a verified,
uncredited supplier bill. PostgreSQL derives the exact immutable bill total;
the browser cannot submit an amount. In one transaction the workflow creates an
immutable payment, canonical accounting event, OPEN-period link, and balanced
journal that debits the bill AP control account and credits a purpose-specific
cash-clearing asset.

The original bill remains unchanged; payment status is derived from the
immutable payment graph rather than client-written bill status or `amount_paid`.
A full supplier payment and a full supplier credit are mutually exclusive under
the bill lock. This manual accounting record is not evidence of bank execution,
matching, or reconciliation.

Partial payments, overpayments, refunds, payment runs, payment reversal,
approval, matching, tax, and FX remain unavailable.

### Verification

- Supplier bill/credit/payment database scenarios: **18/18**, including hostile
  replay, server-derived amount, exact payment/event/period/journal
  reconciliation, retry after close/account retirement, purpose-specific cash
  control, actor authorization, credit/payment exclusion, unsupported input
  rollback, tenant non-enumeration, owner immutability, and reversal rejection.
- Aggregate recovery regressions: **91/91**.
- TypeScript, changed-file lint, and `git diff --check` pass.
- Repository-wide lint remains at the known **86 legacy errors and 8 warnings**
  outside this slice.
- Production build still fails after three transformed modules in the native
  Rollup/stacker runtime before application code is transformed.

### Residual deployment evidence

- All thirteen recovery migrations require ordered rehearsal against a
  disposable, production-like copy of the actual Supabase schema.
- Real concurrent credit/payment requests, period-close contention, managed
  constraint-trigger timing, RLS/grants, PostgREST schema refresh, and Realtime
  publication require staging proof.
- No migration, function deployment, merge, or production action has occurred.

### Next dependency

Build controlled correction workflows for manual customer receipts and supplier
payments so mistakes can post an immutable exact-offset journal in an OPEN
period without mutating the original record or claiming a bank refund. Partial
corrections, bank actions, tax, and FX remain fail closed.

## Recovery checkpoint 16 — atomic receipt and supplier-payment corrections

### Supported boundary

Two admin/moderator RPCs correct one verified manual customer receipt or one
verified manual supplier payment. PostgreSQL derives the immutable amount,
currency, tenant/entity lineage, accounts, and journal lines from the original
record; the browser submits only the source ID, correction number/date, reason,
and idempotency key.

Each workflow creates a separate immutable correction record and canonical
accounting event, selects an OPEN period, posts an exact line-by-line offset,
and links the new journal as the original journal's sole reversal. The original
receipt/payment and its invoice/bill remain unchanged. Safe retry resolves the
existing correction before consulting current period or account state.

These are accounting corrections, not evidence of a refund, recall, bank
execution, match, or reconciliation. One original permits one correction.
Replacement or partial receipts/payments, partial corrections, bank actions,
tax, and FX remain unavailable.

### Verification

- New correction database scenarios: **12/12**, covering hostile replay and
  overload removal, exact source/event/period/journal reconciliation, immutable
  source preservation, safe retry after close/account retirement, actor and
  chronology checks, OPEN-period rollback, one-correction enforcement,
  cross-tenant target non-enumeration, owner immutability, and purpose-specific
  rejection of a second reversal even with the generic write guard opened.
- Focused invoice/bill accounting scenarios: **50/50**.
- Browser containment scenarios: **15/15**, including identifier-only RPC
  forms, tenant-scoped correction history, read-only types, no direct table
  mutation path, and fail-closed history rendering.
- Aggregate recovery regressions: **103/103**.
- TypeScript, changed-file lint, and `git diff --check` pass.
- Repository-wide lint remains at the known **86 legacy errors and 8 warnings**
  outside this slice.
- Production build still fails after three transformed modules in the native
  Rollup/stacker runtime before application code is transformed.

### Residual deployment evidence

- All fifteen recovery migrations require ordered rehearsal against a
  disposable, production-like copy of the actual Supabase schema.
- Real concurrent correction/retry, period-close contention, managed
  constraint-trigger timing, RLS/grants, PostgREST schema refresh, and Realtime
  publication require staging proof.
- No migration, function deployment, merge, or production action has occurred.

### Next dependency

Build a controlled one-time replacement customer receipt and supplier payment
only after the corresponding verified correction. PostgreSQL must derive the
same immutable amount, currency, tenant lineage, and account controls while
serializing the replacement against the correction. Generic repeat/partial
settlement, refunds, bank actions, tax, and FX remain fail closed.

## Recovery checkpoint 17 — one-time settlement replacements

### Supported boundary

Two admin/moderator RPCs post one customer-receipt or supplier-payment
replacement only after the corresponding verified correction. The browser
submits the correction ID, replacement number/date, reference, and idempotency
key; PostgreSQL derives the original amount, currency, tenant/entity lineage,
source document, accounts, and journal lines.

Each replacement creates a separate immutable record, canonical accounting
event, OPEN-period link, and posted journal that is an exact line-for-line copy
of the original verified settlement. The original receipt/payment, correction,
invoice/bill, and their journals remain unchanged. Retry resolves the existing
replacement before consulting current period or account state.

One correction permits one replacement. Generic repeat or partial settlement,
additional replacement/correction chains, refunds, bank execution, matching,
reconciliation, tax, and FX remain unavailable. A replacement is an accounting
record, not evidence of a bank action.

### Verification

- Replacement database scenarios: **12/12**, covering replay and hostile
  grants/policies/overloads, exact source/event/period/journal reconciliation,
  safe retry after period close and account retirement, authorization and
  chronology rollback, one-replacement enforcement, tenant target
  non-enumeration, owner immutability, journal-line/truncate protection, and
  direct or generic reversal rejection.
- Focused invoice and supplier accounting scenarios: **62/62**.
- Browser containment scenarios: **15/15**, including identifier-only RPC
  forms, tenant-scoped replacement history, read-only generated types, no
  physical-table mutation path, and fail-closed rendering.
- Aggregate recovery regressions: **115/115**.
- TypeScript, changed-file lint, and `git diff --check` pass.
- Repository-wide lint remains at the unchanged legacy baseline of **86 errors
  and 8 warnings**, outside this slice.
- The production build remains blocked after three transformed modules by the
  existing native Rollup/`stacker` assertion failure.

### Residual deployment evidence

- All seventeen recovery migrations require ordered rehearsal against a
  disposable, production-like copy of the actual Supabase schema.
- Real concurrent correction/replacement requests, period-close contention,
  managed constraint-trigger timing, RLS/grants, PostgREST schema refresh, and
  Realtime publication require staging proof.
- No migration, Edge function, or application deployment has occurred.

### Next dependency

Build controlled onboarding, tenant-bound role administration, and audited
accounting-master maintenance so the bounded accounting system can be operated
without direct database edits. Ambiguous tenant membership and unsupported
master mutations must continue to fail closed.

## Recovery checkpoint 18 — tenant-bound role administration

### Supported boundary

One tenant-admin RPC changes another existing non-admin member among
`moderator`, `user`, and `viewer`. PostgreSQL resolves the actor's immutable
tenant and admin role, locks the target membership, updates the matching
`profiles` and `user_roles` rows atomically through a deferred composite
constraint, and inserts an append-only audit record with actor, target,
old/new role, reason, and idempotency key.

The browser can list same-tenant members only through a SECURITY DEFINER
routine and can submit only target ID, new non-admin role, reason, and
idempotency key. It has no physical identity-table write contract. Admin-role
changes, self-role changes, tenant moves, invitation, removal, and signup
remain fail closed.

### Verification

- New role-administration database scenarios: **6/6**, covering migration
  replay, hostile grants/policies/overloads, same-tenant member listing,
  non-admin denial, atomic profile/role reconciliation, immutable audit
  evidence, safe retry, idempotency conflicts, invalid evidence rollback,
  cross-tenant target non-enumeration, tenant-scoped audit reads, and direct
  owner-write rejection.
- Focused identity containment and administration scenarios: **12/12**.
- Browser containment scenarios: **15/15**, including RPC-only role mutation,
  tenant-scoped audit reads, read-only generated identity types, and continued
  sign-in-only authentication.
- Aggregate recovery regressions: **121/121**.
- TypeScript, changed-file lint, and `git diff --check` pass.
- Repository-wide lint remains at the unchanged legacy baseline of **86 errors
  and 8 warnings**, outside this slice.
- The production build remains blocked after three transformed modules by the
  existing native Rollup/`stacker` assertion failure.

### Residual deployment evidence

- All eighteen recovery migrations require ordered rehearsal against a
  disposable, production-like copy of the actual Supabase schema.
- Managed Auth/RLS claims, concurrent role changes, deferred composite
  constraints, PostgREST routine/type discovery, audit visibility, and
  migration replay require staging proof.
- No migration, Edge function, or application deployment has occurred.

### Next dependency

Build controlled invitation/onboarding without trusting client-supplied tenant
or role metadata, then add audited maintenance for entities, accounts,
customers, and vendors. Admin membership and ambiguous tenant assignment must
remain fail closed.

## Recovery checkpoint 19 — controlled tenant onboarding

### Supported boundary

One tenant admin can deliver a 24-hour, single-use invitation for a normalized
email, display name, and non-admin `moderator`, `user`, or `viewer` role. The
browser submits those fields, an audit reason, and an idempotency key only to
the JWT-protected `invite-member` Edge function. The Edge function validates
the live caller and exact configured origin, derives a deterministic HMAC
secret, and uses its service role for the otherwise-unexecutable invitation
creation routine and Supabase Auth delivery.

PostgreSQL stores only the SHA-256 token hash. The Auth trigger requires the
exact unexpired invitation ID, secret, and normalized email, then derives the
tenant, display name, and role from immutable database evidence while creating
the matching profile and role atomically. Wrong, missing, expired, or cancelled
evidence fails with the same error and leaves no identity residue. Tenant
admins can list token-free status and cancel a pending invitation.

Admin invitation, tenant creation/moves, member removal, and open self-service
signup remain unavailable. The invitation Edge function is not deployed by
this checkpoint.

### Verification

- Onboarding database scenarios: **7/7**, including replay, hostile grants,
  policies and overloads, service-role-only creation, safe output,
  idempotency/conflict checks, non-admin authorization, forged metadata
  rejection, exact invitation consumption, equal-error invalid evidence,
  cancellation, tenant-scoped audit, and owner/direct immutability.
- Focused identity database scenarios: **19/19**.
- Edge boundary scenarios: **7/7**, including exact JWT configuration, strict
  origin/caller/payload checks, HMAC and SHA-256 handling, safe reconciliation,
  and generic failure responses with no secret/error logging.
- Browser containment scenarios: **15/15**, including the single allowed Edge
  invocation, safe invitation list/cancel RPCs, no direct identity-table
  mutation, no open signup, and no browser token/hash type contract.
- Aggregate recovery regressions: **132/132**.
- TypeScript, changed-file lint, and `git diff --check` pass.
- Repository-wide lint remains at the unchanged legacy baseline of **86 errors
  and 8 warnings**, outside this slice.
- The production build remains blocked after three transformed modules by the
  existing native Rollup/`stacker` assertion failure.

### Residual deployment evidence

- All nineteen recovery migrations require ordered rehearsal against a
  disposable, production-like copy of the actual Supabase schema.
- Managed Auth invitation behavior, SMTP/link delivery, redirect allow-list,
  Edge secrets/CORS/JWT behavior, PostgREST schema refresh, concurrent invite
  creation/consumption, and migration replay require staging proof.
- No migration, Edge function, application deployment, or production action
  has occurred.

### Next dependency

Build audited maintenance for entities, accounts, customers, and vendors so
operators can manage the immutable accounting masters without direct database
edits. Tenant lineage, account hierarchy, purpose constraints, referenced-row
retirement, actor evidence, idempotency, and historical immutability must remain
database-enforced; destructive deletion and cross-tenant reassignment remain
fail closed.

## Recovery checkpoint 20 — controlled account maintenance

### Supported boundary

One tenant admin can create an active chart-of-account row with a normalized
unique code, name, account type, and optional active same-tenant parent of the
same type. An active account can be renamed without changing its structural
identity, or retired one way while preserving all historical references.

Every operation is idempotent and writes an append-only event with actor,
reason, and persistent before/after snapshots. Account code, type, parent,
tenant, controlling classification, default dimensions, creation timestamp,
and physical history remain immutable. Retirement rejects active parents and
any account used by immutable invoice, bill, receipt, or payment controls.

The browser retains a read-only physical account contract and invokes only the
exact create, rename, retire, and safe audit-listing RPCs. Entity, customer, and
vendor maintenance remains unavailable; their lifecycle controls are not
implied by this checkpoint.

### Verification

- New account-maintenance database scenarios: **6/6**, including replay,
  hostile table/column grants, policies and overloads, admin authorization,
  exact create and retry, tenant/type-safe hierarchy, normalized identity,
  audited rename, target non-enumeration, one-way retirement, active-child and
  immutable-control protection, persistent snapshot semantics, and direct
  owner/truncate rejection.
- Focused account containment and maintenance scenarios: **11/11**.
- Browser containment scenarios: **15/15**, including RPC-only maintenance,
  tenant-scoped account reads, hidden physical audit rows, read-only account
  types, and explicit unsupported-master boundaries.
- Aggregate recovery regressions: **138/138**.
- TypeScript, changed-file lint, and `git diff --check` pass.
- Repository-wide lint remains at the unchanged legacy baseline of **86 errors
  and 8 warnings**, outside this slice.
- The production build remains blocked after three transformed modules by the
  existing native Rollup/`stacker` assertion failure.

### Residual deployment evidence

- All twenty recovery migrations require ordered rehearsal against a
  disposable, production-like copy of the actual Supabase schema.
- Managed RLS/grants, PostgREST routine/type refresh, account-control lock
  contention, concurrent create/rename/retire requests, and migration replay
  require staging proof.
- No migration, Edge function, application deployment, or production action
  has occurred.

### Next dependency

Add controlled customer and vendor create/update/retire workflows only after
new invoice and bill posting reject retired parties while correction/retry
paths preserve historical access. Then add entity creation/rename only;
currency change and entity retirement remain unavailable until every posting
routine shares a proven lifecycle check.

## Recovery checkpoint 21 — controlled customer and vendor maintenance

### Supported boundary

One tenant admin can create a normalized active customer or vendor, update an
active party's name/contact/payment metadata, or retire the party one way.
Every operation is idempotent and writes append-only actor, reason, and
persistent before/after evidence. Party ID, tenant, creation evidence, and
historical references never change; physical table and audit writes remain
unavailable to the browser, API roles, service role, and direct owner paths.

New posted invoices and bills require an active same-tenant customer or vendor
under a key-share row lock. Retirement takes an update lock, so concurrent
posting is serialized: the post commits before retirement or fails after it.
Previously posted documents and their safe idempotent retries remain preserved.

### Verification

- New party-maintenance database scenarios: **6/6**, including replay, hostile
  grants/policies/overloads, exact create/update/retire and retry, tenant-admin
  authorization, target non-enumeration, normalized bounded fields, persistent
  before/after evidence, one-way retirement, historical preservation, active
  party posting guards, and direct owner/audit mutation rejection.
- Browser containment scenarios: **15/15**, including read-only physical party
  types, tenant-scoped reads, exact RPC-only maintenance, hidden audit rows, and
  explicit retirement behavior.
- Aggregate recovery regressions: **144/144**.
- TypeScript, changed-file lint, and `git diff --check` pass.
- Repository-wide lint remains at the unchanged legacy baseline of **86 errors
  and 8 warnings**, outside this slice.
- The production build remains blocked after three transformed modules by the
  existing native Rollup/`stacker` assertion failure.

### Residual deployment evidence

- All twenty-one recovery migrations require ordered rehearsal against a
  disposable, production-like copy of the actual Supabase schema.
- Managed RLS/grants, PostgREST routine/type refresh, concurrent posting versus
  retirement, large legacy-master preflight, and migration replay require
  staging proof.
- No migration, Edge function, application deployment, or production action
  has occurred.

### Next dependency

Add tenant-admin entity creation and rename with append-only snapshots and
posting-safe tenant/currency identity. Entity currency change and retirement
remain unavailable until every accounting routine shares a proven lifecycle
contract.

## Recovery checkpoint 22 — controlled entity creation and rename

### Supported boundary

One tenant admin can create a normalized entity with one uppercase three-letter
functional currency or rename an existing same-tenant entity. Both operations
are idempotent and write append-only actor, reason, and before/after evidence.
Entity ID, tenant lineage, functional currency, creation evidence, deletion,
and retirement remain immutable or unavailable.

Entity creation deliberately creates no accounting period, chart-of-account
row, AR/AP/cash control, tax setup, or posting configuration. Each supported
accounting boundary must be configured explicitly before the new entity can
post. The browser retains a read-only physical entity contract and invokes only
the exact create, rename, and safe audit-listing RPCs.

### Verification

- New entity-maintenance database scenarios: **6/6**, including replay,
  hostile grants/policies/overloads, exact create/rename and retry, tenant-admin
  authorization, normalized currency/name, target non-enumeration, NULL-safe
  persistent audit snapshots, immutable currency/tenant/history, no invented
  accounting setup, and direct owner/audit mutation rejection.
- Browser containment scenarios: **15/15**, including tenant-scoped entity
  reads, exact RPC-only maintenance, hidden physical audit rows, read-only
  entity types, and explicit unconfigured-new-entity behavior.
- Aggregate recovery regressions: **150/150**.
- TypeScript, changed-file lint, and `git diff --check` pass.
- Repository-wide lint remains at the unchanged legacy baseline of **86 errors
  and 8 warnings**, outside this slice.
- The production build remains blocked after three transformed modules by the
  existing native Rollup/`stacker` assertion failure.

### Residual deployment evidence

- All twenty-two recovery migrations require ordered rehearsal against a
  disposable, production-like copy of the actual Supabase schema.
- Managed RLS/grants, PostgREST routine/type refresh, concurrent entity
  create/rename requests, large legacy-master preflight, and migration replay
  require staging proof.
- No migration, Edge function, application deployment, or production action
  has occurred.

### Next dependency

Resolve the repository-wide lint baseline and native production-build blocker,
then add CI gates for aggregate tests, TypeScript, lint, migration integrity,
and production build. This repository-quality milestone precedes staging
migration rehearsal.

## Recovery checkpoint 23 — enforceable repository CI

### Supported boundary

Pull requests and pushes to `main` now run a read-only GitHub Actions workflow
on Node 22. The workflow installs the exact lockfile with the repository's
required legacy peer resolver, then runs aggregate regressions, TypeScript,
repository-wide lint, and the production build. It has only `contents: read`
permission and contains no secret, Supabase, publish, or deployment step.

The five non-type-debt lint failures were corrected. Eighty-one legacy
`explicit-any` findings remain visible as warnings rather than being concealed
or unsafely rewritten across unsupported prototype modules. Together with the
eight existing Fast Refresh warnings, the repository lint gate now exits with
zero errors and 89 warnings. Node support is declared as 20 or 22 LTS.

### Verification

- CI workflow safety regression: **1/1**, including read-only permissions,
  Node 22, exact install/test/type/lint/build commands, and absence of secrets
  or deployment actions.
- Aggregate recovery regressions: **151/151**.
- TypeScript, repository-wide lint with **0 errors / 89 warnings**, changed-file
  lint, and `git diff --check` pass.
- This restricted workspace still reproduces the known Rollup native-parser
  `stacker` panic after three transformed modules. The hosted Node 22 workflow
  is the authoritative build gate; a successful hosted run is required before
  staging rehearsal.

### Residual deployment evidence

- All twenty-two recovery migrations still require ordered rehearsal against a
  disposable, production-like copy of the actual Supabase schema.
- The 89 warning sites remain explicit quality debt; no warning is represented
  as type-safe merely to make CI green.
- No migration, Edge function, application deployment, or production action
  has occurred.

### Next dependency

Require a green hosted Node 22 production build, then rehearse all recovery
migrations in order against a disposable production-like database with
preflight, replay, rollback, RLS/grant, PostgREST-cache, and concurrency
evidence. Production remains out of scope without a separate explicit approval.

## Recovery checkpoint 24 — deterministic full-chain migration rehearsal

### Supported boundary

The read-only CI workflow now starts a credential-free local Supabase stack
with pinned CLI `2.116.0`. It applies the complete ordered 63-file history,
resets and reapplies that history, compares two public-schema dumps byte for
byte, runs Supabase database lint at error level, and destroys the stack even
when a prior step fails. A manifest regression pins all 63 files and the
contiguous 22-file recovery tail.

The first two rehearsals exposed real ordered-history defects that isolated
fixtures did not reproduce: legacy `get_user_role(uuid)` returned `text` before
the identity migration installed its enum-return contract, and account
maintenance referenced a supplier-payment control table name that the actual
supplier-payment migration never created. Both are fixed with exact legacy
fixtures and focused regressions.

### Verification

- Migration/CI safety regressions: **3/3**, including the manifest fingerprint,
  read-only permissions, local-only Supabase commands, two resets/dumps,
  deterministic comparison, error-level lint, unconditional cleanup, and the
  absence of tokens, project links, database pushes, or deployment commands.
- Focused identity helper regression: **9/9**.
- Focused account/entity lineage regressions: **13/13**.
- Aggregate recovery regressions: **153/153** on the hosted Node 22 gate.
- Hosted TypeScript, repository-wide lint, production build, and application
  verification pass.
- Hosted disposable Supabase evidence passes: initial full-chain application,
  clean reset/replay, identical public schema, database lint, and teardown.

### Residual deployment evidence

- The successful rehearsal starts from an empty managed local schema. It does
  not prove that a sanitized copy of existing production rows satisfies every
  recovery preflight or lock-time budget.
- Managed PostgREST schema-cache refresh, Realtime publication state, Auth/Edge
  integration, and two-session concurrency still need staging evidence.
- Backup restoration and rollback must be rehearsed against the same sanitized
  data-bearing copy before any production change is considered.
- No remote Supabase project, migration, Edge function, hosted application, or
  production database was changed.

### Next dependency

Obtain an authorized sanitized production-like database copy and rehearse the
same manifest against its legacy rows, including preflight failure reporting,
lock timing, backup restore, rollback, PostgREST/Realtime/Auth behavior, and
two-session races. Then complete finance, security, and UAT sign-off. A remote
deployment remains a separate explicitly approved action.
