# Handoff: Submit Detection + Session Persistence + Browse Resumes (PRE-83)

**Branch**: `feature/submit-detection`
**Worktree**: `/Users/lloydalba/code/apted-submit-detect`
**Linear**: PRE-83
**Date**: 2026-07-08

## Status

All three features implemented and tests green (2026-07-15). Needs live
manual QA against real job sites before merge.

- **Auto-detect submission** â done. Drawer listens for host-page form `submit`
  events, submit-button clicks, and confirmation-page navigations
  (`pushState`/`replaceState`/`popstate` patched). On detection, if a draft
  exists, sends `auto-save-application` â `POST /api/versions` with an embedded
  `application` (outcome `applied`, `portalUrl = location.href`). De-duped per
  draft via `chrome.storage.session` (`aptedSavedDrafts`, 10-min TTL) so the
  submitâconfirmation navigation never creates two records.
- **Session persistence** â done. `newTailor()` in both drawer and sidepanel no
  longer calls `clearSession()`; it keeps JD/company/role (and similar matches
  in the drawer) and rewrites the session with `draftId: null`.
- **Browse all resumes** â done. New `list-versions` message â `GET
  /api/versions`, mapped via `mapVersionList` (in `extension/src/version-list.ts`).
  Drawer renders an "All Resumes" section (searchable) below Matching Resumes,
  lazy-loaded on first drawer open, with a refresh button. Selecting a card
  loads it as the current draft (reuses `get-version`) and shares the single
  preview block with the matching list via shadow-root-scoped card lookup.

Bug fixed along the way: the extension's `save-version` background handler was
sending company/role/outcome at the top level, which `POST /api/versions`
ignores (it reads them from an `application` sub-object) â so manual saves
never created an `applications` row. Now wrapped in `application: { â¦ }`.

