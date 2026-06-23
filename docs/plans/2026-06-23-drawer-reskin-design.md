# Drawer Reskin Design

**Date**: 2026-06-23  
**Branch**: `feature/drawer-ui-improvements`  
**Linear**: PRE-81  
**Scope**: Reskin only — no functional PRE-81 features in this change.

## Goal

Update the Chrome extension drawer (`extension/src/drawer.ts`) to match the
Material 3-style design system defined in `docs/design.md` and established by
the master resume editor (PRE-80).

## Constraints

- Keep the drawer as a 384px floating right-side panel.
- No backend changes.
- No new dependencies.
- Touch only `extension/src/drawer.ts` (CSS and DOM class names) unless a
  shared token file is clearly beneficial.

## Layout

- **Drawer shell**: `bg-surface`, `border-outline-variant`, `rounded-xl`, soft
  shadow.
- **Header**: `h-12`, sticky, `bg-surface-container-lowest`, bottom
  `border-outline-variant`. Left: `Outfit` logo/title. Right: close/settings
  icon buttons (`smallBtnCls`). Connection status moves out of header.
- **Body**: scrollable stacked cards with 12px gap and 16px padding:
  1. Job card
  2. Similar resumes card
  3. Actions card (Tailor / Save)
  4. Preview card
  5. Chat card
- **Footer**: removed as a separate sticky element; chat input lives inside the
  chat card.

## Components

- **Primary buttons**: black bg, white text, `rounded-lg`, `px-4 py-2`.
- **Secondary/icon buttons**: transparent, `text-on-surface-variant`,
  `hover:bg-surface-container-low`.
- **Inputs/textarea**: `border-outline-variant rounded bg-surface`,
  `focus:border-primary focus:ring-1`.
- **Cards**: `bg-surface-container-lowest`, `border-outline-variant`,
  `rounded-xl`, `p-md`.
- **Section labels**: `label-sm uppercase tracking-wider`
  `text-on-surface-variant`.
- **Status**: persistent `label-sm` line, colored only for error/success.
- **Preview header**: `inverse-surface` with `inverse-on-surface` text and
  `hover:bg-white/10` buttons.

## Behavior changes

- Status text remains the source of truth for progress; add bouncing-dots SVG
  during tailoring.
- PDF preview container uses `display: block` so the iframe fills the card.
- Similar-resume cards use the new bordered style with an explicit action
  button.
- Connection status moves to a compact chip or the status bar.

## Out of scope

Functional PRE-81 features (loading dots implementation, PDF sizing fix,
similar resumes before tailoring, selecting past resumes, ATS score,
comments) are documented separately and will be implemented after this reskin.
