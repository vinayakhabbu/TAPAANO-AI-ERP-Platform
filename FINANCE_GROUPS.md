# Intercompany and consolidation operations

## Bilateral books

Intercompany Accounting posts service or funding between two distinct tenant
entities sharing a functional currency. A service records due-from/revenue in the
originating entity and expense/due-to in the counterparty. Funding records the
originator's due-from/cash and the counterparty's cash/due-to. A different operator
approves the entire bilateral transaction. Either closed period or a failed source
check rolls back both sides. A generic journal reversal cannot reverse one side.

Dedicated due-from/due-to accounts cannot reuse configured cash, AR/AP, contract,
provider or schedule control accounts. Funding and settlement require registered
cash accounts. Settlements support exact partial amounts and check capacity on
every affected accounting date, including reservations by later settlements.
Corrections preserve both original bank journals and their exact offsets. Correct
all settlements before reversing the original transaction. The report compares
full dated intercompany control balances to both source books; close requires zero
variances. Amounts and dates never imply that the application sent money.

Reports explicitly reject histories above 2,000 source transfers rather than
truncate control evidence. Larger histories need qualified reporting capacity.
Transaction-currency conversion, monetary remeasurement and realized settlement FX
are separate from translating functional-currency subsidiaries in consolidation.

## Approved reporting perimeter

A reporting group contains its parent and up to 24 other wholly owned entities
from the same tenant. Its reporting currency is the parent's functional currency
at definition. Two administrators approve the immutable definition, membership
start and reserved equity translation account. Create another approved definition
for membership changes; old reports retain their original perimeter. Finance must
confirm ownership for the whole requested interval and identify which legal
entities belong in each statutory or management reporting group.

The application does not infer control, acquisition values, noncontrolling
interests, purchase-price allocation, equity-method accounting, hyperinflation or
hedges. Required investment/equity, acquisition and other adjustments need reviewed
source evidence and accepted accounting policies. A selected reporting group is
not automatically a determination of the legally required consolidation perimeter.

## Translation policy

Each foreign functional currency requires explicit reporting-currency units per
one functional-currency unit. The UI derives the exact dated quotes required by
the books. There is no guessed or silently fetched exchange rate. Quotes are
positive exact decimals, at most eight places, with duplicate/missing/extra quotes
rejected. The supported schedule contains at most 1,500 closing, monthly average
and historical quotes across a report shorter than ten years.

Assets and liabilities use the closing quote. Ordinary income/expense lines use
the approved monthly average, rounded to reporting-currency cents per source line.
Ordinary equity transactions use their dated historical quote. Finance must verify
whether monthly averages reasonably represent the actual transaction-date rates;
volatile currencies or other accounting methods require separate acceptance.

An active fiscal close removes translated operating activity from the closed
income/expense balances and rolls that same translated amount into retained
earnings. It does not retranslate earnings at the year-end spot rate. This also
handles zero functional-currency profit, a closing journal without a retained-
earnings line, or a fiscal close with no journal because local balances were zero.
The difference needed to balance each translated entity is separately identified
as the cumulative translation adjustment in group equity. Source books are unchanged.

These policies are explicit implementation choices requiring finance acceptance.
For primary examples of the distinction between functional-currency translation
and transaction gains/losses, see this
[2025 issuer disclosure filed with the SEC](https://www.sec.gov/Archives/edgar/data/945983/000143774925014103/R11.htm)
and the separate equity translation disclosure in this
[2025 annual filing](https://www.sec.gov/Archives/edgar/data/200406/000020040626000016/R24.htm).
Issuer disclosures illustrate policies; they do not certify this application as
ASC 830 compliant or replace current accounting guidance and customer review.

## Eliminations and final reports

Owned intercompany pairs inside the selected group eliminate dated due-from/due-to
balances and service revenue/expense. The engine follows fiscal earnings into the
appropriate retained-earnings account. Intercompany parties outside the selected
perimeter are explicitly disclosed and remain in its balances. Cash settlements
remain in each entity's bank reconciliation. Rounding of due balances is performed
per currency/control account so component rounding cannot silently create a
residual when an entire matched account is eliminated.

Additional balanced adjustments use the reporting currency and reference one to
100 posted member journals. They remain in a separate group adjustment ledger,
with independent administrator approval and exact reversal history. Registered
cash and the computed translation account cannot be replaced by these entries.
Corrected supporting journals require review of any still-active adjustment before
final consolidation. Prior fiscal adjustments follow the parent's approved
retained-earnings close while period income retains the original dated effect.

A prepared report includes each member's source revision, translated balances,
close checks and translation adjustment. Every account shows translated source
balance, automatic elimination, approved adjustment, translation and final balance.
Both server and browser reconcile exact totals before display/export. The source
perimeter and signed-debit basis are included in CSV; JSON retains detailed evidence.

Finalization requires complete reviewed member periods, reconciled finance sources,
resolved group adjustments and three explicit ownership/rate/elimination
attestations. Approval freezes the submitted report. Changed sources invalidate a
pending decision; concurrent retries return the original result. Active final
reports block all member backdating and group adjustments through their cutoff.
Reopen the latest group report through independent administrator review before
correcting that history. A fiscal reopening must first respect any group cutoff.

Approved snapshots remain available after reopening. Their original figures are
never overwritten. The browser identifies whether current dated source evidence
still matches; an unavailable comparison is explicit. A retained approval snapshot
is not presented as a newly accepted current report. No live deployment is performed
by this code, and production volume, opening balances, FX sources and accounting
acceptance remain governed by PRODUCTION_READINESS.md.

Approved statement presentation and native/group cash-flow classification are
defined in FINANCE_STATEMENTS.md. Activate policies for every member and group.
Final reports retain the approved mapped packet and cash controls; ordinary
chart-based reports remain available for legacy migration comparison.
