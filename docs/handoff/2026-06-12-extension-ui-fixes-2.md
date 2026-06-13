# Handoff: Extension UI Fixes 2 (PRE-75 → 78)

**Date**: 2026-06-12
**Epic**: Extension UI Fixes 2 — round 2 of drawer polish
**Branch**: create from `main` at `b7fb134`

## Linear tickets

| ID | What | Priority |
|----|------|----------|
| PRE-75 | Fix job title and company name scraping in drawer | High |
| PRE-76 | Resizable PDF preview iframe in drawer | High |
| PRE-77 | Click similar resume card to view PDF fullscreen | Medium |
| PRE-78 | Style similar resume cards to match web app + limit to 3 | Medium |

## Current state

`main` (b7fb134) includes:
- Floating drawer content script (PRE-63→69)
- UI fixes: corner radius, PDF toolbar suppression, inject button, fullscreen overlay, scroll containment (PRE-70→74)
- `find-similar` message + `/api/versions/similar` endpoint (PRE-73)
- Inject-to-page fix (chrome.storage.session → message passing)

## Key files

```
extension/src/drawer.ts           — Main drawer: styles, HTML, state, handlers (1500+ lines)
extension/src/drawer.test.ts       — 98 tests for drawer constants, HTML, state
extension/src/background.ts        — Message routing: scrape, tailor, find-similar, fill-nearest-input
extension/src/messages.ts          — Type definitions for messages
extension/src/scrapers.ts           — Site-specific job description scrapers
extension/src/types.ts              — Shared types (Draft, ScrapedJob, SimilarResume, etc.)
src/app/api/versions/similar/route.ts — Server endpoint: POST /api/versions/similar
src/lib/relevance.ts                — Relevance ranking (overlap + embeddings)
```

## Ticket details

### PRE-75: Fix job title and company name scraping

**Problem**: After scraping, the company and role fields in the drawer are sometimes empty or wrong.

**Key files**:
- `extension/src/scrapers.ts` — each scraper returns `{ jobDescription, company, title, source }`
- `extension/src/drawer.ts` ~line 1210 — the scrape handler fills `els.jdCompany.value` and `els.jdRole.value`

**Fix**:
1. Audit each scraper (LinkedIn, Greenhouse, Lever, Workday, Ashby) for company/title extraction
2. If a scraper can't find company/title, parse it from the JD text as fallback (regex for "Company Name — Job Title" patterns)
3. Add scraper-specific tests

**Scraper sites to audit**:
- `https://*.linkedin.com/jobs/*` — LinkedIn
- `https://boards.greenhouse.io/*`, `https://job-boards.greenhouse.io/*`, `https://*.greenhouse.io/*` — Greenhouse
- `https://jobs.lever.co/*` — Lever
- `https://*.myworkdayjobs.com/*` — Workday
- `https://jobs.ashbyhq.com/*` — Ashby

### PRE-76: Resizable PDF preview

**Current state**: The preview iframe has `min-height: 280px` and no user-adjustable height. The `.apted-preview-body` class controls it.

**Implementation plan**:
1. Add a resize handle `<div>` below the preview iframe in `createDrawerHTML()`
2. Handle `mousedown` → track `mousemove`/`mouseup` on `document` to resize
3. Store the preferred height in `chrome.storage.local` under key `apted_preview_height`
4. Apply stored height on init, default 280px
5. Min: 200px, max: remaining drawer space minus JD + chat sections
6. Handle class: `.apted-resize-handle` — 6px tall, cursor: row-resize, subtle grip pattern

**CSS to add** (in `createDrawerStyles()`):
```css
.apted-resize-handle {
  height: 6px;
  cursor: row-resize;
  background: #f5f5f5;
  position: relative;
  flex-shrink: 0;
  transition: background 0.15s;
}
.apted-resize-handle:hover {
  background: #e5e5e5;
}
.apted-resize-handle::after {
  content: "···";
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 10px;
  color: #ccc;
  letter-spacing: 2px;
}
```

**Touch support**: Also handle `touchstart`/`touchmove`/`touchend` for mobile job sites.

### PRE-77: Click similar resume card → fullscreen PDF

**Current state**: The fullscreen overlay exists (`apted-fullscreen-overlay`) and shows the current draft's PDF. Similar resumes show as pills with company/role/score but aren't clickable.

**Implementation plan**:
1. Make each `.apted-similar-item` card clickable
2. On click, fetch the version's PDF via a new message type or existing `fetch-pdf` message
3. The `/api/versions/[id]` endpoint returns the version data including `pdfBase64`
4. Convert pdfBase64 to a blob URL and set it as `els.fullscreenEmbed.src`
5. Show the fullscreen overlay
6. If pdfBase64 is null, show "No PDF available" status message

**New message type** needed in `messages.ts`:
```ts
| { type: "fetch-version-pdf"; versionId: string }
```

**Background handler**: Route to `GET /api/versions/[id]`, extract `pdfBase64`, convert to blob response.

**Drawer changes** (in `renderSimilarResumes`):
- Change the pill to a clickable card
- Add click handler that fetches the PDF for that versionId
- Opens the fullscreen overlay with the result

### PRE-78: Style similar resume cards + limit to 3

**Current style** (small pills):
```css
.apted-similar-item {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  font-size: 12px;
  padding: 3px 10px;
  background: #f9fafb;
  border: 1px solid #e5e5e5;
  border-radius: 999px;
}
```

**Target style** (card matching web app):
- Background: `#fff`
- Border: `1px solid #e5e5e5`
- Border-radius: `6px` (rounded-md)
- Padding: `8px 12px`
- Display: flex row (score badge on left, role + company on right)
- Hover: `border-color: #d1d5db` (neutral-300)
- Cursor: pointer (clickable for PRE-77)
- Score badge: `background: #2563eb; color: #fff; font-size: 11px; font-weight: 700; padding: 2px 6px; border-radius: 999px;`

**Section title**: Change "Similar resumes" → "Past tailored resumes"

**Limit**: Only show max 3 cards. The server endpoint already returns top 5 with score > 10, so just `slice(0, 3)` in `renderSimilarResumes`.

**SimilarResume type** already has `{ company, role, score }`. The API returns `versionId` is needed for PRE-77 but not yet in the type — add `id?: string` to `SimilarResume` in `extension/src/types.ts`.

## Implementation order

```
PRE-75 (scrape fix) → PRE-78 (style + limit 3) → PRE-77 (click to fullscreen) → PRE-76 (resizable preview)
```

75 is independent and blocks nothing. 78 should come before 77 because 77 adds click handlers that depend on the card structure. 76 is independent.

## TDD checklist

For each ticket:
1. Write tests first in `extension/src/__tests__/drawer.test.ts` (or `scrapers.test.ts` for PRE-75)
2. Run `cd extension && npx vitest run`
3. Implement the feature
4. `npx tsc --noEmit` for type checking
5. `npm run build` for bundle
6. Push and create PR when all tickets done