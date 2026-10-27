# Account confirmation, recovery and initial onboarding

No schema, Auth architecture or entitlement changes are required. The existing
business membership is the durable completion check.

## Entry and signup

- Every "Start free trial" CTA links to `/account.html?signup=1`, which opens in
  signup mode ("Start your free trial", "14 days free · No card required").
  "Sign in" links use plain `/account.html` (login mode). Either mode switches to
  the other in place. Password fields have a Show/Hide control.
- Signup requiring confirmation hides the form and shows a dedicated inbox card
  with the submitted email, spam/junk guidance, a note about confirming on another
  device, a Resend email button and Back to login. Normal account polling cannot
  dismiss this screen. Passwords are cleared.
- The existing Supabase `emailRedirectTo` remains `account.html`. The SDK handles
  the confirmation link/session as before. No session is fabricated before
  confirmation; Auth continues to enforce email verification.

## After confirmation

- Authenticated users without a workspace go straight to the business-name form.
  There is no plan-selection step. The copy explains that the 14-day trial starts
  when the business is created; it still begins only when `create_business`
  creates the workspace, exactly as before.
- Reloading before creating a workspace shows the business-name form again.
- Once the user has a workspace, account visits use the existing entitlement
  check: trial/active users enter Staff Controls, expired users see the existing
  data-safe locked state. Returning users and additional members never get a new
  trial. Workspace creation remains idempotent/serialized by the database RPC.

## Recovery

- **Forgot password?** (login mode) and **Reset my password** (after a failed
  login, a duplicate signup or a bad link) open an email form that calls
  `resetPasswordForEmail` with `redirectTo` = `account.html`. The reply is the same
  for every address ("If there's a PopBia account for …").
- The reset link signs the user in with a recovery session (`type=recovery` /
  `PASSWORD_RECOVERY`). The account page holds that session on **Choose a new
  password** instead of continuing to Staff Controls, then calls `updateUser`.
- Logging in before confirming shows a plain explanation and **Send a new
  confirmation email** (`auth.resend`, type `signup`). Resend refusals for unknown
  or already-confirmed addresses are not revealed; offline, rate-limit and server
  failures are.
- Expired, used or superseded links (Supabase redirects with `error_code`, e.g.
  `otp_expired`) show an explanation plus both recovery actions. Token and error
  parameters are removed from the address bar once the SDK has read them.
- Each email action has a 60-second client cooldown (shown on the button) in
  addition to Supabase's server-side `max_frequency` and rate limits. Every form
  uses the shared busy guard, so repeated taps cannot submit twice.

## Errors

Auth errors are mapped from Supabase error codes to plain-language messages with a
next step (wrong credentials, unconfirmed email, weak password, invalid email,
rate limits, disabled signups, ended sessions, offline). Unknown errors show a
generic retry/contact message; the raw error goes to the browser console only.
Wrong password and unknown account read identically. "Please confirm your email"
appears only after Supabase has verified the password.

## Verification

- `npm run check:collection`, `npm run build`, `npm test`.
- `npm run test:collection`: existing Collection, trial/expiry, tenant isolation
  and cross-browser Realtime suite. Signup now enters through `?signup=1` and goes
  directly to business naming. Requires local confirmation **disabled**.
- `npm run test:account-onboarding`: marketing CTAs/links/sample QR, signup mode,
  show/hide password, real signup email captured by local Mailpit, inbox screen
  polling and resend cooldown, friendly unconfirmed login with resend, superseded
  link explanation, confirmation opened in a separate Firefox browser landing on
  business naming, unchanged trial duration, returning login, password reset
  (generic reply, cooldown, held recovery session, new password works, old fails),
  uniform wrong-password/unknown-account messages, reused reset link, duplicate
  signup guidance, and existing trial/legacy workspace bypass.
  Requires **local** `[auth.email] enable_confirmations=true` and the existing
  local account redirect URLs. `SUPABASE_TEST_WORKDIR` may target a disposable
  CLI project. Both suites refuse hosted API URLs and clean up their own fixtures.

## Hosted configuration (manual)

Hosted Supabase was not modified. Password recovery reuses the confirmation
redirect, so no new redirect URL is needed beyond the production
`https://<site>/account.html` entry. Confirm in the dashboard: Site URL, that
redirect entry, custom SMTP, email confirmation on, and that the Confirm signup and
Reset password templates use `{{ .ConfirmationURL }}`.
