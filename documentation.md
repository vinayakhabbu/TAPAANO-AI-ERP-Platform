# TAPAANO AI ERP Platform Documentation

## Overview

A comprehensive, multi-tenant financial management system built for modern enterprises. The application provides end-to-end financial operations management including Order-to-Cash (O2C), Procure-to-Pay (P2P), General Ledger, Banking, Period Close, CRM, Production, Controlling, and Service Management modules with an integrated context-aware AI Agent called "Agent River".

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

**Data Sources**:

- Aggregated from invoices, bills, bank accounts, close tasks

---

### 2. Accounts Receivable - O2C (`/ar`)

**Purpose**: Manage the Order-to-Cash cycle

**Sub-modules**:

#### Customers

- Create, view, edit customer master data
- Fields: Name, Email, Phone, Address, Payment Terms, Credit Limit

#### Sales Orders

- Create sales orders with line items
- Status workflow: `draft` → `pending_approval` → `approved` → `partially_shipped` → `shipped` → `cancelled`
- Link to customer and revenue accounts
- Track requested delivery dates

#### Shipments

- Create shipments against approved sales orders
- Track shipped quantities per line item
- Carrier and tracking number management
- Auto-update sales order shipped quantities
- **Auto-update inventory stock** (decrement on shipment)

#### Invoices

- Create invoices linked to sales orders/shipments
- Status workflow: `draft` → `sent` → `paid` / `overdue` / `cancelled`
- Track payment amounts and balance due
- Tax calculation support

---

### 3. Procure to Pay (`/ap`)

**Purpose**: Manage the Procure-to-Pay cycle

**Sub-modules**:

#### Vendors

- Create, view, edit vendor master data
- Fields: Name, Email, Phone, Address, Payment Terms

#### Purchase Orders

- Create POs with line items
- Status workflow: `draft` → `pending_approval` → `approved` → `partially_received` → `received` → `cancelled`
- Link to vendor and expense accounts
- Track expected delivery dates

#### Goods Receipts

- Receive goods against approved POs
- Track received quantities per line item
- Auto-update PO received quantities
- **Auto-update inventory stock** (increment on receipt)

#### Bills

- Create bills linked to POs/Goods Receipts
- Status workflow: `draft` → `pending` → `paid` / `overdue` / `cancelled`
- Three-way matching (PO ↔ GR ↔ Bill)
- Match status tracking

#### Payment Runs

- Batch payment processing
- Status workflow: `draft` → `pending_approval` → `approved` → `processing` → `completed` / `failed`
- Payment method selection (ACH, Check, Wire)
- Bank account selection

---

### 4. General Ledger (`/gl`)

**Purpose**: Core accounting and financial reporting

**Features**:

#### Chart of Accounts

- Hierarchical account structure
- Account types: `asset`, `liability`, `equity`, `revenue`, `expense`
- Account codes and parent/child relationships

#### Journal Entries

- Manual journal entry creation
- Status workflow: `draft` → `posted` → `reversed`
- Balanced debit/credit validation
- Entry memo and line-level memos

#### Trial Balance

- Real-time account balance calculation
- Debit/credit totals by account

---

### 5. Financial Reports (`/reports`)

**Purpose**: Financial statement generation and analysis

**Features**:

#### Income Statement (P&L)

- Period-based revenue and expense reporting
- Account-level detail with totals
- Net income calculation
- Quick period selection (This Month, Last 3 Months, YTD)

#### Balance Sheet

- Assets, Liabilities, and Equity sections
- Side-by-side comparison layout
- Balance validation indicator
- Current period net income inclusion

#### Cash Flow Statement

- Operating, Investing, Financing activities
- Net cash flow calculation
- Beginning and ending cash positions

#### Report Features

- Customizable date range selection
- PDF export capability
- Real-time data from posted journal entries

---

### 6. Banking (`/banking`)

**Purpose**: Bank account and transaction management

**Features**:

#### Bank Accounts

- Multiple bank accounts per entity
- Track current balances
- Link to GL cash accounts
- Bank details (name, routing, account number)

#### Bank Transactions

- Import and categorize transactions
- Status workflow: `pending` → `matched` → `reconciled`
- Auto-match to invoices and bills
- Suggested account coding

---

