# Managed deployment

## Verified target and initial state

The user selected the existing project `wqkmgthheixqelxnoreu`, named
`TAPAANO-AI-ERP-Platform`, at `https://wqkmgthheixqelxnoreu.supabase.co`.
It is in `ap-northeast-2` and uses PostgreSQL 17. The project was created on
2026-09-15, after the accounting release was merged on 2026-09-14.

On 2026-09-15, authenticated management checks reported ACTIVE_HEALTHY,
zero public tables, zero Auth users, zero Storage objects, no Edge Functions,
and no recorded migrations. The SQL check ran as `postgres`. These are initial
inspection results, not a successful deployment or production acceptance.

The user-provided GitHub integration settings select this repository, working
directory `.`, production branch `main`, and enabled production deployment.
Automatic preview branching is disabled. This connection targets the production
project; it does not establish an isolated staging environment.

## Initial deployment

The configuration update accompanying this record provides a new Supabase-file
change after the project was connected. Merge it through the existing CI gates,
then verify the actual managed deployment. Supabase's native GitHub integration
should apply the pending repository migrations in order and deploy the functions
declared in `config.toml`.

The source release is `ebe3afeccdf5f5afe9db08ffb36aa1bf81a244ff` (PR #41).
Its 92 migration files are unchanged. Their ordered SHA-256 manifest is
`904f0533b9907b58246a5b65d4a54e0fd23e874f1892d4c8fdaf3957fae8c8e1`,
as verified by `tests/migration-manifest.test.mjs`. The latest version is
`20260912050000`. Retain every original migration version so later GitHub deploys
can compare their pending files with the managed history.

Do not assume that a passing GitHub CI job proves a managed deployment: CI uses
a disposable local database. If deployment fails, inspect the first failure and
the managed history before retrying. Do not reset this project, copy local seed
data, or mark unapplied migrations as applied.

## Verification and activation

After deployment, compare all managed migration versions with the repository,
check the resulting application tables and RLS/grants, inspect security advisors,
and verify the deployed function names and authentication settings. Record the
observed results in the deployment PR.

The operational functions are `invite-member`, `finance-webhook`,
`bank-feed-worker`, and `provider-refund-worker`. Remaining declared functions
retain their repository containment behavior. Deploying a function does not
configure its custom secrets, provider credentials, application origin, or tenant
onboarding. Use FINANCE_INTEGRATIONS.md, FINANCE_BANK_FEEDS.md, and
FINANCE_PROVIDER_REFUNDS.md in the repository root for the activation contracts.

Frontend hosting, an isolated managed staging environment, provider acceptance,
representative-volume testing, managed recovery, and finance/security/operations
sign-off remain separate release gates in PRODUCTION_READINESS.md.

References: [GitHub deployment integration](https://supabase.com/docs/guides/deployment/branching/github-integration)
and [migration history](https://supabase.com/docs/guides/deployment/database-migrations).
