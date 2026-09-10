# Finance integration contract and operations

Automated bank-feed connections and their separate worker/scheduler are described
in FINANCE_BANK_FEEDS.md. They retain provider transaction revisions and feed the
existing cash reconciliation workflow; they do not execute bank payments.

The Finance Integrations screen configures a connection, lists verified events,
shows complete-ledger clearing balances and submits mappings for independent
approval. It supports USD accounting for the first US release. Enable the entity's
journal/payment approval policy before onboarding. Connection creation, enable/
disable changes, postings, ignored events and financial reversals require two
different authorized people. Configuration changes require two administrators.

## Supported sources

| Source | Result after mapping and approval |
| --- | --- |
| Stripe `invoice.paid` | Exact receipt against one existing posted ERP invoice; processor clearing is debited and AR credited |
| Stripe `payout.paid` | Exact net payout from processor clearing to the selected entity's bank register |
| Signed `customer.receipt` | Exact partial or full receipt against one existing invoice |
| Signed `processor.payout` | Exact net movement from clearing to the selected bank register |
| Signed `usage.recorded` | Positive exact usage on the selected usage contract; later cycle finalization and recognition retain independent approval |
| Signed `journal.posted` | Balanced payroll, fee or other externally prepared journal resolved from active account codes in the connection's tenant |
| Other event types | Visible unresolved event requiring an explicit reviewed ignore decision; no posting |

These are ingestion and accounting workflows. They do not charge cards, transfer
money, calculate payroll or tax, create Stripe subscriptions or guarantee provider
completeness. The contract billing module owns ERP invoices and revenue schedules;
operators map existing provider objects to their corresponding ERP records.
Provider-side charges and subscriptions must already be configured. Sales-tax
calculations, native CRM sync, chargeback automation and refund/credit allocation
need their own accepted provider contracts before customers depend on them.

The processor receipt is initially posted through the existing receivable control,
then atomically reclassified to the connection's clearing account when necessary.
Payouts move only the provider's reported net amount. Fees are never inferred from
an unexplained difference: import the verified fee journal separately. For a
100.00 receipt, 97.00 payout and 3.00 fee journal, clearing returns to zero. A
nonzero balance remains visible for investigation and does not prevent legitimate
timing items. Bank reconciliation independently proves the bank movement.

