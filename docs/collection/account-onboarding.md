# Account confirmation and initial onboarding

No schema, Auth architecture or entitlement changes are required. The existing
business membership is the durable completion check:

- Signup requiring confirmation hides the form and shows a dedicated inbox card
  with the submitted email, spam/junk guidance and a Back to login button. Normal
  account polling cannot dismiss this screen. Passwords are cleared.
- The existing Supabase `emailRedirectTo` remains `account.html`. The SDK handles
  the confirmation link/session as before. No session is fabricated before
  confirmation; Auth continues to enforce email verification.
- Authenticated users without a workspace see Trial / Monthly / Annual options.
  Trial selection leads to the existing business-name form. The trial itself
  begins only when `create_business` creates the workspace, exactly as before.
- Once the user has a workspace, account visits skip the cards and use the
  existing entitlement check: trial/active users enter Staff Controls, expired
  users see the existing data-safe locked state. Returning users and additional
  members never get a new trial from this screen.

The in-progress choice is only UI state. Reloading before creating a workspace
shows the cards again because onboarding is not yet complete. No user-metadata
flag or local-storage entitlement is introduced. Workspace creation remains
idempotent/serialized by the existing database RPC, so revisiting or retrying
cannot extend or reset a workspace trial.

Monthly and Annual show no prices. They are invite-only previews of the same
product with different billing cadences. Register interest links open an email
app addressed to hello@popbia.com with the corresponding plan-interest subject.
They do not send mail automatically, enable paid access or initiate checkout.
The existing expired-entitlement screen retains its previously specified contact
pricing; it is a different state from the price-free initial onboarding screen.

## Verification

- `npm run check:collection`, `npm run build`, `npm test`.
- `npm run test:collection`: existing Collection, trial/expiry, tenant isolation
  and cross-browser Realtime suite, now choosing the trial before business setup.
  This suite uses the local default with confirmation disabled for its fixtures.
- `npm run test:account-onboarding`: real signup email captured by local Mailpit,
  confirmation opened in a separate Firefox browser, confirmation-state polling,
  Back to login, denied unconfirmed login, responsive card order, price-free
  previews, mailto subjects, workspace creation and unchanged trial duration,
  and existing trial/legacy workspace bypass.
  This suite requires **local** `[auth.email] enable_confirmations=true` and the
  existing local account redirect URLs. `SUPABASE_TEST_WORKDIR` may target a
  disposable CLI project. Both suites refuse hosted API URLs and clean up their
  own fixtures.

Hosted Supabase was not modified. Existing hosted email confirmation settings and
allowed account redirect URL must remain configured for the usual email flow.
