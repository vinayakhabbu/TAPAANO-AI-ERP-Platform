# TAPAANO AI ERP Platform - Technical Documentation

## Overview

TAPAANO is a comprehensive, AI-native enterprise resource planning (ERP) platform built for modern finance teams. It provides full financial management capabilities including multi-entity accounting, CRM, inventory, production, HR & Payroll, Tax Management, and AI-powered automation.

**Version**: 2.2 (January 2026)  
**Phase 1-7 Implementation**: Complete

### Platform Capabilities

| Category | Modules |
|----------|---------|
| **Core Financial** | General Ledger, AR, AP, Banking, Period Close |
| **Sales & CRM** | Opportunities, Quotations, Sales Orders, Invoicing |
| **Procurement** | Requisitions, Purchase Orders, Goods Receipts, Bills |
| **HR & Payroll** | Employees, Time-Off, Attendance, Payroll, Expenses |
| **Tax & Currency** | Tax Codes/Jurisdictions/Rates, Multi-Currency, Revaluation |
| **Advanced Accounting** | Multi-Book, Subscription Billing, Revenue Recognition, Treasury |
| **AI Automation** | OCR Bill Capture, Flux Analysis, AI Report Builder, Agent River |
| **Compliance** | SOX Controls, Decision Ledger, Anomaly Detection |
| **Migration** | NextDay Migration Wizard |

---

## Technology Stack

### Frontend

| Technology          | Purpose                   |
| ------------------- | ------------------------- |
| **React 18**        | UI library                |
| **TypeScript**      | Type-safe development     |
| **Vite**            | Build tool and dev server |
| **Tailwind CSS**    | Utility-first styling     |
| **Shadcn/UI**       | Component library         |
| **React Router v6** | Client-side routing       |
| **TanStack Query**  | Server state management   |
| **React Hook Form** | Form handling             |
| **Zod**             | Schema validation         |
| **Recharts**        | Data visualization        |
| **Lucide React**    | Icon library              |
| **next-themes**     | Dark/light mode theming   |

### Backend (Lovable Cloud)

| Technology                   | Purpose                     |
| ---------------------------- | --------------------------- |
| **Supabase**                 | Backend-as-a-Service        |
| **PostgreSQL**               | Database                    |
| **Edge Functions**           | Serverless API endpoints    |
| **Row Level Security (RLS)** | Multi-tenant data isolation |
| **OpenAI API**               | AI Copilot capabilities     |
| **Resend API**               | Email notifications         |

---

## Application Architecture

### Multi-Tenant Structure

```
Organization
├── Entities (Legal Entities / Business Units)
│   ├── Bank Accounts
│   ├── Invoices
│   ├── Bills
│   ├── Journal Entries
│   ├── Shipments
│   ├── Goods Receipts
│   └── Close Tasks
├── Customers
├── Vendors
├── Accounts (Chart of Accounts)
├── Warehouses
│   ├── Bin Locations
│   └── Inventory Stock
├── Products
│   ├── Serial Numbers
│   └── Batch/Lots
├── Employees
│   ├── Emergency Contacts
│   ├── Documents
│   ├── Time-Off Requests
│   └── Expense Claims
└── Users/Profiles
```

### Authentication & Authorization

- **Email/Password Authentication** via Supabase Auth
- **Role-Based Access Control (RBAC)**:
  - `admin` - Full access
  - `moderator` - Extended permissions
  - `user` - Standard access
  - `viewer` - Read-only access
- **Auto-provisioning**: New users automatically get an organization, entity, and admin role

---

## Modules

### 1. Dashboard (`/`)

**Purpose**: Executive overview of financial health

**Features**:

- Key metrics cards (Revenue, Outstanding AR, Pending AP, Cash Position)
- Revenue trend chart (monthly)
- AR Aging analysis chart
- Period close status tracker
- Recent activity feed
- HR/Payroll summary (total employees, payroll)
- Tax summary (collected, liability)
- Multi-currency summary (unrealized gains/losses)

**Data Sources**:

- Aggregated from invoices, bills, bank accounts, close tasks, employees, tax transactions

---

### 2. Accounts Receivable - O2C (`/ar`)

**Purpose**: Manage the Order-to-Cash cycle

**Tabs**:

| Tab | Description |
|-----|-------------|
| **Invoices** | Create, view, and manage customer invoices |
| **Sales Orders** | Sales order entry and fulfillment |
| **Quotations** | Quote creation and conversion |
| **Shipments** | Shipping and delivery tracking |
| **Subscriptions** | Recurring billing and subscription management |
| **Rev Recognition** | Revenue recognition schedules (ASC 606/IFRS 15) |

**Key Components**:
- `src/components/billing/SubscriptionBilling.tsx` - Subscription management
- `src/components/revenue/RevenueRecognitionSchedule.tsx` - Revenue recognition

---

### 3. Procure-to-Pay (`/ap`)

**Purpose**: Manage the Procure-to-Pay cycle