### 7. Period Close (`/close`)

**Purpose**: Month-end and period-end close management

**Features**:

#### Close Tasks

- Configurable close checklist
- Status workflow: `pending` → `in_progress` → `complete` / `overdue`
- Task assignment to users
- Due date tracking
- Completion timestamps

#### Period Management

- Period-based task organization (e.g., "2024-01")
- Progress tracking and reporting

---

### 8. CRM (`/crm`)

**Purpose**: Customer Relationship Management and Sales Pipeline

**Features**:

#### Pipeline Management

- Visual Kanban board for opportunity tracking
- Funnel view for conversion analysis
- Drag-and-drop stage transitions
- Stage workflow: `lead` → `qualified` → `proposal` → `negotiation` → `closed_won` / `closed_lost`

#### Opportunity Management

- Track sales opportunities with expected values
- Probability-weighted pipeline calculations
- Expected close date tracking
- Customer linkage

#### Sales Analytics

- Key Performance Metrics (Win Rate, Avg Deal Size, Sales Cycle, Pipeline Velocity)
- Revenue & Deals Trend charts
- Pipeline Distribution (Pie chart)
- Stage Conversion Rates (Bar chart)
- Performance by Source analysis
- Quick Stats overview

#### Sales Forecasting

- AI-powered sales predictions
- Period-based forecasting
- Weighted pipeline analysis

---

### 9. Agent River (AI Assistant)

**Purpose**: Context-aware AI assistant for natural language queries across all modules

**Capabilities**:

- **Context-Aware**: Automatically adapts to current page/module
- **Multi-Domain**: Supports CRM, Finance, Inventory, Production, Controlling, Service contexts
- **Tool-Enabled**: Uses OpenAI function calling for database queries
- Query any master or transaction data
- Get summaries and metrics
- Answer questions about pipeline, AR aging, AP status, cash position, inventory levels
- Natural language to database query translation

**Context Modes**:
| Route | Context | Capabilities |
|-------|---------|--------------|
| `/crm` | CRM & Sales | Pipeline summary, at-risk deals, win/loss analysis, opportunity queries |
| `/receivables`, `/payables`, `/banking`, `/general-ledger` | Finance | AR/AP summaries, cash position, invoice/bill queries |
| `/inventory` | Inventory | Stock levels, warehouse summary, low stock alerts |
| `/production` | Production | Production orders, capacity, BOM queries |
| `/controlling` | Controlling | Cost centers, internal orders, budgets, fixed assets, cash flow forecasts, project costs |
| `/service` | Service | Service contracts, warranties, service calls, field visits, service stats |
| Other routes | General | Cross-module queries and assistance |

**Technical Implementation**:

- Edge Function: `unified-agent`
- Model: GPT-4o-mini with function calling
- UI Component: `AIChatBar` (sidebar panel)
- Org-scoped context awareness
- Suggested prompts adapt to current context

**AI Tools Available**:
| Tool | Context | Description |
|------|---------|-------------|
| `get_pipeline_summary` | CRM | Pipeline metrics by stage |
| `get_opportunities` | CRM | Query opportunities with filters |
| `get_at_risk_deals` | CRM | Identify stalled or closing-soon deals |
| `analyze_win_loss` | CRM | Win/loss patterns and rates |
| `get_ar_summary` | Finance | AR aging and outstanding totals |
| `get_ap_summary` | Finance | AP outstanding and due amounts |
| `get_cash_position` | Finance | Total cash across bank accounts |
| `get_stock_levels` | Inventory | Current stock quantities |
| `get_warehouse_summary` | Inventory | Warehouse capacity and status |
| `get_cost_centers` | Controlling | Query cost centers with hierarchy |
| `get_internal_orders` | Controlling | Query internal orders by type/status |
| `get_co_documents` | Controlling | Get CO documents with journal details |
| `get_cost_center_balance` | Controlling | Calculate cost center balance by period |
| `get_budget_variance` | Controlling | Analyze budget vs actual variance |
| `get_fixed_assets` | Controlling | Query fixed assets with depreciation |
| `get_cash_flow_forecast` | Controlling | Get cash flow forecasts by category |
| `get_project_costs` | Controlling | Query project costs and budgets |
| `get_service_contracts` | Service | Query service contracts with status/renewal info |
| `get_warranties` | Service | Query warranties with expiration info |
| `get_service_calls` | Service | Query service calls/tickets by status/priority |
| `get_field_visits` | Service | Query scheduled field service visits |
| `get_service_stats` | Service | Service management KPIs and stats |

