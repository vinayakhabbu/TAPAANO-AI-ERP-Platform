# TAPAANO: completion and production release plan

## Release definition

A complete ERP is the agreed set of business processes operating together, with
reconciled accounting, tenant isolation, recoverable data, and supported operations.
Repository CI is evidence for implementation; it is not evidence of production-data
correctness, statutory compliance, bank execution, or an operational service.

The existing recovery and PR #22 form the accounting foundation. PR #22 was merged
to `main` at `bcc0658ac87bf90384c8f90e5b390379b7b3450b`. It passed 171 regressions,
real Auth/API/browser integration, two complete migration replays, release builds,
CodeQL, and npm audit. Dependency review remains blocked by the repository's
disabled Dependency graph feature. Branch protections still need owner activation.

## Business decisions required

These have not been confirmed in the available project context. Do not invent
tax, payroll, valuation, or statutory rules to fill these gaps.

| Decision | Why it changes implementation |
| --- | --- |
| First release countries and legal entities | Tax registrations, invoice requirements, payroll rules, data residency, reporting |
| Business type: services, distribution, manufacturing, or a defined combination | Required order, purchasing, warehouse, production, and costing workflows |
| Accounting framework, fiscal calendars, opening balances, chart mappings | Financial statements, retained earnings, close, consolidation, reconciliation |
| Supported currencies and precision | Current posting amounts use two decimal places; currency and FX policies need explicit scope |
| Inventory valuation and tracking requirements | FIFO/weighted average, serial/lot/expiry tracking, negative stock, landed cost |
| Users, segregation of duties, transaction volume, retention and latency targets | Approval design, access controls, performance testing, audit storage |
| Bank, payroll, tax and external system providers | Integration contracts, credentials, reconciliation, failure recovery |
| Hosting, staging project, sanitized data, and release owners | Migration/restore rehearsals, operational monitoring, finance and security acceptance |

## Delivery sequence

Each phase needs one complete workflow from browser to database, negative and
concurrent API tests, reconciliation evidence, a reviewed migration, and updated
operator documentation. A menu entry or database table is not module completion.

| Phase | Deliverable | Completion evidence / dependencies |
| --- | --- | --- |
| 1. Ledger reporting foundation | Entity/currency-scoped trial balance, opening/activity/closing balances, exact decimal CSV, explicit unavailable states | Actual posted AR/AP and offset journals reconcile; tenant/date boundaries, retired accounts, large histories and invalid lineage are tested |
| 2. Core finance completion | Account-ledger drilldown and filtering; partial allocations/receipts/payments; credits/refunds; AR/AP aging; setup and period-close UI | Idempotent atomic posting, over-allocation prevention, concurrent settlement/close tests, subledger-to-GL reconciliation |
| 3. Sales and procurement | Quote/order/fulfilment/invoice and requisition/approval/PO/receipt/bill workflows | Document lineage, approval separation, partial fulfilment, returns, cancellation, match tolerances and duplicate prevention |
| 4. Inventory | Receipts, issues, transfers, counts, valuation and COGS | Agreed costing policy, atomic quantity/value movements, stock-to-GL reconciliation, concurrent depletion tests |
| 5. Banking | Statement import, duplicate detection, matching, reconciliation; separately approved payment execution | Provider contracts, bank/subledger/GL reconciliation, signed callbacks, retries and execution status verified against the provider |
| 6. Statements and localization | Trial-balance mappings into financial statements; fiscal close; FX and tax for selected countries | Agreed accounting framework, jurisdiction-specific rules, FX sources, independently checked calculations and finance acceptance |
| 7. Payroll and industry workflows | Scoped payroll; manufacturing/BOM/MRP/WIP or service workflows as required by the selected business | Country and industry requirements, cost and liability reconciliation, approval and payment separation |
| 8. Governed AI assistance | Tenant-scoped retrieval, explainable proposals, human approval before side effects | Grounded outputs, prompt-injection tests, access checks, immutable decision evidence, budget and rollback controls |
| 9. Production acceptance | Data migration, restore, security/load tests, monitoring, incident response, UAT and release | Named owners and immutable evidence for every gate in PRODUCTION_READINESS.md |

Operations work starts alongside Phase 1. It must not be postponed until the
last feature is built. Tax/payroll/industry work follows the business decisions
above; no universal jurisdiction or accounting policy is assumed.

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

## Immediate owner and deployment work

1. Enable Dependency graph in repository security analysis settings and re-run
   dependency review; import and activate `.github/rulesets/main.json`.
2. Confirm the first production country's and business type's requirements.
3. Provide an isolated staging project and sanitized representative data through
   the deployment workflow; keep credentials out of source and browser variables.
4. Rehearse the full migration manifest, reconcile opening and subledger balances,
   and prove restore before considering a production release.
