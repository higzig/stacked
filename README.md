# Stacked sales-ready working copy

This is the existing Stacked site and prospect walkthrough, with the collection tools separated:

- `index.html` — reusable real client website
- `walkthrough.html` — prospect-facing sales walkthrough
- `board-admin.html` — staff collection controls
- `board.html` — customer collection display
- `styles.css` — visual styling and responsive rules
- `app.js` — navigation, tabs, FAQ, cart and WhatsApp ordering behaviour

## Before using with a real client
Replace the demo business data, WhatsApp number, email, Instagram URL, locations/hours, menu and reviews. Do not present the collection board as live unless it is connected to a real system.

## Phase 1 demo placeholders

The WhatsApp number in `client-config.js` is intentionally invalid and the action is blocked. Directions, event email, Instagram, and the Truckside credit destination are also intentionally disabled until verified client destinations are supplied. Do not enable any of them with invented details.

## Client customisation

Start with `client-config.js`. It contains the repeated business name, tagline, WhatsApp number, event email, Instagram link, main location, hours, collection times and event enquiry details.

For a verified destination, replace its placeholder value and change the matching `...Placeholder` flag to `false`. Keeping the flag `true` safely leaves the demo action disabled.

Search `index.html` for `CLIENT` comments to find the menu, schedule, reviews, events, story/about, collection-board and image content that should be changed manually. Brand colours remain at the top of `styles.css` under `CLIENT BRAND COLOURS`.

## Ordering MVP

The ordering flow creates a WhatsApp order request; it does not accept an order or take payment. The generated message includes the configured business name, items, quantities, unit prices, line totals, overall total and preferred collection time, followed by an explicit request for confirmation.

To enable it for a client, add a verified international WhatsApp number using digits only and set `whatsappPlaceholder` to `false` in `client-config.js`. The configured number is validated before any WhatsApp URL can open. Request and confirmation wording can be adjusted through `orderRequestIntro` and `orderConfirmationPrompt`.

## Deployment checklist

Before deployment, replace all demo content and placeholder destinations, update `metaDescription`, and replace `favicon.svg` and the Open Graph image with approved client assets. The pages are static and can be deployed on any host that serves the HTML files, `styles.css`, `client-config.js`, `app.js` and `favicon.svg` from the same directory. The walkthrough links to `board-admin.html` and `board.html` for the optional collection solution.