---

### 10. Decision Desk (`/decisions`)

**Purpose**: Audit trail and analytics for all approval decisions, exceptions, and policy overrides

**Features**:

#### Decision Ledger

- Captures every meaningful action with full context
- Records: decision type, input snapshot, policy evaluation, approval status, rationale, and what changed
- Linked entities for cross-referencing

#### Decision Types Tracked

| Decision Type | Description |
|---------------|-------------|
| `po_approval` / `po_rejection` | Purchase order approvals |
| `payment_approval` / `payment_rejection` | Payment run approvals |
| `payment_processing` | Payment execution |
| `journal_post` / `journal_reverse` | Journal entry posting/reversal |
| `bill_status_change` | Bill status updates |
| `requisition_approval` / `requisition_rejection` | Purchase requisition approvals |

#### Policy Evaluation Engine

- **Structured Rule Capture**: Each decision records which policy rules were checked with pass/fail/warning results
- **Threshold Tracking**: Rules include thresholds and actual values (e.g., PO limit $10K, actual $15K → warning)
- **Exception Routes**: When rules fail, captures required approver role and allowed reason codes

**Policy Rules Implemented**:
| Rule | Threshold | Result |
|------|-----------|--------|
| `po_amount_limit` | $10,000 | Warning if exceeded |
| `po_high_value` | $50,000 | Fail - requires executive approval |
| `payment_amount_limit` | $25,000 | Warning if exceeded |
| `wire_transfer_limit` | $100,000 | Fail - requires dual approval |
| `req_amount_limit` | $5,000 | Warning - exceeds auto-approval |
| `memo_required` | 5+ chars | Warning if missing |

#### Precedent Reference Tracking

- Automatically finds similar past decisions when making new ones
- Records precedent references with similarity scores
- Enables "What did we do last time?" queries

#### Policy Analytics Dashboard

- **Rule Compliance Chart**: Pass/fail/warning breakdown by rule
- **Override Rate Analysis**: Which decision types override policies most often
- **Trend Visualization**: Approvals, rejections, and overrides over time (14-day chart)
- **Top Overridden Rules**: Identifies rules most frequently bypassed

#### Decision Card UI

- Collapsible decision cards with full details
- State at decision time (input snapshot)
- What changed (before → after diffs)
- Rationale capture
- Linked entities
- Approval metadata (who, when, via what channel)

#### Export & Search

- CSV export of filtered decisions
- Search across decision types, rationales, document numbers
- Filter by type, status, date range

**Technical Implementation**:
- `decision_traces` table stores all decision records
- `decision_entities` table links related entities
- `src/lib/policyRules.ts` - Policy evaluation engine
- `src/components/decisions/PolicyAnalyticsChart.tsx` - Analytics dashboard
- Hooks: `useDecisionLedger.ts`, `useApprovals.ts`, `usePurchaseRequisitions.ts`

---

## Database Schema

### Master Data Tables

| Table           | Description                   |
| --------------- | ----------------------------- |
| `organizations` | Tenant/company records        |
| `entities`      | Legal entities/business units |
| `profiles`      | User profiles linked to auth  |
| `user_roles`    | RBAC role assignments         |
| `customers`     | Customer master data          |
| `vendors`       | Vendor master data            |
| `accounts`      | Chart of accounts             |
| `bank_accounts` | Bank account master data      |

### Transaction Tables

| Table                  | Description              |
| ---------------------- | ------------------------ |
| `sales_orders`         | Sales order headers      |
| `sales_order_lines`    | Sales order line items   |
| `shipments`            | Shipment headers         |
| `shipment_lines`       | Shipment line items      |
| `invoices`             | AR invoice records       |
| `purchase_orders`      | Purchase order headers   |
| `purchase_order_lines` | PO line items            |
| `goods_receipts`       | GR headers               |
| `goods_receipt_lines`  | GR line items            |
| `bills`                | AP bill records          |
| `payment_runs`         | Payment batch headers    |
| `payment_run_items`    | Payment batch line items |
| `journal_entries`      | GL journal headers       |
| `journal_lines`        | GL journal line items    |
| `bank_transactions`    | Bank transaction records |
| `close_tasks`          | Period close tasks       |

