# Account-based Collection

Collection starts at `/account.html` (or `/board-admin.html`, which redirects to login).
The marketing site remains intact. The only walkthrough copy change explains the new account/display flow.

## Architecture

- Supabase Auth stores individual accounts and persistent sessions. Browser storage contains only SDK session credentials, never authoritative queue data.
- `profiles` references Auth users. `business_members` joins individuals to independent `businesses`; business IDs remain explicit throughout queries and mutations.
- The first authenticated onboarding creates a business and its membership atomically. Retries return the existing business. The MVP selects the first workspace; invitations, workspace switching and roles are deferred.
- `collection_orders` stores business ID, number, optional customer name, identification type, status and database timestamps. Collected history stays in the database. Remove deletes one order; Clear active queue marks all current orders collected without resetting numbering.
- Queue style, ready reminder and chime settings belong to the business. Changing style affects new orders and never replaces existing orders with samples.
- A database RPC allocates numbers under a business row lock. Optional manual numbers support the existing register's order number. Duplicate active numbers are rejected per business.
- RLS scopes reads and writes to membership. Clients cannot insert memberships, change an order's tenant ID, change the counter, set timestamps, or read another tenant's tables. Business onboarding and order creation use narrowly granted, membership-checked RPCs.
- Triggers send empty Supabase Realtime Broadcast notifications to `collection:<display UUID>`. Both staff and public screens refetch from the database; no client broadcast payload is trusted as state. Ten-second catch-up polling plus refetch on reconnect/visibility recovers missed messages.
- `/board.html?display=<UUID>` is a public venue display. The random UUID is a shareable capability, intended for TVs and customer phones. The anonymous client does not read or reuse staff sessions. `collection_display` exposes the business display name, display settings and active order fields only, never memberships, email addresses, internal business IDs or collected history. Base tables are not anonymous-readable.
- Public Broadcast channels intentionally contain only invalidations. A visitor with a display link can subscribe or send a harmless invalidation, but cannot alter database state. Do not enable Realtime's “private channels only” setting for this MVP. Limit public names to what customers should see. Link revocation/rotation UI and rate limiting are future work.

## Migration

`supabase/migrations/202610050001_collection.sql` creates tables, foreign keys, indexes, RLS, column-level grants, RPCs and notification/timestamp triggers. No remote migration has been applied.

## Configure locally

Docker Desktop must be running. From the repository root:

```sh
npm ci
npx supabase start
npx supabase status
```

Set public configuration in `public/supabase-config.js` using the local API URL and publishable key (legacy anon key also works). Alternatively build with:

```sh
SUPABASE_URL=http://127.0.0.1:55321 SUPABASE_PUBLISHABLE_KEY=<public-key> npm run build
npm run dev
```

Visit `http://localhost:8787/account.html`. Local email confirmation is disabled for testing. Production should use email confirmation. A fresh local stack applies the migration automatically; for an existing **disposable local** stack use `npx supabase db reset` (this erases local data).

The SDK bundle is committed in `public/vendor/supabase.js`, so existing static Cloudflare deployment still works without a build step. Rebuild it after dependency changes. To use environment-based configuration on CI, set the two public variables and run `npm run build` before the existing deploy command. No Worker secret or server-side service-role key is required.

## Configure hosted Supabase before deploying

1. Create/select the intended Supabase project and review the migration against its existing schema. Apply the migration with the Supabase CLI (`supabase link`, then `supabase db push`) only after checking the target project. This task did not run either command.
2. Enable email/password signup, require email confirmation, and configure production SMTP for reliable confirmation delivery.
3. Set Auth Site URL to the real site origin and allow the exact `/account.html` confirmation redirect URL. Add local callback URLs only for development.
4. Keep Realtime enabled, with public Broadcast channels allowed. The migration installs broadcasts; no Postgres Changes publication or publicly readable orders table is needed. Database triggers and Realtime usage require the usual hosted project limits.
5. Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` at build time, or edit the public config file. These values are browser-visible by design. Never use a service-role/secret key. The build rejects recognized service-role/secret keys.
6. Deploy the static site through the existing Cloudflare setup. Then repeat the acceptance workflow against the deployed origin, including confirmation emails and two physical devices.

## Verification

```sh
npm test
npm run check:collection
npx playwright install chromium firefox
npm run test:collection
```

The integration runner uses only the local Supabase URL from `supabase status`, serves its own temporary site on port 8787, and launches separate Chromium and Firefox browsers. Configuration is injected only by the test server; the committed config is unchanged. It creates temporary local users/workspaces and cleans them up. A local service-role key is used **only in the Node test runner** for fixture cleanup, never served to browsers.

Local results on 5 October 2026: the clean migration applied successfully; the Chromium/Firefox integration suite passed all checks below; the eight existing Node tests, Collection syntax checks and Cloudflare static deployment dry run passed. Mobile staff and customer-display screenshots were visually inspected. Production confirmation email delivery and physical-device testing remain to be verified after hosted setup.

It checks signup/onboarding, order #42, Firefox login, Ready updates reaching Chromium and an anonymous display with catch-up polling disabled, reload/session persistence, logout/login persistence, tenant read/update/delete/creation/membership tampering, anonymous projection, concurrent numbering collected history, settings synchronization, queue style changes without data loss, edits/removals, name-only orders, clearing the active queue, and protected-column/direct-insert denial.

## Current boundaries

No automatic import of device-local demo data: new businesses start empty. Old localStorage values are ignored and left untouched. There are no demo/sample-order fallbacks. No offline edits or optimistic writes; failed requests show an error and retain the last fetched snapshot with a connection warning. For network ambiguity, inspect the queue before retrying an add.

No billing, invitations, roles, workspace switcher, password recovery UI, display rotation UI or marketing redesign. Existing QR rendering now uses the scoped display URL. Accounts can administer their workspace without a separate settings dashboard.

Dependency audit: the Supabase browser dependency has no reported audit findings. The existing Wrangler development toolchain reports three findings through `miniflare`/`undici` (one high, two moderate); upgrade that toolchain separately before broader deployment work.

Implementation references: [Supabase Auth callbacks](https://supabase.com/docs/reference/javascript/auth-onauthstatechange), [database Broadcast](https://supabase.com/docs/guides/realtime/broadcast), and [Wrangler commands](https://developers.cloudflare.com/workers/wrangler/commands/).
