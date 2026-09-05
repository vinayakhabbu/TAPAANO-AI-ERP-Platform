# Security policy

TAPAANO currently has no production release. The supported security boundary is
the latest commit on `main`; unsupported prototype modules remain deliberately
contained and must not be exposed as working financial workflows.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability or include credentials,
tenant data, database dumps, or exploit details in a public discussion. Use the
repository's GitHub **Security → Report a vulnerability** flow. If private
reporting is unavailable, contact the repository owner through their GitHub
profile and request a private channel before sharing details.

Include the affected commit, boundary, reproduction steps using synthetic data,
and potential tenant or accounting impact. Never test against a production or
third-party tenant without written authorization.

## Secrets

Only the Supabase URL and publishable/anon key may use the `VITE_` prefix because
Vite embeds those values in the browser bundle. Service-role keys, database
passwords, invitation signing secrets, provider tokens, and customer data must
never be committed or stored in `VITE_*` variables.
