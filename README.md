# TAPAANO AI ERP Platform

> **Production-readiness warning:** this repository is under accounting and
> authorization reconstruction. It is not ready for production deployment or
> financial reliance. Unsupported workflows are intentionally disabled. See
> [`LOOP.md`](./LOOP.md) for verified controls, test evidence, and remaining
> risks.

TAPAANO is a multi-tenant ERP prototype built with React and Supabase. The
current verified accounting slice supports deterministic journals, controlled
accounting periods, exact reversals, and narrow atomic customer-invoice,
supplier-bill, receipt/payment, credit, and correction workflows. Other module screens may preserve historical/prototype data
but must not be treated as authoritative accounting output.

![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)
![React](https://img.shields.io/badge/React-18.x-61DAFB.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6.svg)
![Supabase](https://img.shields.io/badge/Supabase-Backend-3ECF8E.svg)

## Features

### Current implementation status

- **Verified locally:** tenant-scoped posted-journal reads; balanced,
  idempotent manual posting; exact-offset reversal; OPEN/SOFT_CLOSED/
  HARD_CLOSED period enforcement; and zero-tax, same-functional-currency
  customer invoice posting, exact full credit notes, and server-derived manual
  full receipts with one exact-offset receipt correction and one derived
  replacement after that correction, plus zero-tax
  functional-currency supplier-bill posting, exact full supplier credits, and
  server-derived manual full supplier payments with one exact-offset payment
  correction and one derived post-correction replacement through atomic
  database RPCs. Corrections and replacements are accounting records, not
  evidence of a bank refund or action.
- **Contained:** Agent River, model-backed search/embedding, autonomous
  approval, anomaly detection, precedent search, scheduled reports, direct
  notification delivery, legacy AP/payment execution, and banking execution.
- **Authorization boundary:** existing profiles have one immutable,
  tenant-bound role. Self-service registration and team/role administration are
  unavailable pending a controlled onboarding workflow.
- **Unavailable or unverified:** generic repeat or partial replacement receipts,
  partial receipts or receipt corrections, overpayments, refunds,
  customer aging/collections, tax and FX invoice posting, partial supplier
  credits/payments, generic repeat or partial replacement payments, partial
  payment corrections, refunds,
  approval, matching, bank execution/reconciliation,
  tax and FX posting,
  bank matching/reconciliation, inventory and production posting, payroll
  posting, consolidation, and authoritative financial reporting.

### AI-powered features

AI and autonomous workflows are intentionally unavailable while their tenant,
audit, credential, and side-effect boundaries are being rebuilt.

## Tech Stack

| Layer    | Technology                                     |
| -------- | ---------------------------------------------- |
| Frontend | React 18, TypeScript, Vite                     |
| Styling  | Tailwind CSS, shadcn/ui                        |
| State    | TanStack Query, React Hook Form                |
| Backend  | Supabase (PostgreSQL, Auth, Edge Functions)    |
| AI       | Disabled pending controlled reimplementation   |
| Charts   | Recharts                                       |

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- A Supabase project 

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
   cd YOUR_REPO
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set up environment variables**

   Create a `.env` file in the root directory:

   ```env
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key
   VITE_SUPABASE_PROJECT_ID=your_project_id
   ```

4. **Start the development server**

   ```bash
   npm run dev
   ```

5. **Open your browser**

   Navigate to `http://localhost:5173`

### Database Setup

The application requires a Supabase database with the appropriate schema. See `documentation.md` for the complete database structure.

Key tables include:

- `organizations`, `entities`, `profiles` (multi-tenancy)
- `customers`, `vendors`, `products`, `accounts` (master data)
- `sales_orders`, `invoices`, `purchase_orders`, `bills` (transactions)
- `inventory_stock`, `inventory_transactions` (inventory)
- `production_orders`, `bom_headers` (production)

## Project Structure

```
├── src/
│   ├── components/     # React components
│   │   ├── ai/         # AI chat components
│   │   ├── forms/      # Form components for each module
│   │   ├── layout/     # App layout (sidebar, header)
│   │   └── ui/         # shadcn/ui components
│   ├── hooks/          # Custom React hooks
│   ├── pages/          # Page components (routes)
│   ├── lib/            # Utilities
│   └── integrations/   # Supabase client
├── supabase/
│   ├── functions/      # Edge functions
│   └── config.toml     # Supabase config
└── documentation.md    # Detailed documentation
```

## Security status

- The recovered journal, period, invoice/credit/receipt/correction and
  supplier-bill/payment/correction posting,
  identity, accounting-master,
  AP/payment, banking, credential, and listed residual-schema migrations enforce
  their bounded tenant, role, immutability, balance, lineage, and idempotency
  properties in PostgreSQL and have disposable-database regression coverage.
- Authenticated routes are guarded, financial query keys include the current
  identity and organization, and sign-out cancels and clears cached tenant data.
- Unsupported legacy tables covered by the residual lockdown are preservation
  data only. Do not infer implementation correctness—or repository-wide
  security for any unlisted object—from that containment.
- No recovery migration or Edge containment change has been deployed by this
  worktree.

## Documentation

See [documentation.md](./documentation.md) for comprehensive documentation including:

- Detailed module descriptions
- Database schema
- API endpoints
- Security model
- Architecture diagrams

## Development

```bash
# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Lint code
npm run lint

# Run containment/accounting regressions
npm test

# Type-check without emitting files
npm run typecheck
```

## Deployment


### Self-Hosting

1. Build the project: `npm run build`
2. Deploy the `dist/` folder to any static hosting service
3. Configure environment variables on your hosting platform
4. Deploy Supabase Edge Functions to your Supabase project

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting a PR.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

Copyright 2025 Vinayak Habbu

This project is licensed under the Apache License 2.0 - see the [LICENSE](./LICENSE) file for details.

## Acknowledgments


- UI components from [shadcn/ui](https://ui.shadcn.com)
- Backend powered by [Supabase](https://supabase.com)
