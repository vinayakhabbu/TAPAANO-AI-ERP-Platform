# Approved Stripe refunds

This increment connects an approved customer credit to an actual provider refund,
its processor balance entries, and independently reviewed accounting. It uses
synthetic acceptance fixtures; it has not connected or sent money through a real
Stripe account.

## Supported operating contract

The initial adapter supports direct Stripe accounts, USD card charges, a single
paid InvoicePayment allocated entirely to one invoice, and USD refund balance
entries with zero additional refund fees. The credited ERP invoice must have an
active receipt posted from a reviewed Stripe `invoice.paid` event. Account,
environment, invoice, InvoicePayment, PaymentIntent, captured charge, amount and
customer references must agree before dispatch. The approved integration's
clearing account and accounting timezone are retained with the refund.

Split or multi-invoice payments, Connect transfers/application fees, non-card
methods, disputes, currency conversion and additional refund fees require separate
qualified adapters or accounting policies. They remain exceptions requiring
provider review. A `succeeded` refund that later fails is explicitly supported.
Provider ingestion alone does not create external subscriptions or charge cards.

## Workflow

1. Create and independently approve an original-line customer credit. Its paid
   portion remains a reconciled customer-credit liability.
2. In Finance integrations, select the entity and open Provider refunds. Select
   the credit and its original reviewed Stripe receipt, enter the exact amount,
   reference and customer evidence, and submit for independent approval.
3. Approval creates a durable job and reserves the amount. Reservations do not
   change the ledger. Other refunds, applications and credit reversals cannot
   consume reserved credit or overrun the original receipt. The same Stripe
   account/environment cannot route outbound refunds through different ERP
   connections, including connections in another tenant.
4. The worker verifies the provider account and original payment. It searches
   existing refunds for the job identity before sending. Immediately before POST,
   the database records an immutable payment binding and first dispatch time.
5. The POST uses `tapaano-refund-<job UUID>` as its idempotency key and binds the
   approved proposal digest in metadata. After any uncertain outcome, the worker
   recovers the existing refund before considering a retry. No new POST is allowed
   after 23 hours from the first durable dispatch mark; a new key is never created
   for the same job. Cancellation is allowed only before that mark.
6. The worker retrieves the canonical refund and balance transactions. Pending
   refunds remain reserved. Provider evidence includes exact amounts, identifiers,
   status, original and return balance entries, observation time and response
   digest. Reports and evidence pages validate their retained financial sources.
7. A second accounting review posts a verified success: debit customer-credit
   liability, credit the approved processor clearing asset. The date is the
   provider balance entry's date in the approved accounting timezone. Closed
   periods must be reopened through their existing controls. The original bank
   account is not substituted for processor clearing.
8. Continue provider verification after success, including if the integration is
   disabled. If Stripe returns the refund, retrieve the failure balance entry,
   then independently approve the linked customer-credit-use correction on its
   actual return date. The original entry and its reversal remain in the ledger.
   A standalone reversal of a successful provider refund is rejected.

The customer-credit report shows the dated ledger balance and **current** provider
reservation separately. `availableToUse` is the nonnegative dated balance less the
current reservation; it is an operational limit, not a historical ledger movement.
Finance close rejects unresolved dispatches, stale checks, pending provider status,
unposted successful refunds and returned funds needing accounting correction.

## Deployment and credentials

Apply the complete reviewed migration chain and deploy `provider-refund-worker`
with the normal Supabase URL and service-role key. Its public Edge entry uses a
separate, mandatory Bearer token checked before database or provider access:

- `PROVIDER_REFUND_WORKER_TOKEN`: independently generated secret, 32–400 characters.
- `PROVIDER_REFUND_CREDENTIALS`: server-side JSON keyed by the approved finance
  connection UUID, with `environment` (`TEST` or `LIVE`), `accountId` (`acct_…`),
  and `secretKey`. Test/live key prefixes and `/v1/account` identity must agree.

Provision narrowly scoped provider credentials with the necessary invoice,
InvoicePayment, PaymentIntent, charge, refund, balance-transaction and account
permissions. Keep test and live accounts separate. Never put provider keys or the
worker token in Vite configuration, browser storage, application forms, logs or
committed files. The frontend only queues checks and approvals.

