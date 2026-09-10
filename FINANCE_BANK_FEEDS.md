# Bank feed automation

The Banking screen supports independently approved Plaid connections for US-dollar
depository accounts. It synchronizes provider transactions, shows pending items and
corrections, and imports the complete posted window into the existing independently
reviewed cash reconciliation workflow. It does not initiate bank payments.

## Connection and worker activation

1. Create the entity's cash register and obtain bank consent through the organization's
   approved Plaid Link onboarding. Provision a Transactions-enabled Item with the
   required history (up to 730 days, subject to institution availability).
2. In Banking, request the Item/account mapping, environment, cash register and
   earliest history date that finance has verified. A second administrator approves.
   The mapping and coverage are immutable; status changes require another reviewed
   version. Only one enabled feed may own a cash register. Do not reuse an unrelated
   Item's cursor or credentials when reconnecting an account.
3. Store `BANK_FEED_CREDENTIALS` in the Edge deployment secret manager, keyed by the
   approved feed UUID. Each record contains `environment` (`SANDBOX` or `PRODUCTION`),
   `itemId`, `accountId`, `clientId`, `secret` and `accessToken`. Identity/environment
   must exactly match the reviewed feed. Credentials never go into browser variables,
   database connection metadata, source control, logs or exported evidence.
4. Generate a random server-only `BANK_FEED_WORKER_TOKEN` with at least 32 characters.
   Deploy `bank-feed-worker`. Its gateway JWT check is replaced by the mandatory
   separate bearer-secret check before any database/provider access. The worker uses
   the server service role for three narrowly granted sync RPCs; browser sessions
   cannot invoke those RPCs or write/read internal cursor/page tables.
5. Set GitHub repository variable `BANK_FEED_WORKER_URL` to the deployed Supabase
   function URL and secret `BANK_FEED_WORKER_TOKEN` to the matching token. The
   supplied Bank feed synchronization workflow schedules every five minutes and
   can be dispatched manually. It is inactive without the URL variable. Each run
   handles up to three due work items; a managed scheduler can use the same authenticated
   POST contract where stricter timing or higher throughput is required.
6. Run real Plaid Sandbox acceptance, then independently approve and qualify the
   production connection. No credentials or live connection were activated by the
   build/CI workflow. The existing GitHub connection cannot configure deployment
   secrets or repository administration settings.

Plaid Link consent/token exchange is an integration-administrator onboarding step;
this increment does not collect bank login credentials in the ERP. Rotating an
access token for the same Item/account only changes the server secret. A replacement
Item needs a new reviewed connection and verified coverage handoff; retain previous
statement evidence and resolve its date/balance chain before importing new periods.

## Durable synchronization

The adapter uses fixed Plaid HTTPS origins, the pinned `2020-09-14` API version,
Item identity verification, depository-account/currency verification, and a cursor
stream filtered to the approved account. It never accepts a provider URL or a
credential override from a request. Provider numbers are parsed as exact decimal
tokens before conversion to USD cents; fractional cents, unknown currencies and
unbound accounts fail. Plaid's outflow sign is inverted to the ERP's cash convention.

One leased run starts at the last committed cursor. Pages are saved privately;
transactions become visible only after all pages arrive. The complete added,
modified and removed sets apply atomically with the final cursor. An identical
persistence retry returns the original result. A graceful yield retains staged
pages; a failed pagination request or expired in-flight lease discards that run
and restarts from its original cursor. No partial batch updates the visible feed.
An initial empty cursor is recorded as waiting for bank history, never as complete.

Each invocation processes at most three pages to bound Edge execution. A run permits
up to 1,000 pages of 500 entries per provider change array; an exceeded limit fails
without advancing the committed cursor. Each provider request has a timeout and
bounded response size. Failures use bounded exponential retry delays (30 seconds
to one hour) and sanitized codes; raw provider error/customer payloads are not logged.
The UI exposes last success, next attempt, incomplete history and failure state.
Enable scheduler-failure and delayed-sync alerts with a named operations owner.
Provider polling does not force the institution to refresh or guarantee real-time data.

## Reconciliation and corrections

Use the provider's booked date. Pending and removed records never enter a bank
statement; a pending-to-posted transition keeps both identities in revision history.
Zero-value provider records are retained but have no statement line. New statements
require completed historical ingestion, a successful sync within 24 hours, no
unfinished batch/error, reviewed coverage, and exact bank opening/closing controls.
The complete selected posted window must reconcile to those controls. Cached
provider account balances are not used as historical statement balances.

Imports freeze source revisions and all posted rows in the date range. A later
addition, modification, removal or date change affecting that range marks the
statement's sources as changed. Original bank lines, matches and approvals remain
stored. Close is blocked; an approved statement requires reviewed reopening and
voiding, then a corrected import and reconciliation. Resolve later statements first
when repairing a date/balance chain. A provider refresh cannot silently rewrite a
closed bank reconciliation or create a journal.

Period, fiscal and consolidation checks include affected statements and enabled
feeds requiring a healthy sync. Known source conflicts remain blockers even if a
feed is disabled. Disabling a feed is a reviewed operational decision; finance must
establish continued bank-source completeness using its approved bank evidence.

The report cursor paginates transaction history. Posted counts and net movement cover
the complete selected window, and all source rows underlying those totals are
validated. Evidence export contains the displayed page and full-window controls.
Report failures hide previously loaded figures and exports. Database source-graph
checks and populated recovery validate mappings, cursor chains, transaction
revisions and complete retained statement windows.

## Qualification and limits

Database, browser and real local Auth/PostgREST tests cover approvals, isolation,
concurrent claims, lost responses, pagination restart, exact amounts, pending
replacement, corrections to approved statements, failed reads, and backup/restore
retries. The Plaid HTTP transport is replaced with contract fixtures in CI; this
does not substitute for real Sandbox/provider acceptance or managed staging.
Representative-volume performance, bank consent/privacy operations, credential
rotation, monitoring and production recovery remain release acceptance gates.

Provider references consulted 2026-09-10: [Transactions API](https://plaid.com/docs/api/products/transactions/)
and [Sync migration guidance](https://plaid.com/docs/transactions/sync-migration/).