**Tabs**:

| Tab | Description |
|-----|-------------|
| **Bills** | Vendor bill entry and management |
| **Purchase Orders** | PO creation and approval |
| **Requisitions** | Purchase request workflow |
| **Goods Receipts** | Receipt of goods against POs |
| **Payment Runs** | Batch payment processing |
| **OCR Capture** | AI-powered bill data extraction |
| **Prepaids** | Prepaid expense tracking and amortization (Phase 5) |

**Key Components**:
- `src/components/bills/OCRBillCapture.tsx` - Drag-drop OCR extraction
- `src/components/prepaid/PrepaidExpenseList.tsx` - Prepaid expense management (Phase 5)

---

### 4. General Ledger (`/gl`)

**Purpose**: Core accounting operations

**Tabs**:

| Tab | Description |
|-----|-------------|
| **Journal Entries** | Manual journal entry creation |
| **Chart of Accounts** | Account hierarchy management |
| **Multi-Book** | Parallel GAAP/IFRS/Tax ledgers |
| **Intercompany** | Intercompany elimination and reconciliation |

**Key Components**:
- `src/components/accounting/MultiBookAccounting.tsx` - Multi-book management
- `src/components/consolidation/IntercompanyElimination.tsx` - IC elimination

---

### 5. Banking (`/banking`)

**Purpose**: Bank account and transaction management

**Tabs**:

| Tab | Description |
|-----|-------------|
| **Accounts** | Bank account master data |
| **Transactions** | Bank transaction list and reconciliation |
| **Reconciliation** | Match transactions to invoices/bills |
| **Statement Import** | Import OFX/CSV statements |
| **AI Categorizer** | ML-based transaction categorization |
| **Treasury** | Cash pooling and investment tracking |

**Key Components**:
- `src/components/banking/BankInstitutionSelector.tsx` - Plaid-style bank selector
- `src/components/banking/MatchingRulesDialog.tsx` - Auto-match rules
- `src/components/banking/PositivePayDialog.tsx` - Check fraud prevention
- `src/components/ai/TransactionCategorizer.tsx` - AI categorization
- `src/components/treasury/TreasuryManagement.tsx` - Treasury operations

---

### 6. Financial Reports (`/reports`)

**Purpose**: Financial reporting and analysis

**Tabs**:

| Tab | Description |
|-----|-------------|
| **Income Statement** | Profit & Loss report |
| **Balance Sheet** | Financial position |
| **Cash Flow** | Cash flow statement |
| **Trial Balance** | Account balances |
| **Flux Analysis** | AI-powered variance analysis |
| **AI Report Builder** | Natural language report generation |
| **Predictions** | AI cash flow and revenue forecasts (Phase 5) |
| **Contracts** | AI contract compliance analyzer (Phase 6) |

**Key Components**:
- `src/components/analytics/FluxAnalysis.tsx` - Period variance insights
- `src/components/analytics/AIReportBuilder.tsx` - NL report generation
- `src/components/analytics/PredictiveAnalytics.tsx` - Cash flow/revenue predictions (Phase 5)
- `src/components/compliance/ContractAnalyzer.tsx` - AI contract analysis (Phase 6)

---

### 7. CRM (`/crm`)

**Purpose**: Customer relationship management

**Features**:
- Opportunity pipeline (Kanban and Funnel views)
- Sales analytics and forecasting
- Customer activity tracking
- Win/loss analysis

**Key Components**:
- `src/components/pipeline/PipelineKanban.tsx` - Kanban board
- `src/components/pipeline/PipelineFunnel.tsx` - Funnel visualization
- `src/components/analytics/SalesAnalytics.tsx` - Sales metrics
- `src/components/forecasting/SalesForecasting.tsx` - AI predictions

---

### 8. Inventory (`/inventory`)

**Purpose**: Inventory and warehouse management

**Tabs**:

| Tab | Description |
|-----|-------------|
| **Warehouses** | Warehouse master data and bin locations |
| **Products** | Product catalog with inventory details |
| **Stock Transfers** | Inter-warehouse stock movements |
| **Cycle Counts** | Inventory counting and adjustments |
| **Consignment** | Vendor-owned consignment tracking |
| **Movements** | Full inventory movement history (Phase 6) |
| **COGS** | Cost of Goods Sold reporting (Phase 6) |

**Features**:
- Warehouse and bin location management
- Stock transfers and adjustments
- Cycle counting
- Batch/lot tracking
- Serial number tracking
- Consignment inventory
- **Inventory movement tracking** (purchases, sales, adjustments, transfers)
- **COGS Report** with product breakdown and valuation

**Key Components**:
- `src/components/inventory/InventoryMovementsPanel.tsx` - Movement recording/viewing
- `src/components/inventory/COGSReport.tsx` - Cost of goods sold analysis

---

### 9. Production (`/production`)

**Purpose**: Manufacturing and production planning

**Features**:
- Bill of Materials (BOM) management
- Production order processing
- Work center capacity planning
- Material requirements planning (MRP)

