# Broader accounting coverage

This increment adds assessed tax, US bank account refunds, revised revenue
estimates and consideration, foreign monetary balances and noncontrolling
interests. All source-changing actions use independent finance approval, retain
source snapshots and exact decimal amounts, and validate the resulting journals.
These are implemented accounting workflows. Production acceptance still follows
FINANCE_DELIVERY_STATUS.md and PRODUCTION_READINESS.md.

## Assessed tax

Use **Tax accounting** to approve dedicated sales-tax liability, recoverable
purchase-tax and nonrecoverable tax expense accounts. Submit net document lines
and a dated external or reviewed assessment for every line, including exemptions.
Multiple jurisdictions and purchase-tax treatments can apply to one line. Each
assessment retains its source, reference, jurisdiction, taxable basis and amount.
The application accepts an assessed result; it does not choose nexus, registration,
taxability, rates, recovery eligibility or filing obligations.

Invoices debit gross receivables and separate net revenue from collected tax.
Bills credit gross payables and separate expense, recoverable tax and expensed
purchase tax. Receipts and payments settle gross balances. Full credits reverse
the original tax lines. Partial customer credits specify net consideration and
allocate the original tax using cumulative rounding; the last credit consumes the
remaining cents. Paid credits become customer liabilities available for confirmed
refunds or applications. Contract billing and supplemental billing retain tax
separately from the transaction price used for revenue recognition. A tax-required
contract cannot be billed without a reviewed assessment.

Confirmed tax payments/refunds and their dated corrections reconcile dedicated
control accounts. The tax register includes native and foreign documents, original
assessments, credits, settlements and ledger variances. Period close rejects a
variance. Tax-inclusive price extraction, tax determination, return preparation
and filing, and partial supplier concessions are separate scopes.

## Refund methods and provider fees

The existing Stripe refund worker now verifies **card or US bank account (ACH)**
against the actual original payment. ACH dispatch requires a successful,
undisputed original charge, a full refund, customer notification evidence and
Stripe's 180-day window. Pending results reserve the credit without posting cash;
a verified balance entry and a separate accounting approval are required to post.
An expired dispatch window cannot trigger a new payment during recovery.

The reviewer sets an expense account and a maximum fee. The worker and database
reconcile original and returned balance amounts, fees, net amounts and source
identities. Posting debits the customer liability and fee expense, and credits
processor clearing. A returned refund reverses that journal and records any
retained fee separately. Credited fees reduce that retained amount. Fee amounts
above the approved ceiling require investigation; the worker does not expand its
payment authority. Recovery retains the original provider key and observation
history; a lost response does not authorize another refund.

ACH still settles asynchronously. This increment does not operate a bank-payment
rail, submit tax payments or enable a live Stripe account. Wire/check/other
confirmed refunds remain available through the existing reviewed cash workflow;
additional automated provider methods require an accepted integration.

## Contract modifications and revenue estimates

The contract workspace supports versioned revisions of billed fixed-contract
cycles. Retain the enforceable consideration, variable-consideration assessment,
distinctness decision, revised allocation and progress evidence. Existing invoices,
obligations, approvals and journals remain available in historical reports.

- **Prospective** treatment preserves recognized consideration and allocates the
  remainder over future distinct service using daily or milestone recognition.
- **Cumulative catch-up** treatment uses revised daily, milestone or percent-complete
  progress. It can increase or decrease recognized revenue with a signed journal.
- One revision can combine the two treatments across existing obligations. A net
  zero reallocation retains its approval without creating a fictitious journal.
- Approved additional consideration can create unbilled revenue. Supplemental
  invoices transfer the previously recognized portion out of unbilled receivables
  and defer the remaining amount, with separately assessed tax when required.
- Subsequent net credits reduce consideration and the correct revenue, deferred
  or unbilled account. An overbilled price reduction requires the invoice credit
  first. A further dated revision corrects an earlier estimate; an isolated manual
  reversal cannot detach an owned revenue journal.

Revisions cannot change a closed period or an active finalized reporting cutoff,
even if their journal amount is zero. Distinct new obligations can use a separate
approved contract. Revisions of usage cycles, acquisitions of contract portfolios,
standalone selling-price estimation and arbitrary legal contract transformations
are not automatically inferred. Subscription lifecycle changes and revised fixed
contracts use their respective controlled workflows.

## Foreign monetary balances

Use **Foreign currency** for an approved foreign receivable/payable subledger with
dedicated functional-currency control accounts. It retains foreign net, tax and
gross amounts, original spot conversion, source evidence and functional carrying
value. It supplies its own aging; ordinary native AR/AP aging continues to show
native invoices and bills. Both feed the general ledger, statements and group
reports through their dedicated accounts.

Approve a sourced functional-units-per-foreign-unit rate for initial posting,
cutoff remeasurement and confirmed settlement. Partial settlement removes the
proportional historical cost and carrying value, reverses allocated unrealized
exchange results, and records the realized result. The final settlement consumes
rounding residuals. Payables use the opposite gain/loss direction. Voids unwind an
unsettled document and its remeasurement; the latest active event can have a dated
linked correction. An open balance must have a reviewed rate at the close cutoff,
including unchanged-rate confirmations that produce no journal.

