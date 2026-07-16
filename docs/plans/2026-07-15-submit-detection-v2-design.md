# Submit Detection v2 â reliability + save UX

**Branch**: `feature/submit-detection` (PRE-83 continuation)
**Date**: 2026-07-15

## Problem

The existing submit-detection scaffold (PRE-83) fires but misses saves in two
ways, and the success signal is too quiet:

1. **Reliability** â the click heuristic only matches button labels containing
   `submit` (case-insensitive). It deliberately skips bare "Apply" to avoid the
   LinkedIn "Easy Apply" false positive. But several major job sites' final-step
   button says "Apply" or "Send Application", so those submits go unsaved. The
   form `submit` event is the primary signal, but modern React sites
   (Greenhouse, Ashby) often `preventDefault` the submit and fire XHRs, so only
   the click heuristic reliably catches them â which then misses "Apply".
2. **Save UX** â a successful auto-save only writes a tiny line to the status
   bar (`#apted-status`, 10px) at the bottom of the drawer. Easy to miss, and
   the drawer isn't opened if closed, so the user may never see confirmation.

## Design

### 1. Widen the submit-button label heuristic (`submit-detection.ts`)

Replace the `/\bsubmit\b/i` test with a set of whole-word verbs:

```ts
const SUBMIT_VERBS = ["submit", "apply", "send"];

export function isSubmitButtonLabel(text: string): boolean {
  const t = text.trim().toLowerCase();
  return SUBMIT_VERBS.some((v) => new RegExp(`\\b${v}\\b`, "i").test(t));
}
```

This matches "Submit Application", "Submit", "Apply", "Send Application",
"Send application", and case variants. It accepts the "Easy Apply" false
positive tradeoff: opening Easy Apply will save an `applied` record with the
current draft when no real submission happened. Documented tradeoff â the
record is harmless (an `applied` row the user can later correct) and the
dedup-by-draft-id guard means one Easy Apply click saves at most once.

`isConfirmationUrl` is unchanged (high-signal, post-submit navigation; kept as
a secondary trigger).

### 2. Save UX: auto-open drawer + toast, auto-dismiss, click â All Resumes

**Trigger flow on a successful auto-save:**
1. If the drawer is closed, `openDrawer()`.
2. Show a **toast** anchored at the top of the drawer body, above all other
   content: "Application saved â" bold headline + `<company> Â· <role>` subtext
   + a "View" affordance.
3. The toast **auto-dismisses after 4s** with a fade-out transition.
4. **Clicking** the toast (before it dismisses) switches the resumes section to
   the All Resumes view (`setResumesView("all")`) so the user sees the new
   version/application. The new version is already forced into the All Resumes
   list by the existing `state.allResumesLoaded = false; void loadAllResumes(true)`.

No unread dot is set; opening the drawer + the toast is the only signal.

**Toast DOM + CSS:**
- One new element `#apted-save-toast` inside the shadow DOM, positioned
  `sticky`/absolute at the top of `.apted-drawer-body` (so it overlays content
  without shifting layout).
- Classes: `.apted-save-toast` (base), `.apted-save-toast--visible` (shown),
  `.apted-save-toast--error` (save failed variant: "Couldn't save application",
  same open/animation, no "View").
- Transition: opacity + translateY (slide down) over 200ms; auto-dismiss fades
  opacity out over 200ms before `hidden = true`.

**Wiring** (drawer.ts):
- Add `els.saveToast`, `els.saveToastHeadline`, `els.saveToastSub`,
  `els.saveToastView`.
- Replace the `setStatus("Application saved â", "ok")` call in
  `autoSaveApplication` with `showSaveToast(...)`. Keep the status-bar line too
  (it's the status row's purpose; harmless).
- `showSaveToast({ ok, company, role })`: populate fields, add `--visible` (or
  `--error`), `openDrawer()` if closed, set a `clearTimeout`-guarded 4s timer to
  call `hideSaveToast()`.
- The toast's click handler calls `setResumesView("all")` then `hideSaveToast()`.

### 3. Files touched

- `extension/src/submit-detection.ts` â widen `isSubmitButtonLabel` to
  {submit, apply, send}.
- `extension/src/__tests__/submit-detection.test.ts` â add cases for
  "Apply", "Send application", "Easy Apply" (now true), "Send" (true),
  "Confirm review" (still false), etc.
- `extension/src/drawer.ts` â toast DOM + CSS; `showSaveToast`/`hideSaveToast`;
  wire into `autoSaveApplication`; toast click â All Resumes view.
- `extension/src/__tests__/drawer.test.ts` â assert the toast element + IDs
  exist in `createDrawerHTML()`.

No backend changes; `auto-save-application` message + `/api/versions` POST
already stamp `outcome: applied` + `portalUrl`.

## Out of scope

- Undoing an Easy-Apply false save (user can delete the application in the web
  app's application detail view).
- Submit-button selectors per job site (Site-specific approach #3, rejected).
- Email/notification integration.
KEEP THIS SECTION SHORTâwe rely on the existing draft-id dedup.