### AI/Chat Tables

| Table           | Description                     |
| --------------- | ------------------------------- |
| `chat_messages` | AI copilot conversation history |
| `ai_audit_logs` | AI action audit trail           |

### Decision Ledger Tables

| Table               | Description                                      |
| ------------------- | ------------------------------------------------ |
| `decision_traces`   | Decision audit records with policy evaluations   |
| `decision_entities` | Linked entities for each decision trace          |

---

## Security Model

### Row Level Security (RLS)

All tables are protected by RLS policies that enforce:

- **Organization Isolation**: Users can only access data belonging to their organization
- **Role-Based Permissions**: Different operations allowed based on user role

### Key RLS Patterns

```sql
-- Standard org-scoped SELECT
USING (org_id = get_user_org_id())

-- Standard org-scoped INSERT
WITH CHECK (org_id = get_user_org_id())

-- Nested table access (e.g., line items)
USING (EXISTS (
  SELECT 1 FROM parent_table p
  WHERE p.id = child_table.parent_id
  AND p.org_id = get_user_org_id()
))
```

### Database Functions

| Function                  | Purpose                           |
| ------------------------- | --------------------------------- |
| `get_user_org_id()`       | Returns current user's org_id     |
| `get_user_role(user_id)`  | Returns user's highest role       |
| `has_role(user_id, role)` | Checks if user has specific role  |
| `handle_new_user()`       | Trigger for new user provisioning |
| `update_updated_at()`     | Trigger for timestamp updates     |

---

## API / Edge Functions

### `unified-agent`

- **Purpose**: Context-aware AI agent for all modules
- **Endpoint**: `/functions/v1/unified-agent`
- **Method**: POST
- **Auth**: Not required (public)
- **Features**: Multi-context support (CRM, Finance, Inventory, Production), OpenAI function calling

### `crm-agent`

- **Purpose**: CRM-specific AI agent (legacy)
- **Endpoint**: `/functions/v1/crm-agent`
- **Method**: POST
- **Auth**: Not required (public)

### `finance-chat`

- **Purpose**: Finance AI chat interface
- **Endpoint**: `/functions/v1/finance-chat`
- **Method**: POST
- **Auth**: Required (Bearer token)

### `finance-agents`

- **Purpose**: Finance AI agent actions and tools
- **Endpoint**: `/functions/v1/finance-agents`
- **Method**: POST
- **Auth**: Not required (public)

---

## File Structure

```
src/
├── components/
│   ├── ai/                 # AI Agent components
│   │   └── AIChatBar.tsx   # Context-aware AI sidebar
│   ├── analytics/          # Analytics components
│   │   └── SalesAnalytics.tsx
│   ├── crm/                # CRM-specific components
│   ├── dashboard/          # Dashboard widgets
│   ├── forecasting/        # Forecasting components
│   ├── forms/              # Data entry forms
│   ├── layout/             # App layout components
│   ├── pipeline/           # Pipeline visualization
│   │   ├── PipelineKanban.tsx
│   │   └── PipelineFunnel.tsx
│   └── ui/                 # Shadcn UI components
├── hooks/
│   ├── useAuth.tsx         # Authentication hook
│   ├── useBanking.ts       # Banking data hook
│   ├── useCRMAgent.ts      # CRM AI agent hook
│   ├── useGeneralLedger.ts # GL data hook
│   ├── useOpportunities.ts # CRM opportunities hook
│   ├── usePayables.ts      # AP data hook
│   ├── usePeriodClose.ts   # Close data hook
│   ├── useQuotations.ts    # Quotations hook
│   ├── useReceivables.ts   # AR data hook
│   └── useSalesForecasting.ts # Forecasting hook
├── integrations/
│   └── supabase/           # Supabase client & types
├── lib/
│   ├── pdfExport.ts        # PDF generation utilities
│   └── utils.ts            # Utility functions
├── pages/
│   ├── Auth.tsx            # Login/signup page
│   ├── Banking.tsx         # Banking module
│   ├── CRM.tsx             # CRM module
│   ├── FinancialReports.tsx # Reports module
│   ├── GeneralLedger.tsx   # GL module
│   ├── Index.tsx           # Dashboard
│   ├── Inventory.tsx       # Inventory module
│   ├── Payables.tsx        # Procure to Pay module
│   ├── PeriodClose.tsx     # Close module
│   ├── Production.tsx      # Production module
│   ├── Receivables.tsx     # AR module
│   └── Settings.tsx        # User settings
└── main.tsx                # App entry point

supabase/
├── config.toml             # Supabase configuration
└── functions/
    ├── crm-agent/          # CRM AI agent
    ├── finance-agents/     # Finance AI agents
    ├── finance-chat/       # Chat edge function
    └── unified-agent/      # Context-aware unified AI agent
```

