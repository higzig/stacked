# First-use experience in staff controls

No schema, RLS or entitlement changes. Everything lives in `board-admin.html`,
`collection-admin.js` and `collection-staff.css`.

## First-run walkthrough (`collection-walkthrough.js`)

A five-step walkthrough over the real staff controls. A single coach card sits at
the bottom of the screen; the control being taught is outlined and focused (it is
described by the card's text); unrelated sections are dimmed but stay usable.

1. **Your orders**: the add bar. Adding any order records it as the test order.
2. **Customer screen**: the header button, then **Open customer screen** inside
   the panel. During this step the screen opens in the same tab, so phone-only
   businesses don't juggle tabs.
3. **What customers see**, on the real customer screen (`board.html?...&tour=intro`):
   Preparing, Ready for collection, automatic updates, TV/tablet or QR. **Back to
   staff controls** returns.
4. **Mark it Ready**: the test order's own Mark Ready button, then a confirmation
   with **Next** and **See the customer screen** (`tour=ready`, Ready column
   highlighted).
5. **Your turn!**: nothing dimmed. **Finish walkthrough** offers to remove the
   practice orders created during the walkthrough (normal Remove path; numbers are
   never reused) or keep them.

**Skip walkthrough** is on every step. Queue settings has **Restart walkthrough**,
which starts again at step 1. A note after finishing or skipping explains how to
restart.

### State and navigation

- Progress (`popbia-walkthrough:<business id>`: step, test order, practice order
  IDs, status) is per device in `localStorage`. Refreshing resumes the same step.
  Returning from the customer screen by any route (button, browser Back, a new
  load) advances, and `pageshow` re-reads state after a back/forward-cache restore.
- If storage is unavailable the walkthrough does not start, since progress couldn't
  survive the trip to the customer screen. It hides whenever access has ended.
- It starts automatically only for new businesses: created within 14 days, fewer
  than 5 orders ever, and no stored state on this device.

### Customer-screen gating

The customer screen shows its explanation only when `?tour=intro|ready` is present
**and** this device holds `popbia-walkthrough-screen` = `{display, until}`. Staff
controls write it, for its own display ID and 30 minutes, immediately before
navigating, and remove it on return. Customers' phones, TVs, copied links and QR
scans never have it, so `?tour=` alone does nothing. The token contains no auth
data. The "Back to staff controls" link gets its address only when the explanation
is shown, so ordinary public pages contain no link to staff controls.

## Queue and order entry

- The empty queue is a dashed panel, not a fake order row: guidance while the
  walkthrough is active, "No active orders…" otherwise.
- The Add button previews the next automatic number ("Add order #4"). The
  database still assigns it.
- Number + name: "Customer name (optional)". Number only: no name field. Name
  only: name required.
- Editing happens inside the order's row (input, Save name, Cancel; Enter saves,
  Escape cancels). The add bar always adds a new order. The list is patched row
  by row, so polling and Realtime refreshes keep an open edit, its draft and its
  focus. If the order is collected or removed elsewhere, the edit closes with a
  message. Number-only orders have no Edit button (no visible name to edit).

## Verification

`npm run test:first-run` (local Supabase; creates confirmed users through the
admin API, so it works with confirmation on or off) covers:

- all five steps, with targets, focus, dimming and `aria-describedby`
- refreshing at each step, and keyboard-only progress
- the same-tab trip to the customer screen and back, by button and by browser Back
- gating: no explanation for other devices, phone views, expired tokens or other
  businesses' tokens
- practice-order cleanup without number reuse
- restart, skip persistence, and an established business
- Firefox at 390px, with Skip reachable by keyboard
- every queue style and in-row editing after the walkthrough
- screenshots of every step at 1280 and 390px in `/tmp/popbia-wt-*.png`

Suites accept `POPBIA_TEST_PORT` (default 8787) to run beside a dev server; add
`http://127.0.0.1:<port>/account.html` to that project's Auth redirect URLs.