---

### 10. Controlling (`/controlling`)

**Purpose**: Management accounting and cost control

**Tabs**:

| Tab | Description |
|-----|-------------|
| **Cost Centers** | Cost center master data |
| **Internal Orders** | Project/order cost tracking |
| **Budgets** | Budget entry and management |
| **Forecasts** | Cash flow forecasting |
| **Allocations** | Cost allocation rules (Phase 5) |

**Features**:
- Cost center management
- Internal order tracking
- Budget management with variance analysis
- Cash flow forecasting
- **Cost allocation rules** with percentage/formula distribution
- **Allocation run execution** with journal entry creation

**Key Components**:
- `src/components/controlling/BudgetVarianceChart.tsx` - Budget vs actual
- `src/components/controlling/CashFlowChart.tsx` - Cash flow visualization
- `src/components/allocations/AllocationRulesManager.tsx` - Allocation rule CRUD (Phase 5)

---

### 11. Period Close (`/period-close`)

**Purpose**: Month-end and year-end close management

**Features**:
- Close task checklists
- Task assignment and tracking
- Period locking
- Close status dashboard

---

### 12. Service Management (`/service`)

**Purpose**: Service contracts and field operations

**Features**:
- Service contract management
- Service call tracking
- Warranty management
- Field visit scheduling

---

### 13. HR & Payroll (`/hr`)

**Purpose**: Complete human resources and payroll management

**Tabs**:

| Tab | Description |
|-----|-------------|
| **Employees** | Employee master data, hire dates, salaries |
| **Departments** | Organizational structure management |
| **Positions** | Job positions with pay grades |
| **Time Off** | Leave requests and approval workflow |
| **Attendance** | Clock in/out and attendance tracking |
| **Pay Periods** | Payroll period configuration |
| **Payroll Runs** | Process payroll with GL posting |
| **Payslips** | Generate and export employee payslips |
| **Expenses** | Expense claim submission and approval |
| **Documents** | Secure employee document storage |
| **Emergency Contacts** | Employee emergency contacts |
| **Analytics** | HR dashboard with key metrics |

**Key Components**:
- `src/pages/HRPayroll.tsx` - Main HR module
- `src/components/hr/HRAnalyticsDashboard.tsx` - HR analytics
- `src/hooks/useHRPayroll.ts` - Core HR hooks
- `src/hooks/useHRAnalytics.ts` - Analytics calculations
- `src/hooks/useExpenseClaims.ts` - Expense management
- `src/hooks/useEmployeeDocuments.ts` - Document storage
- `src/hooks/useEmergencyContacts.ts` - Emergency contacts
- `src/hooks/useAttendance.ts` - Attendance tracking
- `src/hooks/useTimeOff.ts` - Time-off requests
- `src/hooks/usePayslips.ts` - Payslip generation

**GL Integration**:
Payroll runs automatically create journal entries:
- Debit: Salary Expense accounts (by department)
- Credit: Payroll Payable / Bank accounts

---

### 14. Tax Management (`/tax`)

**Purpose**: Comprehensive tax configuration and tracking

**Tabs**:

| Tab | Description |
|-----|-------------|
| **Tax Codes** | Define tax codes (VAT, GST, Sales Tax) |
| **Jurisdictions** | Geographic tax regions and rules |
| **Tax Rates** | Rate schedules with effective dates |
| **Transactions** | Tax transaction audit trail |
| **Filing** | Tax period management and filing status |

**Features**:
- Auto-calculate tax on invoices and bills
- Support for compound taxes and exemptions
- Tax transaction tracking for filing
- Jurisdiction-based tax rules

**Key Components**:
- `src/pages/TaxManagement.tsx` - Main tax module
- `src/hooks/useTaxManagement.ts` - Tax operations
- `src/components/forms/TaxCodeForm.tsx` - Tax code editor
- `src/components/forms/TaxJurisdictionForm.tsx` - Jurisdiction editor
- `src/components/forms/TaxRateForm.tsx` - Rate management

---

### 15. Currency Management (`/currency`)

**Purpose**: Multi-currency operations and revaluation

**Tabs**:

| Tab | Description |
|-----|-------------|
| **Exchange Rates** | Manage currency pairs and rates |
| **Revaluations** | Period-end currency revaluation |

**Features**:
- Real-time exchange rate lookups
- Automatic conversion to functional currency (USD)
- Unrealized gain/loss tracking on open items
- Realized gain/loss on settlement
- Currency revaluation journal entries

**Key Components**:
- `src/pages/Currency.tsx` - Main currency module
- `src/hooks/useCurrency.ts` - Exchange rate and revaluation hooks
- `src/components/currency/CurrencyRevaluationDialog.tsx` - Revaluation wizard

---

### 16. Decision Desk (`/decisions`)

**Purpose**: AI-powered approval management and audit trail

**Tabs**:

