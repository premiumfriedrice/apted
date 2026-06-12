# Handoff: Extension UI Fixes (PRE-70 → 74)

**Date**: 2026-06-11
**Epic**: Extension UI Fixes — polish the floating drawer after the PRE-63→69 overhaul
**Branch**: create from `main` at `fa69154`

## Linear tickets

| ID | What | Priority |
|----|------|----------|
| PRE-70 | Match drawer corner radius to web app rounded-md | High |
| PRE-71 | Remove Chrome PDF viewer toolbar from preview iframe | High |
| PRE-72 | Inject-to-page button above preview | Medium |
| PRE-73 | Show similar resumes immediately on scrape | Medium |
| PRE-74 | Fullscreen popup button for resume PDF | Medium |

## Current state

`main` (fa69154) has the full floating drawer from PR #10 merged. The drawer (`extension/src/drawer.ts`, 1411 lines) runs as a content script that injects into job-site pages via shadow DOM. It replaces the old Chrome sidePanel.

### Key files to touch

```
extension/src/drawer.ts      — Main file: styles (inline CSS), HTML template, state, handlers
extension/src/drawer.css      — Created when drawer module was first scaffolded; currently empty/unused. Ignore it — all styles are inline in drawer.ts.
extension/src/background.ts   — fill-nearest-input handler using chrome.scripting.executeScript
extension/src/messages.ts     — message type definitions for fill-nearest-input, scrape, tailor, etc.
extension/src/drawer.test.ts  — 580 lines, 70 tests. Add new tests here.
extension/build.mjs           — esbuild config; already includes drawer entry
extension/manifest.json       — content_scripts for drawer.js on supported sites
```

### Architecture notes

**Drawer rendering**: The drawer is created as a shadow DOM host:

```
drawer.ts init() →
  creates a <div> in document.body →
  attaches shadowRoot →
  populates innerHTML with styles + HTML template →
  wires up element refs via the `$()` helper →
  starts the state loop
```

**State**: The `DrawerState` object holds draft, chat, JD text, etc. Persisted to `chrome.storage.session` on a 250ms debounce. Settings come from `chrome.storage.sync`.

**Message passing**: All API calls go through `chrome.runtime.sendMessage()` to `background.ts`. The background service worker handles:
- `scrape` — scrape job description from the page
- `tailor` — tailor the resume
- `edit` / `undo` — edit/undo operations
- `fetch-pdf` — get the compiled PDF
- `fill-nearest-input` — inject PDF into file input on the page

**Shadow DOM**: All CSS selectors are prefixed with `.apted-` to avoid conflicts. The `:host` selector styles the shadow root container itself.

## Ticket details

### PRE-70: Match corner radius

**Current values in drawer.ts:**
| Element | Current radius | Web app equivalent | Should be |
|---------|---------------|-------------------|-----------|
| `.apted-drawer` (main body) | 8px | rounded-lg | **6px** (rounded-md) |
| `.apted-card` | 6px | already matches | 6px |
| `.apted-btn` | 5px | — | **6px** |
| `.apted-input`, `.apted-textarea` | 5px | — | **6px** |
| `.apted-handle` (lowercase-a tab) | 50% | — | leave as-is |
| `.apted-status` | 6px | already matches | 6px |
| Dialog | 8px | rounded-lg | leave as-is |

**Work**: Search `drawer.ts` for `border-radius` (around line 149, 175, 224, 261, 319, 353, 369, 400, 408, 420) and update:
- All 5px → 6px
- 8px on `.apted-drawer` → 6px
- 8px on dialog → leave as-is (dialogs use rounded-lg in web app)

### PRE-71: Remove PDF toolbar

**Problem**: Chrome's built-in PDF viewer shows a toolbar (print, download, rotate, etc.) inside the iframe.

**Fix locations** in `drawer.ts`:
1. Line ~918: `els.previewEmbed.src = objectUrl` — append `#toolbar=0&navpanes=0`
2. Line ~1202: `els.previewEmbed.src = url` — same
3. Line ~1266: `els.previewEmbed.src = ""` — clear, no change needed

**Implementation**:
```ts
// Helper function
function withPdfToolbarSuppressed(url: string): string {
  if (!url) return url;
  const sep = url.includes("#") ? "&" : "#";
  return url + sep + "toolbar=0&navpanes=0";
}
// Then use: els.previewEmbed.src = withPdfToolbarSuppressed(objectUrl);
```

**Note**: This only works in Chrome. If the user has a different PDF handler (Adobe, etc.), the toolbar may still appear — that's expected and acceptable.

### PRE-72: Inject-to-page button

**Current state**: The drawer has download/save/undo buttons in the preview header row. No inject button.

**HTML to add** (line ~663, inside the preview `apted-card-row`):
```html
<button id="apted-inject-pdf" class="apted-btn apted-btn--sm" disabled>Inject to page</button>
```

