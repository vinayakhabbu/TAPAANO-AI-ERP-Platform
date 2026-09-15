# Railway frontend deployment

Deploy `vinayakhabbu/TAPAANO-AI-ERP-Platform`, branch `main`, with repository root
`/` and the committed Dockerfile/railway.json. Supabase remains the database,
Auth and Edge backend at `https://wqkmgthheixqelxnoreu.supabase.co`.

Set these Railway service variables before the first build:

| Variable | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://wqkmgthheixqelxnoreu.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | The project's public publishable key from Supabase |
| `VITE_RELEASE_SHA` | Optional override; defaults to Railway's Git commit SHA at build time |

Never supply Supabase service-role, database, invitation, or provider secrets to
this frontend service. Vite embeds its public configuration at build time;
changing these variables requires a fresh build. The build rejects missing or
secret Supabase configuration. The final image contains only the compiled site
and Caddy configuration, runs without root, and listens on Railway's `PORT`.

Generate a Railway public domain after the deployment health check passes.
Use that HTTPS origin for Supabase Auth's Site URL and exact permitted callback
URLs, and for the invitation Edge function's `APP_ORIGIN`. Configure
`IDENTITY_INVITATION_REDIRECT_URL` to the supported invite callback and set the
invitation signing secret in Supabase separately. Domain changes require those
settings to be reviewed together. See `PRODUCTION_READINESS.md` for activation.

The host applies the same release security headers as `dist/_headers`, including
the exact Supabase HTTPS/WSS origins. Nested app routes return uncached HTML,
hashed assets are immutable, missing assets return 404, internal deployment files
are hidden, and unsupported methods return 405. `/healthz` checks frontend serving
only; Railway deployment health does not certify Supabase or finance workflows.

CI builds the real image with synthetic public configuration and checks these
HTTP boundaries on a disposable local container. After Railway deployment,
verify the generated HTTPS URL, actual headers, browser startup and the intended
Supabase connection. Retain Railway project/service/deployment IDs, domain,
commit SHA and results in the deployment PR. First admin provisioning and live
finance acceptance remain separate; do not seed demo financial data in production.

References: [Railway Docker builds](https://docs.railway.com/builds/dockerfiles),
[build variables](https://docs.railway.com/builds/dockerfiles#using-variables-at-build-time),
and [deployment health checks](https://docs.railway.com/deployments/healthchecks).
