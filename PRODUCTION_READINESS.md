# Production readiness

## Current verdict

**Not approved for production or financial reliance.** The repository-level
quality gate is healthy, but the data-bearing managed-service, operational, and
organizational evidence below has not been completed. A green build is necessary
but is not a release approval.

Hosted baseline: 2026-08-29, commit `c4cecfb`. Local hardening review:
2026-09-05; these worktree changes need review and hosted gates before they
become release evidence. Local verification used supported Node 22.23.2.

## Evidence already present

- The latest hosted Node 22 CI run on `main` passed.
- The aggregate suite passes 161 accounting, authorization, browser-containment,
  Edge-boundary, migration-manifest, and CI-safety regressions.
- The exact npm lockfile type-checks, repository lint exits with zero errors and
  89 visible warnings, the production bundle builds, and `npm audit` reports
  zero known vulnerabilities after the framework security upgrade.
- CI applies the 63-file migration history twice to an empty disposable Supabase
  stack, compares the schemas, lints the database, and always tears it down.
- Unsupported accounting, banking, inventory, production, tax, payroll, AI, and
  autonomous workflows remain fail-closed or unreachable from active routes;
  the active shell exposes no simulated tenant, role, period, or notification state.
- Authentication initialization fails closed when its session or tenant-profile
  read fails, sign-out clears tenant query data and its namespaced local session,
  and blocked browser storage falls back to page-lifecycle memory rather than
  crashing startup.
- Active dashboard, ledger, accounting-period, AR, AP, and banking views expose
  read failures as unavailable and withhold affected counts or totals instead of
  presenting missing financial data as zero or empty history.
- The ordinary build artifact permits same-origin network connections only. The
  release build validates an origin-only Supabase URL and generates a CSP whose
  HTTPS and WebSocket destinations are pinned to that exact origin.

## Mandatory release gates

Each gate needs a named owner, date, immutable evidence link, and explicit
pass/fail result. Do not waive a failure by editing legacy data without an
approved reconciliation record.

1. **Sanitized data rehearsal** — restore a recent production-like backup into an
   isolated project; inventory row counts and constraints; apply all migrations
   in order; record preflight failures, locks, duration, and post-migration
   reconciliation; then repeat from a fresh restore.
2. **Restore and rollback** — define RPO/RTO, prove point-in-time or snapshot
   restore, rehearse the rollback decision and application rollback, and record
   the last safe irreversible database step.
3. **Managed Supabase behavior** — verify RLS/grants as anon, authenticated,
   service-role, and owner; refresh PostgREST schema; inspect Realtime
   publications; exercise Auth onboarding and the invite Edge function; confirm
   allowed-origin and JWT behavior.
4. **Concurrency and performance** — use two independent sessions for posting,
   reversal, correction/replacement, period close, account/party retirement, and
   identity changes; record lock waits, deadlocks, timeouts, query plans, and
   representative p95/p99 latency.
5. **Finance acceptance** — reconcile opening balances and every supported
   journal graph; approve period-close and reversal behavior; document the exact
   unsupported workflow list shown to operators.
6. **Security acceptance** — resolve high/critical dependency and CodeQL results,
   test cross-tenant access, review Edge secrets and logs, set credential rotation
   owners, and perform an authorized application/API review.
7. **Operations** — configure availability/error/latency monitoring, database and
   Edge alerts, audit retention, incident contacts, customer support, status
   communication, and tested runbooks with on-call ownership.
8. **UAT and release approval** — complete role-based UAT on the staged build,
   capture finance/security/product sign-off, approve the deployment window and
   rollback threshold, and retain the evidence with the release commit.

## Release build

Use Node 20.19+ or 22.12+ and npm. Environment values should come from the deployment
platform, not a committed file.

```bash
npm ci --legacy-peer-deps
export VITE_SUPABASE_URL="https://<project-or-custom-domain>"
export VITE_SUPABASE_PUBLISHABLE_KEY="<publishable-or-anon-key>"
npm run verify:release
```

`build:release` rejects HTTP endpoints, URL paths/queries/fragments,
placeholders, and service-role material before Vite embeds public configuration.
It then replaces the fail-closed default CSP with the exact configured Supabase
HTTPS and WebSocket origins. The normal `build` command remains credential-free
so pull requests can compile without remote access, but its artifact does not
permit connections to a remote Supabase project and must not be deployed.

For the active invitation boundary, configure the Edge runtime separately with
`APP_ORIGIN`, `IDENTITY_INVITATION_SIGNING_SECRET`, and
`IDENTITY_INVITATION_REDIRECT_URL`, plus the Supabase-provided URL and keys. The
application origin must match exactly. Never expose those Edge-only secrets to
the browser.

The generated `dist/` includes `_headers` and `_redirects` for static hosts that
support those conventions. Other hosts must reproduce the same SPA fallback,
cache policy, exact-origin CSP, HSTS, frame, MIME-sniffing, referrer, and
permissions headers.

## Deployment order

1. Freeze the release commit and evidence set; take and verify the rollback
   backup.
2. Put unsupported write paths and scheduled side effects in their documented
   contained state.
3. Apply the rehearsed database migration manifest and perform reconciliation.
4. Refresh/verify managed API schema and permissions, then deploy the one active
   invite function with its exact secrets and origin.
5. Run tenant-isolation, posting, retry, correction, close, and onboarding smoke
   tests using synthetic staging identities.
6. Deploy the immutable frontend artifact and verify deep links, headers, login,
   offline sign-out/local-session clearing, blocked-storage behavior, read-error
   states, and contained-module messaging.
7. Monitor the agreed release window. Roll back when an approved threshold is
   crossed; do not improvise destructive database rollback.

No remote migration, function deployment, frontend deployment, or production
data operation is authorized by this document.