`POST /api/versions` and `POST /api/versions/[id]/applications` now accept
`portalUrl` (PRE-85's `portal_url` column).

### Verification

```
Web:  npx vitest run            â 14 files, 167 passed (1 skipped)
Ext:  cd extension && npx vitest run â 6 files, 131 passed
Web:  npx tsc --noEmit          â clean
Ext:  cd extension && npm run build â clean
Ext:  cd extension && npx tsc --noEmit â 1 pre-existing error in
      src/__tests__/background.test.ts(27,22) (identical on main; unrelated
      to this work â the extension tsc gate isn't part of the run command)
```

### Remaining (manual QA)

- Submit a real application on Greenhouse / Lever / Workday / Ashby / LinkedIn
  with a tailored draft in the drawer and confirm exactly one
  `applications` row (outcome `applied`, correct `portal_url`) is created.
- Open the drawer on the same job URL, tailor, click âTailor new draftâ
  path / clear, and confirm JD + matches persist.
- Open the All Resumes browser, search, click a version, confirm it loads.

## What to Build

Three features for the Chrome extension drawer:

### 1. Auto-detect job application submission

When the user submits a job application on a job site (clicks a submit/apply button on Greenhouse, Lever, Workday, Ashby, etc.), the extension should automatically detect this and save an application record with all the information from the current session.

**What to capture:**
- Company name (from `els.jdCompany.value`)
- Job title (from `els.jdRole.value`)
- Job description (from `state.jobDescription` or `els.jdText.value`)
- Date applied (current date, set as `createdAt`)
- Portal URL (`location.href` — the page where they submitted)
- The tailored resume (the current draft content)
- Outcome: automatically set to "applied"

**Detection approach:**

Job sites use standard form submission patterns. Detect via:
- `submit` event on `<form>` elements — most reliable
- Click events on submit-type buttons (`button[type="submit"]`, elements with "submit" or "apply" in text)
- URL change to a confirmation/thank-you page (e.g. `/thank-you`, `/confirmation`, `/success` in the URL)

**Implementation:**

Add a MutationObserver/event listener in the drawer's content script that watches for:
1. Form `submit` events on the host page (not inside the shadow DOM — on `document`)
2. Clicks on buttons with submit-like text ("Submit Application", "Apply", "Submit")
3. URL changes to confirmation pages

When detected:
- If the user has a current draft (state.draft exists), auto-save it as a version + create an application record
- Show a brief status notification: "Application saved ✓"
- If no draft exists, do nothing (user isn't using apted for this application)

**Backend:**

The existing endpoints cover this:
- `POST /api/versions` — saves the tailored resume as a version (returns version id)
- `POST /api/versions/[id]/applications` — creates an application linked to the version (with company, role, JD, outcome="applied", portalUrl)

New message type needed: `auto-save-application` that combines both calls:
1. Save the current draft as a version
2. Create an application for that version with outcome="applied"

Add to `extension/src/messages.ts`:
```typescript
| { type: "auto-save-application"; company: string; role: string; jobDescription: string; portalUrl: string; tailoredContent: Resume }
```

Background handler calls `/api/versions` then `/api/versions/[id]/applications`.

### 2. Keep work cached on the same URL (don't wipe on apply)

**Current problem:** When the user tailors a resume and then clicks "New Tailor" (or the session gets cleared), the drawer wipes everything — JD, company, role, draft, similar resumes, chat. This is destructive if the user just wants to keep working on the same job page.

Also, the session is stored with a single key (`aptedSession`) in `chrome.storage.local`, and it's URL-scoped (`snap.url !== location.href` check in `readSession`). But `newTailor()` calls `clearSession()` which wipes everything.

**What to change:**

The session should persist across page actions as long as the user is on the same job page URL. Specifically:

- **Don't clear session on "New Tailor"** — instead, keep the JD/company/role and just clear the draft + chat. The user might want to re-tailor for the same JD.
  - Actually, re-reading the request: "don't remove the scraped JD and tailored resume draft and matches." The user wants the work to STAY after tailoring. The `newTailor()` function should NOT wipe if the user is on the same URL. Or better: remove the `newTailor()` destructive behavior entirely and just keep everything cached.
  
- **Keep the session alive as long as the URL matches.** The existing `readSession()` already checks `snap.url !== location.href` and returns null if different. So the session IS URL-scoped. The issue is `newTailor()` explicitly calls `clearSession()`.

- **Fix**: Remove the `clearSession()` call from `newTailor()`. Instead, `newTailor()` should just reset the draft to null but keep the JD fields. OR, don't provide a "New Tailor" button at all — the user stays on the same page with the same JD and can re-tailor.

- **Session persistence**: The session already persists across reloads on the same URL (6-hour TTL). The main fix is to stop `newTailor()` from wiping it.

### 3. Browse all resumes in the extension

The user wants to browse all saved resume versions in the extension drawer, so they can pick one to inject even if it wasn't in the "similar resumes" list.

**Implementation:**

Add a new section to the drawer (below or replacing the "Past tailored resumes" section):

- A "All Resumes" section with a scrollable list of all saved versions
- Each item shows: company/role (or version name), date, outcome badge
- Clicking an item loads that version as the current draft (same as clicking a similar resume card)
- A small search input to filter by company/role

**Backend:**

The existing `GET /api/versions` endpoint returns all versions. Need a new message type:

```typescript
| { type: "list-versions" }
```

Background handler calls `GET /api/versions` and returns the list.

The drawer renders this as a list below the similar resumes section. Clicking a version fetches its PDF via `fetch-version-pdf` and loads it as the draft.

## Current State

### Session persistence (`extension/src/session.ts`)
- Single key `aptedSession` in `chrome.storage.local`
- 6-hour TTL
- URL-scoped: only restores if `snap.url === location.href`
- Stores: jd, company, role, draftId, chat, similarResumes
- `clearSession()` removes the key entirely

### Drawer (`extension/src/drawer.ts`)
- `restoreFromSession()` (line ~2085): restores JD, company, role, draft, chat from session
- `schedulePersist()` (line ~1486): debounced write to session
- `newTailor()` (line ~2061): clears JD, company, role, draft, chat, similar → calls `clearSession()`
- `doScrape()` (line ~1230): scrapes JD, fills fields, calls find-similar, persists
- `doTailor()` (line ~1284): sends JD to /api/tailor, saves draft, renders similar resumes

### Similar resumes
- `renderSimilarResumes()` (line ~1049): renders similar resume cards in the drawer
- Cards are clickable to load the version as a draft (if implemented, check)
- `find-similar` message: sends JD to /api/versions/similar, returns top matches

### Save version flow
- `showSaveDialog()` (line ~2023): prompts for company, role, outcome
- `doSaveVersion()` (line ~2036): sends `save-version` message to background
- Background calls `POST /api/versions` with company, role, JD, tailoredContent, outcome

### Messages (`extension/src/messages.ts`)
- `save-version`: saves a version
- `find-similar`: finds similar versions by JD
- `fetch-version-pdf`: fetches a version's PDF
- No `list-versions` message type yet
- No `auto-save-application` message type yet

## Key Files

- `extension/src/drawer.ts` — all drawer UI and logic
- `extension/src/session.ts` — session persistence (chrome.storage.local)
- `extension/src/background.ts` — message handler, routes to web app APIs
- `extension/src/messages.ts` — message types
- `extension/src/types.ts` — shared types
- `src/lib/applications.ts` — Application type definition
- `src/app/api/versions/route.ts` — versions CRUD
- `src/app/api/versions/[id]/applications/route.ts` — create applications for a version
- `src/app/api/applications/[id]/route.ts` — application CRUD

## Testing

```bash
cd /Users/lloydalba/code/apted-submit-detect
npx vitest run                    # web app tests
cd extension && npx vitest run    # extension tests
cd extension && npm run build     # extension build
npm run dev                       # test against live job sites
```

## Out of Scope

- Multi-tab session syncing
- Background job monitoring for application status changes
- Email/notification integration
- Changing the applications page UI (that's PRE-85)