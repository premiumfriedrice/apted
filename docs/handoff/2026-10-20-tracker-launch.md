# Handoff: Tracker-first extension redesign for Chrome Web Store launch (PRE-88)

**Status: COMPLETE (2026-10-21).** Tasks 1–8 implemented on `feature/tracker-launch`;
all suites green (web vitest 204+1 skipped, web tsc clean, extension vitest 209,
extension tsc clean, build + `npm run package` → apted-tracker-v1.0.0.zip).
Resolved open questions + submission checklist: see `docs/store-listing.md`.
Remaining manual items: 1280×800 screenshots (design pass), CWS developer
account + upload, live smoke tests on real postings/Gmail.

**Date**: 2026-10-20
**Branch**: `feature/tracker-launch`
**Worktree**: `/Users/lloydalba/code/apted-tracker-launch`
**Linear**: PRE-88 (priority 2/high)
**Design doc**: `docs/plans/2026-10-20-tracker-first-extension-design.md` — read this
first; it is the source of truth for every decision below.

## What to build

Pivot the store-facing extension from resume-tailoring to **application
tracking**. Tailoring becomes a "coming soon" teaser (feature-flagged OFF,
nothing deleted). The extension auto-captures applications on job boards and
via Gmail DOM monitoring, syncing a live pipeline to the user's apted account.

Suggested task order (each independently shippable/committable):

### Task 1 — Manifest + packaging
- Permissions: `activeTab`, `scripting`, `storage`, `sidePanel`. Drop
  `contextMenus`, `clipboardWrite`, `omnibox`.
- `host_permissions`: exactly the content-script origins (LinkedIn jobs,
  Greenhouse boards + job-boards, Lever, Workday, Ashby) **+
  `https://mail.google.com/*`**.
- Add `optional_host_permissions: ["<all_urls>"]` (existing options-save flow
  already requests runtime host permission for a custom API_BASE — keep).
- `externally_connectable`: `matches: ["https://apted.vercel.app/*"]` (+
  configured API base at runtime where possible).
- `web_accessible_resources` (fonts): restrict to the job-board origins.
- Icons 16/32/48/128 + `action.default_icon`; version `1.0.0`.
- Add `npm run package` to `extension/package.json` + build.mjs: build, zip
  `dist/` (exclude `.DS_Store`), output `apted-tracker-v1.0.0.zip`.

### Task 2 — ATS registry (`extension/src/ats-registry.json`)
Config-driven capture (Simplify-inspired, our own implementation — see design
doc Appendix; do NOT copy their XPaths/JSON):
- Per-ATS entries: `urls` (match patterns), `trackedObj` ID template (e.g.
  `greenhouse:{{company}}/{{reqId}}` from URL params), `company`/`role`
  extraction selectors, `submittedSuccessPaths` (confirmation DOM selector),
  optional submit/continue button label patterns.
- Sites to cover v1: LinkedIn, Greenhouse, Lever, Workday, Ashby.
- Rewire `src/scrapers.ts` + `src/submit-detection.ts` to consume the
  registry; keep `isConfirmationUrl` / `isSubmitButtonLabel` as generic
  fallbacks.
- Add the **1.5s-absence heuristic**: a success element that was absent
  ≥1.5 s and reappeared while the user interacted counts as submitted even
  without a tracked submit click.

### Task 3 — Shared pipeline module (`extension/src/pipeline.ts`)
- `renderPipeline(el, state)` — framework-free, mounts into BOTH
  `sidepanel.html` (side panel) and the drawer's shadow DOM (`drawer.ts`).
- Status board: `Applied` / `Interviewing` (round badges "R2") / `Offer`
  groups, `Rejected`/`Ghosted`/`Declined` collapsed "Closed" section;
  application card = company · role, relative date, portal link, outcome
  status menu (OUTCOMES from `src/lib/applications.ts` vocabulary).
- Optimistic PATCH `/api/applications/[id]`, rollback on error.
- Suggestion cards pinned to top (Apply/Dismiss) — fed by Gmail + captures.
- States: signed-out (Connect CTA), offline (stale cache + retry), empty
  (onboarding hint).
- "Resume tailoring — coming soon" teaser card at the bottom of both
  surfaces. Tailoring UI does NOT render unless the flag is on.

### Task 4 — Capture flow rewrite (`background.ts` + drawer)
- Browsing a posting: scrape only; show "tracked job" card; **no save** (no
  junk draft rows).
- Submit detected: assemble `{ company, role, jobDescription, portalUrl,
  outcome: "applied", trackedObj }` → POST `/api/applications` → toast
  "Logged to apted ✓" with 8 s **Undo** (DELETE `/api/applications/[id]`).
- Dedupe: per-ATS stable `trackedObj` ID + per-tab 30 s cooldown +
  never-downgrade rank (`noRecord < analyticOnly < submitted`).
- Offline/signed-out: queue in `chrome.storage.local`, capped exponential
  backoff on SW wake; "Connect to sync" banner while signed out.
- Passive-tracking opt-out setting (add to `src/types.ts` Settings +
  options page; respect in capture path).

### Task 5 — Gmail monitor (`extension/src/gmail.ts` + manifest entry)
- Content script on `https://mail.google.com/*`, reading pane observer:
  on email open extract sender, subject, body.
- Local classifier: sender domains (`ashbyhq.com`, `greenhouse.io`,
  `lever.co`, `myworkdayjobs.com`, `linkedin.com`, ATS senders) + subject/body
  regexes → outcome suggestion (`applied` confirm / `rejected` /
  `interviewing` round+1 / `offer`).
