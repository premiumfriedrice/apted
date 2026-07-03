# Apted Development Workflow

This document describes how to develop, test, build, and run the apted project. Share this with any agent or contributor onboarding to the project.

## Project Overview

**apted** is a resume tailoring app that adapts a master resume to job descriptions via LLM. It has three components:

1. **Next.js web app** (`/`) — The main application: master resume editor, builder, PDF rendering, API routes
2. **Chrome extension** (`/extension/`) — A floating content-script drawer that overlays job sites, scrapes JDs, tailors resumes, and injects PDFs into application forms
3. **Compile service** (`/compile-service/`) — A minimal Node.js HTTP server that runs Tectonic (LaTeX → PDF) as a subprocess

## Tech Stack

- **Framework**: Next.js 15 (App Router) + TypeScript + React 19
- **Styling**: Tailwind CSS 3 with Material 3-inspired design tokens
- **Database**: PostgreSQL (Supabase in production, local Postgres in dev)
- **LLM**: OpenCode Zen (primary, `https://opencode.ai/zen/v1`), Anthropic (fallback)
- **Extension**: Vanilla TS content script + shadow DOM (no React), esbuild bundler
- **PDF**: pdfjs-dist for rendering, Tectonic for LaTeX compilation
- **Testing**: Vitest + jsdom
- **Fonts**: Inter (UI), Outfit (logo), Material Symbols Outlined (icons)

## LLM Provider Routing

- **Tailor/Edit/Bullets** (rewording, quality-sensitive): `claude-sonnet-4-5` via OpenCode Zen
- **Structure selection** (which sections/items to keep): `deepseek-v4-flash` via OpenCode Zen
- **Fallback**: Anthropic direct for tailor, DeepSeek direct for structure
- Model IDs are NOT prefixed (e.g. `claude-sonnet-4-5`, not `opencode/claude-sonnet-4-5`)

## Environment Setup

### 1. Install dependencies

```bash
npm install
cd extension && npm install
```

### 2. Create `.env.local`

Copy `.env.example` to `.env.local` and fill in:

```
DATABASE_URL=postgresql://...          # Postgres connection string
OPENCODE_API_KEY=...                   # Primary LLM provider key
COMPILE_SERVICE_URL=http://localhost:8080
```

Optional but recommended for production:
```
OPENCODE_BASE_URL=https://opencode.ai/zen/v1
OPENCODE_TAILOR_MODEL=claude-sonnet-4-5
OPENCODE_STRUCTURE_MODEL=deepseek-v4-flash
APTED_AUTH_TOKEN=...                   # Bearer token for /api/* auth
ALLOWED_ORIGINS=chrome-extension://...,https://your-domain.com
```

### 3. Run database migrations

```bash
npm run db:migrate
```

Migrations live in `/migrations/` as numbered `.sql` files. They run in order.

### 4. Seed the database (optional, for dev)

```bash
npm run db:seed
```

### 5. Start the compile service

```bash
cd compile-service && node server.js
```

This runs on `http://localhost:8080` by default. It requires the `tectonic` binary on your PATH (or set `TECTONIC_BIN` env var). In production it runs as a container.

### 6. Start the web app

```bash
npm run dev
```

Runs at `http://localhost:3000`.

### 7. Build the Chrome extension

```bash
cd extension && npm run build
```

Output goes to `extension/dist/`. Load it in Chrome via `chrome://extensions` → Developer mode → Load unpacked → select `extension/dist/`.

For watch mode during dev:
```bash
cd extension && npm run watch
```

## Testing

```bash
# Web app tests (from project root)
npm test                      # run once
npm run test:watch            # watch mode

# Extension tests
cd extension && npm test      # run once
cd extension && npm run test:watch

# Type checking
npx tsc --noEmit              # web app
cd extension && npx tsc --noEmit  # extension

# Extension build (must succeed before loading in Chrome)
cd extension && npm run build
```

All tests and type checks must pass before merging. There is no CI pipeline — run tests locally.

## Development Workflow

### Creating a feature branch

```bash
git checkout main
git pull origin main
git checkout -b feature/<name>
```

### Worktrees

Worktrees are optional but useful for parallel work. Create them at the same level as the main repo:

```bash
git worktree add ../apted-<name> -b feature/<name>
cd ../apted-<name>
npm install
cd extension && npm install
```

### Committing and merging

```bash
# On the feature branch
npm test                      # ensure tests pass
npx tsc --noEmit              # ensure type check passes
cd extension && npm run build # ensure extension builds
git add -A && git commit -m "feat: description"

# Merge to main
git checkout main
git pull origin main
git merge feature/<name> --no-ff -m "Merge PR: description"
git push origin main

# Cleanup
git worktree remove ../apted-<name>   # if using worktree
git branch -d feature/<name>
```

