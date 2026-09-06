# Production readiness

## Current verdict

**Not approved for production or financial reliance.** The repository-level
quality gate is healthy, but the data-bearing managed-service, operational, and
organizational evidence below has not been completed. A green build is necessary
but is not a release approval.

Verified review baseline: PR #22, commit `8b908d7`, merged to `main` at
`bcc0658` on 2026-09-06. New phases require checks on their own exact commits
before they become release evidence. Verification uses supported Node 22.

## Evidence already present

- PR #22 passed hosted Node 22 CI, 171 accounting, authorization,
  browser-containment, Edge-boundary, migration-manifest, and CI-safety regressions,
  plus all seven real Auth/API/browser integration scenarios.
- The exact npm lockfile type-checks, repository lint exits with zero errors and
  89 visible warnings, the production bundle builds, and `npm audit` reports
  zero known vulnerabilities after the framework security upgrade.
- CI applies the current migration history twice to an empty disposable Supabase
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

## September 6 review corrections

The review corrections remove the ledger's inaccessible cost-center join, make
ledger and invoice/bill API relationships explicit where foreign keys overlap, move
operational counts and currency-separated decimal totals into a tenant-scoped
invoker RPC, and read AR/AP history through counted pages. A changing count,
duplicate row, failed page, or history above 50,000 rows is reported as unavailable;
the application does not claim that a partial result is complete. The 50,000-row
interactive-history boundary needs a filtered/paginated UI before larger tenants
are supported. Operational totals remain database aggregates independent of it.

Four additive migrations provide the summary RPC, sanitized diagnostic counters,
the deferred-validator execution correction, and the supported AR/AP source codes
missing from the historical journal constraint, found by full-stack verification.
Deferred trigger wrappers run with owner rights and a fixed search path; internal
validators remain unavailable as client-callable RPCs.
Apply them to staging before testing the matching frontend. Diagnostic events
contain only an allowlisted failure code, server-derived tenant/user, release SHA,
time bucket, and capped occurrence count. No exception messages, stack traces,
URLs, financial records, or credentials are transmitted. Unauthenticated failures
remain sanitized local diagnostics. Configure `VITE_RELEASE_SHA` to the release
commit. Tenant admins can read `client_diagnostic_buckets` through the authenticated
API; owner-level monitoring can aggregate by event code, release, and time.
The server accepts at most one update per actor/code/minute within each hourly
bucket, with a defensive ceiling of 1,000. Inserts perform bounded
cleanup of rows older than seven days; operators should schedule the same retention
cleanup during idle periods. These counters are operational signals, not audit
records or confirmed counts of distinct failures. Alert routing, availability
checks, ownership, and restore proof still require deployment-level configuration.

CI now builds the release artifact with synthetic public configuration and runs
real local Auth/PostgREST/browser checks, authenticated AR/AP receipt/payment,
credit, correction, and replacement commits, plus a concurrent invoice retry against
the fully migrated disposable stack. Synthetic tenant bootstrap is confined to
an empty loopback database. This is not production-data restore or managed-service
acceptance evidence. Test outcomes must be taken from the exact PR/commit checks.

The importable `.github/rulesets/main.json` requires a reviewed PR, current passing
CI/security checks, and resolution of review threads, and blocks force pushes and
branch deletion. Repository owners must import it under Settings → Rules → Rulesets
and verify that it is active. Committing the JSON alone does not enforce it. The
GitHub connection used for this review exposes no administration write action.
The first PR run also confirmed that Dependency graph is disabled. Enable it under
Settings → Advanced Security (security analysis) so the existing dependency-review
gate can run; a successful npm audit does not activate this GitHub feature.

## Ledger reporting phase

The 68-file manifest adds `20260906050000_recovery_trial_balance.sql` after the
four PR #22 migrations. It provides an entity-scoped invoker-rights trial balance
and an index for posted journal date reads. Apply it to staging before the
matching frontend. Index creation and constraint/history scans need timing and
lock evidence on representative data before production deployment.

The report shows exact opening balances, date-range debit/credit activity, and
closing balances, with CSV export. It includes retired accounts and dated offset
journals, excludes and counts drafts, and rejects invalid or unverified posted
history. It does not perform opening-balance or subledger reconciliation, fiscal
close, FX translation, consolidation, or statutory statement preparation.
Browser scope changes and failed refreshes remove previous report/export data.
Database and runtime regressions cover complete histories, exact large decimals,
lineage/balance failures, tenant isolation, and CSV formula escaping. Hosted tests
exercise actual AR/AP posting results and browser report selection/export/failure.

PR #23's exact hosted checks passed 177 regressions, eight real integration
scenarios, deterministic migration replay, typecheck, lint, both builds, CodeQL
and dependency audit. It merged at `578dc5e`; dependency review remains blocked
by the disabled Dependency graph feature.

The owner has confirmed the United States and Rillet's customer market as the
product scope. See [TARGET_CUSTOMER.md](./TARGET_CUSTOMER.md) for that definition
and [ERP_ROADMAP.md](./ERP_ROADMAP.md) for the remaining implementation sequence
and customer-specific accounting and operational inputs. A completed trial-balance
code boundary does not waive any of the release gates below.

## Mandatory release gates

### Finance reporting and period-control increment

The next three additive migrations bring the manifest to 71 files:
`20260906060000_finance_account_ledger.sql`,
`20260906070000_finance_period_controls.sql`, and
`20260906080000_finance_manual_journal.sql`. They add report content revisions,
paged account activity, exact recent-journal summaries, checked period transitions,
append-only period evidence and serialized manual-journal retries. Apply all three
before the matching frontend. The old three-argument `transition_accounting_period`
RPC is revoked from API roles; callers must use `change_accounting_period` with
an expected version and request key. Direct hard close from OPEN is not supported
by that public workflow. Report revisions are consistency tokens, not credentials.

The income statement and balance sheet are ledger views using recorded account
types. They include recorded adjustments and closing entries rather than guessing
which manual entries represent fiscal closing. They do not form a complete set
of financial statements or establish US GAAP compliance. Finance must review the
chart, opening balances, closing entries, presentation and disclosures. For the
distinction between statement purposes, see the
[SEC's financial statements guide](https://www.sec.gov/about/reports-publications/investorpubsbegfinstmtguide).
Cash-flow classification, detailed approved presentation mappings, recurring
schedules, fixed assets and close checklists remain implementation work.

Regressions exercise histories over 1,000 entries, exact large/negative balances,
revision changes, complete exports, stale period versions, request conflicts,
terminal close and role isolation. Full-stack checks exercise independent API
posting/close races, real statement/drilldown output, and browser journal and
period workflows. Use the exact PR checks as implementation evidence; none of
these checks substitutes for the data-bearing and operational gates below.

### Release acceptance

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
