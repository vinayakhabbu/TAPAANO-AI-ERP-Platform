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

- Edge Function: `agent-river` (orchestrating multi-agent system)
- Model: GPT-4o-mini with function calling
- UI Component: `AIChatBar` (global sidebar panel, available on all pages)
- Org-scoped context awareness
- Suggested prompts include CRM, Finance, Inventory, Production, and Service contexts

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

#### Auto-Approval Engine (Phase 2 Agentic)

AI-powered auto-approval for low-risk decisions that match policy and have strong precedent support.

**How It Works**:
1. When submitting for approval, system evaluates if auto-approval is possible
2. Calculates confidence score based on:
   - Policy evaluation (35% weight)
   - Precedent strength (30% weight) 
   - Amount within limits (20% weight)
   - Risk level (15% weight)
3. Auto-approves if confidence ≥75% AND:
   - All policies pass
   - Amount within auto-approval limit
   - At least 2 strong precedents (≥70% similarity)
   - Risk level is "low"

**Auto-Approval Thresholds by Decision Type**:
| Decision Type | Max Auto-Approval Amount | Min Precedents | Min Similarity |
|---------------|--------------------------|----------------|----------------|
| PO Approval | $5,000 | 2 | 75% |
| Payment Approval | $10,000 | 3 | 80% |
| Requisition Approval | $3,000 | 2 | 70% |
| Journal Post | No limit | 3 | 85% |

**Approval Channels**:
- `auto` - System auto-approved based on policy + precedent
- `human` - Routed for human review
- `escalated` - High-risk, requires senior approval

**Decision Desk Tracking**:
- Auto-approved decisions tagged with ⚡ "Auto" badge
- Separate stat card shows auto-approval count and rate
- Full audit trail captures auto-approval confidence and factors

#### Policy Analytics Dashboard

- **Rule Compliance Chart**: Pass/fail/warning breakdown by rule
- **Override Rate Analysis**: Which decision types override policies most often
- **Trend Visualization**: Approvals, rejections, and overrides over time (14-day chart)
- **Top Overridden Rules**: Identifies rules most frequently bypassed
- **Auto-Approval Rate**: Percentage of decisions handled automatically

#### Decision Card UI

- Collapsible decision cards with full details
- State at decision time (input snapshot)
- What changed (before → after diffs)
- Auto-approval indicator and confidence score
- Rationale capture
- Linked entities
- Approval metadata (who, when, via what channel)

#### Export & Search

- CSV export of filtered decisions
- Search across decision types, rationales, document numbers
- Filter by type, status, date range

#### Agent Runs Trace Playback

- Replay AI agent execution steps
- Timeline view of each step with duration
- View input/output data for each step
- Error tracking and debugging

#### Entity Graph Visualization

- Visual graph showing decision-entity relationships
- Interactive nodes for decisions and linked entities
- Relationship mapping across the organization

#### "This becomes precedent" Checkbox

- Mark any decision as a precedent for future reference
- Add scope (global, department, personal) and notes
- Precedents influence future auto-approval confidence

#### Referenced Precedents in Traces

- Each auto-approval decision stores which precedents were consulted
- Similarity scores and notes for each referenced precedent
- Full traceability of AI decision-making

**Technical Implementation**:
- `decision_traces` table stores all decision records with `approval_channel`, `is_precedent`, `precedent_scope`, `precedent_notes`, `precedents_referenced`
- `decision_entities` table links related entities
- `agent_runs` and `agent_run_steps` tables for AI execution playback
- `src/lib/policyRules.ts` - Policy evaluation engine
- `src/lib/autoApproval.ts` - Auto-approval engine with confidence scoring
- `src/components/decisions/PolicyAnalyticsChart.tsx` - Analytics dashboard
- `src/components/decisions/AutonomousApprover.tsx` - Phase 3 autonomous batch processing
- `src/components/decisions/AgentRunPlayback.tsx` - Agent execution timeline
- `src/components/decisions/EntityGraph.tsx` - Decision-entity relationship graph
- `src/components/decisions/PrecedentCheckbox.tsx` - Mark decisions as precedents
- `src/components/decisions/PrecedentExplorer.tsx` - Search and browse precedents
- `supabase/functions/autonomous-approver/` - Backend for autonomous processing
- `supabase/functions/precedent-search/` - Vector/text search for precedents
- Hooks: `useDecisionLedger.ts`, `useApprovals.ts`, `usePurchaseRequisitions.ts`, `useAgentRuns.ts`, `usePrecedentSearch.ts`

