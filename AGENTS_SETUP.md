# Agent Management deployment checklist

This extension **does not replace** the existing customer signup, proof upload, plan purchase, or admin review. Use the **same Supabase project** and the existing Auth and database settings.

## 1. Database migration

In Supabase Dashboard → SQL Editor, run **all** of `supabase/agents.sql` after the existing `supabase/schema.sql`. Re-running it is safe. It adds `agents`, `agent_commissions`, and `agent_audit_logs`; adds immutable `referred_agent_id` to existing profiles and payments; enables RLS; and installs the atomic `review_agent_payment()` function. Until this migration runs, the existing manual approval flow remains available, but agent management returns a setup error and no agent commissions can be created.

## 2. Required server-only environment variables

- `SUPABASE_SERVICE_ROLE_KEY` (**optional**): if present, agent accounts are created with Supabase's admin API and failed setups are auto-deleted. If absent, the app creates the agent account through the public sign-up endpoint and writes the agent record with **your admin session** (RLS-protected). Either way, only an admin can create agents. **Never** put this key in a `NEXT_PUBLIC_` variable.
- `SESSION_SECRET`: a stable, server-only random secret with at least 32 random bytes (for example, generate it with `openssl rand -hex 32`). It signs signup tickets and, by default, referral cookies. Keep it consistent across instances and redeployments. If you use a separate `REFERRAL_SECRET`, keep that stable too. Rotating either secret invalidates the relevant outstanding cookies or tickets.
- `SITE_URL` (recommended, server-only): the deployed public HTTPS origin, for example `https://virtualspro.vercel.app` or your custom domain. `NEXT_PUBLIC_SITE_URL` is also accepted. Set it in the deployment environment and redeploy. It must be a site URL that opens directly in a private browser, not a Supabase URL, a restricted Arena/E2B preview, or a localhost address. The app refuses to copy restricted preview URLs rather than hand out a link that only works inside the builder.
- The existing `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` remain as before.

The SQL migration is required. The service-role key is optional. If the preview shows **"Sandbox Expired"**, that is the hosting preview expiring (not the app) — restart the preview and open the new URL.

## 3. Entry points

- Admin: sign in on the normal site → `/admin` → **Agent Management** → create an agent. The generated password is shown only once; share it privately. The agent can change it in their portal.
- Agent login: share `/signin` on the public site. All roles use that sign-in page; agent credentials take the agent to their own `/agent` dashboard.
- Agent referral link: `/r/<agent-code>` on the public site. It sets the referral cookie and redirects to the **normal** customer homepage on that same host.
- Customer: normal signup → GHS 50 registration proof → admin review → normal dashboard and plans.

## Attribution policy

The first **valid** referral click before signup wins. A signed, HttpOnly 30-day cookie holds the code. Signup copies it into the existing encrypted registration ticket, so it survives the signup → proof submission flow. When the customer account is created on proof submission, the server-only service client claims the referral exactly once (`referred_agent_id IS NULL`). Customers without a valid click remain unassigned. A customer cannot edit referral ownership by changing a URL or by sending their own code to the payment endpoint. Disabling a link stops future attribution; suspending an agent also disables new claims and future commissions, while preserving historical records.

## Money and verification

Payment screenshots still require manual review. A database trigger normalizes **amount**, **currency**, and **referral owner** on every insert (including direct Supabase API inserts). The admin approval RPC locks the pending payment, transitions it once, updates customer access, snapshots the agent's current rate, inserts a commission with a unique `payment_id`, and logs the action **in one transaction**. Pending/rejected payments never generate approved commission. Reversing an approved payment marks both payment and commission reversed, retaining the financial record. Old commissions never change when the agent's rate changes. Customers without referrals produce no agent commission.

## Security / operations

Admin-only RLS protects agent changes and full financial reporting. Active agents can read only their own agent record, attributed customer/payment statuses, and commissions. They cannot approve payments or change rates. Archived agents are soft-deleted (historical payments and commission records remain). Audit logs record agent create/edit, payment approval/rejection/reversal. Refresh the agent dashboard to see rate changes immediately.

The Supabase Auth default email confirmation must remain compatible with the existing platform's registration flow. Verify an agent can sign in through `/signin` after creation.

## Publish links that open outside Arena

The coding sandbox URL (including `*.e2b.app`) is a **private preview**, not a public website. Application code cannot remove Arena's hosting access gate. Never share the sandbox URL as a customer or agent link.

Use Arena's **Deploy to Vercel** control (or another public Node.js/Next.js host). Arena documents direct Vercel deployment for Fullstack Code Arena. Connect your Vercel account, deploy this project, and use the resulting production URL (for example `https://your-project.vercel.app`). A custom domain is optional.

In the production host's environment settings, add:

- `SITE_URL=https://your-project.vercel.app` — exact public HTTPS origin used for agent login and referral links.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` — your existing Supabase project URL and publishable key.
- `DATABASE_URL` — the production PostgreSQL connection string from Supabase **Connect**. Use the pooler connection for a serverless host. The sandbox's `127.0.0.1` database URL will not work on Vercel.
- `SESSION_SECRET` — one stable random value, kept the same across redeploys. Optionally set a separate stable `REFERRAL_SECRET`.
- `SUPABASE_SERVICE_ROLE_KEY` is optional. It enables Supabase Auth admin account creation and rollback. If omitted, agent account creation uses the authenticated admin session and database RLS.

Redeploy after setting these values. First open `https://your-project.vercel.app/signin` in a **private/incognito browser**. If it opens without an Arena login, use that origin as `SITE_URL` and redeploy. Then generate a **new** referral/login link in Agent Management and test it in a second private browser. Previously copied sandbox links remain preview-only and must be replaced.

**Current status:** this workspace has no `SITE_URL` or public production domain configured, so it deliberately disables copying referral links rather than handing out an Arena-only URL. The on-screen notice explains what is missing.

The shared Copy button tries the browser clipboard, then a compatibility fallback. If both are blocked, it opens a dialog with the exact text selected for manual copy. No credentials are put in login or referral URLs.
