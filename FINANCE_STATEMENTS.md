# Approved financial statements and cash flow

This workflow adds reviewed presentation to the posted ledger and group reports.
It supplies a balance sheet, income statement and direct-method cash flow with
source evidence. Finance must accept the accounting policies and required notes;
these reports do not certify a complete GAAP disclosure package.

## Presentation and approval

Use **Financial Statements** to select an entity, dates and either its native
presentation or one of its reporting groups. Two different administrators approve
each statement policy. Policies are immutable numbered versions. Requests retain
the prior version, account metadata and bank perimeter; changed sources invalidate
a pending approval. Every cash classification also requires an independent review.

Map every account appearing in the dated ledger, including retired and zero-net
accounts with historical activity. Choose receivables, other current/noncurrent
assets, current/noncurrent liabilities, contributed capital, retained earnings,
other equity, revenue, cost of revenue, operating expenses, other income/expense
and income tax. The section must match the account type. Unmapped accounts remain
visible and prevent completion. Account names do not determine presentation.

Cash accounts must exactly equal the registered bank/cash perimeter, including
configured receipt and payment accounts. Cash, current restricted cash and
noncurrent restricted cash have distinct balance-sheet sections and together
reconcile to cash-flow totals. The restricted-cash treatment follows the
presentation principle described in [FASB ASU 2016-18](https://storage.fasb.org/ASU%202016-18.pdf):
include restricted amounts in the cash-flow reconciliation and identify the
balance-sheet lines contributing to that total. Finance supplies the nature of
restrictions and accepts which instruments qualify as cash or cash equivalents.

A policy change restates the current presentation of queried history. Prior
versions and approval evidence remain available; approved consolidated reports
retain their original statement packet. A new bank account requires a new policy.
Statement sections use exact debit/credit signs, keep recorded equity separate
from cumulative unclosed earnings, and exclude only owned fiscal closing transfers
from period income. The balance sheet still includes those transfers.

## Source cash classifications

Each posted cash line receives one to fourteen positive allocation magnitudes
whose sum must equal the entire line. Receipt/payment direction comes from the
ledger. The UI supports mixed payments, including an operating expense and an
asset purchase in one cash line. It submits up to twenty selected lines per page;
the API accepts up to two hundred per independently reviewed request. Search the
journal reference/date to bring transfer partners into the same review.

Operating categories include customer receipts/refunds, supplier and employee
payments, interest, income taxes and other operating cash. Investing categories
include capital expenditure, asset disposals, investments/loans and other investing
cash. Financing categories include borrowings, equity, dividends and other
financing cash. The US-first policy keeps interest paid/received in operating
cash; finance must review transaction-specific exceptions and disclosures.

Internal cash transfers and clearing offsets have a separate control category.
They must share an accounting date and sum to zero within a request. Reclassifying
an existing transfer requires every active partner from its previous approval.
They do not enter operating, investing or financing totals. Source corrections
remain original and dated offset journal lines; each line retains its own reviewed
classification history. No classification writes or changes a journal.

Reports show gross receipts, gross payments, net amounts and every unclassified
source. A zero net unclassified balance still blocks completion if lines remain
unclassified. Exact controls require:

- Native opening cash + classified movement + unclassified movement = closing cash.
- Cash balances agree with the mapped balance sheet.
- The current registered cash perimeter agrees with the approved policy.
- Internal transfers offset and every classification has an approved source graph.

## Group cash flow and final reports

Each member uses its own approved native policy and cash classifications. The group
requires its own statement policy. Owned bilateral funding, settlement and correction
cash entries cancel only when both entities belong to the reporting perimeter.
Native member classifications are still required, including eliminated transfers.

Opening and closing balances translate per cash account at their explicit closing
rates. Actual cash movements use the approved monthly average rates already listed
by consolidation preparation. Category receipts/payments aggregate per member and
month before translation. The difference between line and category rounding appears
as a separate rounding amount. Exchange effects derive from opening/closing cash
and all translated source movement, including unclassified cash; an unknown source
cannot become an exchange-rate adjustment.

Group opening cash + classified cash + unclassified cash + translation rounding +
exchange effect must equal closing cash. Member revisions, allocation identities,
translation rates, eliminations and exact cash controls are retained in the
consolidation snapshot. Final group cutoffs prevent historical reclassification;
independently reopen the latest group report first.

Existing entities without a statement policy retain the preceding close behavior
for migration compatibility. Once an entity policy exists, its statement and cash
controls become mandatory close checks. Once any member/group presentation policy
exists, final consolidation requires policies for every member and the group, plus
complete mapped statements and cash flow. **Production onboarding requires policy
activation for every entity and reporting group.** Unconfigured legacy reports are
not evidence of completed production acceptance.

## Verification and supported capacity

Database regressions exercise mixed allocations, paired/reclassified transfers,
stale proposals, tenant/write denial, incomplete mappings, fiscal transfers,
restricted-cash presentation, internal group funding, foreign translation, explicit
rounding and consolidated cutoffs. They execute the actual frontend report parsers
against database results. Browser acceptance covers policy setup, mixed cash splits,
lost responses, concurrent approvals, exact exports, read failure/retry and archived
group statements. Populated restore validates policies and classification graphs
in addition to bank, contract, provider, close and consolidation sources.

Policies support up to 2,000 chart accounts and 500 distinct cash accounts. Native
cash reports support 20,000 dated cash lines; larger intervals fail explicitly.
Representative customer volume requires qualification before raising these limits.
Cash classification is a reviewed reporting process, not an automated guess from
memo text. Noncash investing/financing disclosures, operating-income reconciliation,
policy notes, comparative presentation and statutory filing formats require finance
acceptance and any customer-specific reporting extensions. No live bank/provider
connection, managed deployment or accounting acceptance is established by CI.