#### Autonomous Approver (Phase 3 Full Autonomy)

AI-powered batch processor that autonomously handles pending approvals without human intervention.

**Features**:
- **Preview Mode**: See all pending items with confidence scores before execution
- **Execute Mode**: Batch auto-approve all eligible items
- **Auto-Refresh**: Optionally monitor for new pending items every 30 seconds
- **Factor Breakdown**: Visual display of policy, precedent, amount, and risk factors

**Processing Logic**:
1. Fetches all pending approvals (POs, Payment Runs, Requisitions)
2. Evaluates each against policy rules and precedent history
3. Calculates confidence score for each candidate
4. In execute mode: auto-approves eligible items and records decision traces
5. Routes non-eligible items for human review

**API Endpoint**: `POST /functions/v1/autonomous-approver`
```json
{
  "org_id": "uuid",
  "mode": "preview" | "execute",
  "types": ["purchase_order", "payment_run", "purchase_requisition"]
}
```

**Response**:
```json
{
  "processed": 5,
  "autoApproved": 2,
  "routed": 3,
  "errors": 0,
  "candidates": [
    {
      "id": "uuid",
      "type": "purchase_order",
      "identifier": "PO-001",
      "amount": 2500,
      "confidence": 85,
      "canAutoApprove": true,
      "reason": "Auto-approved: 85% confidence, 3 strong precedents"
    }
  ]
}
```

#### Natural Language Approvals (Agent River Integration)

Approve or reject documents using natural language commands through Agent River.

**Capabilities**:
- Find pending approvals by type
- Approve/reject individual POs, Payment Runs, and Requisitions
- Bulk approve multiple documents at once
- Get approval status summaries

**Example Commands**:
- "Show me all pending purchase orders"
- "Approve PO-001"
- "Reject payment run PR-005 because budget exceeded"
- "Bulk approve all requisitions under $1,000"

**Technical Implementation**:
- `approvals_agent` in `agent-river` edge function
- Tools: `find_pending_approvals`, `approve_document`, `reject_document`, `bulk_approve`

#### Learn from Overrides

System learns from human overrides to improve future auto-approval accuracy.

**How It Works**:
1. When a human overrides an auto-approved or auto-rejected decision, it's recorded in `decision_overrides`
2. System tracks override patterns by decision type and source
3. Confidence adjustments are calculated based on override frequency
4. Future auto-approval confidence scores are adjusted accordingly

**Override Types**:
| Type | Description |
|------|-------------|
| `approval_to_rejection` | Human rejected an auto-approved item |
| `rejection_to_approval` | Human approved an auto-rejected item |
| `confidence_override` | Human adjusted confidence threshold |

**Confidence Adjustment Formula**:
- Base adjustment starts at 1.0 (neutral)
- Each override reduces confidence by calculated factor
- More overrides = lower future confidence for similar decisions
- Adjustments are recalculated periodically

**Database Tables**:
| Table | Description |
|-------|-------------|
| `decision_overrides` | Records each human override with reason |
| `confidence_adjustments` | Stores learned adjustments per decision type |

#### Scheduled Processing

Autonomous approver runs on a schedule to process pending items automatically.

**Schedule Configuration**:
- **Frequency**: Hourly (via `pg_cron`)
- **Scope**: All pending POs, Payment Runs, and Requisitions
- **Mode**: Execute (auto-approves eligible items)

**Technical Implementation**:
- Uses PostgreSQL `pg_cron` and `pg_net` extensions
- Cron job: `autonomous-approver-hourly`
- Calls `autonomous-approver` edge function with `mode: "execute"`

**Cron Schedule**:
```sql
SELECT cron.schedule(
  'autonomous-approver-hourly',
  '0 * * * *',  -- Every hour at minute 0
  $$ SELECT net.http_post(...) $$
);
```

#### Anomaly Detection

AI-powered detection of unusual patterns in approval decisions.

**Anomaly Types Detected**:
| Anomaly | Description | Threshold |
|---------|-------------|-----------|
| `large_po` | Unusually large purchase order | > $50,000 |
| `rapid_approval` | Suspiciously fast approval | < 1 minute |
| `unusual_vendor` | First-time or rarely-used vendor | < 3 historical POs |
| `budget_exceeded` | Approval exceeds budget | > 100% of budget |
| `off_hours_approval` | Approval outside business hours | Before 6am or after 10pm |
| `stalled_approval` | Pending too long without action | > 7 days |
| `high_override_rate` | Frequent human overrides | > 30% override rate |

