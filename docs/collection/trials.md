# Collection workspace entitlements

Migration: `supabase/migrations/202610070001_collection_entitlements.sql`.
This has been tested locally; it has **not** been applied to hosted Supabase.
Apply this migration before publishing the matching account/staff/display assets.
Do not run a hosted database reset.

## Model

`business_entitlements` has one row per business, shared by every member. It stores
`trial_started_at`, `trial_ends_at`, `subscription_status`, `plan`,
`current_period_end`, and `legacy_access`. Member clients have SELECT only; only
trusted server/service administration can change entitlements. No service key
belongs in public assets.

Every business inserted after migration gets a database-created trial in the same
transaction. The duration is exactly 336 hours, avoiding timezone/DST ambiguity.
The existing `create_business` RPC serializes onboarding and returns a user's
existing business instead of renewing the trial. Membership changes never create
entitlements. The current architecture does not promise one lifetime trial across
unrelated accounts/businesses; abuse controls for separate identities are outside
this change.

Existing businesses are backfilled as `active`, `legacy_access=true`, with no
trial dates, plan, or period end. They retain non-expiring development access.
Review these grants deliberately before enabling billing; do not silently expire
them. No accounts, orders, membership or history are removed by expiry.

## Enforcement and UI

Database `clock_timestamp()` determines access; the boundary is strictly
`now < trial_ends_at` (or `current_period_end` for active non-legacy access).
Expired, past_due and cancelled states deny access. No scheduler is necessary.
The member-only `collection_entitlement` RPC materializes trial expiry and returns
authoritative time, remaining days, and effective status. A trial may still be
stored as `trialing` until this RPC is called, but all mutations are already
blocked at its deadline.

RLS restricts tenant reads and writes. Entitlement-aware write policies cover
order edits/deletes and business settings. Triggers additionally protect inserts
through the security-definer order RPC and validate writes at execution time.
Existing column grants prevent moving orders to another tenant or changing
server-owned numbering/timestamps. Trusted administration retains maintenance
access; ordinary authenticated clients cannot grant themselves access.

Staff snapshots poll every 10 seconds and refresh on broadcasts/visibility. The
UI locks on the next refresh, with a trial countdown or data-safe message and
€39/month / €360/year contact options (€108 annual savings). The database lock
is immediate, regardless of the polling delay or modified frontend code.
The account page retains login/logout and shows the expired workspace rather
than offering another business creation form. Anonymous customer displays return
an inactive message and an empty order projection on expiry; no names from the
queue or history are exposed. Restoration shows the original queue again.

## Future billing

A trusted server integration can update the same row to `subscription_status='active'`,
`plan='monthly'` or `'annual'`, `current_period_end=<server-verified end>`, and
`legacy_access=false`. Both cadences grant the same features. Clearing the legacy
flag is essential: it is an explicit non-expiring access override. A null/expired
period end for an ordinary active row denies access. `past_due` and `cancelled`
also deny access; grace periods/cancel-at-period-end would require an explicit
future policy decision. This change includes no Stripe, checkout or webhooks.

## Local verification

- `npm run build`, `npm run check:collection`, `npm test`.
- `npm run test:entitlement-migration`: creates/drops a temporary PostgreSQL
  database inside a local Supabase container, verifying pre-migration data,
  non-expiring legacy backfill, exact duration and deadline enforcement.
  Override `SUPABASE_TEST_DB_CONTAINER` for an isolated local container.
- `npm run test:collection`: existing Chromium/Firefox Collection suite plus
  onboarding/trial persistence, member isolation, protected entitlement columns,
  direct-write denial after expiry, inactive public board, account lock,
  preserved history, and monthly/annual access restoration. Override
  `SUPABASE_TEST_WORKDIR` to target a separate local Supabase CLI project.
  The suite refuses non-local API URLs.

The developer's pre-existing local stack had migration `202610060001` missing
from this checkout. It was left unchanged. Verification instead used the
separate `/tmp/popbia-trial-test` project (`PopBiaTrialTest`, ports 563xx), which
was stopped and its disposable data removed after verification.
If your hosted database also has that unmatched migration, reconcile its schema
with this checkout before applying this one; do not repair migration history
blindly or install two competing trial models.
