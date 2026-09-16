# Tapaano project knowledge

Start with [target customers](../TARGET_CUSTOMER.md),
[finance delivery status](../FINANCE_DELIVERY_STATUS.md) and
[production readiness](../PRODUCTION_READINESS.md). These separate intended
market, implemented behavior and the evidence needed for release. Historical
counts and status notes must be checked against the current commit and live
environment before being used as current evidence.

For development with BMAD, read [BMAD.md](../BMAD.md) and the root
[agent instructions](../AGENTS.md).

| Change area | Existing source of domain context |
| --- | --- |
| Posting, settlements, bank reconciliation, contracts and revenue | [Finance workflows](../FINANCE_WORKFLOWS.md) |
| Tax-bearing transactions, provider fees/refunds, revenue revisions, foreign balances and ownership | [Broader accounting coverage](../FINANCE_ACCOUNTING_COVERAGE.md) |
| Subscription changes, proration and renewals | [Subscription lifecycle](../FINANCE_SUBSCRIPTIONS.md) |
| Customer credits and refund accounting | [Customer adjustments](../FINANCE_CUSTOMER_ADJUSTMENTS.md) |
| Bank feed ingestion and corrections | [Bank feeds](../FINANCE_BANK_FEEDS.md) |
| Signed financial events and approval controls | [Integrations](../FINANCE_INTEGRATIONS.md) |
| External refund execution and recovery | [Provider refunds](../FINANCE_PROVIDER_REFUNDS.md) |
| Accruals, assets, prepaids and fiscal close | [Finance close](../FINANCE_CLOSE.md) |
| Intercompany, currency translation and consolidation | [Groups](../FINANCE_GROUPS.md) |
| Presentation, cash flow and approved report packets | [Statements](../FINANCE_STATEMENTS.md) |
| First administrator and invitation activation | [First-admin setup](../FIRST_ADMIN_SETUP.md) |
| Security boundaries and reporting | [Security](../SECURITY.md) |
| Local development and checks | [Contributing](../CONTRIBUTING.md) |

The broader accounting coverage guide supersedes earlier narrow tax, refund,
revenue and currency boundaries where it explicitly extends them. Inspect the
matching migrations, application code and tests before making a behavior claim.
Older README feature summaries are historical and may lag these domain guides.