---

## Environment Variables

| Variable                        | Description                     |
| ------------------------------- | ------------------------------- |
| `VITE_SUPABASE_URL`             | Supabase project URL            |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon key               |
| `OPENAI_API_KEY`                | OpenAI API key (Edge Functions) |

---

## Key Features Summary

### Implemented Features

| Feature                   | Status | Description                                 |
| ------------------------- | ------ | ------------------------------------------- |
| Multi-tenant architecture | ✅     | Organization-based data isolation           |
| Role-based access control | ✅     | Admin, Moderator, User, Viewer roles        |
| Order-to-Cash (O2C)       | ✅     | Full sales cycle management                 |
| Procure-to-Pay (P2P)      | ✅     | Full procurement cycle management           |
| General Ledger            | ✅     | Chart of accounts, journal entries          |
| Financial Reports         | ✅     | P&L, Balance Sheet, Cash Flow               |
| Banking & Reconciliation  | ✅     | Bank accounts, transactions, matching       |
| Period Close Management   | ✅     | Close tasks, checklists, tracking           |
| **CRM & Pipeline**        | ✅     | Opportunity management, Kanban/Funnel views |
| **Sales Analytics**       | ✅     | Win rates, trends, conversion analysis      |
| **Sales Forecasting**     | ✅     | AI-powered sales predictions                |
| **Agent River (AI)**      | ✅     | Context-aware AI assistant                  |
| Inventory Management      | ✅     | Warehouses, stock, transactions             |
| Production Planning       | ✅     | BOMs, production orders, MRP                |
| Dark/Light Theme          | ✅     | User preference theming                     |
| Responsive Design         | ✅     | Mobile-friendly UI                          |
| Real-time Updates         | ✅     | Live data synchronization                   |
| **Decision Desk**         | ✅     | Audit trail with policy analytics           |

---

## Feature Roadmap

### Financial Management

#### Accounting (Current)

| Feature             | Status | Description                           |
| ------------------- | ------ | ------------------------------------- |
| Journal Entries     | ✅     | Create, post, reverse journal entries |
| Accounts Receivable | ✅     | Invoice management, payment tracking  |
| Accounts Payable    | ✅     | Bill management, payment processing   |
| Chart of Accounts   | ✅     | Hierarchical account structure        |
| Trial Balance       | ✅     | Real-time balance calculation         |

#### Financial Reporting (Current)

| Feature                | Status | Description                     |
| ---------------------- | ------ | ------------------------------- |
| Income Statement (P&L) | ✅     | Revenue, expenses, net income   |
| Balance Sheet          | ✅     | Assets, liabilities, equity     |
| Cash Flow Statement    | ✅     | Operating, investing, financing |
| Period Selection       | ✅     | Custom date range filtering     |
| PDF Export             | ✅     | Export reports to PDF           |

#### Controlling (`/controlling`) - ✅ Implemented

| Feature                  | Status | Description                                                          |
| ------------------------ | ------ | -------------------------------------------------------------------- |
| Cost Center Accounting   | ✅     | Allocate expenses to cost centers with hierarchy support             |
| Internal Orders          | ✅     | Track costs by internal orders (overhead, investment, accrual types) |
| CO Documents             | ✅     | Controlling documents linked to journal entries                      |
| Budget Control           | ✅     | Budget creation and variance analysis                                |
| Cash Flow Forecasting    | ✅     | Predict future cash flows with expected vs actual tracking           |
| Fixed Asset Management   | ✅     | Asset register, depreciation tracking, disposal management           |
| Project Cost Monitoring  | ✅     | Track costs by project with budget lines                             |
| Budget Variance Analysis | ✅     | Visual variance charts and reporting                                 |
| Agent River Integration  | ✅     | AI-powered controlling queries and analysis                          |