Stripe's `arrival_date` is an expected banking date, encoded as a UTC timestamp;
it is used as the payout journal date. Receipt dates use the approved connection's
accounting timezone and the provider's `paid_at` timestamp. A payout can later
fail. Review such exceptions against the actual bank record and request a linked
integration reversal where appropriate. `invoice.paid` events marked as paid out
of band, zero receipts and non-USD amounts are rejected for manual investigation.
This connector consumes Stripe snapshot events with the documented invoice/payout
fields; thin events and a changed event schema must not be activated without
adapter validation. See [Stripe webhook behavior](https://docs.stripe.com/webhooks)
and [the payout object](https://docs.stripe.com/api/payouts/object).

## Connection activation

1. Create the USD legal entity, open accounting periods and posting accounts.
   Use a dedicated asset clearing account, distinct from AR and contract assets.
   Each connection has its own clearing account within an entity.
2. Request the connection in Finance Integrations and have another administrator
   approve its provider, account reference, environment, timezone and mapping.
   Identity and mappings are immutable; label and enabled-state changes are versioned.
3. Configure `FINANCE_WEBHOOK_SIGNING` in the server's deployment secret manager.
   It is a JSON object keyed by the approved connection UUID, for example:

   ```json
   {
     "60000000-0000-4000-8000-000000000001": {
       "provider": "STRIPE",
       "account": "acct_replace_with_verified_account",
       "environment": "TEST",
       "secrets": ["replace_with_the_actual_endpoint_signing_secret"]
     }
   }
   ```

4. Deploy the `finance-webhook` Supabase function and set the provider endpoint to
   `https://<project>.supabase.co/functions/v1/finance-webhook?connection=<uuid>`.
   Only this endpoint has gateway JWT verification disabled: its mandatory raw-body
   HMAC is the provider authentication. Database ingress/configuration RPCs accept
   the server service role only; neither browser sessions nor anonymous callers can
   insert provider events. Do not put service credentials or signing secrets in
   source, browser variables or connection metadata.
5. Run provider test-mode acceptance, then separately approve a live connection and
   register its own live signing secret. Test/live and provider account identities
   must agree across the signed payload, server configuration and approved record.
   The synthetic CI endpoint exercises the deployed local Edge function; it does
   not establish a connection to any live Stripe account.

Support up to three active signing secrets during a short rotation window. Remove
the retired secret after provider deliveries have switched. The endpoint verifies
all supported signature candidates with Web Crypto, allows 300 seconds of clock
skew, caps raw bodies at 1 MiB and persists only normalized financial fields plus
delivery hashes. It never stores the full Stripe customer/payment object. Use
deployment monitoring to alert on HTTP failures, delivery lag and old unresolved
events; keep endpoint clocks synchronized.

## Signed source protocol v1

An adapter that has verified its payroll, meter, processor or other source can send:

```json
{
  "version": 1,
  "id": "delivery-2026-01-31-001",
  "type": "usage.recorded",
  "account": "approved_adapter_account",
  "environment": "TEST",
  "object_id": "meter-event-001",
  "data": {"units": "600000.000001", "occurred_at": "2026-01-31T23:00:00-05:00"}
}
```

`customer.receipt` and `processor.payout` data contain exactly `currency`, `date`
and positive decimal-string `amount`. Dates use `YYYY-MM-DD`, currency is `USD`,
and amounts have at most two fractional digits. `journal.posted` contains
`currency`, `date` and `lines`; each line has `account_code`, decimal-string
`debit`, decimal-string `credit`, and optional `memo`. Use between 2 and 500 lines.
The database requires active tenant-owned accounts, exact positive one-sided
amounts and equal nonzero debit/credit totals. The review freezes the resolved
account identities and amounts. Negative usage offsets remain in the contract's
controlled correction workflow, not this positive-event protocol.

Send `Content-Type: application/json` and `X-Finance-Signature: t=<unix-seconds>,v1=<hex>`.
The signature is HMAC-SHA256 with the approved server secret over the exact UTF-8
bytes of `<unix-seconds>.<original request body>`. Preserve the body byte for byte.
Stripe uses its standard `Stripe-Signature` header and endpoint signing secret.
An accepted delivery returns HTTP 200 with `received_for_review`. Validation or
signature failures return 4xx; unavailable configuration or persistence returns
503. Never treat a failed response as a posted accounting transaction.

## Retry, correction and evidence

Connection/event IDs identify deliveries; connection/operation/provider-object IDs
identify financial sources. Identical retries return the original inbox item.
A different event ID for an identical source records additional delivery evidence
without a second financial source. Conflicting payloads for either identity fail;
an actual correction must use its own source identifier and explicit review.
Events do not have to arrive in chronological order. A source that cannot yet post
stays unresolved; the approval's transaction rolls back on a closed period, stale
mapping, missing contract, finalized usage or exhausted invoice capacity.

Reviewers see the submitted source and proposed target. A changed connection or
source forces a new review. An uncertain decision can be retried with the identical
request, decision and reason; the existing result is returned. Rejected/withdrawn
requests retain their evidence, and the source can receive a fresh proposal.

Receipts, payouts and source journals can be reversed only through their linked
integration review. All associated entries reverse atomically on the approved
date. An original receipt's correction and an integration journal's standalone
reversal cannot bypass this review; a replacement needs a fresh verified provider
source. Reversals retain original entries and approvals. Usage corrections retain
the original meter event and follow contract completeness controls.

The history uses cursor pagination and reports total event count. Evidence export
contains the displayed page; follow older-event cursors for complete history.
Clearing balances always cover the full dated ledger and must not be summed twice
across unrelated views. Report failures hide stale data and exports. Deferred
database checks validate approval/source/journal lineage; populated recovery
revalidates every inbox item and compares reports and retry results after restore.

## Approved outbound refunds

The separate provider-refund worker can execute supported approved USD Stripe card
refunds, retain provider and balance evidence, and queue independent clearing and
returned-fund accounting review. FINANCE_PROVIDER_REFUNDS.md defines its original
invoice binding, reservations, bounded retries, credentials and release acceptance.
Do not treat an inbound receipt, generic journal or worker retry as refund approval.