The optional `provider-refund-worker.yml` workflow runs every five minutes when
`vars.PROVIDER_REFUND_WORKER_URL` is set to the deployed HTTPS Supabase function
endpoint. Set the matching `secrets.PROVIDER_REFUND_WORKER_TOKEN` in the repository.
It processes at most three jobs per run, uses an eight-minute job timeout and
serial scheduling, and reports only typed operational errors. An external runner
can invoke the same authenticated worker. No scheduler was activated here.

Each job has a five-minute database lease. Provider transport has per-request
10-second and overall 85-second bounds; the scheduler allows 120 seconds per
invocation. Confirm deployment timeout limits, observed latency and capacity before
activation. Duplicate persistence responses retry the exact lease and payload.
Successful/returned jobs are checked every six hours; pending jobs every five
minutes. A manual queue request can accelerate a check, with a one-minute floor.

## Recovery and operations

Monitor worker failures and the Provider refunds exception queue. A queue action
only requests verification; it cannot free a reservation, post a journal, change
an approved amount or send an arbitrary payment. An administrator can supply a
known `re_…` reference for an uncertain dispatched job; the worker still requires
its original charge, exact amount and approval metadata to match.

If the 23-hour dispatch window expires and no matching refund is found, leave the
credit reserved and investigate the provider account. Review the complete provider
history, which the adapter searches for up to 1,000 refunds on the original charge;
a known matching provider reference can recover an older result. Never create a
replacement job merely because an old response was lost. Absence from one provider
read is not proof that sending never occurred. Unresolved or contradictory provider
facts require provider/finance investigation and must not be force-cleared through
SQL. Cancel a queued job through independent review if its mapping changed before
first dispatch, then submit against the current approved connection.

Preserve secrets outside the database backup. Before reactivating workers after
restore, reconcile any external activity that occurred after the recovery point,
recover known refunds, verify account bindings and rotate credentials if needed.
The recovery test uses an isolated loopback database and synthetic provider
transport; it does not claim recovery of a live provider account or a production
point-in-time data-loss interval.

## Qualification

Database regressions cover credit reservations, original-receipt capacity,
independent cancellation, pending/failed states, expired dispatch windows,
original/refund/return ledger reconciliation, tenant/service boundaries, exact
observation retries and damaged source evidence. Worker fixtures exercise account
scope, exact integer parsing, lost POST and persistence responses, key expiry,
ambiguous allocations, disputes, unexpected fees and ownership mismatches.

The hosted scenario uses the native worker handler with only Stripe HTTP transport
substituted. Real local Auth, PostgREST and browser sessions exercise uncertain
requests, simultaneous independent approval and claims, clearing posting, returned
fund correction, evidence history, failure visibility, and populated restoration.
Use the increment PR's final head and retained CI artifacts for release evidence.
Real Stripe test-mode acceptance, managed staging, migration/import controls,
representative volume, alerts, credentials, security review and operating ownership
remain production release gates.

## Provider references reviewed on 2026-09-10

The adapter pins `Stripe-Version: 2026-08-26.dahlia`; version changes require
provider-contract requalification.

- [API versioning](https://docs.stripe.com/api/versioning)
- [InvoicePayment listing](https://docs.stripe.com/api/invoice-payment/list)
- [InvoicePayment ownership and amount](https://docs.stripe.com/api/invoice-payment/object)
- [Charge and capture facts](https://docs.stripe.com/api/charges/object)
- [Refund creation](https://docs.stripe.com/api/refunds/create)
- [Refund recovery listing](https://docs.stripe.com/api/refunds/list)
- [Idempotency key retention](https://docs.stripe.com/api/idempotent_requests)
- [Refund statuses and failure balance entries](https://docs.stripe.com/api/refunds/object)
- [Balance transaction amounts, fees and source](https://docs.stripe.com/api/balance_transactions/object)
- [Refund lifecycle and returned funds](https://docs.stripe.com/refunds)
