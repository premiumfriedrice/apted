# APTED-006 — Chrome extension (thin client)

**Ticket:** APTED-006
**Type of work:** Browser extension
**Status:** shipped

## Summary

A Manifest V3 Chrome extension that acts as a thin client for the apted web app:
it scrapes the job posting in the active tab (LinkedIn, Greenhouse, Lever,
Workday, generic fallback), tailors against the user's apted backend, supports
chat-refine / undo / save-version from a side panel, and can drag the resulting
PDF straight onto a job site's upload field. No Anthropic key ever lives in the
extension.

## Context / problem

The fastest tailoring loop is *on the job posting itself* — read the JD from the
page, tailor, drop the PDF into the application form, without copy-paste. That
means a browser extension. But the extension is distributed to users, so it
cannot carry an API key or duplicate the tailoring logic, and Manifest V3's
service-worker model imposes real constraints (no persistent background page,
non-serialisable Blobs across the message boundary).

## Options considered

### Manifest version

- ✅ **Manifest V3** — required; Chrome has deprecated MV2 and removed it from
  the store.
- ❌ **MV2** — not an option for a new extension.

### Thin vs thick client

- ✅ **Thin client — all tailoring proxied through the apted backend** — the
  extension only scrapes, calls `/api/*`, and renders. The Anthropic key stays
  server-side, server logic evolves without re-shipping the extension, and a
  cheap per-request bearer token is all the extension holds.
- ❌ **Thick client — Anthropic key + tailoring logic in the extension** — can't
  distribute a key safely, and every prompt/rules change would need an extension
  release.

### Build tool

- ✅ **esbuild → IIFE bundles** — fast, near-zero config, and IIFE output suits
  MV3 (no runtime module loader). Four entry points (`background`, `sidepanel`,
  `options`, `inject`) bundled independently; static files copied post-build.
- ❌ **Webpack** — heavier and more config for no benefit here.
- ❌ **Rollup** — capable but a more involved plugin story than esbuild needs.

### Primary UI surface

- ✅ **Side panel** — persistent, tab-aware, survives tab switches mid-edit;
  modern Chrome UX. With a **detached-window fallback** for Arc and other
  Chromium browsers that render the popover unreliably, selectable in options.
- ❌ **Popup only** — dismisses on blur and loses the in-progress JD/chat;
  unusable on Arc.

### Scraper injection

- ✅ **On-demand `chrome.scripting.executeScript({ func })` with a self-contained
  `scrapeJob()`** — no persistent content-script overhead on every job page; the
  scraper function carries no imports because nothing survives serialisation, and
  has per-site selectors plus a densest-text-block generic fallback.
- ❌ **Always-on content script with a message listener** — loaded on every
  matched page whether used or not; heavier footprint.

### Moving the PDF across the MV3 boundary

- ✅ **Base64 (chunked) over `chrome.runtime.sendMessage`** — `Blob` isn't
  structured-cloneable through MV3 messaging, so the worker base64-encodes the
  bytes (chunked to avoid stack overflow) and the side panel rebuilds the Blob;
  cached per draft id + `updatedAt` with `If-None-Match`/ETag conditional GETs.
- ❌ **Pass the Blob directly** — fails the structured-clone boundary.

### In-panel preview

- ✅ **Lightweight HTML render of the resume JSON** in the side panel for instant
  feedback; the canonical PDF still comes from the server's Tectonic output.
- ❌ **Full PDF render in the extension** — adds a PDF library and bundle weight
  and risks drifting from the server's canonical output.

### Session persistence

- ✅ **6-hour TTL snapshot in `chrome.storage.local`** (JD, company, role, chat,
  draft id — not the full draft, which is server-canonical); restored on open,
  cleared on "New Tailor", and degrades gracefully if the server-side draft was
  deleted (404 → drop the id, keep JD + chat).
- ❌ **No TTL** — stale drafts persist forever.
- ❌ **Short (1h) TTL** — loses work across a normal workday pause.

## Decision

A Manifest V3 thin client built with esbuild, side-panel-first (window fallback
for Arc), scraping on demand and proxying everything through the apted backend.
The deciding factor was *distribution safety + maintainability*: a thin client
keeps the Anthropic key server-side and lets the tailoring logic evolve without
shipping a new extension, while MV3's constraints (serialisation, no persistent
background) drove the base64-PDF and on-demand-injection specifics.

## Files touched

- `extension/manifest.json` — MV3 manifest, host/optional permissions, side panel, commands, omnibox, context menus
- `extension/build.mjs` — esbuild bundler (4 entry points, IIFE, watch/minify)
- `extension/src/background.ts` — service worker: API client, scrape orchestration, message router, base64 PDF
- `extension/src/inject.ts` — content script: floating affordance + draggable PDF chip (shadow DOM)
- `extension/src/scrapers.ts` — self-contained `scrapeJob()` with per-site selectors + generic fallback
- `extension/src/sidepanel.ts` / `.html` / `.css` — side-panel UI (form, preview, chat)
- `extension/src/renderer.ts` — Resume JSON → HTML preview
- `extension/src/pdf.ts` — PDF blob cache + filename suggestions
- `extension/src/session.ts` — 6-hour TTL session snapshot
- `extension/src/options.ts` / `.html` — API_BASE + auth token + open-mode config
- `extension/src/storage.ts` — `chrome.storage.sync` wrappers
- `extension/src/messages.ts` / `types.ts` — typed message protocol & shared shapes

## Build note

`extension/` ships TypeScript source only; `dist/` is gitignored and must be
built (`npm run build` or `npm run watch` in `extension/`) before loading the
unpacked extension from `extension/dist/` in `chrome://extensions`.

## Follow-ups

- [ ] Job-board scrapers are selector-based and will break as those sites change their DOM; needs periodic maintenance.
- [ ] `<all_urls>` is an optional permission requested at runtime for arbitrary API_BASE origins — keep that request explicit and user-initiated.