**Severity Levels**:
- 🔴 **Critical**: Requires immediate attention
- 🟡 **Warning**: Should be reviewed
- 🔵 **Info**: For awareness only

**API Endpoint**: `POST /functions/v1/anomaly-detector`
```json
{
  "org_id": "uuid",
  "lookback_days": 30
}
```

**Response**:
```json
{
  "anomalies": [
    {
      "id": "uuid",
      "type": "large_po",
      "severity": "warning",
      "title": "Large Purchase Order",
      "description": "PO-001 for $75,000 exceeds normal threshold",
      "source_type": "purchase_order",
      "source_id": "uuid",
      "detected_at": "2024-01-15T10:30:00Z",
      "metadata": { "amount": 75000, "threshold": 50000 }
    }
  ],
  "summary": {
    "total": 5,
    "critical": 1,
    "warning": 3,
    "info": 1
  }
}
```

**UI Component**: `AnomalyDetector.tsx` in Decision Desk "Anomaly Detection" tab

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

| Table                    | Description                                           |
| ------------------------ | ----------------------------------------------------- |
| `decision_traces`        | Decision audit records with policy evaluations        |
| `decision_entities`      | Linked entities for each decision trace               |
| `agent_runs`             | AI agent execution runs with status and timing        |
| `agent_run_steps`        | Individual steps within an agent run for playback     |
| `decision_overrides`     | Human overrides of AI decisions for learning     |
| `confidence_adjustments` | Learned confidence adjustments per decision type |

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

### `precedent-search`

- **Purpose**: Search for similar past decisions (precedents)
- **Endpoint**: `/functions/v1/precedent-search`
- **Method**: POST
- **Auth**: Not required (public)
- **Features**: Vector search (with OpenAI embeddings) and text search fallback

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

### `agent-river`

- **Purpose**: Orchestrating AI agent with multi-domain routing
- **Endpoint**: `/functions/v1/agent-river`
- **Method**: POST
- **Auth**: Not required (public)
- **Features**: Routes to specialized agents (CRM, Finance, Inventory, Approvals, etc.)

### `autonomous-approver`

- **Purpose**: Batch autonomous approval processing
- **Endpoint**: `/functions/v1/autonomous-approver`
- **Method**: POST
- **Auth**: Not required (public)
- **Features**: Preview/execute modes, confidence scoring, policy evaluation

### `anomaly-detector`

- **Purpose**: Detect unusual patterns in approval decisions
- **Endpoint**: `/functions/v1/anomaly-detector`
- **Method**: POST
- **Auth**: Not required (public)
- **Features**: Multiple anomaly types, severity levels, lookback period

### `global-search`

