# Handoff: Site Navigation + Shared Header + Library Reskin (PRE-82)

**Branch**: `feature/site-navigation`
**Worktree**: `/Users/lloydalba/code/apted-site-nav`
**Linear**: PRE-82
**Date**: 2026-07-02

## What to Build

### 1. Shared site header with navigation

Extract the header from the master resume page (`src/app/master/page.tsx`, line ~363) into a shared component used across all pages. The header should:

- Contain the "apted" wordmark (Outfit font, 22px, medium weight, tracking-tight) on the left
- Contain navigation links to the right of the wordmark: "Library" (root `/`) and "Master" (`/master`)
- Show an active-page indicator on the current page's nav link (e.g. bold text, underline, or a small dot — match the master page's toggle style)

Current master header (line ~363):
```tsx
<header className="bg-surface-container-lowest dark:bg-surface-dim text-primary dark:text-primary-fixed w-full h-16 sticky top-0 border-b border-outline-variant dark:border-outline flex items-center px-lg w-full z-50">
  <span className="text-[22px] font-medium tracking-tight text-on-surface dark:text-inverse-on-surface" style={{ fontFamily: "'Outfit', sans-serif" }}>apted</span>
</header>
```

The shared header should go in `src/app/layout.tsx` (the root layout) so it renders on every page. The master page should then remove its own duplicate header.

**Design tokens** (from `tailwind.config.ts` / `docs/design.md`):
- `bg-surface-container-lowest` (white), `h-16`, `sticky top-0`, `border-b border-outline-variant`, `px-lg`, `z-50`
- Nav links: `text-sm text-on-surface-variant hover:text-on-surface font-medium`
- Active link: `text-on-surface font-semibold` + a small bottom border indicator or dot
- Small ghost button style for nav links: transparent bg, hover shows `bg-surface-container-low`

### 2. Remove the per-page header from master

The master page (`src/app/master/page.tsx`) currently has its own header (line ~363-365). Remove it since the shared header in layout.tsx now handles this. The master page's editor toolbar (the Structured/LaTeX/JSON toggle row, line ~372+) stays — that's a sub-toolbar, not the site header.

### 3. Reskin the library page (root `/`)

The library page (`src/app/page.tsx`) currently uses old styling: `bg-neutral-50`, `border-neutral-200`, `rounded-lg`, etc. Reskin it to match the master page's design system:

**Cards:**
- `bg-surface-container-lowest` (white), `border border-outline-variant`, `rounded-xl` (12px)
- Hover: `hover:border-on-surface-variant` + soft shadow

**Filter chips:**
- Replace the current `bg-neutral-900 text-white` active state with the design system's button styles
- Active chip: `bg-on-surface text-surface-container-lowest rounded-lg font-medium text-sm` (black bg, white text)
- Inactive chip: ghost button style — `text-on-surface-variant hover:bg-surface-container-low rounded-lg`

**Outcome badges:**
- Keep the color coding but use the design system's rounded-full and label-sm typography

**Page layout:**
- Remove `max-w-6xl` wrapper — use the same full-width layout as master page
- Add `px-lg py-lg` padding consistent with master page
- Use `bg-background` (surface) as page background

**Typography:**
- Page title "Library": `headline-lg` (18px semibold) instead of `text-2xl font-semibold`
- Card title: `headline-md` (15px semibold)
- Card metadata: `body-sm` (13px)
- Section labels: `label-sm uppercase tracking-wider`

**Detail modal:**
- Keep the two-column layout but reskin borders to `border-outline-variant`
- Use `surface-container-lowest` backgrounds
- Dark PDF pane should use `inverse-surface` theme like the master page's preview

### 4. Third nav link (placeholder)

The user wants a third page but hasn't decided what it is yet. For now, add a placeholder nav link with a disabled/coming-soon state. Options to present to the user:
- **Builder** (`/builder`) — the tailor/chat page where users create new tailored resumes
- **Settings** (`/settings`) — the settings page for API keys and provider config
- **Jobs** — a job tracking dashboard showing application outcomes

For now, add "Builder" (`/builder`) as the third link since that page already exists and is the natural next step after Library → Master → Builder (view versions → manage master → create new).

## Key Files

- `src/app/layout.tsx` — root layout, add shared header here
- `src/app/page.tsx` — library page, reskin
- `src/app/master/page.tsx` — remove duplicate header (line ~363-365)
- `src/app/builder/page.tsx` — builder page (exists, will get nav link)
- `src/app/settings/page.tsx` — settings page (exists)
- `tailwind.config.ts` — design tokens (reference only, no changes needed)
- `docs/design.md` — design system reference

## Design System Reference

See `docs/design.md` for the full token set. Key values:

| Token | Value | Use |
|-------|-------|-----|
| `primary` / `on-surface` | `#000000` / `#191c1d` | Primary actions, text |
| `surface` / `background` | `#f8f9fa` | Page backgrounds |
| `surface-container-lowest` | `#ffffff` | Headers, cards |
| `surface-container-low` | `#f3f4f5` | Hover backgrounds |
| `outline-variant` | `#c3c6d7` | Borders, dividers |
| `on-surface-variant` | `#434655` | Secondary text, icons |
| `inverse-surface` | `#2e3132` | Dark preview header/background |

Fonts: Inter (UI), Outfit (logo), Material Symbols (icons).
Radius: 12px for cards (rounded-xl), 6px for inputs/buttons (rounded-lg).

## Testing

```bash
cd /Users/lloydalba/code/apted-site-nav
npx vitest run           # web app tests (must pass)
npx tsc --noEmit         # type check (must pass)
npm run dev              # visual check: nav header on all 3 pages, library styling
```

## Out of Scope

- Changing the builder page UI (only adding it to nav)
- Changing the settings page UI
- Changing the extension
- Backend/API changes