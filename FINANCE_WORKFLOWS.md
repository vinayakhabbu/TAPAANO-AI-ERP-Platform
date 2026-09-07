# Verified finance workflows

## Banking

Open Banking and create a named cash register for one entity and one active asset
account. This mapping is immutable and unique per entity/account. It records no
bank credentials or routing identifiers. The original bank tables remain frozen.

Upload a CSV using the columns in
[`bank-import-example.csv`](tests/fixtures/us-finance/bank-import-example.csv).
Use the bank's stable transaction ID, ISO booking date, description, reference and
signed decimal amount. Positive amounts increase cash. The example's opening
balance is 50,000.00 and closing balance is 84,700.00; its unidentified 750.00 is an
exception to investigate, not an automatically recognized sale. Adapt bank exports
to this explicit schema; arbitrary OFX, BAI2, MT940 and provider CSV layouts are not
automatically inferred. No file is interpreted as executable spreadsheet content.

The database verifies dates, exact two-decimal amounts, duplicate IDs, all-or-nothing
row insertion and opening + activity = closing. It accepts at most 5,000 statement
rows. Complete reconciliation reads stop explicitly above 10,000 cash ledger lines.
One statement is open per register. Later statements must follow the last approved
statement's date and balance. Incorrect imports require a reviewed void.

Match one or more bank rows to one or more posted cash ledger lines with the same
direction and exact total. References and dates are evidence for the preparer;
amount equality alone is not evidence that two transactions represent the same
payment. A line cannot be actively matched twice. Removed matches retain their
author, timestamps and explanation. Post missing fees and interest through the
controlled journal workflow, then match the resulting cash line. A processor payout
normally needs clearing-account accounting for its gross receipt and fees before
its net cash entry is matched.

The reconciliation shows bank closing, ledger closing, signed outstanding book
items, adjusted bank balance and variance. Unmatched ledger items carry to later
statements. Initial bank opening must equal the cash ledger before the first
statement; establish and reconcile opening balances before importing that history.
Pre-existing outstanding items need an accepted cutover rather than being silently
assumed cleared. All bank rows must be explained and both variances zero before
close. This is reconciliation evidence, not independent proof of bank balances.

Close, reopen and void requests retain the exact report snapshot. A different
accounting operator must decide; the importer and any matching/removal preparer
cannot approve. Cash ledger changes invalidate a pending approval. Rejection
returns the statement to preparation. Approved reconciliations prohibit backdated
cash postings; obtain an independently approved reopen to correct the cutoff.
Later statements must be resolved before reopening an earlier one. Period closing
continues to apply independently. A lost response is retried with the original
request; exports contain report and matching evidence. Review history is retained
separately in the database and browser.

Production bank execution, automated feeds, provider-specific formats and accepted
historical conversion remain provider/onboarding work. Accounting reconciliation
never sends money. Representative throughput and managed staging acceptance remain
required; the common posting lock is a deliberate correctness boundary.

## Finance approvals

Finance Approvals contains manual journals, partial supplier payments, their exact
corrections/replacements, and policy requests. A proposal has an immutable payload, financial source snapshot,
requester, reason and retry key. A different accounting operator approves or rejects
it; only the requester can withdraw. Approval and every resulting record/journal
commit together. A failed execution leaves the proposal pending for investigation
or retry. Concurrent retries return the same recorded result. Contract-cycle changes after
submission invalidate the approval snapshot and require a fresh proposal. Policy changes
require two administrators and an explicit current policy version.

Enable both journal and payment approval requirements for each production entity.
Existing entities retain direct posting until this reviewed policy is enabled.
Once enabled, database triggers reject direct journal/payment posting, including
payment corrections and replacements. Contract actions always require independent
approval, regardless of this policy. Bank reconciliation retains its additional
importer/matcher independence checks. These are accounting approvals, not bank
authorization or execution, procurement commitments, SSO or a complete spend system.

## Contracts, subscriptions and usage

Contracts and Revenue records approved fixed or usage contracts in the entity's
functional currency. Configure the ordinary invoice AR/revenue accounts and choose
separate deferred-revenue liability and unbilled-receivable asset accounts. Billing
uses the existing zero-tax invoice and receipt subledger; tax-provider configuration
and customer-specific tax acceptance remain prerequisites where applicable.