#### Decision Desk (`/decisions`) - ✅ Implemented

| Feature                    | Status | Description                                                    |
| -------------------------- | ------ | -------------------------------------------------------------- |
| Decision Ledger            | ✅     | Audit trail for all approval decisions                         |
| Policy Evaluation Capture  | ✅     | Store rules checked with pass/fail/warning results             |
| Precedent Reference        | ✅     | Log which past decisions influenced new ones                   |
| Policy Analytics Dashboard | ✅     | "Policy vs Reality" charts and override analysis               |
| Decision Card UI           | ✅     | Collapsible cards with snapshots, diffs, rationale             |
| CSV Export                 | ✅     | Export filtered decisions                                      |

#### Advanced Reporting (Planned)

| Feature | Status | Description |
| Cash Flow Statement | 🔲 | Statement of cash flows |
| Custom Report Builder | 🔲 | User-defined report templates |
| Real-time Dashboards | ✅ | Key metrics visualization |
| Audit Trail Reports | ✅ | Complete transaction history (via Decision Desk) |

---

### Sales & Customer Management

#### Sales Management (Current)

| Feature                 | Status | Description                    |
| ----------------------- | ------ | ------------------------------ |
| Customer Master Data    | ✅     | Store customer information     |
| Sales Orders            | ✅     | Create and manage sales orders |
| Shipment Tracking       | ✅     | Track deliveries and carriers  |
| Invoice Generation      | ✅     | Create invoices from orders    |
| Credit Limit Management | ✅     | Set customer credit limits     |

#### Sales Management (Planned)

| Feature                    | Status | Description                                                                                           |
| -------------------------- | ------ | ----------------------------------------------------------------------------------------------------- |
| **Opportunity Management** | ✅     | Track sales opportunities with pipeline stages (Lead → Qualified → Proposal → Negotiation → Won/Lost) |
| **Sales Pipeline**         | ✅     | Visual Kanban and Funnel pipeline tracking                                                            |
| **Sales Forecasting**      | ✅     | AI-powered sales predictions                                                                          |
| **Quotation Management**   | ✅     | Create, track quotes, and convert to sales orders                                                     |
| **Sales Analytics**        | ✅     | Win rates, trends, conversion analysis, performance metrics                                           |
| Mobile Sales App           | 🔲     | On-the-go sales management                                                                            |

#### Service Management (`/service`) - ✅ Implemented

| Feature                 | Status | Description                                                        |
| ----------------------- | ------ | ------------------------------------------------------------------ |
| Service Contracts       | ✅     | Manage service agreements with renewals and billing                |
| Warranty Tracking       | ✅     | Track product warranties with expiration alerts                    |
| Service Call Management | ✅     | Log, track, and respond to service requests with priority handling |
| Field Service           | ✅     | Schedule and manage on-site service visits                         |
| Agent River Integration | ✅     | AI-powered service queries and analysis                            |

#### Marketing (Planned)

| Feature             | Status | Description                    |
| ------------------- | ------ | ------------------------------ |
| Campaign Management | 🔲     | Create marketing campaigns     |
| Lead Management     | 🔲     | Track and nurture leads        |
| Campaign Analytics  | 🔲     | Measure campaign effectiveness |
| Email Integration   | 🔲     | Email campaign automation      |

---

### Purchasing & Inventory Control

#### Procurement (Current)

| Feature                   | Status | Description                                       |
| ------------------------- | ------ | ------------------------------------------------- |
| Vendor Master Data        | ✅     | Store vendor information                          |
| Purchase Orders           | ✅     | Create and manage POs                             |
| Goods Receipts            | ✅     | Record incoming goods                             |
| Three-Way Matching        | ✅     | PO ↔ GR ↔ Bill matching                         |
| Payment Runs              | ✅     | Batch payment processing                          |
| Document Linking          | ✅     | Link related documents                            |
| **Purchase Requisitions** | ✅     | Internal purchase requests with approval workflow |