- **Purpose**: Cross-module search functionality
- **Endpoint**: `/functions/v1/global-search`
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
│   ├── decisions/          # Decision Desk components
│   │   ├── AgentRunPlayback.tsx     # Agent execution timeline
│   │   ├── AnomalyDetector.tsx      # Anomaly detection UI
│   │   ├── AutonomousApprover.tsx   # Batch approval UI
│   │   ├── EntityGraph.tsx          # Decision-entity graph
│   │   ├── PolicyAnalyticsChart.tsx # Policy analytics
│   │   ├── PrecedentCheckbox.tsx    # Mark as precedent UI
│   │   └── PrecedentExplorer.tsx    # Precedent search/browse
│   ├── forecasting/        # Forecasting components
│   ├── forms/              # Data entry forms
│   ├── layout/             # App layout components
│   ├── pipeline/           # Pipeline visualization
│   │   ├── PipelineKanban.tsx
│   │   └── PipelineFunnel.tsx
│   └── ui/                 # Shadcn UI components
├── hooks/
│   ├── useAuth.tsx         # Authentication hook
│   ├── useAgentRuns.ts     # Agent execution playback
│   ├── useBanking.ts       # Banking data hook
│   ├── useDecisionLedger.ts    # Decision audit trail
│   ├── useDecisionOverrides.ts # Override learning
│   ├── useGeneralLedger.ts # GL data hook
│   ├── useOpportunities.ts # CRM opportunities hook
│   ├── usePayables.ts      # AP data hook
│   ├── usePeriodClose.ts   # Close data hook
│   ├── usePrecedentSearch.ts # Precedent search
│   ├── useQuotations.ts    # Quotations hook
│   ├── useReceivables.ts   # AR data hook
│   └── useSalesForecasting.ts # Forecasting hook
├── integrations/
│   └── supabase/           # Supabase client & types
├── lib/
│   ├── autoApproval.ts     # Auto-approval engine
│   ├── pdfExport.ts        # PDF generation utilities
│   ├── policyRules.ts      # Policy evaluation engine
│   └── utils.ts            # Utility functions
├── pages/
│   ├── Auth.tsx            # Login/signup page
│   ├── Banking.tsx         # Banking module
│   ├── CRM.tsx             # CRM module
│   ├── DecisionDesk.tsx    # Decision audit & analytics
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
    ├── agent-river/        # Orchestrating multi-agent system
    ├── anomaly-detector/   # Anomaly detection
    ├── autonomous-approver/ # Batch autonomous approvals
    ├── global-search/      # Cross-module search
    └── precedent-search/   # Vector/text precedent search
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
| **AI OCR Bill Capture**   | ✅     | Drag-and-drop bill scanning with extraction |
| **AI Flux Analysis**      | ✅     | Period-over-period variance insights        |
| **AI Report Builder**     | ✅     | Natural language financial reports          |
| **Subscription Billing**  | ✅     | Recurring revenue with proration            |
| **Multi-Book Accounting** | ✅     | Parallel ledgers (GAAP, IFRS, Tax)          |
| **Treasury Management**   | ✅     | Cash pooling and investments                |
| **Bank Institution Selector** | ✅ | Plaid-style bank connection wizard          |
| **Revenue Recognition**   | ✅     | ASC 606/IFRS 15 5-step model                |
| **Intercompany Elimination** | ✅  | IC transaction matching and elimination     |
| **AI Transaction Categorization** | ✅ | ML-based account suggestions             |
| **SOX Controls**          | ✅     | Compliance matrix and deficiency tracking   |
| **NextDay Migration**     | ✅     | AI-assisted data migration wizard           |

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
| Auto-Approval Engine       | ✅     | AI-powered auto-approval for low-risk decisions                |
| Autonomous Approver        | ✅     | Batch autonomous processing without human intervention         |
| Natural Language Approvals | ✅     | Approve/reject via Agent River natural language commands       |
| Learn from Overrides       | ✅     | System learns from human overrides to improve accuracy         |
| Scheduled Processing       | ✅     | Hourly autonomous processing via pg_cron                       |
| Anomaly Detection          | ✅     | AI-powered detection of unusual approval patterns              |
| Agent Runs Playback        | ✅     | Replay AI agent execution steps with timeline view             |
| Entity Graph               | ✅     | Visual graph of decision-entity relationships                  |
| Precedent Checkbox         | ✅     | Mark decisions as precedents for future reference              |
| Referenced Precedents      | ✅     | Track which precedents influenced each decision                |
| Precedent Search           | ✅     | Vector and text search for similar past decisions              |

#### Advanced Reporting

| Feature | Status | Description |
| Cash Flow Statement | ✅ | Statement of cash flows |
| Custom Report Builder | ✅ | AI-powered natural language report builder |
| Real-time Dashboards | ✅ | Key metrics visualization |
| Audit Trail Reports | ✅ | Complete transaction history (via Decision Desk) |
| AI Flux Analysis | ✅ | Period-over-period variance analysis with AI insights |

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

#### Advanced Features

| Feature               | Status | Description                     |
| --------------------- | ------ | ------------------------------- |
| Bank Institution Selector | ✅ | Plaid-style bank connection wizard |
| Payment Processing    | ✅     | ACH, Check, Wire payments       |
| Auto-Matching Rules   | ✅     | Rule-based transaction matching |
| Bank Statement Import | ✅     | Import OFX/QFX/CSV files        |
| Positive Pay          | ✅     | Check fraud prevention          |

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

### AI-Powered Document Automation

#### OCR Bill Capture (`/payables` → Bills tab)

**Purpose**: Intelligent bill capture and data extraction using AI-powered OCR

