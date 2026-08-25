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
6. Existing-user authentication with immutable tenant membership and one
   tenant-bound role assignment.

All verified accounting writes occur through controlled PostgreSQL routines.
The browser has no physical-table write contract for journals, periods,
invoices, invoice lines, accounting events, accounting masters, or roles.

## Fail-closed and preservation boundaries

The following are unavailable or read-only preservation metadata:

- Agent River, embeddings, global/precedent search, anomaly detection,
  autonomous approval, scheduled report delivery, and direct notifications.
- Customer settlement, aging, collections, partial credits, refunds, tax and
  cross-currency invoice posting.
- AP posting, approvals, payment runs, payment execution, and payment matching.
- Bank connections, imports, matching, reconciliation, positive pay, balances,
  and bank-account credentials.
- Accounting-master and organization maintenance.
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
- Profiles and roles are immutable across API, service-role, and direct owner
  DML; only the current profile can be read through browser policies.
- Self-service signup, invitation, removal, and role changes are unavailable
  until a controlled onboarding/administration workflow exists.

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
- Implement controlled onboarding and the missing accounting vertical slices.
- Resolve repository-wide lint failures and obtain a successful production build
  in a supported build environment.
- Perform finance/security review, backup and rollback rehearsal, and explicit
  release approval.

No recovery migration, Edge function, commit, push, or deployment has been made
from this workspace.
