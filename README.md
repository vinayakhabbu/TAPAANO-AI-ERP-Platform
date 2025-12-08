# Finance ERP - Enterprise Resource Planning System

A comprehensive, multi-tenant financial management system built with modern web technologies. Features end-to-end financial operations including Order-to-Cash (O2C), Procure-to-Pay (P2P), General Ledger, Banking, CRM, Production, Controlling, and Service Management with an integrated AI assistant called **Agent River**.

![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)
![React](https://img.shields.io/badge/React-18.x-61DAFB.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6.svg)
![Supabase](https://img.shields.io/badge/Supabase-Backend-3ECF8E.svg)

## Features

### Core Modules
- **Dashboard** - Executive overview with KPIs, charts, and activity feed
- **CRM** - Pipeline management, opportunities, customer insights, sales forecasting
- **Accounts Receivable (O2C)** - Quotations, sales orders, shipments, invoices
- **Accounts Payable (P2P)** - Purchase requisitions, POs, goods receipts, bills, payment runs
- **Inventory** - Stock management, warehouses, bin locations, batch/serial tracking, cycle counts
- **Production** - BOMs, production orders, work centers, capacity planning
- **General Ledger** - Chart of accounts, journal entries, trial balance
- **Banking** - Bank reconciliation, statement imports, matching rules, positive pay
- **Controlling** - Cost centers, internal orders, budgets, fixed assets
- **Service Management** - Contracts, warranties, service calls, field visits
- **Period Close** - Month-end close task management

### AI-Powered Features
- **Agent River** - Unified AI assistant with specialized sub-agents for each module
- Natural language queries across all business data
- Context-aware responses based on current module

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite |
| Styling | Tailwind CSS, shadcn/ui |
| State | TanStack Query, React Hook Form |
| Backend | Supabase (PostgreSQL, Auth, Edge Functions) |
| AI | OpenAI GPT-4o-mini (BYOK - Bring Your Own Key) |
| Charts | Recharts |

## Getting Started

### Prerequisites
- Node.js 18+ and npm
- A Supabase project (or use Lovable Cloud)
- OpenAI API key (optional, for AI features)

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

### OpenAI API Key (Optional)

For AI features (Agent River), add your OpenAI API key in:
**Settings → API Keys → OpenAI API Key**

Your key is stored securely in the database and never exposed in code.

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

## Security

- **Row Level Security (RLS)** - All data is isolated by organization
- **Role-Based Access Control** - Admin, Moderator, User, Viewer roles
- **Secure API Keys** - User API keys stored in database, not in code
- **Auth** - Supabase Authentication with email/password

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
```

## Deployment

### Lovable (Recommended)
Click **Share → Publish** in the Lovable editor.

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

- Built with [Lovable](https://lovable.dev)
- UI components from [shadcn/ui](https://ui.shadcn.com)
- Backend powered by [Supabase](https://supabase.com)
