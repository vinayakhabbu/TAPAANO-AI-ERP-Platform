<!-- bmad:context -->
<!-- Verified 2026-09-16 against fc1d049a8a126e89d6dc9a28bd7834b42f3c2575. -->
## Tapaano
Finance ERP for US SaaS, AI and services companies, using React/TypeScript
and Supabase. Read BMAD.md for workflows and docs/README.md for domain
references. Production acceptance remains governed by PRODUCTION_READINESS.md.

## Policy
- Keep credentials, invitation tokens and customer data out of commits
  and BMAD artifacts; use synthetic fixtures and sanitized evidence.
- Preserve unsupported-workflow containment; implement and test its
  accounting, authorization and external-effect boundaries before activation.
- Distinguish verified implementation, deployed configuration and production
  acceptance; report evidence for each separately.

## Where things are
- For finance changes, read FINANCE_DELIVERY_STATUS.md and the relevant
  domain guide indexed in docs/README.md before defining scope.
- For identity changes, read FIRST_ADMIN_SETUP.md and src/hooks/useAuth.tsx.
- For provider effects, read FINANCE_INTEGRATIONS.md and
  FINANCE_PROVIDER_REFUNDS.md; accounting entries alone do not send money.

## Running and verifying
- Use Node 22 and npm ci --legacy-peer-deps; follow CONTRIBUTING.md and
  .github/workflows/ci.yml for the applicable checks.
- Database regression fixtures must be disposable and local.
  Integration checks require local Supabase, Docker and Playwright;
  never point fixture/reset commands at a managed project.
- Use the BMAD setup and doctor commands in BMAD.md; keep upstream skills
  intact and put supported team overrides under _bmad/custom/.

## Conventions that differ from defaults
- Keep money exact using decimal strings and existing BigInt helpers.
- Enforce tenant/role authorization in Postgres/RLS and controlled RPCs;
  browser filters and user-editable metadata are not authorization.
- Preserve atomic posting, approval evidence, source snapshots, retry keys
  and linked corrections when changing financial workflows.
- Report incomplete or inconsistent histories as unavailable;
  preserve the completeness checks in src/lib/readAllRows.ts.

## Known pitfalls
- Older README feature summaries lag behind the domain delivery guides;
  verify supported behavior against those guides, migrations and tests.
<!-- /bmad:context -->
