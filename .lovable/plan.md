
## End-to-End Test Results

### What I tested
- Full database state (all 130+ tables)
- Agent River edge function (live call + logs)
- Auth system, RLS policies
- All page routes and component imports
- Dashboard stats aggregation
- Key data flows

---

### Findings & Issues

**CRITICAL — Agent River is broken for everyone**
The `OPENAI_API_KEY` secret stored in edge function secrets is invalid (401 Unauthorized). The logs confirm:
> `"Incorrect API key provided: sk-svcac***...V7YA"`

This means Agent River fails for ALL users — both signed-in and anonymous — even though the key fallback logic is correct. The fix: update the `OPENAI_API_KEY` secret with a valid key, OR the user adds their own in Settings → API Keys.

**Issue 2 — Organizations table: no UPDATE policy**
The RLS on `organizations` only has a `SELECT` policy. When a logged-in user goes to Settings → API Keys and saves an OpenAI key, the `UPDATE` to `organizations.openai_api_key` will silently fail (RLS blocks it). Need to add an `UPDATE` policy for org admins.

**Issue 3 — Database is empty**
There is only 1 user, 1 org, 1 entity, 1 opportunity in the entire database. All module pages (Receivables, Payables, Inventory, etc.) will render empty states. This is expected for a fresh org — not a bug, but worth noting.

**Issue 4 — `profiles` table has no `email` column**
The `handle_new_user` trigger stores email only in the `auth.users` table (not in `profiles`). Some places in settings/team may try to display the email — minor display gap.

**Issue 5 — Autonomous Approver returning 401**
Logs show the `autonomous-approver` edge function is returning 401, meaning it requires a valid auth token but the call may not be sending one properly.

---

### What works correctly
- Auth flow: sign-up, sign-in, profile + org creation trigger (`handle_new_user`)
- All 18 page routes are correctly registered
- RLS on `profiles` is correct (users can view/update own profile)
- Dashboard stats hook aggregates across all modules gracefully (no crashes when empty)
- AI Chat input is enabled for everyone (fix from previous session works)
- Scheduled reports table and UI are correctly wired
- All form components import cleanly
- Sidebar navigation, header, layout all use correct route paths

---

### Plan to fix all issues

**1. Fix organizations UPDATE RLS** — add a policy allowing org admins to update their own org row

**2. Fix OPENAI_API_KEY** — the system key is expired/invalid. Switch Agent River to use Lovable AI (no API key needed) as the primary LLM instead of OpenAI directly, so it works out of the box

**3. Fix Autonomous Approver 401** — ensure the edge function invocation passes the auth token properly from the frontend

**4. Add email display fallback** — in team/profile settings, fall back to `auth.uid()` joined display where email is needed

**Technical steps:**
```
1. Add UPDATE RLS on organizations table (migration)
2. Rewrite agent-river to use Lovable AI endpoint (LOVABLE_API_KEY) instead of direct OpenAI
3. Check autonomous-approver invocation in AutonomousApprover.tsx to pass auth header
4. Minor: profile display_name fallback in TeamSettings
```
