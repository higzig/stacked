# First-use experience in staff controls

No schema, RLS or entitlement changes. Everything lives in `board-admin.html`,
`collection-admin.js` and `collection-staff.css`.

## Getting-started guide

A dismissible card at the top of the queue with three steps, each with progress:

1. **Add a test order.** Its button adds an order named "Test" (no name for
   number-only queues) through the normal `add_collection_order` RPC. The hint
   says which number it takes and that numbers are never reused, so the first
   real customer gets the next one.
2. **Open your customer screen.** Opens `board.html?display=<UUID>` in a new tab.
   Staff controls are not reloaded or reset. Anything in the Customer screen panel
   (open, print or show the poster, copy a link) counts too.
3. **Mark it Ready.** Points to the real Mark Ready button rather than doing it,
   so owners learn the control they will use in service.

When all three are done the card says "You're ready for service" with the next
order number, **Remove test order** (deletes the guide's own test order through
the normal Remove path; its number is not reused) and **Done**. Queue settings has
**Show getting-started guide** to reopen it. A reopened guide stays until Done or
Hide guide.

Progress sources:

- Steps 1 and 3 come from the business's order history (head-count queries on
  `collection_orders`, including collected rows, which members can already read),
  so they survive refreshes and other devices.
- Step 2, finished steps, the test order ID and dismissal/completion are stored per
  device and business in `localStorage` (`popbia-first-run:<business id>`), so
  removing the test order doesn't undo progress. Storage failure only means
  the guide may reappear on that device.

The guide is shown only when it is not dismissed or finished, not all steps are
done, and the business is new: created within the last 14 days and fewer than 5
orders ever. Established businesses never see it, even on a new device. If the
history query fails, the guide stays hidden; it never blocks service.

## Queue and order entry

- The empty queue is a dashed panel, not a fake order row: guidance while the
  guide is active, "No active orders…" otherwise.
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
admin API, so it works with confirmation on or off): new-business guide and empty
state, numbering hint, each step, refresh persistence, new-tab customer screen
with Realtime, completion, dismissal persistence (Firefox, 390px), established
business, all three queue styles, and editing/cancelling.
