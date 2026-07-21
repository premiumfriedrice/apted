# Handoff: V1 Polishing - Skeletons + Animation Fixes (PRE-90)

**Branch**: `feature/v1-polishing`
**Worktree**: `/Users/lloydalba/code/apted-v1-polishing`
**Linear**: PRE-90
**Date**: 2026-07-19

## What to Build

### 1. Skeleton loaders for loading states
Add skeleton placeholders for pages while data loads:
- Dashboard: skeleton cards for recent resumes, skeleton rows for recent applications
- Resumes page: skeleton cards in the grid
- Applications page: skeleton rows in the table
- Resume detail page: skeleton for PDF preview and insights
- Master page: already has a loading state, improve it with skeleton

### 2. Sidebar animation fixes
Three bugs to fix in AppShell.tsx:

**Bug 1: Icons shift right during collapse animation**
- Current: icons slide right with the drawer edge, then snap to collapsed position
- Fix: icons should stay stationary in their final (collapsed) position at all times
- The sidebar width transitions, but icon positions don't change
- Use a single layout for both states: icons always centered in w-12, text hidden by overflow when collapsed

**Bug 2: Profile lowers during collapse**
- Current: the profile avatar drops down when collapsing
- Fix: profile should stay at the same vertical position in both states

**Bug 3: Padding bar under profile in collapsed state**
- Current: `pb-md` on the footer container creates a visible gap below the profile when hovering (hover bg reveals the padding)
- Fix: remove the extra padding so the profile sits flush at the bottom

### 3. Extension drawer animation
- Fix the drawer collapse animation to match the sidebar behavior (content stays static, edge slides)

## Key Files
- `src/components/AppShell.tsx` — sidebar animation fixes
- `src/app/page.tsx` — dashboard skeletons
- `src/app/resumes/page.tsx` — resume card skeletons
- `src/app/applications/page.tsx` — application row skeletons
- `src/app/resumes/[version]/page.tsx` — detail page skeleton
- `src/app/master/page.tsx` — master page skeleton
- `extension/src/drawer.ts` — drawer animation (if applicable)

## Testing
```bash
cd /Users/lloydalba/code/apted-v1-polishing
npx vitest run
npx tsc --noEmit
npm run build
npm run dev  # visual check: sidebar collapse, loading states
```
