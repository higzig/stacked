# Deferred contact form

Saved for future use. The active contact section is now a direct email link to
hello@popbia.com. No email Worker or paid email binding is deployed.

Preserved here: form markup, the JavaScript event handler, and email-enabled Wrangler
configuration. The backend remains in `src/contact.mjs`, with tests in `test/`.
To restore, reinsert the form and handler, merge the saved configuration into the
root Wrangler file, and review the recipient/sender addresses (the old implementation
uses ryan@popbia.com). Then complete the setup and live delivery checks below.
Do not deploy this archived configuration unless the form is deliberately restored.

## Contact form email setup

The homepage submits JSON to `/api/contact` without opening an email app. It shows
“Query submitted” after Cloudflare accepts the notification to `ryan@popbia.com`.
The notification includes all answers, with the customer's email as Reply-To.
A separate branded thank-you email promises a response within 1 working day and
sets Reply-To to Ryan. Both messages include HTML and plain-text versions.

Before live use:

1. Sign in with `npx wrangler login`.
2. Enable Cloudflare Email Sending on the account (requires a Workers Paid plan).
3. Onboard and verify `popbia.com` for sending through Email Service in the dashboard
   or `npx wrangler email sending enable popbia.com`. Preserve existing mailbox/MX
   records; sending setup does not require moving Ryan's inbox.
4. Check the domain using `npx wrangler email sending list` and
   `npx wrangler email sending dns get popbia.com`.
5. Run `npm run deploy`, or use the existing Git-connected deployment.
6. Submit a real enquiry using an address you control, check both inboxes, and check
   that Reply on the business notification targets the customer.

Local `npm run dev` simulates email sending; it does not prove live delivery.
`npm test` uses mocked email bindings and covers success, validation, HTML escaping,
rate limits, provider failures, and static asset routing. `npm run check` performs
syntax checks and a deployment dry run. Generate runtime types with
`npx wrangler types` when editing bindings; generated types are ignored by Git.

The endpoint caps request size and field lengths, checks the request origin,
uses a honeypot, and limits submissions per IP/email with a Cloudflare rate limiter.
Rate limits are local to Cloudflare locations, not a global spam quota.
If the business notification fails, the form retains answers and reports an error.
If only the acknowledgement fails, the enquiry remains submitted to avoid duplicate
notifications; a `contact_acknowledgement_failed` log includes the reference from
Ryan's notification for follow-up. There is no durable retry queue. Provider
acceptance does not guarantee inbox delivery; monitor Email Service delivery logs.

Official setup guide: https://developers.cloudflare.com/email-service/get-started/send-emails/