**Element ref** (add to `els` object around line ~845):
```ts
injectPdf: $<HTMLButtonElement>("apted-inject-pdf"),
```

**Click handler** (add in the `wireEvents`/`onMount` section):
```ts
els.injectPdf.addEventListener("click", async () => {
  els.injectPdf.disabled = true;
  els.injectPdf.textContent = "Injecting…";
  const reply = await send<{ ok: boolean; error?: string }>({
    type: "fill-nearest-input"
  });
  if (reply.ok) {
    els.injectPdf.textContent = "Injected ✓";
    els.injectPdf.classList.add("apted-btn--success");
    setTimeout(() => {
      els.injectPdf.textContent = "Inject to page";
      els.injectPdf.classList.remove("apted-btn--success");
      els.injectPdf.disabled = false;
    }, 2000);
  } else {
    els.injectPdf.textContent = "Failed";
    els.injectPdf.disabled = false;
  }
});
```

**Show/hide**: Enable when `state.draft` is set, disable otherwise. Add to the existing `updateUI()` function alongside the download/save/undo disabled states.

**Background.ts already handles this**: The `fill-nearest-input` case in background.ts reads the base64 PDF from chrome.storage.session, injects a script into the active tab, finds a file input, and fills it. The drawer needs to first stash the PDF base64 into session storage before sending the message.

**Stashing PDF**: The drawer already fetches the PDF via `fetchPdfForPreview` and gets a blob. Before calling `fill-nearest-input`, convert the blob to base64 and store:
```ts
const reader = new FileReader();
reader.readAsDataURL(blob);
reader.onload = () => {
  const b64 = (reader.result as string).split(",")[1]; // strip data: prefix
  chrome.storage.session.set({ aptedDragPdfB64: b64, aptedDragPdfFilename: "resume.pdf" });
  // Then send the message
};
```

### PRE-73: Similar resumes on scrape

**Current behavior**: `renderSimilarResumes()` is called in two places:
1. Line ~1129: After tailoring completes (inside tailor success handler)
2. Line ~1268: `els.similarSection.hidden = true` (cleared on new session)

**Desired**: Call `renderSimilarResumes()` immediately after scraping.

**Current scrape handler** (around line ~1090-1120 in drawer.ts):
It scrapes the JD, fills the form fields, and enables the tailor button.

**Fix**: After a successful scrape, make an API call to find similar resumes. This may require a new API endpoint or reusing logic from `/api/tailor`.

**Recommended approach**: Add a `find-similar` message type to `messages.ts` that background.ts routes to a new `/api/versions/similar` endpoint. The drawer calls this after scrape and renders the results.

**API design**:
```
POST /api/versions/similar
{ jobDescription: string, limit?: number }
→ { similar: { versionId: string, role: string, company: string, score: number }[] }
```

**Drawer changes**:
1. Add `find-similar` to `messages.ts` Msg type
2. Background.ts: route to new API endpoint
3. Drawer.ts: call after scrape, render results
4. also when clicking a similar resume, load that version as the draft

### PRE-74: Fullscreen popup

**Button**: Add `Fullscreen` button in the preview header row (alongside Inject/Download/Save/Undo).

**Click handler** (in drawer.ts):
```ts
els.fullscreenBtn.addEventListener("click", async () => {
  if (!state.draft?.id) return;
  // Option A: Open in popup window
  window.open(
    `http://localhost:3000/api/drafts/${state.draft.id}/pdf?toolbar=0`,
    "resume-preview",
    "width=900,height=1100,left=50,top=50"
  );
});
```

**Better approach — shadow DOM overlay**:
Instead of a popup, show a fullscreen overlay within the shadow DOM:
- Add `.apted-fullscreen-overlay` CSS and a div to the HTML
- Toggle with `hidden` attribute
- Show the same `<iframe>` but at full viewport
- Close button (×) in top-right corner
- Close on Escape
- No toolbar on the fullscreen PDF (use PRE-71's `withPdfToolbarSuppressed`)

If using the overlay approach, the iframe needs to be re-rendered at full size or the existing iframe can be temporarily reparented to the fullscreen overlay.

## Implementation order

```
PRE-70 → PRE-71 → PRE-72 → PRE-74 → PRE-73
```

70/71/72/74 are all in the drawer preview area and overlap. PRE-73 touches a separate code path (scrape handler) and may need a new API endpoint.

## TDD checklist

For each ticket:
1. Write tests in `extension/src/__tests__/drawer.test.ts`
2. Tests should mock chrome.* APIs (see existing tests for patterns)
3. Run `cd extension && npx vitest run`
4. Implement the feature
5. `npx tsc --noEmit` for type checking
6. `npm run build` for bundle

## PR readiness

When all tickets done:
1. All tests pass (`npx vitest run`)
2. TypeScript clean (`npx tsc --noEmit`)
3. Extension builds (`cd extension && npm run build`)
4. Commit with ticket references, push branch, open PR against main