Each contract has a finite service period up to ten years, a timezone, and a once,
monthly, quarterly or annual billing frequency. Cycle boundaries are anchored to
the original service start; a final short cycle prorates its fixed price by actual
days in the anchored cycle. There is no implicit indefinite renewal. Future cycle
repricing/cancellation requires approved amendments and untouched cycles. Mid-cycle
modifications, migration of already-billed contracts, discounts, variable
consideration constraints and contingent rights need their own accepted policies.

Fixed consideration is allocated to up to twenty distinct performance obligations
using relative standalone selling prices. Deterministic cumulative cent rounding
preserves the total allocation. Daily service uses actual calendar days and
cumulative rounding, including leap years and partial months. Milestones require
dated transfer/acceptance evidence; forecasts do not mark them delivered. Finance
must approve whether promises are distinct and these methods reflect delivery.
This implements specific approved accounting policies; it is not an automatic
ASC 606 compliance determination. The design follows the separation of performance
obligations, allocation and satisfaction described in
[FASB's revenue recognition update](https://storage.fasb.org/ASU%202016-10.pdf).

Usage events have a contract, named source, stable external identifier, timestamp
and exact quantity. Identical duplicate deliveries return the same record;
conflicting deliveries fail. Exact offsets preserve the original event's time and
cannot be repeated. The accounting timezone assigns events to billing cycles.
Finalize a completed cycle by independently approving its event revision and
source control total. The price is aggregate net units times the exact unit rate,
rounded once to cents. Closed usage rejects late arrivals rather than silently
changing issued invoices. Late-event adjustment invoices, tiered pricing, minimum
commitments, source-completeness automation and provider metering are additional
integration requirements. A zero-usage cycle can be finalized and marked billed
without a zero-value invoice or journal.

## Revenue and contract reconciliation

Billing and recognition are separate dated events. A contract invoice uses the
verified AR invoice workflow and atomically reclassifies its revenue credit to
deferred revenue. Recognition debits deferred revenue when already invoiced, or an
unbilled receivable when earned before invoicing. Invoicing subsequently clears
that unbilled balance. A catch-up recognition dated before an existing invoice
also creates the required clearing entry on the invoice date; both affected
periods must be open. Invoice dates cannot cross later recognized history.

Recognition requests advance in accounting-date order, cannot post future service,
and post only the earned amount above previous recognition. The report shows
allocation and cumulative schedules, dated postings, billed/recognized/deferred/
unbilled amounts, and all-contract control-account comparisons to the GL. Manual
control-account entries remain visible as variances. Private graph checks and
deferred constraints verify source approvals, allocation bounds and contract
balances at every posting date. Contract journals cannot be reversed individually.

Full credits for unpaid contract invoices require independent approval and reverse
both recognized revenue and remaining deferral on the credit date while retaining
original history. Existing settlement safeguards prohibit crediting invoices with
receipt history. Partial contract credits, refunds, disputes and modifications of
already-recognized consideration remain separate implementation/acceptance work.

The synthetic annual case yields January revenue 3,100.00 and February 2,800.00;
the 12,000 bundle allocates 9,600 to service and 2,400 to training, with exact
cumulative rounding. The 600,000-unit usage case at 0.0025 recognizes 1,500.00 in
January before its February invoice and clears the unbilled balance on invoicing.
These dated balances, approval retries, tenant denials and source graphs are
included in database and authenticated browser/recovery qualification.

## Provider integrations

Finance Integrations stages signed Stripe receipts/payouts and signed usage or
journal imports for independent approval. It includes immutable mappings, provider
event/object deduplication, source snapshots, clearing balances, linked reversals,
cursor history and evidence export. See [the integration contract and runbook](FINANCE_INTEGRATIONS.md)
for activation, payloads, retry handling, exception review and provider boundaries.

## Schedules and fiscal closing

Finance Schedules and Financial Close add independently approved prepaids, fixed
assets, recurring journals, accrual reversals, source completeness checks and
retained-earnings closing. See [the close policies and runbook](FINANCE_CLOSE.md)
for date allocation, corrections, disposal, reviewed period transitions and fiscal
reopening. These workflows preserve source history and exact dated GL comparisons.

## Intercompany and consolidation

Intercompany Accounting records bilateral service, funding, partial settlement and
linked corrections. Group Consolidation adds approved membership, explicit FX
quotes, automatic matched-pair eliminations, reviewed adjustments and immutable
final reports. See [Group finance policies](FINANCE_GROUPS.md) for supported
translation, retained earnings, source evidence and reopening controls.
