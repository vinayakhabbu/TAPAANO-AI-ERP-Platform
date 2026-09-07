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