**Features**:
| Feature | Status | Description |
|---------|--------|-------------|
| Drag-and-Drop Upload | ✅ | Upload bills via drag-and-drop or file browser |
| AI Field Extraction | ✅ | Automatic extraction of vendor, amounts, dates, line items |
| Confidence Scoring | ✅ | Confidence percentages for each extracted field |
| Field Verification | ✅ | Manual verification workflow with approve/reject |
| Processing Queue | ✅ | Visual queue showing processing, review, and approved bills |
| Multi-Format Support | ✅ | PDF, PNG, JPG file support |

**Technical Implementation**:
- Component: `src/components/bills/OCRBillCapture.tsx`
- Simulated OCR processing with confidence-based extraction
- Verification workflow with per-field approval

---

#### AI Flux Analysis (`/reports` → Flux Analysis)

**Purpose**: AI-powered period-over-period variance analysis with automated insights

**Features**:
| Feature | Status | Description |
|---------|--------|-------------|
| Variance Detection | ✅ | Identify significant account variances |
| Significance Threshold | ✅ | Configurable threshold (default ≥10%) |
| AI Explanations | ✅ | Automated explanations for each variance |
| AI Recommendations | ✅ | Actionable recommendations per variance |
| 6-Month Trend Chart | ✅ | Historical trend visualization |
| Executive Summary | ✅ | AI-generated executive summary |
| Period Comparison | ✅ | Prior period, prior year, budget comparisons |

**Technical Implementation**:
- Component: `src/components/analytics/FluxAnalysis.tsx`
- Recharts-based variance and trend visualizations
- AI-generated explanations with recommendation actions

---

#### AI Report Builder (`/reports` → Report Builder)

**Purpose**: Generate custom financial reports using natural language queries

**Features**:
| Feature | Status | Description |
|---------|--------|-------------|
| Natural Language Queries | ✅ | Type queries in plain English |
| Template Library | ✅ | Pre-built report templates |
| Sample Queries | ✅ | Quick-start query suggestions |
| Report History | ✅ | View and reuse generated reports |
| Multiple Report Types | ✅ | Summary, trend, comparison formats |
| Category Filtering | ✅ | Financial, operational, executive categories |

**Technical Implementation**:
- Component: `src/components/analytics/AIReportBuilder.tsx`
- Natural language to report generation
- Template-based quick generation

---

### Advanced Accounting Modules

#### Multi-Book Accounting

**Purpose**: Parallel ledgers for different accounting standards (GAAP, IFRS, Tax)

**Features**:
| Feature | Status | Description |
|---------|--------|-------------|
| Parallel Ledgers | ✅ | GAAP, IFRS, Tax book support |
| Automatic Adjustments | ✅ | Auto-generated book adjustments |
| Reconciliation Matrix | ✅ | Cross-book balance reconciliation |
| Book Sync Status | ✅ | Real-time sync status per book |
| Entry Comparison | ✅ | Side-by-side journal entry comparison |

**Supported Books**:
| Book | Currency | Standard | Purpose |
|------|----------|----------|---------|
| GAAP | USD | US GAAP | Primary financial reporting |
| IFRS | USD | IFRS | International reporting |
| Tax | USD | Tax Basis | Tax compliance |
| Management | USD | Internal | Management reporting |

**Technical Implementation**:
- Component: `src/components/accounting/MultiBookAccounting.tsx`
- Tabbed interface for entries, adjustments, reconciliation

---

#### Subscription Billing

**Purpose**: Recurring revenue management with usage-based billing and proration

**Features**:
| Feature | Status | Description |
|---------|--------|-------------|
| MRR/ARR Tracking | ✅ | Monthly and annual recurring revenue |
| Subscription Management | ✅ | Active, trial, paused, cancelled states |
| Usage-Based Billing | ✅ | Metered billing with quantity tracking |
| Proration Engine | ✅ | Mid-cycle plan change calculations |
| Plan Changes | ✅ | Upgrade/downgrade with prorated credits |

**Subscription States**:
| State | Description |
|-------|-------------|
| `active` | Currently billing |
| `trial` | Free trial period |
| `paused` | Temporarily suspended |
| `cancelled` | No longer active |

**Proration Calculation**:
- Days remaining in billing cycle
- Credit for unused current plan
- Charge for new plan prorated days
- Net proration amount

**Technical Implementation**:
- Component: `src/components/billing/SubscriptionBilling.tsx`
- Plan pricing tiers: Starter ($29), Professional ($99), Enterprise ($299)