#### Procurement (Planned)

| Feature                   | Status | Description                   |
| ------------------------- | ------ | ----------------------------- |
| Vendor Evaluation         | 🔲     | Rate and score vendors        |
| Blanket Purchase Orders   | 🔲     | Long-term purchase agreements |
| Multi-currency Purchasing | 🔲     | Buy in foreign currencies     |

#### Inventory Management (Current)

| Feature                  | Status | Description                            |
| ------------------------ | ------ | -------------------------------------- |
| Warehouse Management     | ✅     | Multiple warehouse support             |
| Bin Location Management  | ✅     | Sub-zone stock management              |
| Inventory Valuation      | ✅     | FIFO, LIFO, Average costing            |
| Stock Transfers          | ✅     | Inter-warehouse transfers              |
| Cycle Counting           | ✅     | Scheduled inventory counts             |
| Reorder Point Planning   | ✅     | Automatic replenishment alerts         |
| Serial/Batch Tracking    | ✅     | Track items by serial/batch            |
| Product Master Data      | ✅     | SKU, costs, tracking options           |
| Inventory Stock Tracking | ✅     | Real-time stock levels by warehouse    |
| Inventory Transactions   | ✅     | Full transaction history               |
| **P2P Integration**      | ✅     | Auto-update inventory on goods receipt |
| **O2C Integration**      | ✅     | Auto-update inventory on shipment      |

#### Inventory Management (Planned)

| Feature               | Status | Description                                      |
| --------------------- | ------ | ------------------------------------------------ |
| Consignment Inventory | ✅     | Manage consigned stock with vendor tracking      |
| Inventory Receipts    | ✅     | Direct inventory adjustments without PO/shipment |

---

### Production Planning (`/production`)

**Purpose**: Manufacturing operations and production planning with MTS/MTO support

#### Current Features

| Feature                        | Status | Description                                            |
| ------------------------------ | ------ | ------------------------------------------------------ |
| Bill of Materials (BOM)        | ✅     | Multi-level BOM with components and routing operations |
| Production Orders              | ✅     | Manufacturing order management with status workflow    |
| Material Requirements Planning | ✅     | MRP calculations to identify material shortages        |
| Capacity Planning              | ✅     | Work center scheduling and utilization tracking        |
| Shop Floor Control             | ✅     | Track production progress and operation status         |
| Work Center Management         | ✅     | Define production resources with capacity/efficiency   |
| Backflush Processing           | ✅     | Automatic material consumption on order completion     |
| AI Copilot Integration         | ✅     | Query production data via natural language             |
| **MTS/MTO Planning Strategy**  | ✅     | Make-to-Stock vs Make-to-Order production              |
| **Production Goods Receipts**  | ✅     | Post finished goods from production orders             |
| **Sales Order Linkage**        | ✅     | Link MTO production orders to sales orders             |
| **Stock Type Segmentation**    | ✅     | Unrestricted vs Sales Order Stock inventory            |

#### Planning Strategies

**Make-to-Stock (MTS)**

- Production for general inventory replenishment
- Goods receipts create `unrestricted` stock
- No sales order linkage required
- Available for any future customer orders

**Make-to-Order (MTO)**

- Production tied to specific customer orders
- Goods receipts create `sales_order_stock`
- Mandatory linkage to sales order and line item
- Reserved inventory for specific customer

#### Sub-modules

**Work Centers**

- Define production resources (machines, lines, stations)
- Set hourly rates, capacity per day, efficiency rates
- Track utilization and availability

**Bill of Materials**

- Multi-level BOM structure with components
- Routing operations with work center assignments
- Setup time and run time per unit
- Scrap rate calculations

**Production Orders**

- Create orders from BOMs
- Status workflow: `draft` → `planned` → `released` → `in_progress` → `partially_delivered` → `completed`
- Auto-generate components and operations from BOM
- Track planned vs confirmed quantities
- Optional sales order linkage for MTO
- Planning strategy badge display

**Production Goods Receipts**

- Post finished goods against production orders
- Automatic stock type determination based on planning strategy
- Updates production order confirmed quantity and status
- Updates inventory stock with correct stock type
- For MTO: Updates sales order delivered quantities

