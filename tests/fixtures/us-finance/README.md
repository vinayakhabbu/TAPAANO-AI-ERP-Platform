# Synthetic US finance acceptance pack

Created 2026-09-07 at the owner's request to proceed without customer documents.
Every party, identifier, contract, event and statement here is invented. These
are implementation fixtures, not signed agreements, bank exports, production
seeds, evidence of customer approval, or a universal accounting policy.

## Working defaults

- US software/services seller, USD functional and transaction currency, calendar
  fiscal year, accrual accounting. Accounting dates use America/New_York; ingestion
  retains UTC timestamps and source timezone. Statement dates are posted dates.
- Amounts are decimal strings. USD ledger amounts have two decimals; usage rates
  retain four decimals. Aggregate usage before rounding the invoice amount.
- Each example assumes an approved enforceable arrangement, probable collection,
  no financing component requiring adjustment, no refunds/options/discounts other
  than the explicit bundle allocation, and no contract modification.
- Zero tax is a test isolation assumption, not a conclusion about taxability or
  US nexus. Real tax configuration and accounting-policy acceptance remain gates.
- Invoice, cash receipt, service delivery, revenue and bank settlement are separate
  events. Never use one event's date as a substitute for another's evidence.
- Draft proposals require an authorized human before any financial side effect.
  Separate preparer/reviewer identities are a future acceptance requirement;
  these files do not add that enforcement to the current application.

## Synthetic order forms

Seller for all forms: **SYNTH Example Software LLC**. Contact domains, if needed,
must end in `.example`; there are no account numbers, routing numbers or secrets.

| ID / buyer | Commercial terms | Performance and test accounting assumptions |
| --- | --- | --- |
| ANNUAL-01 / SYNTH Atlas Analytics | Non-cancellable access, Jan 1–Dec 31 2027; USD 36,500 prepaid invoice Jan 1, due Jan 31; receipts Jan 5 USD 15,000 and Jan 20 USD 21,500 | One stand-ready obligation delivered evenly each day; 365 service days at USD 100. January revenue USD 3,100; remaining deferred balance USD 33,400. Billing credits deferred revenue, not immediate sales. First receipt leaves AR USD 21,500. |
| MONTHLY-01 / SYNTH Beacon AI | One January service period, USD 1,200 invoiced Jan 1, due Jan 31; collected through processor Jan 10 | One monthly stand-ready obligation, fully delivered by Jan 31. Recognize USD 1,200 over January. Invoice timing alone does not trigger recognition. Renewals require a new explicit service period. |
| USAGE-01 / SYNTH Cedar Data | Jan 1–31 API usage; USD 0.0025 per accepted request, no included allowance or tiers; 600,000 valid requests; invoice Feb 1 USD 1,500, due Mar 3 | Distinct usage transfers as consumed. Fixture assumes the variable consideration relates specifically to that usage and is eligible for allocation to it. At Jan 31 recognize USD 1,500 to unbilled receivable, reclassify to billed AR Feb 1; do not recognize twice. |
| BUNDLE-01 / SYNTH Delta Services | Jan 1–Mar 31 access plus a separately usable training package; total USD 12,000 invoice Jan 1 due Jan 31; access SSP USD 12,000 and training SSP USD 3,000 | Training is assumed distinct and provides no essential customization. Allocate USD 9,600 to access and USD 2,400 to training using relative SSP. Access transfers evenly over 90 days; training completed/accepted Jan 20. January access revenue USD 3,306.67 and training revenue USD 2,400. A milestone alone is not proof of transfer. |

The bundle uses cumulative rounding: round total allocated consideration earned
through each boundary, then subtract the previous cumulative amount. January,
February and March access revenue is 3,306.67 / 2,986.66 / 3,306.67. This is a
documented fixture policy; equal-month recognition is not silently substituted.

`contracts.json` carries machine-readable terms, usage evidence and expected
schedules. `bank-statement.json` is a provider-neutral normalized statement, not
an assertion of compatibility with a particular bank's CSV or OFX dialect.
`expected-results.json` records independently reviewable balances and journal
examples. Tests validate this pack's arithmetic and relationships; they do not
prove that future application workflows have been implemented.

## Bank statement and reconciliation

SYNTH Operating Bank / account alias `SYNTH-OPERATING-USD`, January 2027:

