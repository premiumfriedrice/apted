# Handoff: Dashboard UI Cleanup, Profile Modal, Policy Pages (PRE-87) — COMPLETE

**Status**: Implemented and merged-ready on `feature/dashboard-ui-cleanup`.
Final commit: `a64604a`. tsc clean, 167 tests pass, `next build` succeeds.
Next step: squash-merge to main and clean up the worktree (see WORKFLOW.md).

**Branch**: `feature/dashboard-ui-cleanup`
**Worktree**: `/Users/lloydalba/code/apted-dashboard-ui`
**Linear**: PRE-87
**Date**: 2026-07-18

## What to Build

### 1. Dashboard section spacing and UI cleanup

Clean up the dashboard page (`src/app/page.tsx`):
- Fix spacing between sections (Recent Resumes, Application Tracker)
- Ensure consistent vertical rhythm between all sections
- Clean up any inconsistent padding/margins
- Make the search bar consistent with the design system

Current state: sections have `mb-12` on Recent Resumes but no consistent spacing pattern. The Application Tracker section has no bottom margin. Filter and Export buttons exist but may not be wired up.

### 2. Profile footer modal

When the user clicks the profile footer in the AppShell sidebar, show a modal/popover with:
- **Settings** link (goes to `/settings`)
- **Upgrade plan** link (placeholder for now, can show a "coming soon" message)
- **Learn more** section with links to:
  - Privacy Policy (`/privacy`)
  - Usage Policy (`/usage`)
  - Terms of Service (`/terms`)

Current state: The profile footer (`src/components/AppShell.tsx` line ~220) has a settings icon link and a logout button. Clicking the profile avatar/name does nothing. Replace the direct settings link + logout with a click handler that opens a modal.

The modal should:
- Use the design system tokens (surface-container-lowest, outline-variant)
- Show the user's name and email at the top
- List the links as a vertical menu
- Include a "Sign out" button at the bottom
- Close on click-away or Escape

### 3. Policy pages

Create three static pages with placeholder legal text:
- `src/app/privacy/page.tsx` — Privacy Policy
- `src/app/usage/page.tsx` — Usage Policy
- `src/app/terms/page.tsx` — Terms of Service

Each page should:
- Use the AppShell wrapper
- Have a max-width readable layout (max-w-3xl)
- Show a heading and placeholder body text
- Use design system typography tokens

## Current State

### Dashboard (`src/app/page.tsx`)
- Recent Resumes section with `mb-12` spacing
- Application Tracker section with no bottom margin
- Search bar at the top
- View all links (recently fixed to point to /resumes and /applications)
- New Resume dashed card in the grid

### AppShell profile footer (`src/components/AppShell.tsx` line ~220)
- Collapsed mode: settings icon + avatar circle
- Expanded mode: avatar + name + tier + logout button + settings icon
- No modal/popover on profile click

### No policy pages exist yet

## Key Files

- `src/app/page.tsx` — dashboard, fix spacing
- `src/components/AppShell.tsx` — add profile modal
- `src/app/privacy/page.tsx` — NEW: privacy policy
- `src/app/usage/page.tsx` — NEW: usage policy
- `src/app/terms/page.tsx` — NEW: terms of service
- `docs/design.md` — design system reference

## Testing

```bash
cd /Users/lloydalba/code/apted-dashboard-ui
npx vitest run
npx tsc --noEmit
npm run build
npm run dev  # visual check
```

## What was done

- **Dashboard spacing**: Fixed a JSX nesting bug (`src/app/page.tsx`) where the
  Master Resume `<section>` was rendered *inside* the Application Tracker
  section due to a missing closing tag. Sections are now siblings and every
  section uses a consistent `mb-12` bottom margin.
- **Profile footer modal**: `src/components/AppShell.tsx` now lifts
  `profileOpen` state and `logout` into `AppShell`. The sidebar footer
  (both collapsed avatar and expanded name row) opens a `ProfileMenu`
  popover anchored to the bottom-left of the sidebar. It shows the user's
  name/email, a Settings link, an "Upgrade plan" disabled placeholder
  ("Soon" pill), a "Learn more" group linking to /privacy, /usage, /terms,
  and a Sign out button. Closes on click-away or Escape, and re-anchors
  when the sidebar collapses/expands. The standalone settings icon and
  logout button were removed from the footer (now in the menu).
- **Policy pages**: Created `src/app/privacy/page.tsx`,
  `src/app/usage/page.tsx`, `src/app/terms/page.tsx` as static server
  components rendered inside AppShell, using a `max-w-3xl` readable layout
  and design-system typography tokens. Placeholder legal text only.

## Out of Scope

- AI insights caching (that's PRE-88, separate worktree)
- Dashboard data/analytics changes
- Payment/upgrade flow implementation
- Changing the sidebar nav structure