**MRP (Material Requirements Planning)**

- Run MRP to calculate material needs
- Identify shortages and planned order quantities
- Configurable planning horizon

**Capacity Planning**

- Generate capacity schedules for work centers
- Track planned hours vs available hours
- Identify overloaded work centers

**Shop Floor Control**

- View active production orders
- Track operation progress (pending → in_progress → completed)
- Record actual times vs planned

#### Business Rules

| Rule ID            | Description                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| BR-PLANNING-001    | Product planning strategy (MTS/MTO) drives production behavior                                 |
| BR-PROD-001        | MTO orders require sales order linkage; MTS orders must not have linkage                       |
| BR-GR-001          | Every goods receipt must be linked to a production order                                       |
| BR-GR-002          | MTS → unrestricted stock; MTO → sales order stock                                              |
| BR-GR-003          | Confirmed quantity tracks total goods received                                                 |
| BR-PROD-STATUS-001 | Status transitions: CREATED → RELEASED → IN_PROCESS → PARTIALLY_DELIVERED → DELIVERED → CLOSED |

#### Database Enhancements

| Table/Field                             | Description                       |
| --------------------------------------- | --------------------------------- |
| `products.planning_strategy`            | MTS or MTO planning strategy      |
| `production_orders.sales_order_id`      | Linked sales order for MTO        |
| `production_orders.sales_order_item_id` | Linked sales order line for MTO   |
| `production_orders.confirmed_quantity`  | Total goods received              |
| `production_goods_receipts`             | Goods receipts from production    |
| `inventory_stock.stock_type`            | Unrestricted or Sales Order Stock |
| `inventory_stock.sales_order_id`        | For reserved MTO stock            |

#### AI Copilot Tools

| Tool                            | Description                                    |
| ------------------------------- | ---------------------------------------------- |
| `get_production_goods_receipts` | Query production goods receipts with filtering |
| `get_inventory_by_stock_type`   | Get inventory segmented by stock type          |
| `get_mto_production_status`     | View MTO orders with sales order details       |

---

### Banking & Reconciliation

#### Current Features

| Feature                 | Status | Description                     |
| ----------------------- | ------ | ------------------------------- |
| Bank Account Management | ✅     | Multiple accounts per entity    |
| Transaction Recording   | ✅     | Manual transaction entry        |
| Invoice/Bill Matching   | ✅     | Match transactions to documents |
| Account Reconciliation  | ✅     | Reconcile bank statements       |

#### Planned Features

| Feature               | Status | Description                     |
| --------------------- | ------ | ------------------------------- |
| Bank Feed Integration | 🔲     | Automated transaction import    |
| Payment Processing    | ✅     | ACH, Check, Wire payments       |
| Auto-Matching Rules   | 🔲     | Rule-based transaction matching |
| Bank Statement Import | 🔲     | Import OFX/QFX/CSV files        |
| Positive Pay          | 🔲     | Check fraud prevention          |

---

### Additional Planned Features

#### Document Management

| Feature              | Status | Description                   |
| -------------------- | ------ | ----------------------------- |
| Document Attachments | 🔲     | Attach files to transactions  |
| Document Templates   | 🔲     | Customizable print layouts    |
| E-invoicing          | 🔲     | Electronic invoice exchange   |
| Digital Signatures   | 🔲     | Sign documents electronically |

#### Workflow & Automation

| Feature                | Status | Description                                                    |
| ---------------------- | ------ | -------------------------------------------------------------- |
| Approval Workflows     | ✅     | Submit, approve, reject for POs, Payment Runs, Journal Entries |
| Email Notifications    | 🔲     | Automated alerts                                               |
| Scheduled Reports      | 🔲     | Auto-generated reports                                         |
| Recurring Transactions | 🔲     | Automated recurring entries                                    |

#### Integrations

| Feature                | Status | Description                    |
| ---------------------- | ------ | ------------------------------ |
| API Access             | ✅     | RESTful API via Edge Functions |
| Webhook Support        | 🔲     | Real-time event notifications  |
| Third-party Connectors | 🔲     | External system integrations   |

---

## Legend

| Symbol | Meaning           |
| ------ | ----------------- |
| ✅     | Implemented       |
| 🔲     | Planned / Roadmap |