### Commit message convention

Prefix commits with:
- `feat:` — new feature
- `fix:` — bug fix
- `style:` — visual/UI-only change
- `docs:` — documentation only
- `chore:` — tooling, dependencies, config
- `perf:` — performance improvement
- `refactor:` — code restructuring without behavior change

## Key Architecture

### Web app API routes

- `POST /api/tailor` — Main tailoring endpoint. Reads master resume + JD from DB, runs two-phase pipeline (DeepSeek structure selection → Sonnet tailoring), saves draft
- `POST /api/edit` — Chat-based editing of a draft. Takes an instruction, rewrites the draft
- `POST /api/extract` — LLM extracts company, title, location, keywords from a JD
- `POST /api/master/generate-bullets` — Converts prose dump into structured resume bullets (merge with existing)
- `GET /api/master/pdf` — Renders master resume to PDF via compile service
- `GET /api/master` — Returns master resume JSON (redacted) + PII map
- `PUT /api/master` — Saves master resume
- `POST /api/versions/similar` — Finds similar past versions by JD relevance
- `GET /api/drafts/[id]/pdf` — Renders a draft to PDF

### Two-phase tailor pipeline

1. **Phase 1 (DeepSeek v4 flash)**: Reads JD + master resume skeleton, returns a FilterSpec (which sections/items to keep)
2. **Phase 2 (Claude Sonnet)**: Takes the filtered master + JD + relevant prior versions, produces a tailored Resume JSON

### PII handling

- PII (name, phone, email, links, org names) is redacted before DB storage and LLM prompts
- Redaction map stored alongside resume in DB
- PII injected back only for rendering (PDF, .tex, display)
- The `redactResume()` / `injectResume()` functions in `src/lib/redact.ts` handle this

### Resume JSON schema

Defined in `src/lib/resume.ts` (Zod schemas). The structure is:
- `contact` — name, phone, email, links
- `sections[]` — ordered list, each with a `kind`: experience, projects, education, skills, achievements
- Experience/project items have `bullets[]` and optional `notes` (raw prose for tailoring, never rendered)

### Resume rules (LLM prompt source of truth)

`src/lib/resume-rules.md` is the single source of truth for LLM behavior. It's injected into the system prompt for tailor and edit flows. It covers: factual integrity, selection logic, bullet writing (XYZ formula + keyword weaving), formatting constraints, and the JSON schema.

### Extension architecture

- `extension/src/drawer.ts` — All drawer UI (HTML, CSS, JS in one file, ~1700+ lines). Runs as a content script in a shadow DOM.
- `extension/src/background.ts` — Service worker. Routes messages from drawer to web app APIs via `fetch()`.
- `extension/src/messages.ts` — TypeScript message types for drawer ↔ background communication.
- `extension/src/scrapers.ts` — Scrapes JD text from job sites (LinkedIn, Greenhouse, Lever, Workday, Ashby). Company/title extraction is LLM-only now (no DOM selectors).
- `extension/src/pdf.ts` — PDF fetching, caching, and object URL management.
- The extension does NOT use React. All DOM manipulation is vanilla JS in the shadow DOM.

### Compile service

- `compile-service/server.js` — Minimal HTTP server. `POST /compile` takes raw .tex, runs `tectonic` subprocess, returns PDF. `GET /health` for health checks.
- Runs on port 8080 by default.
- In production: containerized with Tectonic binary baked into the Docker image.

## Design System

See `docs/design.md` for the full design token reference. Key points:

- Light theme default. Dark accents reserved for PDF preview panes.
- Primary color: black (#000000) for primary buttons. Blue (#2563eb) only for focus rings.
- Font: Inter for UI, Outfit for logo, Material Symbols for icons.
- Cards: white bg, 12px radius (rounded-xl), border #c3c6d7.
- 6px radius for inputs and small buttons.
- No gradients, no glassmorphism, no marketing aesthetics. Tool-like and dense.

## Linear

- Team: Premiumfriedrice (key `PRE`)
- Issues created via the `linear_*` tools or directly in the Linear UI
- Epic = project-level issue with sub-tasks as separate issues
- Comment on issues with worktree paths and progress updates

## Useful Scripts

```bash
npm run db:migrate          # Run SQL migrations
npm run db:seed             # Seed DB with sample data
npm run backfill-pdfs       # Backfill PDF column for existing versions
npm run benchmark           # Benchmark LLM providers against test JDs
```