- Ambiguous → `POST /api/extract` (existing route; pass email text, get
  `{ company, role, type }`).
- Suggestion cards only (no silent mutation, v1); per-Gmail-message-id
  memory in `chrome.storage.local` to avoid repeat prompts.
- Privacy: ambiguous-email sender/subject/body go to the user's own account
  only. Disclose in privacy policy + listing data-use form.

### Task 6 — Connect-page auth (web app + extension)
- New `src/app/connect/page.tsx`: requires session; "Connect extension"
  button → `POST /api/auth/extension-token` → `chrome.runtime.sendMessage(
  EXTENSION_ID, { type: "apted-connect", token })`.
- Extension: `runtime.onMessageExternal` handler in `background.ts` stores
  the token, acks, and the surface flips to signed-in.
- Keep paste-token fallback in options (works for dev/unpacked IDs; the web
  page can only message a *published* extension ID).
- Match on production API base (`https://apted.vercel.app`); document dev
  flow in extension README.

### Task 7 — Server additions (web app)
- Light `POST /api/applications/event`: accepts just
  `{ trackedObj, url, capturedAt, partial: { company?, role?, ... } }`,
  always succeeds (event-first writes; upgradeable later — see design doc §4
  revision 5). Row-level security like the other applications routes.
- Update `src/app/privacy/page.tsx`: extension data collection (job boards +
  Gmail sender/subject/body for ambiguous emails), sync to user's account,
  no sale/sharing.

### Task 8 — Store assets
- Icons/PNGs + 1280×800 screenshots (side panel pipeline over a job board;
  drawer on Greenhouse; suggestion card). Needs design pass — assets
  currently do not exist anywhere in the repo.
- Listing copy (category: Productivity) built on the single-purpose sentence;
  data-use disclosures.
- Dry-run: package zip, load unpacked, verify no console errors.

## Current state (as of this handoff)

- Worktree created at the design-doc commit + one fix commit
  (`ee6449a` — pre-existing extension typecheck repairs; see git log).
- ALL GREEN: web `vitest` 198 passed/1 skipped, web `tsc --noEmit` clean;
  extension `tsc --noEmit` clean (was 15 errors on main — fixed here),
  extension `vitest` 146 passed, `npm run build` clean.
- Extension currently: tailor-first drawer (shadow DOM, 384px) on job sites;
  side panel tailor UI; submit-detection + scrapers + auto-save-application
  exist but target the versions API, not applications.
- Web app: full `/api/applications` CRUD + `/applications` pages; Better Auth
  (email/Google/GitHub) with `/api/auth/extension-token` long-lived bearer
  flow; `/api/extract` LLM field extraction; privacy page exists.
- Simplify Copilot 3.1.9 study in the design doc Appendix (REA MCP server
  registered in `.mcp.json` — restart pi to use REA tools).

## Key files

Modify:
- `extension/manifest.json`, `extension/build.mjs`, `extension/package.json`
- `extension/src/{background,drawer,sidepanel,options}.ts`,
  `src/submit-detection.ts`, `src/scrapers.ts`, `src/storage.ts`,
  `src/types.ts`, `src/messages.ts`
- `src/app/privacy/page.tsx`

Create:
- `extension/src/ats-registry.json`, `extension/src/pipeline.ts`,
  `extension/src/gmail.ts`, `extension/src/raw-imports.d.ts` (already added)
- `src/app/connect/page.tsx`, `src/app/api/applications/event/route.ts`

Reference (do not rewrite):
- `src/lib/applications.ts` (OUTCOMES vocabulary), `src/app/api/applications/**`
- `src/app/api/auth/extension-token/route.ts`, `src/app/api/extract/route.ts`
- `docs/plans/2026-10-20-tracker-first-extension-design.md`

## How to test

```bash
cd /Users/lloydalba/code/apted-tracker-launch
npx vitest run          # web tests — all pass
npx tsc --noEmit       # web typecheck — clean
cd extension
npm test               # extension tests — all pass
npm run typecheck      # extension tsc — clean
npm run build          # builds to dist/
```

Manual: load `extension/dist` unpacked (chrome://extensions), verify on a
Greenhouse/Lever posting; Gmail needs a real signed-in Gmail tab.

## Out of scope

- No changes to tailoring logic itself (scrapers stay shared where the
  tracker reuses them; drawer tailoring UI just stops rendering).
- No Gmail API / OAuth (restricted scopes → CASA assessment); Workspace
  Add-on is a possible v2.
- No search/filter in the pipeline UI (web app is the power UI).
- No mobile.

## Architecture constraints

- Framework-free extension code (vanilla TS + esbuild, iife bundles) — no
  React in the extension.
- ALL network calls live in the service worker; surfaces only message
  (`chrome.runtime.sendMessage`).
- Content scripts stay scoped to declared job-board + Gmail origins; never
  `<all_urls>` host permissions.
- Don't copy Simplify code/config — patterns only (our own selectors,
  our own registry format).
- Web app conventions: Next.js App Router, `requireUserId` + RLS via
  `setRlsUserOnPool` in every new route, vitest tests colocated.
- Manifest V3 only; keep esbuild `target: chrome120`.

## Open questions (decide during implementation, note in Linear)

- Passive tracking default on/off?
- `POST /api/applications/event` standalone vs relaxing required fields on
  the main route (leaning standalone — keeps main route strict).
- Any `tabs`-permission fallback channel? Prefer none.
- Store listing copy draft (needs product voice pass).