| Tab | Description |
|-----|-------------|
| **Decisions** | Decision trace audit log |
| **Precedents** | Search and browse similar past decisions |
| **Agent Runs** | AI execution playback and debugging |
| **Entity Graph** | Decision-entity relationship visualization |
| **Autonomous** | Batch autonomous approval processing |
| **Anomalies** | AI-detected unusual patterns |
| **Analytics** | Policy and decision analytics |

#### Decision Trace (Audit Trail)

Every approval action creates an immutable audit record containing:
- Policy rules evaluated and their pass/fail status
- Precedent cases referenced with similarity scores
- Structured rationale for the decision
- Approval channel (manual, auto-approved, agent)
- Full traceability of AI decision-making

**Technical Implementation**:
- `decision_traces` table stores all decision records
- `decision_entities` table links related entities
- `agent_runs` and `agent_run_steps` tables for AI execution playback
- `src/lib/policyRules.ts` - Policy evaluation engine
- `src/lib/autoApproval.ts` - Auto-approval engine with confidence scoring

#### Autonomous Approver

AI-powered batch processor that autonomously handles pending approvals.

**Features**:
- Preview Mode: See all pending items with confidence scores
- Execute Mode: Batch auto-approve all eligible items
- Auto-Refresh: Monitor for new pending items every 30 seconds
- Factor Breakdown: Visual display of policy, precedent, amount, and risk factors

**API Endpoint**: `POST /functions/v1/autonomous-approver`

#### Anomaly Detection

AI-powered detection of unusual patterns in approval decisions.

**Anomaly Types**:
| Anomaly | Description | Threshold |
|---------|-------------|-----------|
| `large_po` | Unusually large purchase order | > $50,000 |
| `rapid_approval` | Suspiciously fast approval | < 1 minute |
| `unusual_vendor` | First-time or rarely-used vendor | < 3 historical POs |
| `budget_exceeded` | Approval exceeds budget | > 100% of budget |
| `off_hours_approval` | Approval outside business hours | Before 6am or after 10pm |
| `stalled_approval` | Pending too long without action | > 7 days |
| `high_override_rate` | Frequent human overrides | > 30% override rate |

#### Learn from Overrides

System learns from human overrides to improve future auto-approval accuracy.

**How It Works**:
1. When a human overrides an auto-approved/rejected decision, it's recorded
2. System tracks override patterns by decision type and source
3. Confidence adjustments are calculated based on override frequency
4. Future auto-approval confidence scores are adjusted accordingly

---

### 17. Settings (`/settings`)

**Purpose**: Application configuration

**Tabs**:

| Tab | Description |
|-----|-------------|
| **Profile** | User profile settings |
| **Organization** | Organization configuration |
| **Team** | Team member management and roles |
| **Security** | Security settings and 2FA |
| **API Keys** | API key management |
| **Auto-Approval** | Auto-approval configuration |
| **Decision Tabs** | Decision Desk tab visibility |
| **SOX Controls** | SOX compliance controls matrix |
| **Migration** | NextDay data migration wizard |

**Key Components**:
- `src/components/settings/AutoApprovalSettings.tsx` - Auto-approval config
- `src/components/settings/DecisionDeskTabsSettings.tsx` - Tab visibility
- `src/components/compliance/SOXControls.tsx` - SOX control matrix
- `src/components/migration/NextDayMigration.tsx` - Migration wizard

---

### 18. Agent River (AI Assistant)

**Purpose**: Context-aware AI copilot for all modules

**Features**:
- Multi-context support (CRM, Finance, HR, Tax, Currency, Inventory, Production)
- Natural language approvals ("Approve PO-001")
- Dynamic route-specific suggested prompts
- Orchestrator routing to specialized sub-agents

**Sub-Agents**:
| Agent | Domain |
|-------|--------|
| `finance_agent` | AP/AR, invoices, payments |
| `crm_agent` | Opportunities, customers, pipeline |
| `inventory_agent` | Stock, warehouses, transfers |
| `hr_agent` | Employees, payroll, time-off |
| `tax_agent` | Tax codes, calculations, filing |
| `currency_agent` | Exchange rates, revaluation |
| `approvals_agent` | PO/PR approvals, payment runs |

**API Endpoint**: `POST /functions/v1/agent-river`

---

## UI Navigation Reference

