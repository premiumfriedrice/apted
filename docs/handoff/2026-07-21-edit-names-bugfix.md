# Handoff: Edit Feature Changing Project/Version Names (PRE-95)

**Branch**: `feature/bugfixes3-edit-names`
**Worktree**: `/Users/lloydalba/code/apted-bugfixes3`
**Linear**: PRE-95
**Date**: 2026-07-21

## What to Fix

When the user edits a tailored resume via chat in the extension drawer, the project/section names in the resume get changed unexpectedly. For example, a project called "apted" might get renamed to something else after a chat edit instruction.

## Investigation

### The edit flow:
1. User types an instruction in the drawer chat (e.g., "lead with the AI project")
2. `doEdit()` in `extension/src/drawer.ts` sends `{ type: "edit", draftId, instruction }` to background
3. Background calls `POST /api/edit` with `{ draftId, instruction }`
4. The edit route loads the current draft + master, sends them to the LLM with the instruction
5. The LLM returns a new Resume JSON object
6. The edit route saves it as the new draft content

### The problem:
The LLM is receiving the full master resume + current draft in `editUserPrompt()` and the instruction says "Apply the instruction to the current draft and return the new, complete Resume JSON." But the system prompt (`resume-rules.md`) says "Reuse existing bullet text verbatim when it already fits" and "Preserve ids."

The issue is that the LLM may be:
- Renaming sections (e.g., changing "Projects" to "Technical Projects")
- Renaming project headings to be more descriptive
- Rewriting item titles/org names to match the JD better
- The instruction "lead with the AI project" might cause the LLM to rename or restructure the project section

### The fix:
Add explicit rules to the edit user prompt or resume-rules.md that say:
- "NEVER rename sections, project names, job titles, or organizations unless the user explicitly asks"
- "Only modify bullet text and section ordering per the user instruction"
- "Preserve all section titles, item titles, org names, project names exactly as they are"

The edit user prompt (`src/lib/prompts/user.ts` line 96) currently says:
```
TASK
Apply the instruction to the current draft and return the new, complete Resume JSON. Preserve ids.
```

This needs to be strengthened to explicitly say: do not rename things unless asked.

## Key Files

- `src/lib/prompts/user.ts` — `editUserPrompt()` function (line ~96)
- `src/lib/resume-rules.md` — could add a rule about preserving names
- `src/lib/prompts/system.ts` — system prompt builder that injects resume-rules.md

## Testing

```bash
cd /Users/lloydalba/code/apted-bugfixes3
npx vitest run
npx tsc --noEmit
npm run build
# Manual test: tailor a resume, then add a project called "apted", then
# edit via chat with "lead with the apted project" — verify the project
# name stays "apted" and doesn't get renamed
```

## Out of Scope

- Auto-save dedup fix (separate worktree: apted-bugfixes2)
- Wrong JD fix (separate worktree: apted-bugfixes2)
- RLS refactor