# PRE-80 — Master resume editor redesign

**Ticket:** PRE-80  
**Type of work:** Web app / master resume UI  
**Status:** shipped

## Summary

Redesigned the master resume editor into a Material-style three-pane workspace: a sticky editor header, a scrollable structured/LaTeX/JSON editor, and a custom PDF preview pane. Added drag-to-reorder everywhere, inline renaming, live PDF rendering via pdfjs-dist, export to PDF/TeX/JSON, trackpad zoom, and a persistent saved/unsaved indicator.

## Context / problem

The original master editor used a generic layout with a shared light-theme navbar, an iframe PDF preview, and small up/down arrow buttons for reordering. It did not feel like a dedicated document editor, the preview was hard to read, and reordering sections/items/bullets was slow and finicky.

## Options considered

### How should the preview render?

- ✅ **Custom pdfjs-dist canvas viewer** — full control over zoom, page indicator, dark theme, and export. Renders pages at device-pixel ratio for crisp text; all pages in one scrollable pane.
- ❌ **Browser default `<iframe>` PDF viewer** — easy to add but offers no styling, no zoom control, no export, and clips content at the bottom.

### How should users reorder sections and items?

- ✅ **Native HTML5 drag-and-drop with drag-indicator handles** — consistent across sections, section items, and curated bullets; no extra libraries.
- ❌ **Up/down arrow buttons** — already existed but required precise clicking and did not scale to long lists.

### Where should the PDF preview live?

- ✅ **Right-hand pane with a dark inverse-surface theme** — mirrors the screenshot reference and keeps the PDF page visually distinct from the light editor.
- ❌ **Light-themed preview** — harder to see page boundaries and looked visually flat.

## Decision

Ship a focused, app-like master editor. Remove the shared navbar and the left sidebar entirely; the editor is now the left pane and the custom PDF viewer is the right pane. Keep the page scaled to 90% and use the Outfit font only for the `apted` logo. Make LaTeX and JSON full-pane code editors; make Structured a scrollable card editor. Save compiles LaTeX on demand rather than auto-compiling.

## Files touched

- `src/app/master/page.tsx` — complete rewrite of the master page. New layout, drag-to-reorder, custom PDF viewer, editor header with mode toggles/status/save, export dropdown, and page/zoom controls.
- `src/app/api/master/compile/route.ts` — new endpoint that accepts raw `.tex` and returns a compiled PDF.
- `src/app/layout.tsx` — removed shared navbar for the master route; loaded Outfit font for the logo.
- `src/lib/resume.ts` — added optional `Contact.title` field and `notes` fields on experience/project items.
- `tailwind.config.ts` — added Material-style design tokens (colors, spacing, typography, radius).
- `docs/plans/2026-06-15-master-ui-redesign.md` — design plan for the prose-first bullet generation work.

## Key behaviors

- **Editor modes:** Structured, LaTeX, JSON. Toggles live in the sticky editor header.
- **Save:** persists structured JSON to `/api/master`; in LaTeX mode it also compiles `customTex` through `/api/master/compile` and updates the preview.
- **Drag handles:** section cards, section items, and curated bullets each have a `drag_indicator` handle; clicking it toggles a delete icon; clicking away cancels the delete toggle.
- **Custom PDF viewer:**
  - All pages rendered in one scrollable pane.
  - Page indicator tracks scroll position; prev/next buttons scroll to the target page.
  - Zoom in/out buttons plus trackpad zoom (Ctrl/pinch + scroll).
  - Renders at `devicePixelRatio` via an offscreen canvas to avoid flashes.
  - Dark inverse-surface header with export dropdown (PDF/TeX/JSON), editable filename, zoom controls, and page indicator.
- **Export filename:** defaults to `[ContactName]MasterResume` and is editable inline in the preview header; used for all three export formats.
- **Saved/unsaved indicator:** in the editor header, tracks resume and LaTeX snapshots.
- **PII masking:** eye icons on contact fields toggle visibility of sensitive values.

## Follow-ups

- [ ] Add keyboard shortcuts for mode switching, save, and zoom.
- [ ] Persist preview pane width and zoom level to user preferences.
- [ ] Consider a "fit to width" zoom button in the PDF viewer.
- [ ] Evaluate whether the 90% page zoom still makes sense now that toolbars are denser.