---

#### Revenue Recognition

**Purpose**: ASC 606/IFRS 15 compliant revenue recognition with 5-step model

**Features**:
| Feature | Status | Description |
|---------|--------|-------------|
| 5-Step Model | ✅ | Full ASC 606/IFRS 15 compliance |
| Performance Obligations | ✅ | Multiple performance obligations per contract |
| Deferred Revenue | ✅ | Automatic deferred revenue tracking |
| Recognition Schedule | ✅ | Visual recognition timeline |
| Contract Management | ✅ | Contract-based revenue tracking |

**5-Step Revenue Recognition Model**:
1. Identify the contract
2. Identify performance obligations
3. Determine transaction price
4. Allocate transaction price
5. Recognize revenue when obligations satisfied

**Technical Implementation**:
- Component: `src/components/revenue/RevenueRecognitionSchedule.tsx`

---

#### Intercompany Elimination

**Purpose**: Automated intercompany transaction matching and elimination

**Features**:
| Feature | Status | Description |
|---------|--------|-------------|
| IC Transaction Matching | ✅ | Auto-match intercompany transactions |
| Elimination Entries | ✅ | Generate elimination journal entries |
| Reconciliation Matrix | ✅ | Entity-to-entity balance matrix |
| Unmatched Detection | ✅ | Identify and flag unmatched IC transactions |
| Batch Processing | ✅ | Bulk elimination processing |

**Technical Implementation**:
- Component: `src/components/consolidation/IntercompanyElimination.tsx`
- Entity relationship tracking
- Automatic elimination journal generation

---

### Treasury & Cash Management

#### Treasury Management

**Purpose**: Comprehensive treasury operations including cash pooling and investments

**Features**:
| Feature | Status | Description |
|---------|--------|-------------|
| Cash Pooling | ✅ | Physical and notional pooling structures |
| Investment Portfolio | ✅ | Track investments with yields and maturities |
| Bank Relationships | ✅ | Manage banking relationships and credit lines |
| Position Summary | ✅ | Real-time treasury position overview |
| Interest Optimization | ✅ | Automated interest accrual tracking |

**Cash Pool Types**:
| Type | Description |
|------|-------------|
| Physical | Actual fund movements between accounts |
| Notional | Virtual pooling with notional balances |
| Zero Balance | Automatic sweeping to target balance |

**Investment Categories**:
- Treasury Bills
- Commercial Paper
- Money Market Funds
- Time Deposits

**Technical Implementation**:
- Component: `src/components/treasury/TreasuryManagement.tsx`
- Investment tracking with maturity alerts
- Pool hierarchy visualization

---

#### Bank Institution Selector

**Purpose**: Plaid-style bank connection wizard for enhanced bank feeds

**Features**:
| Feature | Status | Description |
|---------|--------|-------------|
| Bank Search | ✅ | Search across 1000+ institutions |
| Popular Banks | ✅ | Quick access to major banks |
| OAuth Support | ✅ | Secure OAuth authentication flow |
| Real-time Feeds | ✅ | Real-time transaction support indicators |
| Connection Status | ✅ | Visual connection progress |

**Supported Banks** (Sample):
- Chase
- Bank of America  
- Wells Fargo
- Citibank
- Capital One

**Technical Implementation**:
- Component: `src/components/banking/BankInstitutionSelector.tsx`
- Simulated OAuth flow with status updates

---

### AI Transaction Intelligence

#### Transaction Categorizer

**Purpose**: ML-powered automatic transaction categorization

**Features**:
| Feature | Status | Description |
|---------|--------|-------------|
| AI Suggestions | ✅ | Automatic category suggestions with confidence |
| Learned Rules | ✅ | System learns from user actions |
| Bulk Accept | ✅ | Accept all high-confidence suggestions |
| Rule Management | ✅ | View and toggle learned categorization rules |
| Confidence Thresholds | ✅ | Configurable auto-categorization threshold |

**Confidence Levels**:
| Range | Indicator | Action |
|-------|-----------|--------|
| ≥90% | Green | Auto-categorize eligible |
| 70-89% | Yellow | Suggest with review |
| <70% | Red | Requires manual review |

**Technical Implementation**:
- Component: `src/components/ai/TransactionCategorizer.tsx`
- Pattern-based rule learning
- Vendor/description matching

---

