# Finance delivery status

The agreed first market is US finance teams at growing SaaS, AI, digital and
services companies. This is a finance ERP implementation with explicit accounting
policies; it is not an assertion of complete Rillet feature parity or production
acceptance.

| Requested area | Implemented workflows | Evidence and operating contract |
| --- | --- | --- |
| Bank statement import and reconciliation | CSV import, duplicate/control checks, cash matching, timing items, independent close/reopen/void, partial AR/AP settlements and corrections | PR #30; FINANCE_WORKFLOWS.md |
| Subscription/usage billing and revenue recognition | Approved contracts and performance obligations, recurring fixed/usage cycles, invoicing, deferred/unbilled revenue, recognition, prospective amendments and supported credits | PR #31; FINANCE_WORKFLOWS.md |
| Integrations and approval workflows | Signed Stripe and generic financial events, usage ingestion, source deduplication, reviewed mappings/postings, processor clearing, linked reversals and two-person finance policies | PR #31–32; FINANCE_INTEGRATIONS.md |
| Consolidation and agreed finance features | Prepaids/assets, recurring journals/accruals, fiscal close, intercompany transactions/settlements, wholly owned groups, FX translation, eliminations and retained approved reports | PR #33–34; FINANCE_CLOSE.md and FINANCE_GROUPS.md |
| Financial statements and cash flow | Approved native/group presentation, restricted cash, split cash allocations, transfer controls, translated group cash flow, source reconciliation and frozen statement packets | Financial-statement increment; FINANCE_STATEMENTS.md. Use its completed PR checks as release evidence. |

The repository contains synthetic bank statements/contracts and repeatable acceptance
scenarios for these workflows. Real customer data was not required to implement the
baseline. Synthetic checks establish repeatable code behavior and do not establish
a customer's accounting decisions, provider completeness or production environment.

## Required before production release

1. Enable GitHub Dependency graph, rerun dependency review, and activate the supplied
   main ruleset. The connected GitHub tools do not expose administration writes.
2. Configure an isolated managed staging project, the release build and Edge
   functions, approved provider test accounts, secrets and intended application
   origin. No live provider account or managed deployment has been configured here.
3. Activate two-person posting/payment and statement policies for every entity/group.
   Approve opening balances, cash perimeter, contracts, chart mappings, tax/provider
   responsibilities, fiscal dates, ownership and FX policies.
4. Run representative-volume migration/UAT, managed restore and security checks;
   configure alerts, recovery targets, incident ownership and credential rotation.
5. Record finance, security, operations and product acceptance with the immutable
   release commit and evidence links. PRODUCTION_READINESS.md defines the gates.

## Boundaries that require a separate accepted scope

Provider ingestion does not create external subscriptions, charge cards or move
money. Native sales-tax determination/filing, payroll calculation, CRM synchronization,
automated chargebacks and arbitrary refund/credit allocations are not supplied by
the generic journal protocol. The initial revenue contract does not cover every
variable-consideration or retrospective contract modification policy. Consolidation
supports wholly owned groups and functional-currency translation; noncontrolling
interests, hyperinflation and native transaction-currency remeasurement require
additional accepted accounting workflows. Statutory notes, noncash disclosures and
filing formats require finance review and reporting extensions where applicable.

These boundaries remain visible instead of being represented by simulated or
unverified workflows. A production pilot must fit the supported contract, with any
required extension completed and tested before onboarding.
