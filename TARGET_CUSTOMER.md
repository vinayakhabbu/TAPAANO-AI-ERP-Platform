# TAPAANO customer and product scope

Decision recorded: 2026-09-06. The project owner selected the **United States**
for the first release and instructed TAPAANO to serve the customer market that
Rillet targets. These are confirmed inputs. The delivery order below is an
implementation priority, not a claim that the owner excluded other customers.

## Market evidence

Rillet's current positioning reaches finance and accounting teams from growing
companies through enterprises. Its customer stories include controllers and
finance leaders at Scribe, Postscript, Halcyon, Highway, and public company Lunai
Bioworks. This is broader than an early-stage startup segment.
Source: [Rillet customer stories](https://www.rillet.com/customers), reviewed
2026-09-06.

SaaS, professional services, and AI companies are explicit segments in Rillet's
Maxio partnership announcement. Its revenue product addresses subscriptions,
usage, milestones, deferred revenue, and contract changes. Those buying needs
provide a practical starting point for TAPAANO's US delivery sequence.
Sources: [Rillet and Maxio](https://www.rillet.com/blog/rillet-and-maxio-partner-to-deliver-an-ai-powered-finance-stack)
and [revenue recognition](https://www.rillet.com/product/advanced-revenue-recognition),
reviewed 2026-09-06.

Rillet also markets multi-entity and multi-currency accounting to enterprises
with international operations, and serves private-equity firms and portfolio
companies. It connects accounting to CRM, spend, payments, payroll, and tax
providers. These are relevant expansion requirements for the same customer market.
Sources: [enterprise](https://www.rillet.com/solution/enterprise),
[private equity](https://www.rillet.com/solutions/private-equity), and
[integrations](https://www.rillet.com/product/native-integrations), reviewed
2026-09-06. These sources establish the vendor's positioning and advertised
capabilities; they do not independently prove its performance or compliance.

## TAPAANO customer profile

The following is TAPAANO's working product interpretation of that evidence.
No arbitrary employee count, revenue threshold, funding stage, or US state is
required to fit the market.

| Dimension | Target |
| --- | --- |
| Economic buyer | CFO, VP of Finance, controller, or accounting leader responsible for reliable books and close |
| Daily users | Accountants, AR/AP staff, revenue accountants, financial analysts, and authorized approvers |
| Initial delivery focus | Growing US SaaS, AI, digital-product, and professional-services companies with recurring or contract revenue |
| Broader customer market | Mid-market and enterprise finance teams, public companies, and private-equity portfolio businesses whose workflows meet the validated release scope |
| Buying triggers | Spreadsheet-heavy close, disconnected billing and ledger data, complex revenue schedules, growing entity count, and audit or investor reporting demands |
| Primary job | Move from a contract or transaction to reconciled books, an explainable close, and trustworthy financial reports |
| Qualification | Supported contract and currency policies, required integrations, representative volume, finance acceptance, and operational requirements can all be demonstrated |

Product direction: an AI-assisted financial ERP for US finance teams, bringing
contracts, billing, accounting, reconciliation, and close into one traceable
workflow. This describes the intended product; current implemented behavior is
listed in [README.md](./README.md).

## Required product outcomes

These are planned release requirements, not features that are already available.
The first production cohort must have all of its required workflows implemented
and accepted; a smaller pilot must name its supported boundaries explicitly.

| Workflow | Required outcome | Acceptance evidence |
| --- | --- | --- |
| Books and reporting | Governed setup and opening balances; GL drilldown; mapped income statement, balance sheet and cash-flow reporting; accrual, prepaid and fixed-asset schedules | Every report and schedule reconciles to the ledger; finance approves mappings, cutoffs, depreciation and retained-earnings treatment |
| Revenue | Approved customer contracts; subscription, usage and milestone billing; amendments; deferred revenue and recognition schedules under documented US GAAP policies, including applicable ASC 606 treatment | Contract-to-invoice-to-journal traceability; complete usage and revision history; exact schedule totals; independently approved accounting examples |
| Receivables | Partial receipts and allocations, credits, refunds, aging, collections and processor settlement reconciliation | Concurrent requests cannot over-allocate; customer balances agree with AR control accounts; recorded cash and external settlement are distinguishable |
| Payables and spend | Bill capture, duplicate detection, approvals, purchase commitments, partial payments, expenses and accruals | Approval separation; vendor balances agree with AP control accounts; provider execution statuses and errors are reconciled |
| Cash and close | Statement import and bank feeds, matching, exceptions, reconciliation, recurring journals, close tasks, locks and evidence | Statement opening plus activity equals closing; books reconcile to statements; a closed period rejects unauthorized posting |
| Group accounting | Entity reporting, intercompany accounting, consolidation and supported FX | Elimination and translation policies are approved; consolidated totals reconcile to source entities without silently summing currencies |
| Integrations | Billing/processor, CRM, spend/AP, payroll, tax and banking connections | Authenticated ingestion; idempotent retries; explicit source ownership; replay, exception handling, control totals and reconciliation |
| Trust and operation | Tenant isolation, role separation, durable audit evidence, secure onboarding, monitored service, tested migration and restore | Real API and browser isolation tests, finance UAT, representative load evidence and every applicable production gate |
| AI assistance | Explainable coding, matching, contract extraction and close proposals grounded in authorized data | Human approval before financial side effects; linked source evidence; prompt-injection and cross-tenant tests; deterministic posting controls |

## US release assumptions and customer configuration

- Design for US GAAP reporting and approved accrual-accounting policies. An
  accounting framework label or balanced trial balance alone is not acceptance.
- Prioritize US entities and USD for initial acceptance fixtures. Preserve each
  entity's explicit functional currency. Existing same-currency EUR test coverage
  does not demonstrate FX, foreign statutory reporting, or global readiness.
- Collect states of operation, registrations, exemptions and tax-provider setup
  per customer. Do not infer nexus or apply one nationwide sales-tax rule. Current
  zero-tax posting remains a narrow supported boundary until tax is implemented.
- Evaluate provider integrations for US payroll, sales tax, tax reporting and
  payment execution. Their credentials, agreements, sandbox tests and release
  acceptance remain dependencies; no provider has been selected or connected.
- Candidate discovery starts with Stripe for billing/payments, Salesforce or
  HubSpot for CRM, Ramp/Brex/BILL for spend, and payroll/tax/bank providers used by
  the first customers. These are integration priorities to validate, not promises
  of existing connectors or a requirement that customers use every provider.
- Set measurable service, volume, latency, retention, RPO and RTO targets during
  pilot acceptance. Do not market enterprise scale before those targets are tested.

## Delivery boundaries

Finance, contract revenue, cash reconciliation and close take priority over
warehouse operations, manufacturing/MRP, and building a native payroll or tax
calculation engine. Those remain possible later customer-driven additions. This
is TAPAANO's sequencing decision, not a claim about features Rillet lacks.

The broader enterprise/public-company market remains in scope. SSO, lifecycle
provisioning, granular access policies, evidence retention, consolidation, scale,
and customer-specific audit requirements must be validated before accepting a
customer that depends on them. No SOC certification, SOX suitability, accounting
compliance, release date, or competitor feature parity is asserted by this plan.

The next implementation milestone is **close-ready core finance**: complete
account-ledger drilldown, verified financial-statement mappings, setup and period
controls, and reconciled AR/AP and cash. Contract revenue follows that foundation;
integration architecture and operations work begin alongside it. Detailed sequence
and implementation evidence: [ERP_ROADMAP.md](./ERP_ROADMAP.md) and
[PRODUCTION_READINESS.md](./PRODUCTION_READINESS.md).
