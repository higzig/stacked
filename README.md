# Stacked

Static food-truck website, prospect walkthrough, and collection-board demo prepared for Cloudflare Workers static assets.

## Project structure

```text
Stacked/
├── public/
│   ├── index.html          # Clean reusable client-facing website
│   ├── walkthrough.html    # Prospect-facing walkthrough
│   ├── board-admin.html    # Collection board controls
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

`wrangler.jsonc` serves only `./public` as static assets. This prevents repository files, Git metadata, or `node_modules` from being uploaded as public assets.

If the Cloudflare project is already connected to GitHub, keep the deploy command as:

```text
npx wrangler deploy
```

No build command is required for the site itself.

## Local testing

From the repository root:

```bash
python3 -m http.server 4173 --directory public
```

Then test:

- http://127.0.0.1:4173/
- http://127.0.0.1:4173/walkthrough.html
- http://127.0.0.1:4173/board-admin.html
- http://127.0.0.1:4173/board.html

## Client configuration

Edit `public/client-config.js` for business name, contact details, location, opening hours, ordering details, and the public collection-board URL.

Before sharing the QR code publicly, replace `publicBoardUrl` with the deployed board URL, for example:

```js
publicBoardUrl: "https://stacked.example.workers.dev/board.html"
```
