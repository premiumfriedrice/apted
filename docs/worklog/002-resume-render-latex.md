# APTED-002 — Resume schema & LaTeX rendering (Jake template)

**Ticket:** APTED-002
**Type of work:** Resume data model & deterministic rendering
**Status:** shipped

## Summary

A Zod-validated JSON resume schema and a renderer that turns it into a complete,
compilable LaTeX document using Jake Gutierrez's resume template macros. The
renderer enforces the house formatting rules (one page, no em-dashes, no inline
bold/italic) at the LaTeX-escaping layer as a backstop against the LLM.

## Context / problem

The resume is edited as structured JSON (by hand and by the LLM) but must be
delivered as a pixel-stable, single-page PDF. That needs a deterministic
JSON → document step with a data model expressive enough for real resumes
(experience, projects, education, skills, achievements) yet tight enough that
the LLM can reliably produce and edit it. Layout must not drift between
environments.

## Options considered

### Document format / rendering target

- ✅ **LaTeX (Jake Gutierrez template)** — deterministic layout, native one-page
  discipline, typography control independent of any browser. Compiles the same
  everywhere.
- ❌ **HTML/CSS → PDF (Puppeteer / wkhtmltopdf)** — familiar to web devs and CSS
  is reusable, but the hard one-page constraint is painful to guarantee and
  output varies with the rendering engine.
- ❌ **Typst** — attractive modern alternative; explicitly left as a *future*
  renderer the architecture can accept (the dispatcher can gain a `renderTyp`
  sibling) but not built now.

### Template

- ✅ **Jake's template** — clean, well-scoped macro interface
  (`\resumeSubheading`, `\resumeItem`, list start/end), actively used, one-page
  by design. MIT-licensed (attribution kept in `LICENSE-jake-resume.md`).
- ❌ **AltaCV / ModernCV** — more features and visual flourish, but heavier and
  would demand a richer schema and more rendering logic for no gain on a
  one-page text resume.

### Architecture

- ✅ **Template-dispatcher (`render/index.ts`) in front of `render/jake.ts`** —
  the schema and compile pipeline stay template-agnostic; a second template is
  additive.
- ❌ **Single hard-coded renderer** — simpler today, but bakes Jake into the
  pipeline and makes a second template a rewrite.

### Schema shape

- ✅ **Discriminated union on section `kind`** with stable `id`s on every item
  *and* every bullet — type-safe dispatch in the renderer, and stable ids let
  the chat editor target "bullet 3 of this job" without relying on array order.
- ❌ **One polymorphic `items[]` with a loose type field** — less type-safe,
  easier for the LLM to corrupt.
- ✅ **Free-form `start`/`end` strings** ("May 2024", "Present", "2024–2025") —
  ergonomic, no date parsing.
  ❌ rejected structured date objects as too rigid for resume reality.
- ✅ **Skills stored as a comma-separated string per group** — maps 1:1 to the
  rendered line. ❌ rejected an array (needs join logic, more schema for no
  benefit).

### Where to enforce formatting rules

- ✅ **Belt-and-suspenders: instruct the LLM in the prompt *and* strip/escape in
  `tex()`** — em-dashes → `, `, en-dashes → `-`, `**bold**`/`_italic_` → plain
  text, then escape LaTeX specials (`\ & % $ # _ { } ~ ^`) in the correct order.
- ❌ **Trust the prompt alone** — one stray em-dash or `&` would break
  compilation or violate house style; the renderer must be the last line of
  defence.

## Decision

LaTeX via Jake's template, fronted by a dispatcher, fed by a discriminated-union
Zod schema, with formatting rules enforced redundantly in `tex()`. The deciding
factor was determinism: a resume PDF must look identical every time and fit one
page, which LaTeX guarantees and browser rendering does not. The renderer also
*omits* pdfTeX-only lines (`\input{glyphtounicode}`, `\pdfgentounicode=1`)
because compilation goes through Tectonic/XeTeX (see APTED-004), and drops empty
sections so Jake's `\begin{itemize}` never receives an empty list.

## Files touched

- `src/lib/resume.ts` — Zod schema (`Resume`, `Section`, item types, `Bullet`), `emptyMaster()`
- `src/lib/render/index.ts` — template dispatcher (`renderResume(resume, template)`)
- `src/lib/render/jake.ts` — `renderJake()`, `tex()` escaping, `dateRange()`, section/contact renderers, `PREAMBLE`, attribution
- `src/lib/resume-rules.md` — single source of truth for formatting rules & schema (also fed to the LLM at runtime)
- `LICENSE-jake-resume.md` — MIT attribution for Jake Gutierrez / Sourabh Bajaj
- `.claude/skills/jake-resume/SKILL.md` — skill descriptor pointing at these rules

## Follow-ups

- [ ] Typst renderer is designed-for but not implemented.
- [ ] One-page guarantee is enforced by content discipline + tight spacing, not by a hard overflow check — long input can still spill.
