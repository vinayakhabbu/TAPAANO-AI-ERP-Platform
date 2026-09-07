# TAPAANO: completion and production release plan

## Release definition

A complete ERP is the agreed set of business processes operating together, with
reconciled accounting, tenant isolation, recoverable data, and supported operations.
Repository CI is evidence for implementation; it is not evidence of production-data
correctness, statutory compliance, bank execution, or an operational service.

The owner confirmed the **United States** as the first release market and
**Rillet's customer market** as TAPAANO's target on 2026-09-06. Use
[TARGET_CUSTOMER.md](./TARGET_CUSTOMER.md) for the researched customer definition,
required outcomes, and explicit distinction between confirmed scope and delivery
priorities. The initial focus is growing US SaaS, AI, digital-product and services
finance teams; the broader enterprise and public-company market remains in scope.

The existing recovery and PR #22 form the accounting foundation. PR #22 was merged
to `main` at `bcc0658ac87bf90384c8f90e5b390379b7b3450b`. It passed 171 regressions,
real Auth/API/browser integration, two complete migration replays, release builds,
CodeQL, and npm audit. Dependency review remains blocked by the repository's
disabled Dependency graph feature. Branch protections still need owner activation.

PR #23 added the entity-scoped trial balance and exact CSV export, merged to
`main` at `578dc5e64e6358f5572b213b4bb11c94483f4184`. Its code passed 177 regressions,
eight real Auth/API/browser integration scenarios, deterministic replay of all
68 migrations, typecheck, lint, both builds, CodeQL and dependency audit. This
completes the first reporting code boundary, not the production release.

## Synthetic development baseline

The owner authorized industry-informed synthetic contracts and statements on
2026-09-07. Use [the US finance reference pack](./tests/fixtures/us-finance/README.md)
for subscription, usage, bundle allocation, partial receipt and bank reconciliation
implementation. Its machine-readable scenarios include exact expected schedules,
entries and exception balances. Real documents are no longer a prerequisite to
continue development. These fixtures do not implement the remaining workflows or
replace customer-specific accounting and production acceptance.

## Remaining implementation and onboarding inputs

Country and target customer are now confirmed. The following customer-specific
inputs still need validation before their affected workflows can be accepted.
They do not block implementation of the shared US finance foundation. Do not
invent tax, payroll, valuation, or statutory rules to fill these gaps.

| Decision | Why it changes implementation |
| --- | --- |
| Legal entities, US states, registrations and tax-provider configuration | Customer-specific tax, invoice and reporting requirements; no single nationwide sales-tax assumption |
| US GAAP policies, fiscal calendars, opening balances and chart mappings | Financial statements, retained earnings, close, consolidation and reconciliation |
| Contract terms, performance obligations, usage sources and revenue policies | Billing, amendments, credits, deferred revenue and independently accepted recognition schedules |
| Entity currencies, FX policies and precision | Current posting amounts use two decimal places; same-currency posting is not FX support |
| Users, segregation of duties, transaction volume, retention and latency targets | Approval design, access controls, performance testing, audit storage |
| Bank, payroll, tax and external system providers | Integration contracts, credentials, reconciliation, failure recovery |
| Hosting, staging project, sanitized data, and release owners | Migration/restore rehearsals, operational monitoring, finance and security acceptance |

## Delivery sequence

Each phase needs one complete workflow from browser to database, negative and
concurrent API tests, reconciliation evidence, a reviewed migration, and updated
operator documentation. A menu entry or database table is not module completion.

