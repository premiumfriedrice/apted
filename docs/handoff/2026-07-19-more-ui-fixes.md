# Handoff: More UI Fixes (PRE-92)

**Branch**: `feature/more-ui-fixes`
**Worktree**: `/Users/lloydalba/code/apted-more-ui-fixes`
**Linear**: PRE-92
**Date**: 2026-07-19

## What to Fix

These issues were partially addressed in PRE-91 but are still broken. Fix each one properly.

### 1. Sidebar alignment: logo, nav icons, and profile are NOT aligned

The brand area, nav links, and profile footer use different horizontal padding, causing the icons/text to not line up vertically.

**Current state (the bug):**
- Brand area: `px-md` (16px) on the outer div, then `w-12` (48px) centered div inside. Logo text center is at 16 + 24 = 40px from left.
- Nav links: `mx-md` (16px) + `px-md` (16px) = 32px margin+padding, then `w-12` (48px) centered div. Icon center is at 32 + 24 = 56px from left.
- Profile footer: `px-md` (16px), then `w-12` (48px) centered div. Avatar center is at 16 + 24 = 40px from left.

So nav icons are at 56px while logo and profile are at 40px. They don't align.

**Fix:** Use the same horizontal padding for all three. The nav links should NOT have both `mx-md` and `px-md`. Pick one:
- Option A: Remove `mx-md` from nav links, keep only `px-md` (matches brand and profile)
- Option B: Add `mx-md` to brand and profile (but this is more complex)

Recommended: Option A. Change nav link className from `mx-md px-md` to just `px-md` (remove mx-md). This aligns all three at 40px from the left edge for the icon center.

**File:** `src/components/AppShell.tsx` line ~236

### 2. Skeleton for Sankey diagram on applications page

A `SkeletonFunnel` component exists and is imported, but verify it actually renders during loading. The current code shows it only when `loading` is true, but check that the `loading` state is properly set.

**File:** `src/app/applications/page.tsx` line ~177

### 3. Skeleton for application activity stats on dashboard

A `SkeletonStatCard` component exists and is used. Verify it renders properly during loading and that the stats don't show "0" before data loads.

**File:** `src/app/page.tsx` line ~163

### 4. Hover action on application rows: dashboard vs applications page

Both pages now have clickable rows with `cursor-pointer` and `hover:bg-surface-container-lowest`. Verify the hover styles match exactly. The dashboard rows have a "Resume Used" link that uses `stopPropagation` — make sure the applications page does the same.

**Files:** `src/app/page.tsx` line ~207, `src/app/applications/page.tsx` line ~250

### 5. Application portal link in single application view

The portal URL field in the single application view (`/applications/[id]`) currently shows the raw URL as a link that opens in a new tab. The user wants this to be more user-friendly — show a cleaner link like "Open application portal" that links to the portal URL, rather than showing the full raw URL.

**Current:** Shows `{portalUrl}` as link text with an `open_in_new` icon
**Desired:** Show "Open application portal" as the link text, or show the domain name instead of the full URL

**File:** `src/app/applications/[id]/page.tsx` line ~383

### 6. Search bar text on dashboard

Already changed to "Search by company or role..." — verify this is correct and appropriate.

**File:** `src/app/page.tsx` line ~145

## Key Files

- `src/components/AppShell.tsx` — sidebar alignment fix
- `src/app/applications/page.tsx` — skeleton funnel, row hover
- `src/app/page.tsx` — skeleton stats, row hover, search text
- `src/app/applications/[id]/page.tsx` — portal link text
- `src/components/Skeleton.tsx` — skeleton components (verify they work)

## Testing

```bash
cd /Users/lloydalba/code/apted-more-ui-fixes
npx vitest run
npx tsc --noEmit
npm run build
npm run dev  # visual check: sidebar alignment, loading states, hover, portal link
```

## Out of Scope

- Changing the sidebar collapse animation (already fixed in PRE-90)
- Adding new features
- Changing the extension

---

## Resolution (commit cee648e)

All six items completed; tests, `tsc --noEmit`, and `npm run build` all pass.

1. **Sidebar alignment:** `src/components/AppShell.tsx` nav links use `px-md` only (dropped `mx-md`) so brand, nav icons, and profile avatar all center at 40px from the edge.
2. **Skeleton funnel (applications page):** Verified `loading ? <SkeletonFunnel/> : ...` renders while loading; `SkeletonRow`s also render in the table body during load.
3. **Skeleton stat cards (dashboard):** Verified four `SkeletonStatCard`s render while `loading` is true; real `StatCard`s only render after load, so "0" never flashes.
4. **Row parity (applications page takes precedence):** Dashboard recent-application rows now mirror `/applications`: the Resume Used cell is a plain text link with `hover:underline` + `stopPropagation`, and the Status cell is an inline `<select>` with optimistic `updateOutcome` + `updatingId` (ported from `src/app/applications/page.tsx`, replacing the static badge and the unused cycling `updateOutcome`).
5. **Portal link label:** In `src/app/applications/[id]/page.tsx` the link now reads "Open application portal" with an `open_in_new` icon; the hostname (with `www.` stripped) is shown as secondary text instead of the raw URL.
6. **Search placeholder:** Verified `"Search by company or role..."` in `src/app/page.tsx`.
