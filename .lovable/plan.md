
## Phase 8B: Investor Metrics Dashboard

### What we're building
A dedicated `/metrics` page and dashboard widget covering the SaaS/investor KPIs that Rillet showcases: MRR, ARR, NRR, Churn Rate, CAC, LTV, and a 12-month cohort waterfall chart — all calculated live from the existing `invoices` and `customers` tables.

### Current state
- **No subscriptions table** in the DB — only `invoices` and `customers` exist
- `SubscriptionBilling` component uses 100% hardcoded mock data
- No MRR/ARR/churn calculations exist anywhere
- The main Dashboard has no investor-facing metrics section
- The sidebar has no `/metrics` route

---

### What we need to build

**1. Database migration**
Add an `investor_metrics_snapshots` table to store monthly computed snapshots (MRR, ARR, new/churned/expanded revenue, customer counts). This lets us show historical trend charts without re-computing everything on every page load.

```sql
CREATE TABLE public.investor_metrics_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  period_date date NOT NULL,  -- first day of month
  mrr numeric DEFAULT 0,
  arr numeric DEFAULT 0,
  new_mrr numeric DEFAULT 0,
  churned_mrr numeric DEFAULT 0,
  expansion_mrr numeric DEFAULT 0,
  contraction_mrr numeric DEFAULT 0,
  active_customers integer DEFAULT 0,
  new_customers integer DEFAULT 0,
  churned_customers integer DEFAULT 0,
  nrr numeric DEFAULT 0,  -- net revenue retention %
  gross_churn_rate numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(org_id, period_date)
);
-- RLS: org members can read/insert their own snapshots
```

**2. New hook: `useInvestorMetrics.ts`**
Calculates all metrics live from the `invoices` table (monthly recurring revenue = invoices grouped by customer per month), plus reads/writes snapshots. Key calculations:
- **MRR** = sum of `invoices.total` in the current month (paid + sent)
- **ARR** = MRR × 12
- **New MRR** = revenue from customers with first invoice this month
- **Churned MRR** = revenue from customers who had invoices last month but not this month
- **Expansion MRR** = revenue increase from existing customers vs prior month
- **NRR** = (prior MRR - churned + expansion) / prior MRR × 100
- **Gross Churn Rate** = churned customers / prior active customers × 100
- **12-month waterfall** = array of monthly MRR breakdown (new/churned/expansion/contraction)

**3. New page: `src/pages/InvestorMetrics.tsx`**
Route: `/metrics`, sidebar label: "Investor Metrics" under Reports & Close

Layout:
```
┌─────────────────────────────────────────────────────┐
│  MRR    ARR    NRR    Gross Churn   Active Customers │
│  $Xk    $Xk    X%       X%               X          │
├──────────────────────┬──────────────────────────────┤
│  MRR Waterfall Chart │  Revenue Retention Heatmap   │
│  (12-month stacked   │  (monthly cohort grid)       │
│   bar: new/exp/churn)│                              │
├──────────────────────┴──────────────────────────────┤
│  Customer Cohort Table  │  Top Customers by MRR     │
└─────────────────────────────────────────────────────┘
```

**4. Dashboard widget**
Add a compact "Investor Metrics" `ModuleSummaryCard` on the main dashboard pointing to `/metrics`.

**5. Sidebar entry**
Add "Investor Metrics" with a `TrendingUp` icon under the "Reports & Close" section.

---

### Files to create/modify

| File | Action |
|---|---|
| `supabase/migrations/..._investor_metrics.sql` | New — snapshots table + RLS |
| `src/hooks/useInvestorMetrics.ts` | New — all metric calculations |
| `src/pages/InvestorMetrics.tsx` | New — full metrics dashboard page |
| `src/App.tsx` | Add `/metrics` route |
| `src/components/layout/Sidebar.tsx` | Add nav entry |
| `src/pages/Index.tsx` | Add Investor Metrics summary card |
| `src/hooks/useDashboardStats.ts` | Add `metrics` section |

---

### Technical note
Since there is no `subscriptions` table, MRR is computed from `invoices` grouped by customer per calendar month. This is the correct approach for an ERP (revenue = what was actually invoiced), and matches how Rillet derives GL-backed metrics. The snapshot table stores computed results for fast historical charting.