| Phase | Deliverable | Completion evidence / dependencies |
| --- | --- | --- |
| 1. Ledger reporting foundation — code merged | Entity/currency-scoped trial balance, opening/activity/closing balances, exact decimal CSV, explicit unavailable states | Actual posted AR/AP and offset journals reconcile; tenant/date boundaries, retired accounts, large histories and invalid lineage are tested in PR #23 |
| 2. Close-ready core finance | Complete account-ledger drilldown; approved statement mappings and income statement/balance sheet/cash-flow reports; setup, opening balances, period controls, recurring journals, accruals, prepaids and fixed assets | Reports and schedules reconcile to the GL; finance approves cutoff and retained-earnings treatment; closed-period and concurrent-posting tests pass |
| 3. Subledgers and cash reconciliation | Partial allocations/receipts/payments, credits/refunds, AR/AP aging, statement import, duplicate detection, matching and reconciliation | Idempotent atomic posting, over-allocation prevention, concurrent settlement tests, bank/subledger/GL reconciliation and explicit unresolved exceptions |
| 4. Contract billing and revenue | Approved contracts, subscription/usage/milestone billing, amendments, deferred revenue, recognition schedules and traceable recurring-revenue metrics | Documented revenue policies, independently checked examples, source usage completeness, exact schedule totals, contract-to-invoice-to-journal reconciliation |
| 5. Connected finance operations | Billing/processor and CRM ingestion; spend, AP approvals and purchase commitments; payroll, tax and banking provider integrations | Verified provider contracts and callbacks, source ownership, idempotent retries, replay, sync visibility, control totals and accepted jurisdiction-specific behavior |
| 6. Group and enterprise accounting | Intercompany workflows, consolidation, supported FX, fine-grained permissions, SSO and provisioning | Agreed elimination/translation policies, separate entity and consolidated reconciliation, access lifecycle tests and representative scale evidence |
| 7. Governed AI assistance | Coding, matching, contract extraction and close proposals with tenant-scoped retrieval and human approval before side effects | Grounded outputs, prompt-injection tests, access checks, durable decision evidence, budget controls and deterministic posting validation |
| 8. Production acceptance | Data migration, restore, security/load tests, monitoring, incident response, UAT and release | Named owners and immutable evidence for every applicable gate in PRODUCTION_READINESS.md; each customer uses only its accepted workflows |

Integration architecture and operations work start alongside core finance.
Required tax, payroll, currency and provider support must be accepted before
onboarding customers that depend on it. Warehouse fulfilment, inventory valuation,
manufacturing/MRP and native payroll/tax engines are later customer-driven additions;
they are not prerequisites for this initial finance delivery sequence. Their
existing containment remains necessary until each is implemented and verified.

Phase ordering does not certify an earlier phase for enterprise or public-company
use. Customer acceptance depends on all required workflows, controls and operating
evidence, including later phases when applicable.

## Phase 1 implementation contract

`get_entity_trial_balance(entity, from, through)` uses invoker rights and derives
the tenant from authenticated membership. It reads one statement snapshot and one
entity's functional currency. Opening balances include posted journals before the
start date, activity includes both endpoints, and closing balances include posted
journals through the end date. Retired accounts with history remain in the report.
Drafts are excluded and counted. Originals and their later offset journals are
included according to their individual dates.

The report fails if included journals lack valid event/period links, contain
unbalanced or invalid lines, or use the ambiguous legacy `reversed` status.
It does not silently drop such records. Amounts remain decimal strings through
PostgreSQL, the API, the client reconciliation check, and CSV. The browser clears
results when scope changes or a refresh fails. CSV text fields are escaped against
spreadsheet formula interpretation.

This is a trial balance of recorded journals. It does not reconcile unposted legacy
documents, invent opening balances, close income/expense accounts, prove bank
settlement, consolidate entities, or constitute statutory financial statements.
All production-data and finance acceptance gates remain applicable.

## Core finance implementation increment

PR #25, merged at `53abd35666c52abab9ec302549a836fc3c749ddb`, adds complete account-activity paging and
exact running balances, income and balance-sheet views, controlled manual journal
entry, and browser period creation/transitions/history. Recent journal summaries
now use server-calculated decimal strings and explicit entity currencies. An
account-ledger export stops when the report revision changes; exports over 50,000
lines require narrower dates while interactive paging remains available.

