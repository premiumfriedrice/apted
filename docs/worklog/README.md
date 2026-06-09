# apted — Worklog

A per-subsystem record of the work that produced apted, written so the **design
decisions** are legible: for each change you can see the ticket it addressed, the
options that were on the table, which one was chosen, and why the others were not.

> **Provenance.** These entries were *reconstructed from the codebase* (the
> `Initial commit`) rather than logged live as the work happened. The technical
> facts (engines, libraries, schema, flags) are read directly from the code. The
> **alternatives** in each "Options considered" section are inferred from the
> architecture — they are the plausible forks a reasonable engineer faced given
> this stack, not a transcript of decisions actually debated. Treat them as a
> faithful reconstruction, not a court record.
>
> **Tickets are placeholders** (`APTED-00x`). Swap in real issue keys when you
> have them.

## Index

| Ticket | Type of work | Entry |
|--------|--------------|-------|
| APTED-001 | Database schema & persistence | [001-database-persistence.md](001-database-persistence.md) |
| APTED-002 | Resume schema & LaTeX rendering (Jake template) | [002-resume-render-latex.md](002-resume-render-latex.md) |
| APTED-003 | LLM tailoring, editing & extraction | [003-llm-tailoring.md](003-llm-tailoring.md) |
| APTED-004 | PDF compile service | [004-pdf-compile-service.md](004-pdf-compile-service.md) |
| APTED-005 | Next.js web app, API & auth | [005-webapp-api-auth.md](005-webapp-api-auth.md) |
| APTED-006 | Chrome extension (thin client) | [006-chrome-extension.md](006-chrome-extension.md) |

## Entry format

Each entry follows the same skeleton — copy [`_TEMPLATE.md`](_TEMPLATE.md) for new work:

- **Ticket** — the issue this change addresses.
- **Summary** — one or two sentences on what shipped.
- **Context / problem** — what forced the decision.
- **Options considered** — the forks, with ✅ chosen / ❌ rejected and the reason.
- **Decision** — what was chosen and the deciding factor.
- **Files touched** — the concrete code involved.
- **Follow-ups** — known gaps or deferred work.