| Feature | Route | Tab/Section |
|---------|-------|-------------|
| OCR Bill Capture | `/ap` | OCR Capture |
| Subscription Billing | `/ar` | Subscriptions |
| Revenue Recognition | `/ar` | Rev Recognition |
| AI Transaction Categorizer | `/banking` | AI Categorizer |
| Treasury Management | `/banking` | Treasury |
| Multi-Book Accounting | `/gl` | Multi-Book |
| Intercompany Elimination | `/gl` | Intercompany |
| Flux Analysis | `/reports` | Flux Analysis |
| AI Report Builder | `/reports` | AI Report Builder |
| HR Analytics | `/hr` | Analytics |
| Expense Claims | `/hr` | Expenses |
| Tax Codes | `/tax` | Tax Codes |
| Exchange Rates | `/currency` | Exchange Rates |
| Revaluations | `/currency` | Revaluations |
| SOX Controls | `/settings` | SOX Controls |
| NextDay Migration | `/settings` | Migration |
| Auto-Approval Config | `/settings` | Auto-Approval |
| Autonomous Approver | `/decisions` | Autonomous |
| Anomaly Detection | `/decisions` | Anomalies |
| Precedent Search | `/decisions` | Precedents |
| Agent Run Playback | `/decisions` | Agent Runs |
| Allocation Rules | `/controlling` | Allocations |
| Prepaid Expenses | `/ap` | Prepaids |
| Predictive Analytics | `/reports` | Predictions |
| Contract Analyzer | `/reports` | Contracts |
| Inventory Movements | `/inventory` | Movements |
| COGS Report | `/inventory` | COGS |

---

## Database Schema

### Master Data Tables

| Table | Description |
|-------|-------------|
| `organizations` | Tenant/company records |
| `entities` | Legal entities/business units |
| `profiles` | User profiles linked to auth |
| `user_roles` | RBAC role assignments |
| `customers` | Customer master data |
| `vendors` | Vendor master data |
| `accounts` | Chart of accounts |
| `bank_accounts` | Bank account master data |
| `employees` | Employee master data |
| `departments` | Department structure |
| `positions` | Job positions |
| `tax_codes` | Tax code definitions |
| `tax_jurisdictions` | Tax jurisdictions |
| `exchange_rates` | Currency exchange rates |

### Transaction Tables

| Table | Description |
|-------|-------------|
| `sales_orders` | Sales order headers |
| `invoices` | AR invoice records |
| `purchase_orders` | Purchase order headers |
| `bills` | AP bill records |
| `journal_entries` | GL journal headers |
| `journal_lines` | GL journal line items |
| `bank_transactions` | Bank transaction records |
| `payment_runs` | Payment batch headers |
| `payroll_runs` | Payroll processing runs |
| `payroll_items` | Individual payroll line items |
| `expense_claims` | Employee expense claims |
| `time_off_requests` | Leave requests |
| `attendance_records` | Employee attendance |
| `tax_transactions` | Tax transaction audit |
| `currency_revaluations` | FX revaluation records |

### AI/Decision Tables

| Table | Description |
|-------|-------------|
| `chat_messages` | AI conversation history |
| `ai_audit_logs` | AI action audit trail |
| `decision_traces` | Decision audit records |
| `decision_entities` | Linked entities for decisions |
| `agent_runs` | AI agent execution runs |
| `agent_run_steps` | Steps within agent runs |
| `decision_overrides` | Human override records |
| `confidence_adjustments` | Learned confidence adjustments |
| `auto_approval_configs` | Auto-approval configuration |

---

## Security Model

### Row Level Security (RLS)

All tables are protected by RLS policies that enforce:
- **Organization Isolation**: Users can only access data belonging to their organization
- **Role-Based Permissions**: Different operations allowed based on user role
- **PII Protection**: Employee data restricted to HR admins or record owners

### Key RLS Patterns

```sql
-- Standard org-scoped SELECT
USING (org_id = get_user_org_id())

-- Admin/Moderator only
USING (
  org_id = get_user_org_id() 
  AND get_user_role(auth.uid()) IN ('admin', 'moderator')
)

-- Self or admin access (for employee data)
USING (
  org_id = get_user_org_id()
  AND (
    user_id = auth.uid()
    OR get_user_role(auth.uid()) IN ('admin', 'moderator')
  )
)
```

### Database Functions

| Function | Purpose |
|----------|---------|
| `get_user_org_id()` | Returns current user's org_id |
| `get_user_role(user_id)` | Returns user's highest role |
| `has_role(user_id, role)` | Checks if user has specific role |
| `handle_new_user()` | Trigger for new user provisioning |
| `update_updated_at()` | Trigger for timestamp updates |

---

## API / Edge Functions

### `agent-river`
- **Purpose**: Orchestrating AI agent with multi-domain routing
- **Endpoint**: `/functions/v1/agent-river`
- **Features**: Routes to specialized agents (CRM, Finance, HR, Tax, Approvals)

### `autonomous-approver`
- **Purpose**: Batch autonomous approval processing
- **Endpoint**: `/functions/v1/autonomous-approver`
- **Features**: Preview/execute modes, confidence scoring, policy evaluation

### `anomaly-detector`
- **Purpose**: Detect unusual patterns in approval decisions
- **Endpoint**: `/functions/v1/anomaly-detector`
- **Features**: Multiple anomaly types, severity levels

### `precedent-search`
- **Purpose**: Search for similar past decisions
- **Endpoint**: `/functions/v1/precedent-search`
- **Features**: Vector search with OpenAI embeddings, text fallback

### `generate-embedding`
- **Purpose**: Generate vector embeddings for decision traces
- **Endpoint**: `/functions/v1/generate-embedding`

