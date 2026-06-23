# Master UI Redesign: Prose-First Bullet Generation

**Date**: 2026-06-15
**Branch**: `feature/master-ui-redesign`
**Worktree**: `/Users/lloydalba/code/apted-master-ui`
**Linear**: PRE-80

## Problem

The current master resume UI forces users to write polished bullet points by
hand. This causes them to drop details, filter memories through a "professional
voice," and lose the raw specificity the tailor needs for strong XYZ bullets.

## Design

### Core insight

**Prose is the primary input. Bullets are generated.** The user dumps raw
memories, work diaries, commit messages, whatever. The LLM converts that prose
into structured bullets. The tailor step later reshapes those bullets for a
specific JD.

### The new experience/project item layout

Each item has:

1. **Structured fields** (same as now): title, org, dates, location, stack
   (projects only). Quick factual inputs.
2. **Prose area** (large textarea, replaces the old notes field): raw dump of
   everything remembered. No professional voice required. Detailed and
   messy is better. Placeholder: "Dump everything you remember — work diaries,
   commit messages, recalled details. Raw and detailed is better."
3. **"Generate bullets" button**: sends prose + existing bullets to
   `/api/master/generate-bullets`. LLM merges existing bullets with new detail
   from the prose. Preserves accurate existing bullets, adds new ones, drops
   contradicted ones. Fills `notes` with the prose for the tailor step.
4. **Bullet list** (below the button): generated/tweaked bullets. Still
   manually editable after generation.
5. **Tags** (same as now): optional soft signal for the tailor step.

Prose is **never cleared** after generation. Users can add more memories and
regenerate. Each generation is a merge, not a replace.

### `/api/master/generate-bullets` endpoint

**Input**: `{ itemId, prose, existingBullets }`

**Behavior**:
1. Sends prose + existing bullets to the LLM with a system prompt:
   "Merge existing resume bullets with new prose detail. Keep bullets that are
   still accurate. Add bullets for new achievements/scope from the prose. Drop
   bullets contradicted by the prose. Never fabricate. Each bullet follows XYZ
   format when facts support it — otherwise keep it factual and concise."
2. Returns `{ bullets: Bullet[], notes: string }` — merged bullets and prose
   preserved as notes.
3. Uses the "edit" provider (Claude Sonnet via OpenCode Zen) for quality.
4. **No JD context** — purely prose → bullets. The tailor handles JD reshaping.
5. **Error handling**: if LLM fails, return existing bullets unchanged + notes
   set to the prose. Never lose user data.

### Merge semantics

"Generate bullets" does NOT replace existing bullets. It merges:
- **Keep** existing bullets that are still accurate and supported by the prose
- **Add** new bullets for achievements/scope mentioned in the prose but not
  covered by existing bullets
- **Drop** bullets contradicted by the prose
- **Never fabricate** bullets with details not in the prose or existing bullets

### Tailor step (unchanged)

The tailor already reads `notes` from the JSON. No changes needed. It will
naturally have richer source material because `notes` is now the full prose
dump instead of a manually-written summary.

## Implementation Tasks

### Task 1: `/api/master/generate-bullets` endpoint + prompt

- Create `src/app/api/master/generate-bullets/route.ts`
- Add `generateBulletsUserPrompt()` to `src/lib/prompts/user.ts`
- The prompt instructs the LLM to merge prose with existing bullets
- Returns `{ bullets: Bullet[], notes: string }`
- Uses "edit" provider for quality
- Graceful degradation on failure (return existing bullets)

### Task 2: UI changes — prose-first layout

- `src/app/master/page.tsx`:
  - Rename notes field label to "Prose" with larger textarea
  - Add "Generate bullets" button per experience/project item
  - Wire button to `/api/master/generate-bullets` endpoint
  - On response: update bullets array and notes field
  - Show loading state while generating
  - Error state with fallback to existing bullets
- Placeholder: "Dump everything you remember — work diaries, commit messages, recalled details. Raw and detailed is better."

### Task 3: Tests for the new endpoint

- `src/app/api/master/generate-bullets/route.test.ts`
- Test: returns merged bullets from prose + existing
- Test: preserves existing accurate bullets
- Test: adds new bullets for prose detail not covered
- Test: falls back to existing bullets on LLM failure
- Test: saves prose as notes field
- Test: returns 400 on empty prose

## Scope

**In scope**: Endpoint, prompt, UI, tests
**Out of scope**: Builder page redesign, tailor pipeline, extension changes