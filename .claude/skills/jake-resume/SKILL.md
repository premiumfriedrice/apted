---
name: jake-resume
description: Use whenever working on apted's resume tailoring logic, the JSON→LaTeX renderer, Jake Gutierrez's resume template macros, the runtime system prompt for /api/tailor or /api/edit, the master_resume schema, or anything touching resume formatting rules (one page, no em-dashes, no inline bold in bullets). Load this skill before editing files in src/lib/render/, src/lib/prompts/, or any code that produces or modifies resume JSON or .tex output.
---

# jake-resume skill

The canonical rules, JSON schema, and Jake's-template macro mapping live in **`src/lib/resume-rules.md`**. Read that file first before editing any renderer, prompt, or schema code. Treat it as the single source of truth — if a rule needs to change, change it there, not inline.

## When this skill loads, do:

1. Read `src/lib/resume-rules.md` in full.
2. Confirm any code you write or edit complies with the hard formatting constraints (one page, no em-dashes, no inline bold in bullets).
3. For renderer changes (in `src/lib/render/`), verify the JSON→macro mapping matches the rules file exactly.
4. For prompt changes (in `src/lib/prompts/`), make sure the runtime prompt loads `src/lib/resume-rules.md` rather than restating its contents. The current loader is `src/lib/prompts/system.ts::buildSystemPrompt`.
5. For schema changes (`src/lib/resume.ts`), update the Master JSON schema section in `resume-rules.md` in the same change.

## Tectonic / LaTeX compile

The renderer produces `.tex` and shells out to `tectonic` to compile to PDF. Tectonic runs in a separate container service (`compile-service/`), not Vercel serverless. When editing the compile path, do not assume the full TeX Live toolchain — only Tectonic. Tectonic uses XeTeX, so pdfTeX-only macros (`\input{glyphtounicode}`, `\pdfgentounicode=1`) must not appear in the preamble.

## Anti-patterns to reject

- Duplicating the rules from `src/lib/resume-rules.md` inline in code or prompts (causes drift).
- Returning partial diffs from the model — always full JSON matching the schema.
- Using `\textbf{}` inside `\resumeItem{}`.
- Em-dashes anywhere in output.
- Letting the Zod schema in `src/lib/resume.ts` drift from the JSON schema documented in `src/lib/resume-rules.md`.
