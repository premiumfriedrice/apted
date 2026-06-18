# Handoff: Drawer UI Improvements (PRE-81)

**Branch**: `feature/drawer-ui-improvements`
**Worktree**: `/Users/lloydalba/code/apted-drawer-ui`
**Linear**: PRE-81
**Date**: 2026-06-18

## Context

The Chrome extension drawer (`extension/src/drawer.ts`) is a single-file content script (~1700 lines) that runs as a floating panel on job sites. It handles: scraping JDs, tailoring resumes, displaying PDF previews, similar resumes, and chat-based editing.

## Two Changes

### 1. Loading indicator during tailoring

**Current state**: When the user clicks "Tailor Resume", the button disables and a text status shows "Tailoring… this can take 10–30s." That's it — no animation, no progress.

**What to do**: Add an animated bouncing-dots SVG (MessageLoading component pattern) that shows during the tailoring phase. This should replace or augment the current plain status text in the drawer.

The component is a simple SVG with 3 circles that bounce with staggered timing:

```tsx
<svg width="24" height="24" viewBox="0 0 24 24" className="text-foreground">
  <circle cx="4" cy="12" r="2" fill="currentColor">
    <animate id="spinner_qFRN" begin="0;spinner_OcgL.end+0.25s" attributeName="cy" calcMode="spline" dur="0.6s" values="12;6;12" keySplines=".33,.66,.66,1;.33,0,.66,.33" />
  </circle>
  <circle cx="12" cy="12" r="2" fill="currentColor">
    <animate begin="spinner_qFRN.begin+0.1s" attributeName="cy" calcMode="spline" dur="0.6s" values="12;6;12" keySplines=".33,.66,.66,1;.33,0,.66,.33" />
  </circle>
  <circle cx="20" cy="12" r="2" fill="currentColor">
    <animate id="spinner_OcgL" begin="spinner_qFRN.begin+0.2s" attributeName="cy" calcMode="spline" dur="0.6s" values="12;6;12" keySplines=".33,.66,.66,1;.33,0,.66,.33" />
  </circle>
</svg>
```

**Implementation notes**:
- The drawer is vanilla JS/TS in a content script (NOT React). The SVG animation needs to be created as inline SVG in the shadow DOM, or inserted as an innerHTML fragment.
- There's already a CSS spinner (`.apted-spinner`) used for PDF loading. The new bouncing-dots animation should be a separate CSS class or inline SVG added to the status area during tailoring.
- Key files: `extension/src/drawer.ts` (all UI, CSS, HTML in one file)
- The `doTailor()` function (line ~1284) sets status text and disables the button. Add the animation there.
- The `setStatus()` function (line ~1620) updates a status bar at the top of the drawer. Consider showing the bouncing dots next to or replacing the status text during tailoring.

### 2. PDF viewer sizing fix

**Current state**: When the compiled PDF loads into the `#apted-preview-embed` iframe, the iframe doesn't fill the container. There's visible space between the PDF edges and the container walls.

**What to do**: Make the PDF iframe fill the entire `#apted-preview` container with zero gaps.

**Current CSS** (line ~436):
```css
.apted-preview-body {
  border: 1px solid #e5e5e5;
  background: #f9fafb;
  border-radius: 6px;
  overflow: hidden;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 280px;
  resize: vertical;
}

.apted-preview-embed {
  width: 100%;
  height: 100%;
  border: 0;
  border-radius: 6px;
}
```

The iframe already has `width: 100%; height: 100%` but the `display: flex; align-items: center; justify-content: center` on the container creates a flex context that may not give the iframe its full calculated size. Fix: when the iframe is visible, the container should use `display: block` or ensure the iframe gets `flex: 1; min-height: 0` so it fills the space.

**Key insight**: The `resize: vertical` on the container means users can resize. The iframe must always fill whatever size the container currently is.

## Key Files

- `extension/src/drawer.ts` — ALL drawer UI (HTML, CSS, JS in one file)
- `extension/src/drawer.css` — unused (styles are inline in drawer.ts)
- `extension/src/background.ts` — message handler, routes to web app APIs
- `extension/src/messages.ts` — message types
- `extension/src/__tests__/drawer.test.ts` — drawer tests

## Testing

```bash
cd /Users/lloydalba/code/apted-drawer-ui
npx vitest run                    # web app tests (must pass)
cd extension && npx vitest run    # extension tests (must pass)
cd extension && npm run build    # extension build (must succeed)
```

## Architecture

- The drawer runs as a content script injected into the page via `chrome.scripting.executeScript`
- All UI is built programmatically in a shadow DOM to avoid CSS conflicts with the host page
- CSS is embedded as a template literal string in drawer.ts (not a separate CSS file)
- The extension doesn't use React — it's all vanilla DOM manipulation
- Communication with the Next.js backend goes through `chrome.runtime.sendMessage` → `background.ts` → `fetch()` to the web app API

### 3. Similar resumes before tailoring

**Current state**: Similar resumes only appear after a tailor run (`renderSimilarResumes` is called after the tailor response comes back).

**What to do**: After scraping a JD, immediately call `find-similar` to show past resumes that match BEFORE the user clicks "Tailor Resume." The user can then decide whether to tailor from scratch or start from an existing version.

**Key data flow**:
- `doScrape()` (line ~1230) already calls `find-similar` after scraping, so similar resumes show up in the drawer right after scraping.
- But currently `renderSimilarResumes` is also called after tailoring with `draft.similarResumes`.
- The similar-resume cards should have a "Use this" or "Load" action that sets the draft to that past version.

**Backend**: `POST /api/versions/similar` takes a `jobDescription` and returns `{ similar: [{id, company, role, score, tailored_content}] }`. This already exists.

### 4. Select a past resume to edit

**What to do**: When the user clicks a similar resume card, load that version as the current draft. Then they can edit it via chat instead of starting a fresh tailor from master.

**Key data flow**:
- Similar resume cards already exist in the drawer (rendered by `renderSimilarResumes`).
- Need a click handler on each card that:
  1. Fetches the full version content via `fetch-version-pdf` or a new `get-version` message
  2. Sets `state.draft` to that version's content
  3. Renders the PDF preview for that version
  4. Enables the chat/edit flow on that version
- The `send({ type: "get-draft", draftId })` message already fetches a draft by ID.
- May need a new message type or endpoint to fetch a version (not just a draft) by ID.

### 5. ATS keyword match score indicator

**What to do**: Show a visual ATS keyword match score that indicates what percentage of JD keywords appear in the current resume. This helps the user gauge alignment before applying.

**Implementation approach**:
- The `/api/extract` endpoint already extracts `terms` (keywords) from a JD.
- After scraping, call `/api/extract` to get JD keywords.
- Display a score like "72% keyword match" or a small progress bar next to the similar-resumes section or in the status area.
- The score could be: `(# of JD terms found in resume text) / (# of JD terms) * 100`.
- This is a display-only feature — no backend changes needed beyond what already exists.

## Related Linear Issues

- PRE-76: Resizable PDF preview iframe in drawer (related to sizing)
- PRE-74: Add fullscreen popup button for resume PDF preview
- PRE-75: Fix job title and company name scraping (done — LLM only now)
- PRE-78: Style similar resume cards to match web app + limit to 3
- PRE-77: Click similar resume card to view PDF fullscreen