| Posted date | Source ID | Description | Signed USD | Running balance |
| --- | --- | --- | ---: | ---: |
| Opening | — | Opening statement balance | — | 50,000.00 |
| Jan 5 | BANK-001 | ANNUAL-01 first receipt | 15,000.00 | 65,000.00 |
| Jan 11 | BANK-002 | PROCESSOR-001 net payout | 1,470.00 | 66,470.00 |
| Jan 15 | BANK-003 | Payment of opening supplier payable | -4,000.00 | 62,470.00 |
| Jan 20 | BANK-004 | ANNUAL-01 final receipt | 21,500.00 | 83,970.00 |
| Jan 25 | BANK-005 | Unidentified incoming transfer | 750.00 | 84,720.00 |
| Jan 31 | BANK-006 | Bank fee, absent from initial books | -25.00 | 84,695.00 |
| Jan 31 | BANK-007 | Interest, absent from initial books | 5.00 | 84,700.00 |

PROCESSOR-001 comprises MONTHLY-01 gross 1,200 and a separate opening AR item
gross 300, with synthetic fees 24 and 6 respectively. Net 1,470 settles to the
bank. These fees are invented test amounts, not Stripe pricing. Processor clearing
is a separate account; a net deposit does not reduce AR by the gross amount
without the underlying collection and fee evidence.

Books also contain a Jan 30 check for 1,200 that clears Feb 2 and a Jan 31 deposit
of 2,000 that clears Feb 1. Initial book cash is 84,770. Statement cash adjusted
for those timing differences is 85,500. Approved fee and interest entries bring
book cash to 84,750, leaving the unidentified 750 difference unresolved.
If separately approved, a Dr cash / Cr unidentified-receipts liability entry for
750 brings book cash to 85,500. Numerical agreement does not resolve ownership;
the exception remains open until supported identification and allocation.

## Required future application acceptance

1. Partial receipts allocate 15,000 then 21,500 against ANNUAL-01 exactly once;
   competing allocations cannot exceed the remaining balance. Reject excess or
   negative allocation amounts; preserve refund/correction lineage separately.
2. Reimporting the same `(tenant, bank account, source transaction ID)` with the
   same payload is a no-op. A changed payload under that ID is a conflict, not an
   overwrite. Equal amounts/descriptions under different IDs are not duplicates.
3. Wrong tenant/entity/currency, malformed amounts, incomplete statement totals,
   overlapping statements, ambiguous matches and out-of-period rows enter explicit
   validation/exception flows. Dates alone never justify automatic matching.
4. Usage event IDs are unique per source and tenant. Duplicate delivery cannot
   increase the invoice. Late data and corrections create explicit revisions or
   adjustments; they do not silently rewrite a finalized invoice or closed period.
5. Invoice generation and recognition retries each produce one durable result.
   Schedules reconcile to allocated consideration. Recognition in a closed period
   is rejected; an authorized adjustment follows the established period policy.
6. Contract amendments, cancellation credits, non-distinct onboarding, material
   rights, financing, multi-currency, taxes and disputes require separate policies
   and fixtures before support. AI may propose; it cannot infer approval evidence.

## Source basis and limits

Reviewed 2026-09-07. Source concepts inform the fixture design; commercial terms,
amounts, rounding conventions and expected entries above are our explicit test
assumptions, not quotations or vendor-certified examples.

- [FASB revenue recognition](https://fasb.org/page/PageContent?bcpath=tfft&pageId=%2Fstandards%2Fimplementing%2Frevrec%2Ffasb-iasb-resource-group%2Frevenue-recognition-bridge-page.html)
  and [Topic 606 foundation](https://storage.fasb.org/ASU%202014-09_Section%20A.pdf):
  identify promises, determine and allocate consideration, and recognize on
  satisfaction. The original ASU is a foundation, not the complete amended
  Codification; customer accounting acceptance must use applicable current guidance.
- [Stripe Billing](https://docs.stripe.com/billing): recurring and usage pricing
  are separate billing models supported by provider-specific integrations.
- [Stripe usage guidance](https://docs.stripe.com/billing/subscriptions/usage-based):
  current docs distinguish Metronome for new usage integrations from existing
  Billing Meters implementations. Keep this fixture provider-neutral; select and
  verify the actual adapter/API version during integration implementation.
- [Stripe payout reconciliation](https://docs.stripe.com/reports/payout-reconciliation):
  reconcile automatic payouts to their underlying transactions and fees; manual
  and instant payout reporting requires different treatment.

No real customer documents are required to continue development against this
pack. Representative customer data, policies, provider sandbox access and operational
acceptance are still needed before a production release.
