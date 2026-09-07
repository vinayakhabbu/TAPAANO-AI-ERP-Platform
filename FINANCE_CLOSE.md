# Schedules and reviewed financial close

Finance Schedules links existing posted asset debits to approved prepaid or fixed
asset policies. Registration never posts a second acquisition. Cost, in-service
date, useful life, residual value and accounts are immutable approved terms. Book
expense is cumulative cost less residual value allocated over actual service days,
rounded once to cents. Partial-month and leap-year dates follow the same policy.
Finance must accept the policy; this does not calculate tax depreciation.

Run a schedule through an accounting date and submit the supporting evidence. An
independent approver posts only the remaining earned expense. Fixed assets credit
their separate accumulated depreciation account; prepaids credit the acquisition
asset. Complete schedule control balances are compared with the complete dated GL.
Unregistered or manually adjusted balances appear as variances, requiring review.

Recurring templates support anchored monthly, quarterly and annual dates. Accruals
post once and reverse on their specified later date. Runs process only due dates;
they require approval and are not unattended background jobs. A run is limited to
120 occurrences, with at most 600 dates over a policy shorter than fifty years.
Run earlier cutoffs when more occurrences are due. Source changes invalidate
pending approvals. Concurrent approval retries return the same completed result.

Corrections preserve the original and offset the latest eligible expense or
recurrence. A subsequent asset run recalculates remaining earned expense. Corrected
recurring occurrences stay corrected; submit a new template for revised terms.
Outstanding accruals use their programmed reversal. Unused asset registrations may
be cancelled, leaving the original purchase for separate correction or reassignment.
Future recurrences may be cancelled only after resolving overdue occurrences.

Disposal first records earned depreciation, then removes cost and accumulated
depreciation and records proceeds and gain/loss. An erroneous disposal can be
restored by independently reversing it on its original open accounting date. Earned
depreciation remains; the disposal and offset remain in history. A fully expensed
prepaid with no remaining financial effect does not need a zero-value disposal
journal. Impairment, component assets, revaluation, retroactive life changes and tax
depreciation require separate accepted policies and workflows.

Financial Close checks dated ledger validity, AR/AP comparisons, bank approvals,
asset and revenue controls, due schedules, completed usage, unrecognized earned
revenue, provider exceptions and pending finance decisions. It cannot discover
unrecorded contracts, banks or liabilities by itself. Five explicit completeness
attestations are submitted with the report snapshot for independent review.

Reviewed period transitions retain version and approval evidence. Entities with
required journal approval, or any history of reviewed close, cannot bypass these
reviews through the older direct period transition API. Open periods can be soft
closed, then reopened or permanently hard closed. Hard close is irreversible.

Two administrators approve fiscal closing for an annual or initial short period
that exactly covers configured accounting periods. Prior earnings must already be
closed. The final period must be open for the closing journal. The transaction
transfers all recorded income/expense balances to retained earnings and soft-closes
open periods in the year. Raw trial balances retain these journal entries; income
statements exclude only the explicitly identified fiscal closing transfers and
their reversals, preserving the year's reported profit.

An active fiscal close prevents all backdating through its cutoff, even if an
individual period is subsequently reopened. Reopen the latest fiscal close through
independent administrator approval before adjusting it. Reopening reverses the
closing transfer on its original date; hard-closed years cannot be reopened.
The subsequent close recomputes earnings from the corrected ledger.

General manual-journal reversals also have an approval form. Proposals show the
source journal's exact lines; fiscal, schedule, contract and provider journals
require their owned correction workflow. Changed source evidence prevents approval
of an outdated proposal. Existing pending reversal requests from before this
evidence enhancement need withdrawal and resubmission.

Database graph validation checks approved terms, exact postings and all offsets.
The browser/integration fixture covers four schedule types, bank reconciliation,
concurrent approval, fiscal earnings, tenant denial, unavailable reports and
restored source graphs. Synthetic qualification does not establish customer useful
lives, opening balances, tax provisions, completeness or production-scale latency.
Statement mapping, cash-flow classification and group accounting remain subsequent
increments; these close controls alone are not a production acceptance decision.
