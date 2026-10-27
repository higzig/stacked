# Customer screen and QR poster

No schema, RLS, Auth or entitlement changes.

## Staff controls

The header **Customer screen** button opens a panel with two options that can be
used together:

- **TV or tablet** ("Display live orders on a screen."): **Open customer screen**
  (`board.html?display=<UUID>`, new tab; staff controls are not reloaded) and
  **Copy screen link**.
- **QR code** ("Let customers check orders on their phones."): a live QR code for the phone view
  (`board.html?display=<UUID>&phone=1`), **Print QR poster**
  (`qr-poster.html?display=<UUID>&print=1`, opens the print dialog), **Show QR on
  this screen** (same poster page without printing, for phone-only businesses)
  and **Copy customer link**.

Copying uses the Clipboard API. When it is refused (insecure page, permissions),
the link appears selected in a read-only field to copy by hand. Opening, printing,
During the walkthrough's step 2, Open customer screen opens in the same tab instead (see first-run.md), and the QR section, Copy screen link and the copy status are hidden so the highlighted button is the only action.

## QR poster (`qr-poster.html`, `collection-poster.js`)

Anonymous page. It reads the business name through the existing
`collection_display` RPC and renders the phone-view link as an SVG QR code
(error correction M, four-module quiet zone, navy on white). The A4 print
stylesheet gives exactly one page with no toolbar. On screen it is responsive, so
it doubles as a QR to show from a phone. Invalid or unknown display IDs show an
explanation. An inactive (expired) workspace still prints, with an on-screen
warning.

A downloadable PDF was not added: every current browser can "Save as PDF" from
the print dialog, and the page says so. A generated PDF would need a new library
for little gain.

## Customer screen (`board.html`, `collection-display.js`)

- Wording: business name with "Order status"; columns **Preparing** and **Ready for
  collection**; empty states "No orders being prepared" / "No orders ready yet",
  larger and higher contrast. Marketing pages use the same terms.
- Connection status with a coloured dot: Live, Reconnecting…, Offline · retrying ·
  last update HH:MM, invalid link, inactive. It stays visible on phones (the clock
  is hidden there instead). The browser `online` event triggers an immediate
  refresh, in addition to the 10-second catch-up polling and Realtime rejoin.
- Shared screens (not `phone=1`) get footer controls:
  - **Full screen**: shown only where the Fullscreen API exists; prefixed WebKit
    API supported.
  - **Turn sound on**: one tap creates and resumes a single AudioContext, then plays
    a confirmation chime. Ready chimes reuse it. Hidden when the business turned the
    chime off. Before the tap, browsers keep sound blocked, so no chime plays.
  - Screen wake lock: requested automatically where supported, re-acquired when the
    page becomes visible again; "Screen stays on" shows while held. Phone views
    never request it.
- The phone view hides the footer (its QR and display controls are pointless there).
- Unchanged: Realtime invalidation plus polling, announcements, paging and the
  overdue reminder.

## Device limitations (manual verification needed)

- **iPhone Safari** has no element fullscreen, so the button is hidden. Use "Add to
  Home Screen" for a chrome-free view. **iPad Safari** supports it (prefixed).
- **Smart TV browsers** vary. Many lack the Fullscreen and Wake Lock APIs, so the
  controls hide. Set the TV's own sleep/screensaver to off.
- **Wake Lock** is supported in recent Chrome, Edge, Safari 16.4+ and Firefox 126+.
  It is released when the tab is hidden or the device locks, and some devices
  release it on low battery. Elsewhere, set display sleep to "Never".
- **Sound** always needs one tap after each page load (autoplay policy). If the
  screen reloads itself (power cut, browser update), sound stays off until someone
  taps **Turn sound on** again.

Automated tests cover the supported paths with Chromium (and stubs for wake lock)
and the unsupported fallbacks. Real TVs, iPads, iPhones and Android tablets need
the manual checks in the Phase 3 handover.

## Public-access security review

- The display UUID (random, 122 bits) is the only identifier in customer URLs and
  QR codes. No business ID, email, membership or staff route appears in them.
  Public pages contain no links to staff controls.
- `collection_display` (anonymous, SECURITY DEFINER) returns only name, queue style,
  reminder/chime settings, an inactive flag and active orders (id, number, customer
  name, type, status, created/ready times). Base tables remain closed to anonymous
  clients. The customer pages use an anonymous Supabase client that never reads the
  staff session. Staff controls redirect anonymous visitors to login.
- **Concern (needs a decision): the link is permanent and printing makes it
  public.** Anyone holding a poster photo or a shared link can watch the live queue,
  including customer names, from anywhere, indefinitely. There is no way to rotate
  the display ID yet. Mitigations: use the "Order numbers" queue style where names
  are sensitive, and add link rotation (a small RPC plus a button; it would
  invalidate printed posters).
- **Known (unchanged):** the public Realtime channel accepts broadcasts from anyone
  with the UUID. They carry no data, but repeated invalidations make every open
  screen refetch. There is no rate limiting on the public RPC.

## Verification

`npm run test:customer-screen` (local Supabase; works with email confirmation on or
off) covers:

- the panel, links and QR codes, each verified module by module against the
  expected phone link (staff panel, screen footer and poster SVG)
- copy, including the fallback
- the auto-print poster: a single-page A4 PDF, the phone display and invalid links
- the new-tab customer screen with its wording, empty states, real-time Ready,
  sound unlock, chimes, fullscreen and the chime setting
- removing the test order without reusing its number
- the anonymous phone view with no session or staff links, the staff redirect and
  the projection's fields
- per-business QR destinations
- offline status and catch-up on reconnect
- wake lock acquire, release and re-acquire, plus fallbacks with no Fullscreen,
  Wake Lock or Web Audio
- the Firefox shared screen
