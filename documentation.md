# Finance ERP Application Documentation

## Overview

A comprehensive, multi-tenant financial management system built for modern enterprises. The application provides end-to-end financial operations management including Order-to-Cash (O2C), Procure-to-Pay (P2P), General Ledger, Banking, and Period Close modules with an integrated AI Copilot.

---

## Technology Stack

### Frontend
| Technology | Purpose |
|------------|---------|
| **React 18** | UI library |
| **TypeScript** | Type-safe development |
| **Vite** | Build tool and dev server |
| **Tailwind CSS** | Utility-first styling |
| **Shadcn/UI** | Component library |
| **React Router v6** | Client-side routing |
| **TanStack Query** | Server state management |
| **React Hook Form** | Form handling |
| **Zod** | Schema validation |
| **Recharts** | Data visualization |
| **Lucide React** | Icon library |
| **next-themes** | Dark/light mode theming |

### Backend (Lovable Cloud)
| Technology | Purpose |
|------------|---------|
| **Supabase** | Backend-as-a-Service |
| **PostgreSQL** | Database |
| **Edge Functions** | Serverless API endpoints |
| **Row Level Security (RLS)** | Multi-tenant data isolation |
| **OpenAI API** | AI Copilot capabilities |

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

#### Invoices
- Create invoices linked to sales orders/shipments
- Status workflow: `draft` → `sent` → `paid` / `overdue` / `cancelled`
- Track payment amounts and balance due
- Tax calculation support

---

### 3. Accounts Payable - P2P (`/ap`)
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

### 5. Banking (`/banking`)
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

### 6. Period Close (`/close`)
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

### 7. AI Copilot
**Purpose**: Natural language interface for financial queries and actions

**Capabilities**:
- Query any master or transaction data
- Get summaries and metrics
- Answer questions about AR aging, AP status, cash position
- Natural language to database query translation

**Technical Implementation**:
- Edge Function: `finance-chat`
- Agents: `finance-agents`
- Chat history persistence
- Org-scoped context awareness

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

### Transaction Tables
| Table | Description |
|-------|-------------|
| `sales_orders` | Sales order headers |
| `sales_order_lines` | Sales order line items |
| `shipments` | Shipment headers |
| `shipment_lines` | Shipment line items |
| `invoices` | AR invoice records |
| `purchase_orders` | Purchase order headers |
| `purchase_order_lines` | PO line items |
| `goods_receipts` | GR headers |
| `goods_receipt_lines` | GR line items |
| `bills` | AP bill records |
| `payment_runs` | Payment batch headers |
| `payment_run_items` | Payment batch line items |
| `journal_entries` | GL journal headers |
| `journal_lines` | GL journal line items |
| `bank_transactions` | Bank transaction records |
| `close_tasks` | Period close tasks |

### AI/Chat Tables
| Table | Description |
|-------|-------------|
| `chat_messages` | AI copilot conversation history |
| `ai_audit_logs` | AI action audit trail |

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
| Function | Purpose |
|----------|---------|
| `get_user_org_id()` | Returns current user's org_id |
| `get_user_role(user_id)` | Returns user's highest role |
| `has_role(user_id, role)` | Checks if user has specific role |
| `handle_new_user()` | Trigger for new user provisioning |
| `update_updated_at()` | Trigger for timestamp updates |

---

## API / Edge Functions

### `finance-chat`
- **Purpose**: AI copilot chat interface
- **Endpoint**: `/functions/v1/finance-chat`
- **Method**: POST
- **Auth**: Required (Bearer token)

### `finance-agents`
- **Purpose**: AI agent actions and tools
- **Endpoint**: `/functions/v1/finance-agents`
- **Method**: POST
- **Auth**: Required (Bearer token)

---

## File Structure

```
src/
├── components/
│   ├── ai/                 # AI Copilot components
│   ├── dashboard/          # Dashboard widgets
│   ├── forms/              # Data entry forms
│   ├── layout/             # App layout components
│   └── ui/                 # Shadcn UI components
├── hooks/
│   ├── useAuth.tsx         # Authentication hook
│   ├── useBanking.ts       # Banking data hook
│   ├── useGeneralLedger.ts # GL data hook
│   ├── usePayables.ts      # AP data hook
│   ├── usePeriodClose.ts   # Close data hook
│   └── useReceivables.ts   # AR data hook
├── integrations/
│   └── supabase/           # Supabase client & types
├── lib/
│   └── utils.ts            # Utility functions
├── pages/
│   ├── Auth.tsx            # Login/signup page
│   ├── Banking.tsx         # Banking module
│   ├── GeneralLedger.tsx   # GL module
│   ├── Index.tsx           # Dashboard
│   ├── Payables.tsx        # AP module
│   ├── PeriodClose.tsx     # Close module
│   ├── Receivables.tsx     # AR module
│   └── Settings.tsx        # User settings
└── main.tsx                # App entry point

supabase/
├── config.toml             # Supabase configuration
└── functions/
    ├── finance-agents/     # AI agents edge function
    └── finance-chat/       # Chat edge function
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon key |
| `OPENAI_API_KEY` | OpenAI API key (Edge Functions) |

---

## Key Features Summary

| Feature | Status |
|---------|--------|
| Multi-tenant architecture | ✅ |
| Role-based access control | ✅ |
| Order-to-Cash (O2C) | ✅ |
| Procure-to-Pay (P2P) | ✅ |
| General Ledger | ✅ |
| Banking & Reconciliation | ✅ |
| Period Close Management | ✅ |
| AI Copilot | ✅ |
| Dark/Light Theme | ✅ |
| Responsive Design | ✅ |
| Real-time Updates | ✅ |

---

## Future Enhancements

- [ ] Automated bank feed imports
- [ ] Auto-matching rules engine
- [ ] Financial reporting (P&L, Balance Sheet)
- [ ] Budget vs Actual tracking
- [ ] Intercompany transactions
- [ ] Approval workflows with notifications
- [ ] Document attachments
- [ ] Audit trail viewer
- [ ] Multi-currency support
- [ ] Tax calculation engine
