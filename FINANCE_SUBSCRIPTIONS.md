# Subscription lifecycle

This increment extends Contracts and Revenue with approved changes to recurring
fixed-price, functional-currency, zero-tax subscriptions that have one distinct
daily service obligation. It supports seat/quantity changes, upgrades, downgrades,
percentage discounts, cancellation, approved finite renewal terms and corrections.
Usage and milestone contracts continue through their existing dedicated workflows.

## Service and accounting policy

The service cutoff is the first day of the changed service, in the contract's
accounting calendar. Changes use actual calendar days and cumulative rounding to
cents. Billing anchors retain the original date and absolute cycle offset, including
month-end anchors. This is an explicit day-based policy; it does not assume that a
provider's second-based proration or billing mode produces identical results.

One independent approval executes a finite, immutable list of child actions:

1. Recognize delivered service through the preceding day, if a catch-up is needed.
2. Credit unused billed service against the original invoice line. This reduces
   deferred revenue and unpaid AR, or creates a customer-credit liability for paid amounts;
   it does not reverse earned revenue or create a cash refund.
3. Cancel the old current cycle and untouched future cycles. For a change, create a
   replacement term with its first partial cycle and subsequent anchored cycles.

The first replacement charge is the approved net full-cycle price multiplied by
remaining service days divided by the complete anchored billing-cycle days. Quantity
is an integer from 1 to 999999. Unit price and percentage discount are exact decimal
strings; the discount must be at least zero and below 100 percent. The net full-cycle
price is rounded to cents before calendar proration. Zero-value partial cycles can
be marked billed without creating an invoice. Full-cycle consideration must be
positive. The replacement uses the original service-obligation accounting accounts.

Original invoices, terms, recognition and credits remain stored. Parent and child
requests retain the same requester and independent reviewer, with explicit action
identities, payloads and source snapshots. A failed child rolls the whole transaction
back. The child executor is private, validates its executing parent and accepts only
the action in that parent's approved plan. Standalone unused-service credits and
unlinked reversals cannot bypass the subscription workflow.

After approval, invoice the replacement using the existing contract billing action.
Apply the old customer balance to it, retain a balance, or record a separately
confirmed refund. External charges, provider subscription updates and automatic
invoice dispatch are separate provider operations and are not initiated here.

## Renewal and correction

Renewal approval creates a new finite term beginning the day after the current term
ends. Its price, quantity, discount and end date are reviewed explicitly. The system
creates the future cycles; it does not authorize indefinite automatic extensions.
Only one active change or renewal can own an original term. Work from the replacement
term after a change. If a future renewal was already approved, correct that unused
renewal before changing the current term and then approve the revised renewal.

An erroneous change may be corrected on its original open effective date while its
replacement has no billing, recognition, cancellation or further lifecycle activity.
Resolve uses of the unused-service credit first. Correction reverses that credit,
cancels the unused replacement, restores the original cycles and retains earned
service recognition. Once the replacement has activity, use a subsequent prospective
change. Prior approvals and correction evidence remain in the history.

## Controls and boundaries

Changes require a billed current cycle, untouched future cycles, no unresolved
price concession on the affected cycle, and an effective date after recognized
history. The date cannot be in the future and must be open beyond approved fiscal
and consolidated cutoffs. Catch-up recognition also needs its preceding accounting
date open. Existing prospective cycle amendments remain available for untouched
future cycles; their repricing also honors replacement billing anchors.

Price concessions, usage changes, multi-obligation reallocations, variable
consideration, tax-bearing subscriptions, free full-cycle plans, changes to service
frequency and arbitrary retrospective modifications require their separately
accepted policies. The operating contract assumes the remaining daily service is
distinct and the approved replacement price is appropriate. Finance must approve
that assessment; code validation does not certify every revenue-recognition policy.

## Qualification

Database scenarios cover paid-invoice upgrades, discounted seats and downgrades,
chained cancellation, original month-end anchors, renewals, same-date corrections,
failed-child rollback, stale proposals, tenant isolation, private-executor denial,
exact pricing and future anchored repricing. The real Auth/API/browser scenario
submits changes and renewals, retries lost responses and concurrent approvals,
applies the customer credit, corrects cancellation and checks failed-read recovery.
Populated recovery validates parent/child source graphs and compares all subscription,
contract and customer-credit reports, including retrying the approved parent.

Provider reference: Stripe's [proration documentation](https://docs.stripe.com/billing/subscriptions/prorations)
(consulted 2026-09-10) distinguishes prepaid fixed-charge proration, usage billing,
discounts, unpaid invoice behavior and original debit references. This implementation
uses its declared daily accounting policy and owned source invoices; actual provider
behavior must be reconciled during provider qualification. Production deployment,
real contracts/provider acceptance and representative-volume testing remain release
gates in PRODUCTION_READINESS.md.