### `global-search`
- **Purpose**: Cross-module search functionality
- **Endpoint**: `/functions/v1/global-search`

### `send-notification`
- **Purpose**: Email notifications for workflow events
- **Endpoint**: `/functions/v1/send-notification`
- **Features**: Resend API integration

---

## File Structure

```
src/
├── components/
│   ├── accounting/              # Advanced accounting
│   │   └── MultiBookAccounting.tsx  # Parallel ledgers
│   ├── ai/                      # AI components
│   │   ├── AIChatBar.tsx        # Context-aware AI sidebar
│   │   └── TransactionCategorizer.tsx # ML categorization
│   ├── analytics/               # Analytics components
│   │   ├── AIReportBuilder.tsx  # Natural language reports
│   │   ├── FluxAnalysis.tsx     # Variance analysis
│   │   └── SalesAnalytics.tsx   # Sales metrics
│   ├── banking/                 # Banking components
│   │   ├── BankFeedDialog.tsx
│   │   ├── BankInstitutionSelector.tsx
│   │   ├── MatchingRulesDialog.tsx
│   │   ├── PositivePayDialog.tsx
│   │   └── StatementImportDialog.tsx
│   ├── billing/                 # Subscription billing
│   │   └── SubscriptionBilling.tsx
│   ├── bills/                   # Bill processing
│   │   └── OCRBillCapture.tsx
│   ├── compliance/              # Compliance tools
│   │   └── SOXControls.tsx
│   ├── consolidation/           # Consolidation
│   │   └── IntercompanyElimination.tsx
│   ├── controlling/             # Cost accounting
│   │   ├── BudgetVarianceChart.tsx
│   │   └── CashFlowChart.tsx
│   ├── currency/                # Multi-currency
│   │   └── CurrencyRevaluationDialog.tsx
│   ├── dashboard/               # Dashboard widgets
│   ├── decisions/               # Decision Desk
│   │   ├── AgentRunPlayback.tsx
│   │   ├── AnomalyDetector.tsx
│   │   ├── AutonomousApprover.tsx
│   │   ├── EntityGraph.tsx
│   │   ├── PolicyAnalyticsChart.tsx
│   │   ├── PrecedentCheckbox.tsx
│   │   └── PrecedentExplorer.tsx
│   ├── forecasting/             # Forecasting
│   │   └── SalesForecasting.tsx
│   ├── forms/                   # Data entry forms (50+)
│   ├── hr/                      # HR components
│   │   └── HRAnalyticsDashboard.tsx
│   ├── layout/                  # App layout
│   │   ├── AppLayout.tsx
│   │   ├── CommandPalette.tsx
│   │   ├── Header.tsx
│   │   └── Sidebar.tsx
│   ├── migration/               # Data migration
│   │   └── NextDayMigration.tsx
│   ├── pipeline/                # CRM pipeline
│   │   ├── PipelineKanban.tsx
│   │   └── PipelineFunnel.tsx
│   ├── revenue/                 # Revenue recognition
│   │   └── RevenueRecognitionSchedule.tsx
│   ├── settings/                # Settings
│   │   ├── AutoApprovalSettings.tsx
│   │   ├── DecisionDeskTabsSettings.tsx
│   │   └── ...
│   ├── treasury/                # Treasury
│   │   └── TreasuryManagement.tsx
│   └── ui/                      # Shadcn UI components
├── hooks/
│   ├── useAuth.tsx
│   ├── useAgentRuns.ts
│   ├── useAttendance.ts
│   ├── useAutoApprovalConfigs.ts
│   ├── useBanking.ts
│   ├── useBankingReconciliation.ts
│   ├── useBankingWithGL.ts
│   ├── useCOIntegration.ts
│   ├── useConsignment.ts
│   ├── useControlling.ts
│   ├── useCurrency.ts
│   ├── useDashboardStats.ts
│   ├── useDecisionDeskTabs.ts
│   ├── useDecisionLedger.ts
│   ├── useDecisionOverrides.ts
│   ├── useEmergencyContacts.ts
│   ├── useEmployeeDocuments.ts
│   ├── useExpenseClaims.ts
│   ├── useFinancialReports.ts
│   ├── useGeneralLedger.ts
│   ├── useHRAnalytics.ts
│   ├── useHRPayroll.ts
│   ├── useInventory.ts
│   ├── useInventoryReceipts.ts
│   ├── useNotifications.ts
│   ├── useOpportunities.ts
│   ├── usePayables.ts
│   ├── usePayslips.ts
│   ├── usePeriodClose.ts
│   ├── usePrecedentSearch.ts
│   ├── useProduction.ts
│   ├── usePurchaseRequisitions.ts
│   ├── useQuotations.ts
│   ├── useReceivables.ts
│   ├── useSalesForecasting.ts
│   ├── useServiceManagement.ts
│   ├── useTaxManagement.ts
│   ├── useTeamManagement.ts
│   ├── useTimeOff.ts
│   └── useTransactionDefaults.ts
├── integrations/
│   └── supabase/
├── lib/
│   ├── autoApproval.ts
│   ├── pdfExport.ts
│   ├── policyRules.ts
│   └── utils.ts
├── pages/
│   ├── Auth.tsx
│   ├── Banking.tsx
│   ├── Controlling.tsx
│   ├── CRM.tsx
│   ├── Currency.tsx
│   ├── DecisionDesk.tsx
│   ├── FinancialReports.tsx
│   ├── GeneralLedger.tsx
│   ├── Help.tsx
│   ├── HRPayroll.tsx
│   ├── Index.tsx
│   ├── Inventory.tsx
│   ├── Payables.tsx
│   ├── PeriodClose.tsx
│   ├── Production.tsx
│   ├── Receivables.tsx
│   ├── ServiceManagement.tsx
│   ├── Settings.tsx
│   └── TaxManagement.tsx
└── main.tsx

supabase/
├── config.toml
└── functions/
    ├── _shared/
    │   └── agentRunLogger.ts
    ├── agent-river/
    ├── anomaly-detector/
    ├── autonomous-approver/
    ├── generate-embedding/
    ├── global-search/
    ├── precedent-search/
    └── send-notification/
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon key |
| `OPENAI_API_KEY` | OpenAI API key (Edge Functions) |
| `RESEND_API_KEY` | Resend email API key |

---

## Key Features Summary

### Implemented Features (Phase 1-6 Complete)

| Feature | Status | Description |
|---------|--------|-------------|
| Multi-tenant architecture | ✅ | Organization-based data isolation |
| Role-based access control | ✅ | Admin, Moderator, User, Viewer roles |
| Order-to-Cash (O2C) | ✅ | Full sales cycle management |
| Procure-to-Pay (P2P) | ✅ | Full procurement cycle management |
| General Ledger | ✅ | Chart of accounts, journal entries |
| Financial Reports | ✅ | P&L, Balance Sheet, Cash Flow |
| Banking & Reconciliation | ✅ | Bank accounts, transactions, matching |
| Period Close Management | ✅ | Close tasks, checklists, tracking |
| CRM & Pipeline | ✅ | Opportunity management, Kanban/Funnel |
| Sales Analytics | ✅ | Win rates, trends, conversion analysis |
| Sales Forecasting | ✅ | AI-powered sales predictions |
| Agent River (AI) | ✅ | Context-aware AI assistant |
| Inventory Management | ✅ | Warehouses, stock, transactions |
| Production Planning | ✅ | BOMs, production orders, MRP |
| Controlling | ✅ | Cost centers, internal orders, budgets |
| Decision Ledger | ✅ | Full audit trail with AI decision records |
| Policy Engine | ✅ | Configurable approval policies |
| Precedent System | ✅ | Vector search for similar past decisions |
| Autonomous Approver | ✅ | AI batch approval processing |
| Anomaly Detection | ✅ | AI-powered unusual pattern detection |
| Agent Run Playback | ✅ | Step-by-step AI execution visualization |
| Entity Graph | ✅ | Decision-entity relationship visualization |
| Learn from Overrides | ✅ | AI learning from human corrections |
| **HR & Payroll** | ✅ | Full employee lifecycle, payroll, GL posting |
| **Tax Management** | ✅ | Tax codes, jurisdictions, rates, filing |
| **Multi-Currency** | ✅ | Exchange rates, revaluation, gain/loss |
| **OCR Bill Capture** | ✅ | AI document data extraction |
| **Flux Analysis** | ✅ | AI variance analysis |
| **AI Report Builder** | ✅ | Natural language report generation |
| **Multi-Book Accounting** | ✅ | Parallel GAAP/IFRS/Tax ledgers |
| **Intercompany Elimination** | ✅ | Auto-elimination with reconciliation |
| **Subscription Billing** | ✅ | Recurring billing and proration |
| **Revenue Recognition** | ✅ | ASC 606/IFRS 15 compliance |
| **Treasury Management** | ✅ | Cash pooling, investment tracking |
| **SOX Controls** | ✅ | Control matrix, testing, evidence |
| **NextDay Migration** | ✅ | AI-powered data migration wizard |
| **AI Categorizer** | ✅ | ML-based transaction categorization |
| **Allocations Engine** | ✅ | Automated cost allocation with distribution rules (Phase 5) |
| **Prepaid Expenses** | ✅ | Prepaid expense tracking with amortization (Phase 5) |
| **Predictive Analytics** | ✅ | AI cash flow and revenue forecasting (Phase 5) |
| **Inventory COGS** | ✅ | Full inventory movement tracking and COGS reporting (Phase 6) |
| **AI Contract Analyzer** | ✅ | Contract term extraction and compliance scoring (Phase 6) |
| **Scheduled Reports** | ✅ | Automated report scheduling and email delivery (Phase 7) |
| **Notification Engine** | ✅ | Centralized email notifications for workflows (Phase 7) |

### Implemented Features (Phase 7 Complete)

#### Phase 7: Integrations & Automation

| Feature | Status | Description |
|---------|--------|-------------|
| **Scheduled Reports** | ✅ | Auto-email financial report packages |
| Report Scheduler | ✅ | Configure daily/weekly/monthly report schedules |
| Report Processor | ✅ | Edge function for automated report generation |
| **Email Notifications** | ✅ | Centralized notification engine |
| Approval Notifications | ✅ | Email on PO/Bill/Time-off approval/rejection |
| Expense Claim Notifications | ✅ | Email on expense claim status changes |
| Payment Reminders | ✅ | Email payment reminder notifications |

### Planned Features (Phase 8+ Roadmap)

#### Phase 8: External Integrations

| Feature | Status | Description |
|---------|--------|-------------|
| **Plaid Integration** | 🔲 | Real bank account connectivity via Plaid API |
| Bank Link Token | 🔲 | Plaid Link frontend integration |
| Transaction Sync | 🔲 | Automated bank transaction import |
| **Third-Party Connectors** | 🔲 | Integration framework for CRM/Payroll/E-commerce |
| Integration Hub | 🔲 | Available integrations management UI |
| Salesforce Connector | 🔲 | Sync customers and opportunities |
| Shopify Connector | 🔲 | Sync orders from e-commerce |
| **Public REST API** | 🔲 | OpenAPI/Swagger documentation |
| API Documentation | 🔲 | Interactive API docs at /api-docs |
| API Key Management | 🔲 | Rate limiting and access control |

#### Future Roadmap

| Feature | Status | Description |
|---------|--------|-------------|
| Lease Accounting | 🔲 | ASC 842 ROU assets and liabilities |
| FX Hedging | 🔲 | Currency hedge position tracking |
| Benefits Administration | 🔲 | Employee benefits enrollment |
| Performance Reviews | 🔲 | Review cycles and goals |

---

## Database Tables (Phase 5-7)

### Phase 5 Tables

| Table | Purpose |
|-------|---------|
| `allocation_rules` | Cost allocation rule definitions |
| `allocation_rule_targets` | Distribution targets per rule |
| `allocation_runs` | Allocation execution history |
| `prepaid_expenses` | Prepaid expense master data |
| `amortization_schedule` | Period-by-period amortization entries |

### Phase 6 Tables

| Table | Purpose |
|-------|---------|
| `inventory_movements` | Stock movement transactions |
| `cash_flow_predictions` | AI-generated cash forecasts |
| `revenue_predictions` | AI-generated revenue forecasts |

### Phase 7 Tables

| Table | Purpose |
|-------|---------|
| `bank_connections` | Plaid bank connection credentials |
| `scheduled_reports` | Report schedule configuration |
| `integrations` | Third-party integration configs |
| `integration_sync_logs` | Integration sync history |

---

## Legend

- ✅ Implemented and available
- 🔲 Planned for future release

---

## Version History

| Version | Date | Description |
|---------|------|-------------|
| 1.0 | Dec 2025 | Initial release - Core ERP modules |
| 2.0 | Jan 2026 | Phase 1-4 Advanced Features complete |
| 2.1 | Jan 2026 | Phase 5-6 Financial Automation complete |
| 2.2 | Jan 2026 | Phase 7 Integrations & Automation complete |
| 3.0 | TBD | Phase 8+ External Integrations |

### Phase 1-4 Summary (January 2026)

**Phase 1 - AI Document Automation**:
- OCR Bill Capture with confidence scoring
- AI Flux Analysis for variance insights
- AI Report Builder for natural language queries

**Phase 2 - Advanced Accounting**:
- Subscription Billing with proration
- Multi-Book Accounting (GAAP/IFRS/Tax)
- Treasury Management suite

**Phase 3 - Compliance & Migration**:
- SOX Controls matrix and evidence library
- NextDay Migration wizard
- Enhanced intercompany elimination

**Phase 4 - AI Intelligence**:
- AI Transaction Categorizer with learning
- Bank Institution Selector (Plaid-style)
- Enhanced autonomous processing

### Phase 5-7 Summary (Complete)

**Phase 5 - Core Financial Automation** ✅:
- Allocations Engine with rule-based distribution
- Prepaid Expenses & Amortization Schedules
- Real-time Budget Variance tracking with GL integration

**Phase 6 - Inventory & Predictions** ✅:
- Full Inventory COGS tracking with stock movements
- AI Predictive Analytics (cash flow, revenue)
- AI Contract Compliance Analyzer

**Phase 7 - Integrations & Automation** ✅:
- Scheduled Reports manager with email delivery
- Centralized notification engine for approval workflows
- Report processor edge function

### Phase 8+ Roadmap (Planned)

**Phase 8 - External Integrations**:
- Real Plaid bank feed integration
- Third-party connector framework (Salesforce, Shopify)
- Public REST API with documentation
