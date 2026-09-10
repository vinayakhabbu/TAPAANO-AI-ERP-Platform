# Customer credits and refunds

This increment adds `/customer-adjustments` for independently approved, exact-cent
adjustments to posted functional-currency, zero-tax customer invoices. Original
invoices, invoice lines, receipts and revenue entries remain retained evidence.

## Operating contract

- Two administrators configure one dedicated, previously unused customer-credit
  liability account per entity. Every credit, refund, application and correction
  then requires a requester and a different accounting reviewer.
- Credits reference one to 200 original invoice lines. Cumulative credits cannot
  exceed each original line. The posting first reduces unpaid AR; the paid portion
  creates a customer-credit liability. A credit does not create a cash movement.
- A confirmed refund debits that liability and credits a registered bank/clearing
  account. It requires an original active receipt or replacement, a unique bank or
  provider confirmation reference, and an amount within both the credit balance
  and the original payment's remaining refundable amount. This records confirmed
  money movement; it does not call a provider or initiate a transfer.
- Credit balances can settle another posted invoice for the same customer/entity.
  Applications participate in invoice capacity and dated AR aging. Balances funded
  by an application can be applied again; refunding a chain of transferred credits
  back to a different invoice's payment is outside this source contract.
- Refund/application corrections retain dated reversal journals. Reverse active
  uses before reversing a credit, and unwind dependent invoice credits in reverse
  order. Corrections require evidence that the accounting record or bank event was
  reversed; a correction is not an instruction to recover money from a customer.
- Existing receipt corrections and legacy full credits cannot bypass active
  customer-credit dependencies. Generic journal reversals cannot detach any owned
  credit/refund/application journal. Every dated AR and customer-liability balance
  must remain within its source capacity, including later already-recorded dates.
- Review proposals retain the invoice/settlement state and proposed debit/credit
  split. Approval rechecks the snapshot. Retrying the same completed decision is
  idempotent, including after restore. Tenant APIs cannot directly mutate sources.

## Contract price concessions

A contract invoice credit uses the original relative selling-price allocation.
Within each obligation it reduces already recognized revenue proportionally and
reduces the remaining deferred revenue for the rest. Future recognition posts only
the remaining net consideration. The invoice's original billed amount and gross
recognition entries are not rewritten. Reports show net billed, recognized and
deferred balances, a net service schedule and control-account reconciliation.

This is a price concession over the original performance obligations. Changes to
future service, quantities or subscription terms must use a prospective subscription
change policy; this credit action is not a universal contract-modification method.
Recognition cannot be backdated across an approved credit/correction. The reviewer
must establish the actual concession agreement and appropriate allocation policy.

## Reports, close and qualification

The customer report includes credit lines, payments, uses, reversals and journal
references. It compares customer balances with the full liability control account;
a variance blocks close. AR aging includes the exact owned journal movements.
Reports validate source graphs, and the browser rechecks decimal identities with
integer cents, hides stale figures/exports after failed reads, and supports CSV and
JSON evidence export. The workspace paginates credits in groups of 20. Its explicit
capacity is 5,000 posted invoices and 2,000 credits per entity; larger volumes need
additional query and acceptance work, not silent truncation.

Database scenarios cover partial/paid/part-paid credits, receipt capacity, source
corrections, cumulative contract concessions, historical reporting, pennies,
independent review, stale proposals, tenant isolation and closed periods. The managed
stack scenario exercises the actual browser, concurrent approval retry, refunds,
applications, API denial and recovery. Populated restore validates the new policy,
credit and use graphs and compares reports and completed approval results.

Implementation references (consulted 2026-09-10): Stripe's [credit-note
semantics](https://docs.stripe.com/invoicing/dashboard/credit-notes) distinguish
invoice reduction, customer balance and refunds and recommend original-line
references. [Refund documentation](https://docs.stripe.com/refunds) distinguishes
refund lifecycle from an invoice adjustment. These describe provider behavior,
not certification of the ERP's accounting policies. No live provider qualification
or production accounting acceptance is implied by synthetic tests.
