# First administrator activation

The ERP administrator is a tenant role, not a Supabase project-team role.
This release supports one initial administrator in an otherwise empty project.
It does not create a default account, password, finance entity, or example books.

## Before sending

Deploy the migration and frontend together. The activation route is
`https://tapaano-erp-production.up.railway.app/auth/setup`.
In Supabase Auth URL Configuration, set the application Site URL and explicitly
allow that activation URL. Verify the invitation email template uses Supabase's
confirmation URL and the project can send to the approved recipient. Configure
SMTP if the project's built-in email service does not permit the recipient.
Do not mark an email verified yourself or issue a shared starter password.

Review the exact company name, administrator display name, and normalized email.
For a test company, label it clearly and use only synthetic financial data.
Provide the following operator environment through a secure local secret store:

- `TAPAANO_OWNER_DATABASE_URL`: the target project's PostgreSQL owner connection,
  with TLS certificate verification enabled for managed connections.
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`: that same project's server-side
  Auth configuration. Never set a service key as a Vite/Railway frontend variable.
- `TAPAANO_ACCOUNT_SETUP_URL`: the exact HTTPS activation URL above.
- `TAPAANO_COMPANY_NAME`, `TAPAANO_ADMIN_NAME`, `TAPAANO_ADMIN_EMAIL`.
- `TAPAANO_BOOTSTRAP_REQUEST_KEY`: a unique operation identifier.
- `TAPAANO_BOOTSTRAP_TOKEN`: 32 cryptographically random bytes encoded as 64
  lowercase hexadecimal characters. Generate with `openssl rand -hex 32` and
  retain privately with the request key until activation is reconciled.
- `TAPAANO_AUTH_DELIVERY_READY=yes`: set only after verifying the URL allowlist,
  invitation template and recipient delivery configuration.

Run `node scripts/provision-first-admin.mjs` using supported Node 22.
It prepares a 24-hour, email-bound, hashed invitation through an owner-only SQL
function, sends the Supabase Auth invitation, and verifies that the new profile
and membership both belong to the reserved company with the `admin` role.
The email link proves control of the inbox. The activation page then lets the
recipient choose a password and returns them to sign-in.
Success means Auth accepted delivery, not proof that the email reached the inbox.

The connected Supabase MCP currently exposes database operations, but not Auth
admin invitation delivery or Auth configuration writes. Do not extract connector
tokens or deploy a public privileged helper to work around that limitation.
The operator command must run in an authorized environment with these credentials.

## Failure and retry

Retain the same request key, token, company and recipient when retrying a lost
response. Different payloads with the same key fail. A consumed request reports
`account_already_created` without sending another message or creating another
tenant. It does not assert that a previous email was delivered. Inspect Auth
delivery logs and use an authorized Auth recovery flow if a created user's email
was lost. Point recovery links to the same `/auth/setup` route; configure the
recovery email template and URL allowlist before sending.

An expired, unconsumed invitation can be reissued by the owner with a new key and
token, only for the same reserved company/email/name. The earlier invitation is
retained as EXPIRED. Any existing unrelated company/user, or a consumed bootstrap,
closes preparation of new first-admin requests. Nothing disables triggers or RLS.
Normal member invitations still cannot request an admin role. The existing
tenant role workflow manages non-admin roles; additional administrator
provisioning is outside this first-admin operation.

## Acceptance

Verify email receipt and exact callback origin, choose a password, sign in, check
the company and role, sign out, and confirm a used link cannot create another
account. Do not record password, invitation token, or session-bearing URLs in
screenshots, PRs or logs. Use distinct authorized reviewer identities for
independent approval tests. Workflows requiring two administrators still need a
separately implemented and reviewed additional-admin provisioning path.

References: [Supabase invitations](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail),
[password recovery](https://supabase.com/docs/guides/auth/passwords),
[redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).
