# PopBia

Static PopBia sales website, Stacked food-truck template, and collection-board prototype prepared for Cloudflare Workers static assets.

## Project structure

```text
Stacked/
├── public/
│   ├── index.html          # PopBia sales website
│   ├── collection.html     # PopBia Collection product walkthrough
│   ├── stacked.html        # Stacked food-truck template demo
│   ├── walkthrough.html    # Stacked prospect walkthrough
│   ├── board-admin.html    # PopBia Collection staff controls
│   ├── board.html          # Customer-facing collection display
│   ├── styles.css
│   ├── app.js
│   ├── client-config.js
│   ├── qrcode.js
│   └── favicon.svg
├── wrangler.jsonc
├── .gitignore
└── README.md
```

## Cloudflare deployment

`wrangler.jsonc` serves only `./public` as static assets. The deferred contact form backend is not deployed.

If the Cloudflare project is already connected to GitHub, keep the deploy command as:

```text
npx wrangler deploy
```

No build command is required for the site itself.

## Local testing

From the repository root:

```bash
npm ci
npm run dev
```

Then test:

- http://localhost:8787/
- http://localhost:8787/collection.html
- http://localhost:8787/stacked.html
- http://localhost:8787/walkthrough.html
- http://localhost:8787/board-admin.html
- http://localhost:8787/board.html

## Client configuration

Edit `public/client-config.js` for business name, contact details, location, opening hours, ordering details, and the public collection-board URL.

Before sharing the QR code publicly, replace `publicBoardUrl` with the deployed board URL, for example:

```js
publicBoardUrl: "https://stacked.example.workers.dev/board.html"
```

Ordering uses `CLIENT_CONFIG.ordering.channels` and `defaultChannel`. The default
must be enabled and either `"whatsapp"` or `"email"`; invalid configurations disable
the request action. There is no customer channel picker. WhatsApp uses the existing
`whatsappNumber` / `whatsappPlaceholder` settings; email uses `contactEmail` /
`contactEmailPlaceholder` and `ordering.emailSubject`. Keep placeholder flags enabled
for the fictional demo. Neither channel sends automatically: a configured business
opens a composed request in WhatsApp or an email app for the customer to review.
Ordering has no backend or connection to Collection.


## Contact section

The homepage displays a direct `mailto:hello@popbia.com` link. There is no active
form endpoint, automatic acknowledgement, or email-sending service dependency.
The previous form implementation and setup notes are preserved in
[docs/contact-form/README.md](docs/contact-form/README.md) for later use.