Statement views use the immutable account classifications already in the chart.
They do not infer current/noncurrent categories, fiscal closing entries, cash-flow
classification, disclosures or statutory presentation. Balance-sheet equity shows
recorded equity and cumulative unclosed revenue/expense balances separately.
Period locks remain distinct from completing the reconciliation and approval work
of a financial close. These remaining Phase 2 requirements are still open.

The next implemented increment provides date-scoped AR/AP aging and ledger
comparison for supported invoices/bills, credits, receipts/payments, corrections
and replacements. It includes revision-protected paging, complete CSV export and
browser posting-account setup. The report derives balances from immutable dated
source postings; document headers are not treated as current outstanding balances.
Manual entries to a control account appear as explicit reconciliation variances.

Customer/vendor credits on account, refunds, collections,
bank statement import/matching/reconciliation and approval workflows remain open.
Contract revenue, provider integrations and group consolidation remain subsequent
milestones; no recurring billing or revenue-recognition schedule is implied by
this reporting increment.

## Partial settlement implementation increment

The amount-entry RPCs `post_customer_receipt_amount` and
`post_supplier_payment_amount` allocate a positive two-decimal amount to one
verified invoice or bill in its functional currency. Multiple immutable receipt
or payment records may reference the same document. Existing full-settlement RPCs
retain their original contract and reject documents that already have settlements.
They do not infer a remaining amount. Existing unique tenant/reference, retry key,
event and journal identities remain enforced.

A shared private invariant checks cumulative settlements at every accounting date,
including corrections and replacements. A new allocation cannot over-settle a
historical day or consume capacity reserved by a later posting. Posting is atomic
with its balanced journal and serialized against competing settlement and close
requests. Exact amount strings and normalized numeric hashes keep retries stable.

Use **Record receipt/payment** on an aging row. Its displayed outstanding amount
is scoped to the selected report date, not a promise of current capacity. After
an uncertain response, retry the same immutable request. Check source history
before editing a rejected request. Every receipt/payment has its own history and
existing correction/replacement controls. The legacy `fullReceiptCount` summary
field is retained for API compatibility; it counts all original receipt records,
and the browser labels it **Receipts recorded**.

Each original allocation may be corrected once for its exact amount and replaced
once for that same amount, subject to available dated capacity. Full document
credits remain blocked after any receipt/payment record, including corrected
records. Partial credits, refunds, unapplied cash, multi-document remittances,
repeat replacement chains and bank execution/reconciliation remain unavailable.

The synthetic 36,500 amount split into 15,000 and 21,500 is an allocation acceptance
case against an ordinary posted receivable/payable. It does not post or validate
the annual contract's deferred-revenue accounting. Contract billing and revenue
recognition remain separate milestones. Existing table-level posting locks are a
correctness boundary; representative multi-tenant throughput still needs acceptance.

## Production acceptance is the delivery target

The owner reaffirmed production grade as the goal on 2026-09-07. Completion means
the agreed US finance workflows are usable together and every applicable release
gate has evidence. Feature PRs, synthetic fixtures and passing CI are intermediate
results. Bank reconciliation, contract billing/revenue, the required integrations,
permissions/approvals, and customer-specific accounting acceptance remain on the
completion plan alongside operational readiness.