### Compliance & Governance

#### SOX Controls Module

**Purpose**: SOX compliance management with controls testing and deficiency tracking

**Features**:
| Feature | Status | Description |
|---------|--------|-------------|
| Controls Matrix | ✅ | Comprehensive control inventory |
| Automated Testing | ✅ | Scheduled control testing |
| Deficiency Tracking | ✅ | Track and remediate control deficiencies |
| Evidence Library | ✅ | Centralized evidence repository |
| Certification Workflow | ✅ | Management certification process |

**Control Categories**:
| Category | Description |
|----------|-------------|
| Financial Reporting | Controls over financial close and reporting |
| IT General | IT security and access controls |
| Process | Business process controls |
| Entity-Level | Governance and oversight controls |

**Control Status**:
| Status | Description |
|--------|-------------|
| `effective` | Operating as designed |
| `ineffective` | Control failure identified |
| `not_tested` | Pending testing |
| `remediation` | Under remediation |

**Deficiency Severity**:
| Level | Impact |
|-------|--------|
| Material Weakness | Significant misstatement risk |
| Significant Deficiency | More than inconsequential risk |
| Deficiency | Process improvement needed |

**Technical Implementation**:
- Component: `src/components/compliance/SOXControls.tsx`
- Controls library with test scheduling
- Deficiency workflow with remediation tracking

---

### Data Migration

#### NextDay Migration Wizard

**Purpose**: AI-assisted data migration from legacy systems

**Features**:
| Feature | Status | Description |
|---------|--------|-------------|
| Multi-Source Import | ✅ | Excel, CSV, QuickBooks, NetSuite, SAP support |
| AI Field Mapping | ✅ | Automatic field mapping suggestions |
| Data Validation | ✅ | Pre-import validation with error detection |
| Progress Tracking | ✅ | Step-by-step migration progress |
| Error Resolution | ✅ | Guided error correction workflow |

**Supported Sources**:
| Source | Formats | Description |
|--------|---------|-------------|
| Excel | .xlsx, .xls | Spreadsheet imports |
| CSV | .csv | Flat file imports |
| QuickBooks | API/Export | Accounting system migration |
| NetSuite | API/Export | ERP migration |
| SAP | API/Export | Enterprise migration |

**Migration Steps**:
1. **Source Selection** - Choose data source type
2. **File Upload** - Upload export files
3. **Field Mapping** - Map source to target fields
4. **Validation** - Review and fix data issues
5. **Import** - Execute migration

**Validation Rules**:
- Required field checks
- Data type validation
- Reference integrity
- Duplicate detection
- Business rule validation

**Technical Implementation**:
- Component: `src/components/migration/NextDayMigration.tsx`
- AI-powered field mapping suggestions
- Real-time validation feedback

---

## File Structure (Updated)

```
src/
├── components/
│   ├── accounting/           # Advanced accounting
│   │   └── MultiBookAccounting.tsx
│   ├── ai/                   # AI components
│   │   ├── AIChatBar.tsx
│   │   └── TransactionCategorizer.tsx
│   ├── analytics/            # Analytics & reporting
│   │   ├── AIReportBuilder.tsx
│   │   ├── FluxAnalysis.tsx
│   │   └── SalesAnalytics.tsx
│   ├── banking/              # Banking components
│   │   ├── BankFeedDialog.tsx
│   │   ├── BankInstitutionSelector.tsx
│   │   ├── MatchingRulesDialog.tsx
│   │   ├── PositivePayDialog.tsx
│   │   └── StatementImportDialog.tsx
│   ├── billing/              # Subscription billing
│   │   └── SubscriptionBilling.tsx
│   ├── bills/                # AP components
│   │   └── OCRBillCapture.tsx
│   ├── compliance/           # Compliance modules
│   │   └── SOXControls.tsx
│   ├── consolidation/        # Consolidation
│   │   └── IntercompanyElimination.tsx
│   ├── migration/            # Data migration
│   │   └── NextDayMigration.tsx
│   ├── revenue/              # Revenue recognition
│   │   └── RevenueRecognitionSchedule.tsx
│   ├── treasury/             # Treasury management
│   │   └── TreasuryManagement.tsx
│   └── ...                   # Other components
```

---

## Legend

| Symbol | Meaning           |
| ------ | ----------------- |
| ✅     | Implemented       |
| 🔲     | Planned / Roadmap |
