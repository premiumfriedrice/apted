# Apted Design System

This document captures the design philosophy and concrete patterns used in the master resume editor (PRE-80). It is the reference for building the rest of the Apted application.

## Philosophy

- **App-like, not document-like.** Dense information, minimal chrome, direct manipulation.
- **Boring over clever.** Standard Material 3 patterns, native behaviors, and obvious affordances.
- **No speculative abstractions.** One implementation per concept; no config for values that never change.
- **Content first.** Toolbars and chrome stay compact so resumes, forms, and previews dominate the viewport.
- **Efficient motion.** Transitions are short (200ms), subtle, and only where they aid orientation.

## Layout

- **Page scale:** `zoom: 0.9` on the root for the master page. Use only when the target view is information-dense.
- **Top bar:** minimal. Left-aligned logo in Outfit, no tagline. White/surface background, bottom outline.
- **Three-pane workspace:** editor (left) | resizer | preview (right). No sidebar navigation inside the page.
- **Pane headers:** `h-12`, sticky, `bg-surface-container-lowest`, bottom `border-outline-variant`. Editor header uses light theme; preview header uses dark `inverse-surface` theme.
- **Resizers:** 1px vertical bars with a 2px grab indicator. Mouse-driven, no libraries.

## Color

Light theme is default. Dark accents are reserved for the PDF preview pane so the rendered page pops.

Key tokens (from `tailwind.config.ts`):

| Token | Value | Use |
|-------|-------|-----|
| `primary` | `#000000` | Primary actions, selected states |
| `on-primary` | `#ffffff` | Text on primary buttons |
| `surface` | `#f8f9fa` | Page backgrounds |
| `surface-container-lowest` | `#ffffff` | Headers, cards |
| `surface-container-low` | `#f3f4f5` | Hover backgrounds |
| `surface-container-high` | `#e7e8e9` | Active toggle backgrounds |
| `outline-variant` | `#c3c6d7` | Borders, dividers |
| `on-surface` | `#191c1d` | Primary text |
| `on-surface-variant` | `#434655` | Secondary text, icons |
| `inverse-surface` | `#2e3132` | Dark preview header/background |
| `inverse-on-surface` | `#f0f1f2` | Text on inverse surface |

Use `bg-white/10` for hover states on inverse surfaces.

## Typography

- Font family: Inter for UI; Charter/serif stack for rendered resume content.
- Scales:
  - `headline-lg`: 18/24 semibold
  - `headline-md`: 15/20 semibold
  - `body-md`: 14/20 regular
  - `body-sm`: 13/18 regular
  - `label-md`: 12/16 medium
  - `label-sm`: 11/14 semibold
- Section labels and metadata use `label-sm uppercase tracking-wider`.

## Components

### Buttons

- `primaryBtnCls`: black bg, white text, `px-4 py-2 rounded-lg`. For Save and primary actions.
- `smallBtnCls`: transparent, `text-on-surface-variant`, `hover:bg-surface-container-low`, `inline-flex items-center gap-1`. For toolbars with icons.
- `modeActiveBtnCls`: `bg-surface-container-high text-on-surface font-semibold`. For toggle groups (Structured / LaTeX / JSON).
- Inverse buttons (preview header): `text-inverse-on-surface hover:bg-white/10`.

### Cards

- White or `surface-container-lowest` background.
- `border border-outline-variant rounded-xl p-md`.
- Section cards have a drag-indicator handle, inline title input, and collapse chevron.

### Inputs

- Ghost-style inline edits: `bg-transparent border-none focus:ring-0 outline-none p-0`.
- Bordered inputs for form fields: `border-outline-variant rounded bg-surface focus:border-primary focus:ring-1`.
- Full-pane code editors (LaTeX/JSON): borderless, `resize-none`, flex-grow.

### Reorder / delete

- Drag handles use the Material `drag_indicator` icon.
- Clicking the drag handle toggles a delete icon; clicking away cancels.
- No up/down arrows for reordering.

## Patterns

### Status feedback

- Persistent indicator for saved/unsaved state (green “Saved”, tertiary “Unsaved changes”).
- Transient status messages only for errors or one-time events, never for the save state itself.

### Export

- Export button with dropdown: PDF, TeX, JSON.
- Export filename is editable inline in the preview header and defaults to `[ContactName]MasterResume`.

### Preview

- Custom canvas-based PDF viewer using pdfjs-dist.
- All pages in one scrollable pane; page indicator tracks scroll position.
- Zoom via buttons and Ctrl/trackpad wheel; rendered offscreen then blitted to avoid flashes.
- Rendered at `devicePixelRatio` for crisp text.

## Anti-patterns

- Do not add sidebars inside pages. Navigation lives outside the page chrome.
- Do not use the browser’s default `<iframe>` PDF viewer.
- Do not use arrow buttons for reordering.
- Do not auto-compile or auto-save heavy operations; trigger them explicitly via Save.
- Avoid arbitrary `max-w` clamps on user-editable text fields.

## Extending

When building a new page:

1. Use the same token set and Tailwind classes.
2. Keep the top bar minimal (logo + page-specific actions only).
3. Prefer native drag-and-drop and mouse events over libraries.
4. Place primary actions in a sticky `h-12` header.
5. Use the inverse-surface theme only for preview/document panes, not for general UI.