The next operations increment adds populated backup/restore qualification to CI:
rebuild the database, restore synthetic financial and Auth data, compare row and
security metadata fingerprints, verify foreign keys/source graphs and exercise
login, isolation, posting retries and financial reports after recovery. See
[Production readiness](./PRODUCTION_READINESS.md#populated-recovery-qualification)
for the tested boundary and the managed-service evidence still required. CI retains
only a sanitized evidence report, never raw database backups.

## Immediate owner and deployment work

1. Enable Dependency graph in repository security analysis settings and re-run
   dependency review; import and activate `.github/rulesets/main.json`.
2. Select representative US finance acceptance fixtures and a first pilot cohort
   within the confirmed customer scope; record its entity, contract, accounting,
   state, provider, access and volume requirements.
3. Provide an isolated staging project and sanitized representative data through
   the deployment workflow; keep credentials out of source and browser variables.
4. Rehearse the full migration manifest, reconcile opening and subledger balances,
   and prove restore before considering a production release.

## Bank statement reconciliation increment

The next verified workflow adds bank CSV import, duplicate/control-total checks,
explicit cash-ledger matching, dated timing items, and independent close/reopen/void
reviews. It preserves frozen legacy bank history. See [Finance workflows](FINANCE_WORKFLOWS.md)
for its cutover assumptions, data limits and provider boundaries. Contract billing,
revenue recognition, general approvals/integrations and consolidation continue in
the remaining delivery sequence; this increment does not complete that scope.

## Contract billing and finance approval increment

Bank import and independent reconciliation are merged in PR #30. The next increment
adds approved fixed/usage contracts, recurring billing cycles, revenue schedules,
unbilled/deferred accounting, prospective amendments, full unpaid contract credits
and enforceable journal/payment approval policies. See FINANCE_WORKFLOWS.md for the
implemented accounting policies, source controls and explicit modification limits.
Provider integration and group/consolidation delivery continue next; managed staging
and finance/security acceptance are still required for a production release.

## Connected finance increment

PR #31 merged contract billing, usage revenue and finance approvals at
`23cb835406afe3e8fe405e766b3b748d1b68b911`, with 220 regressions, 15 integration
scenarios, 76 deterministic migrations, both builds and populated recovery.
The provider increment implements authenticated webhook ingestion, duplicate
source controls, independently approved posting, clearing reports and linked
corrections. Its deployed local Edge, browser and recovery gates run against
synthetic accounts. See FINANCE_INTEGRATIONS.md. Group consolidation, intercompany
accounting and the remaining close features continue next; live provider and
managed-service acceptance remain required.

## Schedule and fiscal close increment

PR #32 merged provider integration at `d8838d83c376cf6654d84e76cc0ba7aa8e238cdb`
with 227 regressions, 16 integration scenarios, 77 deterministic migrations and
restored evidence for 32 financial source graphs. The next close increment adds
prepaids, fixed assets, recurring journals, accrual reversals, reviewed period
transitions and fiscal earnings transfers with preserved income reporting.
FINANCE_CLOSE.md defines those policies. Approved statement mappings, cash-flow
classification, intercompany accounting and consolidation remain implementation
work; managed staging and customer finance/security acceptance remain release gates.

## Group accounting increment

PR #33 merged schedules and fiscal close at
`f9c458f34c82870fb4f076aa98b74a5ff72875e0`, with 233 regressions, 17 integration
scenarios, 79 deterministic migrations, both builds and 38 restored financial
source graphs. The group increment implements bilateral intercompany accounting,
partial settlements, wholly owned reporting groups, explicit FX translation,
matched-pair and manual eliminations, retained earnings, approved snapshots and
consolidated cutoff controls. FINANCE_GROUPS.md describes its accepted-policy
boundaries. Approved statement mappings and cash-flow reports remain next, alongside
the production acceptance and provider/onboarding requirements already recorded.

## Mapped statements and cash flow increment

PR #34 merged intercompany and consolidation at
`b6cd35dc6bbd9ddfd9a9078fbf0a9df6a22e169c`: 238 regressions, 18 authenticated
integration scenarios, 81 deterministic migrations, both builds, CodeQL, production
dependency audit and 47 restored source graphs passed. Dependency review remains
blocked by the repository's disabled Dependency graph setting.

The statement increment adds independently approved account presentation, immutable
cash allocations, mixed-payment splits, internal-transfer controls, native and group
cash flows, restricted cash, explicit FX/rounding controls and frozen statement
packets. FINANCE_STATEMENTS.md defines behavior and capacity. These complete the
previously identified statement-mapping and cash-classification implementation gaps.
The four finance priorities now have concrete workflows and acceptance scenarios;
production release still requires the owner settings, managed staging, representative
opening balances, provider activation and finance/security sign-off listed above.
