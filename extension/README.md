# apted — browser extension

Thin Manifest V3 client for the apted web app. The extension never holds the Anthropic key: every request is proxied through your apted server's `POST /api/tailor`, `POST /api/edit`, and `POST /api/versions` routes.

## What it does

- Adds a **side panel** that mirrors the web builder: scraped JD on top, live resume preview in the middle, chat box at the bottom.
- Click **Scrape tab** (or open the panel on a supported job page) and a content script extracts the JD from the active tab. Site-specific selectors for LinkedIn, Greenhouse (`boards.greenhouse.io`, `job-boards.greenhouse.io`), Lever (`jobs.lever.co`), and Workday (`*.myworkdayjobs.com`). Anywhere else: a generic largest-text-block extractor.
- **Tailor** POSTs the JD to `{API_BASE}/api/tailor` and renders the returned draft.
- The **chat box** POSTs each instruction to `{API_BASE}/api/edit` with the current draft id and re-renders the preview.
- **Save as version** dialog hits `{API_BASE}/api/versions` with the JD, current draft, company, role, and outcome.
- **Undo** reverts via `PATCH {API_BASE}/api/drafts/[id]` with `{ op: "undo" }`.

## Build

```bash
cd extension
npm install
npm run build
```

This bundles to `extension/dist/`. There is no framework — vanilla TS through esbuild. `npm run watch` rebuilds on file change.

## Load unpacked (Chrome / Edge / Brave)

1. Visit `chrome://extensions`.
2. Toggle **Developer mode** on.
3. Click **Load unpacked** and select `extension/dist`.
4. Pin the **apted** action so the icon stays in the toolbar.

To reload after a rebuild, hit the refresh icon on the apted card in `chrome://extensions`. The side panel will pick up the new bundle next time it opens.

## Configure

1. Right-click the apted icon → **Options**, or open the side panel and click **Settings**.
2. Set:
   - **API_BASE** — base URL of your apted web app (e.g. `http://localhost:3000` in dev, or your prod URL). No trailing slash.
   - **Auth token** — opaque token your server validates. Sent on every request as `Authorization: Bearer <token>`. Leave blank if your server uses cookies or no auth.
3. On save, Chrome will prompt for host permission to your `API_BASE` origin — accept it. MV3 service workers need this to fetch cross-origin.

## Server side: enabling extension calls

The extension makes `fetch` calls from its service worker to your apted server's API routes. Two things you may need to add to the web app:

### CORS

The extension's origin is `chrome-extension://<EXTENSION_ID>`. Either return permissive CORS headers from the relevant routes:

```ts
// In each API route handler (or via Next.js middleware)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization",
};
```

…and handle `OPTIONS` preflight. Or restrict `Access-Control-Allow-Origin` to your specific `chrome-extension://<id>` once you've installed it.

### Auth token validation (optional)

If you set an auth token in options, your routes should check `Authorization: Bearer <token>`. This is the only mechanism the extension uses to tell the server which user is calling — no Anthropic key, no other credentials.

## Permissions

Declared in `manifest.json`:

- `activeTab` + `scripting` — for the on-demand JD scrape via `chrome.scripting.executeScript({ func })`. No persistent content scripts.
- `sidePanel` — for the panel UI.
- `storage` — for the API_BASE / auth token.
- `host_permissions` — LinkedIn, Greenhouse, Lever, Workday (for scraping without an `activeTab` user gesture, e.g. when re-scraping on auto-open).
- `optional_host_permissions: ["<all_urls>"]` — requested at runtime when you save an API_BASE. Lets the service worker `fetch` your apted server.

## Files

```
extension/
  manifest.json
  package.json            (esbuild + @types/chrome)
  tsconfig.json
  build.mjs               (esbuild script)
  src/
    background.ts         service worker: scrape orchestrator + API client
    sidepanel.html/.css/.ts   side panel UI
    options.html/.ts      API_BASE + auth token settings
    scrapers.ts           self-contained scrapeJob() injected into the active tab
    renderer.ts           Resume JSON -> HTML preview
    types.ts              Resume / Draft / Version / ScrapedJob shapes
    storage.ts            chrome.storage.sync wrappers
    messages.ts           background <-> sidepanel message types
```

## Limitations & notes

- The preview is HTML (not the Tectonic PDF from the web app). If you want pixel parity with the printed resume, open the web app's builder on that draft — the draft id is the same.
- Scraper selectors are best-effort and these sites' DOMs shift often. If a scrape comes back empty, paste the JD into the textarea directly — everything else still works.
- The auto-scrape on side panel open only fires for the four supported hosts. Anywhere else, click **Scrape tab** manually.
- No Anthropic API key, DB credentials, or model name lives in the extension. The web app stays the single source of truth for tailoring logic.