Foreign tax stays at the approved initial functional conversion; monetary AR/AP
remeasurement does not re-assess tax. If a jurisdiction requires remeasurement or
settlement of the tax liability itself, approve that accounting treatment before
using this policy. Current transaction currencies use two decimal minor units:
USD, EUR, GBP, CAD, AUD, NZD, SGD, HKD and CHF. Zero/three-decimal currencies,
hedge/derivative accounting, foreign-currency bank accounts and hyperinflation
require additional policies and qualification.

## Majority ownership and consolidation

An approved controlled reporting group can retain static **direct majority
ordinary voting ownership**, with proportional economic rights, for its reporting
interval. The reporting parent is 100%; each subsidiary must be more than 50%
through 100%. Percentages retain six decimal places. Parent allocation,
noncontrolling equity and currency translation use separate reserved equity
accounts that never post to the member books.

Consolidation includes 100% of member assets, liabilities, revenue and expense.
The report separately attributes net income, ending equity and translation to the
parent and noncontrolling interests; losses can create negative noncontrolling
equity. Rounding residuals remain with the parent. Reviewed group adjustments
identify the member whose earnings/net assets they affect, with attribution
justification. This supports upstream earnings adjustments without incorrectly
allocating parent-only adjustments to minority owners. Translation continues to
retain closing, period-average and historical rate evidence. Approved report
snapshots and CSV/JSON exports preserve the ownership attribution.

The preparer must supply acquisition/investment eliminations and other necessary
valuation adjustments. This does not automatically determine control or perform
purchase-price allocation. VIEs, indirect/cross ownership, preference rights,
mid-period ownership changes, loss of control and an automated comprehensive NCI
rollforward remain distinct scopes. Do not use a new static percentage to rewrite
an earlier approved interval.

## Qualification and volume limits

The CI regression job uses isolated PostgreSQL 17 databases for the complete finance
fixture: its nested approval workflows exceed the embedded WebAssembly engine's
reliable execution in this suite. The same assertions run against the production
database engine; no accounting cases are skipped. Other unit fixtures continue
to use PGlite. Set TAPAANO_TEST_DATABASE_URL to the dedicated local test service
to reproduce the finance regression job.

For a disposable local run (Docker required):

```sh
docker run --rm -d --name tapaano-finance-tests \
  -e POSTGRES_DB=tapaano_regression_fixture \
  -e POSTGRES_PASSWORD=synthetic_regression_password \
  -p 127.0.0.1:55432:5432 postgres:17
docker exec tapaano-finance-tests pg_isready -U postgres -d tapaano_regression_fixture
TAPAANO_TEST_DATABASE_URL=postgres://postgres:synthetic_regression_password@127.0.0.1:55432/tapaano_regression_fixture \
  node --test --test-concurrency=4 --test-timeout=180000 tests/*.test.mjs
docker stop tapaano-finance-tests
```

Wait for the readiness check to succeed before running the tests. The helper
requires this named empty local bootstrap database and deletes only the unique
fixture databases it creates. These credentials are synthetic test configuration.

The test suite covers native SQL graph integrity, exact rounding, approval retry,
source changes, tenant denial, worker payment eligibility, fee returns, browser
submission, unavailable reports, and retained source recovery. The managed-stack
suite combines assessed contract amendments, taxed foreign AR/AP and a finalized
foreign majority-owned group, then restores the populated database and replays
approval/provider retries. CI runs both full migration replays, database lint,
authenticated API/browser/worker acceptance, builds and security checks. Retain the
completed PR's exact commit, workflow runs and recovery artifact as release evidence.

Bounded reports fail explicitly instead of silently truncating: tax registers have
2,000 native documents and 2,000 settlements; foreign reports have 2,000 documents
and 2,000 events per document; revised cycles allow 200 revisions; reporting groups
allow 25 members. Customer-volume acceptance and indexed performance measurement
remain release requirements, not consequences of synthetic examples.

## Accounting and provider references

Implementation policy was checked against primary sources on 2026-09-12:

- [FASB revenue update, ASC 606](https://storage.fasb.org/ASU%202014-09_Section%20A.pdf),
  contract modifications in 25-10–13, variable consideration in 32, and Example 8.
- [FASB foreign currency statement](https://storage.fasb.org/fas52.pdf), the
  transaction/translation distinction underlying ASC 830.
- [FASB noncontrolling interests statement](https://storage.fasb.org/fas160.pdf),
  full consolidation, separate ownership attribution and losses, now codified in
  ASC 810; [subsequent scope clarification](https://storage.fasb.org/ASU2010-02.pdf).
- [Stripe ACH Direct Debit](https://docs.stripe.com/payments/ach-direct-debit),
  refund eligibility, timing and dispute interaction.
- [Stripe balance transactions](https://docs.stripe.com/api/balance_transactions/object),
  original/return amount, fee and net evidence.

These sources inform the implemented policies; the application does not certify
an individual customer's US GAAP conclusions, tax compliance or controls.
