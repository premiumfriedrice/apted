# apted Tracker — Chrome Web Store Redesign

**Date**: 2026-10-20
**Status**: Design validated through brainstorming; implementation pending
**Scope**: Extension pivot from tailor-first to tracker-first, plus everything
needed to pass Chrome Web Store review and ship v1.0.0.

## Context

The extension (`extension/`) is a thin MV3 client for the apted web app,
currently built around resume tailoring. Publishing it as-is would fail or
stall store review: no icons, `host_permissions: ["<all_urls>"]` (drifted from
the README's documented design), `web_accessible_resources` matching
`<all_urls>`, and a listing that drags in an account + server requirement
through the tailoring features.

Decision: **ship the tracker as the product.** Tailoring becomes a
"coming soon" feature. The tracker syncs to the user's apted account via the
existing `/api/applications` routes and Better Auth extension-token flow.

## Decisions

1. **Product pivot** — tracker-first; tailoring is surfaced as a teaser card,
   hidden behind an off-by-default flag. Nothing is deleted.
2. **Sync** — applications sync to the apted account (web app stays source of
   truth). No local-only mode in v1.
3. **Surfaces** — one shared pipeline UI rendered in *both* the job-site
   drawer and the side panel.
4. **Auth** — connect-page handoff: extension opens the web app, user signs
   in (Google / GitHub / email), token flows back via `externally_connectable`.
5. **Gmail** — a content script on `mail.google.com` watches for job emails
   (DOM approach). No Gmail API OAuth (restricted scopes → CASA assessment,
   non-starter). A Gmail Workspace Add-on is a possible v2, not a launch item.
6. **Capture design** informed by a REA-assisted reverse-engineering study of
   Simplify Copilot 3.1.9 (see Appendix).

## Section 1: Product identity & manifest

**Listing single purpose:** *"apted Tracker logs your job applications
automatically while you apply on job boards, and syncs a live pipeline to
your apted account."*

`manifest.json` changes:

- **Permissions:** `activeTab`, `scripting`, `storage`, `sidePanel`.
  Drop `contextMenus`, `clipboardWrite`, `omnibox` (tailoring-only, dormant).
- **`host_permissions`**: replace `<all_urls>` with exactly the content-script
  origins — LinkedIn jobs, Greenhouse (boards + job-boards), Lever, Workday,
  Ashby, **plus `https://mail.google.com/*`** for the Gmail watcher.
- **`optional_host_permissions: ["<all_urls>"]`** — requested at runtime when
  the user saves a non-default `API_BASE` (existing behavior).
- **`externally_connectable`**: `matches: ["https://apted.vercel.app/*"]`
  (plus any configured API base) for the connect-page handoff.
- **`web_accessible_resources`** (fonts): restricted to the job-board origins.
- **Icons**: add 16/32/48/128 + `action.default_icon`. Assets to be designed.
- **Version**: `1.0.0`.

Entry points stay: toolbar action, `Ctrl/Cmd+Shift+E`.

## Section 2: Gmail email monitoring

Content script on `https://mail.google.com/*` observes the reading pane;
on email open it extracts **sender, subject, body**.

Two-layer classification:

1. **Local patterns** (zero latency): sender domains (`ashbyhq.com`,
   `greenhouse.io`, `lever.co`, `myworkdayjobs.com`, `linkedin.com`, major
   ATS senders) + subject/body regexes ("thank you for applying", "we regret
   to inform you", "invite you to interview", "pleased to offer").
2. **Server layer when ambiguous**: existing `/api/extract` endpoint returns
   `{ company, role, type }`.

Outcome mapping (existing `OUTCOMES`):

| Email pattern | Suggestion |
|---|---|
| "Thank you for applying" | confirms `applied` |
| "Regret / moving forward with other candidates" | `rejected` (+ `rejectedAfterRound`) |
| "Interview / schedule a call" | `interviewing`, round+1 |
| "Pleased to offer" | `offer` |

**Suggest, don't silently mutate (v1):** matched emails become suggestion
cards in the pipeline with one-tap Apply / Dismiss. Per-message-id memory in
`chrome.storage.local` prevents repeat prompts. Auto-apply toggle later.

**Privacy posture:** only ambiguous emails send sender + subject + body to
the user's own apted account — same as JD scraping. Disclosed in the privacy
policy and the listing's data-use form.

## Section 3: Shared pipeline UI

One framework-free module (`pipeline.ts`, `renderPipeline(el, state)`) with a
small shared state store (`chrome.storage.local` cache + server sync). The
side panel mounts it directly; the drawer mounts it inside its shadow DOM.
All network calls stay in the service worker — surfaces only message.

Layout — grouped status board:

- **Header**: "apted Tracker" + signed-in user initial/avatar
- **Stage groups** with counts, newest first: `Applied`, `Interviewing`
  (round badges, e.g. "R2"), `Offer`; `Rejected`/`Ghosted`/`Declined` collapse
  into a muted "Closed" section; `Draft` rarely appears (see Section 4)
- **Application card**: company · role, relative date, round badge, portal
  link, status menu (same outcome vocabulary as the web app). Changes PATCH
  `/api/applications/[id]` optimistically, roll back on error
- **Suggestion cards** (Gmail / captures) pin to the top with Apply/Dismiss

States: signed-out (connect CTA), offline/error (stale cache + retry), empty
(onboarding hint). Search/filter stays out of v1 — the web app is the power UI.

A **"Resume tailoring — coming soon"** teaser card sits at the bottom of both
surfaces.

## Section 4: Job-board capture flow

**Browsing a posting:** scrape company/role/JD (existing scrapers). Nothing is
saved — the drawer shows a compact "tracked job" card plus the pipeline. No
junk `draft` rows.

**Submitting** (confirmation URL or final-step button — existing
`submit-detection.ts`): capture `{ company, role, jobDescription, portalUrl,
outcome: "applied" }`, POST `/api/applications`, refresh pipeline cache,
toast **"Logged to apted ✓"** with 8-second **Undo** (DELETE).

Offline/signed-out: failed POSTs queue in `chrome.storage.local` with capped
exponential backoff retries on service-worker wake; capture works while
signed out and queues with a "Connect to sync" banner. Nothing captured is
lost.

### Revisions from the Simplify study (see Appendix)

1. **Per-ATS stable IDs** for dedupe instead of company+role matching:
   `greenhouse:stripe/4021853`, `ashbyhq:stripe/12345`, `linkedin:…` — built
   from URL params or extraction templates. Store alongside the application;
   check against local cache before creating.
2. **Confirmation heuristic upgrade** in `submit-detection.ts`: a success
   element that was **absent ≥1.5 s and reappeared** while the user interacted
   counts as submitted even without a tracked submit click (guards against
   confirmation DOM that was present all along).
3. **Passive-tracking opt-out setting**: logging applications the user
   submitted without apted's involvement can be disabled. (Default value —
   open question.)
4. **Never-downgrade status rank** (`noRecord < analyticOnly < submitted`) +
   **per-tab 30 s cooldown** to prevent double-logs of one submission.
5. **Event-first writes:** add a light server endpoint (e.g.
   `POST /api/applications/event`) that accepts just
   `{ trackedObj, url, capturedAt }` and always succeeds, so captures with
   missing fields still land and are upgraded later. Current
   `POST /api/applications` requires company + role and would drop partial
   captures.

## Section 5: Auth / connect flow

Sign-in via connect-page handoff:

1. Signed-out surfaces show a **Connect** CTA.
2. Extension opens `{API_BASE}/connect` in a new tab.
3. User signs in with Google / GitHub / email (Better Auth) — or is already
   signed in.
4. The connect page calls `chrome.runtime.sendMessage(EXTENSION_ID,
   { type: "connect", token })` — the token comes from the existing
   `POST /api/auth/extension-token` (long-lived session, bearer plugin
   validates server-side).
5. Extension stores the token, closes/succeeds the tab, surfaces now signed
   in; pipeline syncs.

Fallback: paste-token field in Options (needed for dev IDs anyway, since the
web page can only message a *published* extension ID).

**Web app work:** a `/connect` page + "Connect extension" button that fetches
the token and messages it via `externally_connectable`. Dev-mode note: with an
unpacked extension, `chrome.runtime.sendMessage` from the page can address the
dev ID explicitly (`chrome.runtime.sendMessage(devId, …)` requires the dev ID
to be reachable — document this in the README; the paste-token fallback covers
the gap).

## Section 6: Store submission assets

- **Privacy policy**: update `src/app/privacy/page.tsx` — extension collects
  job-application data from job boards + Gmail (sender/subject/body of
  ambiguous emails), syncs to the user's apted account; no data sold/shared.
- **Icons**: 16/32/48/128 PNGs + a 1280×800 promo tile — to be designed.
- **Screenshots**: at least one 1280×800 showing the pipeline (side panel over
  a job board page); ideally drawer-on-Greenhouse + suggestion card.
- **Listing**: category "Productivity"; detailed description built on the
  single purpose; data-use disclosures for "website content" (job boards +
  Gmail) and "user activity" (browsing history on supported sites only).
- **Packaging**: `npm run package` in `extension/` — build, then zip `dist/`
  excluding `.DS_Store`/junk; version `1.0.0`.
- **Developer account**: $5 CWS registration (user action).

## Open questions

- Passive tracking default: on or off by default?
- Event-first API shape: standalone `applications/event` route vs relaxing
  required fields on `POST /api/applications`.
- Do we need a `tabs`-permission fallback channel (URL-watching after submit)
  like Simplify's, or do content-script + confirmation heuristics cover our
  supported sites? Prefer to avoid `tabs`/`webRequest`/`webNavigation`.
- Store listing copy draft.

## Appendix: Simplify Copilot 3.1.9 study (REA-assisted)

Analyzed via REA (`npx rea-agents analyze-javascript-application`, registered
as an MCP server in `.mcp.json`) on the locally installed extension, plus
direct reading of `remoteConfig.json` / `background.js` /
`contentScriptMain.js`. Purpose: learn patterns for interoperability; we
reimplement ideas in our own code, we do not copy their code or config.

Findings:

- **56-ATS remote config registry** keyed by ATS with: `urls` /
  `urlsExcluded`, `trackedObjExtractors` (XPath + template → stable ID, e.g.
  `adp:{{companySlug}}/{{reqId}}`), `applyButtonPaths` (enter flow),
  `continueButtonPaths` (multi-step "Next" — *not* final),
  `submitButtonPaths` (final), `submittedSuccessPaths` (confirmation DOM),
  `containerPath` (form scope), `inputSelectors` (autofill targets).
- **Three detection channels** in the background: content-script
  `onSubmission` messages; `webRequest.onCompleted` network confirmations
  (Amazon `summary?result=success` 200); `tabs.onUpdated` URL watchers
  (BreezyHR `/apply/submitted`).
- **Core submitted decision** (content script): `successElementVisible AND
  (submitButtonClicked OR autofilled OR (successEl absent ≥1.5 s then
  reappeared AND user interacted))`. Passive submissions (no autofill)
  suppressible via user setting.
- **Dedupe**: per-tab lane lock, 30 s cooldown, `noRecord < analyticOnly <
  submitted` rank that never downgrades; per-ATS `trackedObj` identity.
- **Two-tier server writes**: cheap `applied_event` (`{tracked_obj, url}`)
  always recorded first and returns IDs; full `applied` record
  (company resolution: search → exact match → auto-create "Unknown Company")
  upgrades it; 422 retry drops server-rejected Q&A answers.
- **UX**: green `✓` badge on the action icon ~2.5 s after a successful log.
- **Manifest contrast**: Simplify runs content scripts on `*://*/*` with
  `cookies`/`webRequest`/`webNavigation`/`alarms`/`offscreen` because of
  universal autofill. apted's tracker-specific design needs none of these —
  a materially leaner review story.
