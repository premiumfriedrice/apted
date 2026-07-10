# Handoff: Application Detail View (PRE-85)

**Branch**: `feature/application-detail`
**Worktree**: `/Users/lloydalba/code/apted-app-detail`
**Linear**: PRE-85
**Date**: 2026-07-08

## What to Build

A dedicated page for viewing a single job application at `/applications/[id]`, showing the resume it was submitted with, the application portal URL, notes, and outcome controls.

### 1. Migration: add portal_url and notes columns

Create `migrations/0007_application_details.sql`:

```sql
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS portal_url text,
  ADD COLUMN IF NOT EXISTS notes text;
```

Simple additive migration — no data backfill needed.

### 2. Backend: extend applications API

Modify `src/app/api/applications/[id]/route.ts`:

- **GET**: Add `portal_url` and `notes` to the SELECT query and `rowToJson` output (camelCase: `portalUrl`, `notes`)
- **PATCH**: Accept `portalUrl` (string) and `notes` (string) as updatable fields. Add to the dynamic field list alongside the existing fields (company, role, jobDescription, outcome, interviewRound, rejectedAfterRound).

Modify `src/lib/applications.ts`:
- Add `portalUrl: string | null` and `notes: string | null` to the Application type

### 3. UI: application detail page

Create `src/app/applications/[id]/page.tsx`:

**Layout**: Two-column split matching the resume detail page (`/resumes/[version]`):
- Left column: application details + notes
- Right column: resume PDF preview (reuse `PdfPreviewPane`)

**Left column contents (top to bottom):**

1. **Back button**: Link back to `/applications`
2. **Application header**: Company name (large), role, outcome badge, created date
3. **Outcome controls**: Quick-toggle buttons to change outcome (applied, interviewing, offer, rejected, ghosted, declined). Uses PATCH `/api/applications/[id]` with optimistic update.
4. **Portal URL field**: 
   - If set: show as a clickable link (opens in new tab) with an edit button
   - If not set: show an input with a "Save" button
   - Placeholder: "https://careers.company.com/jobs/123"
   - On save: PATCH the application with `portalUrl`
5. **Notes field**: 
   - A textarea (auto-saving on blur or via a Save button)
   - Placeholder: "Interview prep, contact info, follow-up reminders..."
   - On save: PATCH the application with `notes`
6. **Job description**: Expandable section showing the JD text this resume was tailored for
7. **Interview round info**: If outcome is "interviewing", show which round. Editable via a small dropdown or +/- buttons.

**Right column:**
- The resume PDF (fetched from the version associated with this application)
- Reuse `PdfPreviewPane` component
- Need to fetch the version's PDF via `/api/versions/[id]` (returns `pdfBase64`)

**Data flow:**
1. Page loads: `GET /api/applications/[id]` → application data (includes `versionId`)
2. Then: `GET /api/versions/[versionId]` → version data (includes `pdfBase64`, `tailoredContent`, `name`)
3. Convert `pdfBase64` to blob URL for the PdfPreviewPane
4. User edits portal URL / notes / outcome → `PATCH /api/applications/[id]` with optimistic update

### 4. Link from applications table

Modify `src/app/applications/page.tsx`:
- Make application company/role clickable, linking to `/applications/[id]`
- Keep the inline outcome dropdown as-is (quick updates without navigating)

### 5. Link from resume detail page

The resume detail page (`/resumes/[version]`) already lists applications for that version. Make each application card link to `/applications/[id]`.

## Current State

### Applications table
- `applications` table has: id, version_id, company, role, job_description, outcome, interview_round, rejected_after_round, created_at
- No portal_url or notes columns yet

### Applications page (`/applications`)
- Shows a funnel chart + table of applications grouped by version
- Inline outcome dropdown with optimistic PATCH
- No detail view — clicking a row doesn't navigate anywhere

### Applications API (`/api/applications/[id]`)
- GET: returns application by id
- PATCH: updates company, role, jobDescription, outcome, interviewRound, rejectedAfterRound
- DELETE: removes application

### Resume detail page (`/resumes/[version]`)
- Shows version PDF + JD + insights + applications list
- Application cards are not clickable

### Components available
- `PdfPreviewPane` — reusable PDF viewer with export, zoom, resizer
- `AppShell` — sidebar navigation wrapper
- `FunnelChart` — Sankey diagram (not needed on detail page)

## Key Files

- `src/app/applications/[id]/page.tsx` — NEW: application detail page
- `src/app/applications/page.tsx` — modify: link rows to detail page
- `src/app/api/applications/[id]/route.ts` — modify: add portalUrl, notes to GET/PATCH
- `src/lib/applications.ts` — modify: extend Application type
- `migrations/0007_application_details.sql` — NEW: add columns
- `src/components/PdfPreviewPane.tsx` — reuse for resume preview
- `src/app/resumes/[version]/page.tsx` — modify: link application cards to detail page
- `docs/design.md` — design system reference

## Testing

```bash
cd /Users/lloydalba/code/apted-app-detail
npm run db:migrate           # run the new migration
npx vitest run               # all tests must pass
npx tsc --noEmit             # type check must pass
npm run dev                  # visual check: /applications/[id]
```

## Out of Scope

- Auto-detecting the portal URL from the extension (that's PRE-83)
- Email integration or notifications
- Application timeline/event log
- Changing the funnel chart