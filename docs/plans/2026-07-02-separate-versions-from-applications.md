# Separate Versions from Applications Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Split the `resume_versions` table into a content-only `resume_versions` table and a per-job `applications` table so one resume can be submitted to multiple jobs without duplicating PDFs/content.

**Architecture:** Keep `resume_versions` as the canonical tailored resume (content + PDF). Move job-specific fields (`company`, `role`, `job_description`, `outcome`) to a new `applications` table with a foreign key to `resume_versions`. The Library shows versions; the version detail shows the list of applications for that version. Existing rows are migrated by creating one application per existing version.

**Tech Stack:** Next.js App Router, TypeScript, PostgreSQL (raw `pg` pool), Tailwind CSS, Vitest.

---

### Task 1: Database migration

**Files:**
- Create: `migrations/0004_separate_applications.sql`

**Step 1: Write the migration**

```sql
-- Create applications table.
CREATE TABLE IF NOT EXISTS applications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id      uuid NOT NULL REFERENCES resume_versions(id) ON DELETE CASCADE,
  company         text NOT NULL,
  role            text NOT NULL,
  job_description text NOT NULL,
  outcome         outcome NOT NULL DEFAULT 'draft',
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS applications_version_id_idx ON applications (version_id);
CREATE INDEX IF NOT EXISTS applications_outcome_idx    ON applications (outcome);
CREATE INDEX IF NOT EXISTS applications_created_idx    ON applications (created_at DESC);

-- Migrate existing resume_versions rows into applications.
INSERT INTO applications (version_id, company, role, job_description, outcome, created_at)
SELECT id, company, role, job_description, outcome, created_at
FROM resume_versions;

-- Remove job-specific columns from resume_versions.
ALTER TABLE resume_versions
  DROP COLUMN company,
  DROP COLUMN role,
  DROP COLUMN job_description,
  DROP COLUMN outcome;
```

**Step 2: Apply the migration locally**

Run:
```bash
cd /Users/lloydalba/code/apted-site-nav
psql $DATABASE_URL -f migrations/0004_separate_applications.sql
```

Expected: completes without errors.

**Step 3: Commit**

```bash
git add migrations/0004_separate_applications.sql
git commit -m "feat(migration): split resume_versions into versions + applications"
```

---

### Task 2: Update version types and API reads

**Files:**
- Modify: `src/app/api/versions/route.ts`
- Modify: `src/app/api/versions/[id]/route.ts`
- Modify: `src/app/api/versions/[id]/use/route.ts`
- Modify: `src/app/api/versions/similar/route.ts`
- Modify: `src/app/api/tailor/route.ts`
- Modify: `src/app/page.tsx`

**Step 1: Update `GET /api/versions`**

Return versions with their applications aggregated. Replace the single-row query with a join that collects applications per version.

```ts
const SELECT = `
  SELECT
    v.id,
    v.tailored_content,
    v.created_at,
    v.pdf,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'company', a.company,
          'role', a.role,
          'jobDescription', a.job_description,
          'outcome', a.outcome,
          'createdAt', a.created_at
        ) ORDER BY a.created_at DESC
      ) FILTER (WHERE a.id IS NOT NULL),
      '[]'::jsonb
    ) AS applications
  FROM resume_versions v
  LEFT JOIN applications a ON a.version_id = v.id
`;

// Filter by outcome requires HAVING: the version must have at least one application with that outcome.
```

`rowToJson` becomes:

```ts
function rowToJson(row: Record<string, unknown>) {
  const pdfBuf = row.pdf as Buffer | null;
  return {
    id: row.id,
    tailoredContent: row.tailored_content,
    createdAt: row.created_at,
    pdfBase64: pdfBuf ? pdfBuf.toString("base64")) : null,
    applications: row.applications as Application[],
  };
}
```

**Step 2: Update `GET /api/versions/[id]`**

Use the same join shape and return `applications`.

**Step 3: Update `PATCH /api/versions/[id]`**

Only allow patching `tailoredContent`. Outcome/company/role moves to applications. Remove those fields from the PATCH.

**Step 4: Update `POST /api/versions`**

Accept `tailoredContent` plus an optional initial application `{ company, role, jobDescription, outcome }`. Insert the version, then if application data is provided insert one application row referencing the new version.

**Step 5: Update `DELETE /api/versions/[id]`**

Cascading delete is handled by `ON DELETE CASCADE`, so the existing DELETE works.

**Step 6: Update `/api/versions/[id]/use`**

Still reads `tailored_content` from `resume_versions` and creates a draft. No schema change needed beyond the column removal.

**Step 7: Update `/api/versions/similar`**

Join with applications to get the display `company`/`role` for each version. Use the most recent application, or aggregate them.

```sql
SELECT v.id, v.tailored_content, a.company, a.role
FROM resume_versions v
LEFT JOIN LATERAL (
  SELECT company, role FROM applications WHERE version_id = v.id ORDER BY created_at DESC LIMIT 1
) a ON true
ORDER BY v.created_at DESC
```

**Step 8: Update `/api/tailor`**

Prior-versions query only needs `tailored_content`:

```sql
SELECT tailored_content FROM resume_versions ORDER BY created_at DESC LIMIT 20
```

**Step 9: Update `Version` type in `src/app/page.tsx`**

```ts
type Application = {
  id: string;
  company: string;
  role: string;
  jobDescription: string;
  outcome: Outcome;
  createdAt: string;
};

type Version = {
  id: string;
  tailoredContent: unknown;
  createdAt: string;
  pdfBase64: string | null;
  applications: Application[];
};
```

**Step 10: Run typecheck and tests**

Run:
```bash
npx tsc --noEmit
npx vitest run
```

Expected: type errors from the UI using old fields; tests fail until Task 3.

**Step 11: Commit**

```bash
git add src/app/api/versions src/app/api/tailor/route.ts src/app/page.tsx
git commit -m "feat(api): read versions with applications, remove job fields from versions"
```

---

### Task 3: Add application APIs

**Files:**
- Create: `src/app/api/versions/[id]/applications/route.ts`
- Create: `src/app/api/applications/[id]/route.ts`

**Step 1: Create `GET /api/versions/[id]/applications`**

Returns all applications for a version ordered by `created_at DESC`.

```ts
const r = await pool.query(
  "SELECT id, company, role, job_description, outcome, created_at FROM applications WHERE version_id = $1 ORDER BY created_at DESC",
  [id],
);
return NextResponse.json(r.rows.map(rowToJson));
```

**Step 2: Create `POST /api/versions/[id]/applications`**

Body: `{ company, role, jobDescription, outcome? }`. Insert a new application for the version.

**Step 3: Create `GET /api/applications/[id]`**

Return a single application by id.

**Step 4: Create `PATCH /api/applications/[id]`**

Body: `{ company?, role?, jobDescription?, outcome? }`. Update provided fields.

**Step 5: Create `DELETE /api/applications/[id]`**

Delete the application.

**Step 6: Add tests**

Create `src/__tests__/api/applications.test.ts` with tests for create, list, update, delete, and outcome filtering propagation.

**Step 7: Run tests**

```bash
npx vitest run src/__tests__/api/applications.test.ts
```

Expected: PASS.

**Step 8: Commit**

```bash
git add src/app/api/versions/[id]/applications src/app/api/applications/[id] src/__tests__/api/applications.test.ts
git commit -m "feat(api): add CRUD endpoints for applications"
```

---

### Task 4: Reskin Library cards for versions + applications

**Files:**
- Modify: `src/app/page.tsx`

**Step 1: Card header shows primary application**

Use the most recent application for the card title/company/role.

```ts
const primary = version.applications[0];
const company = primary?.company ?? "Untitled";
const role = primary?.role ?? "";
const outcome = primary?.outcome ?? "draft";
```

**Step 2: Show application count badge**

If `version.applications.length > 1`, show a small badge: "+2 applications".

**Step 3: Update filter behavior**

Outcome filter now means "versions that have at least one application with this outcome". Use `HAVING` in the SQL or filter in the API.

**Step 4: Run typecheck**

```bash
npx tsc --noEmit
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(ui): library cards show versions with application count"
```

---

### Task 5: Reskin version detail modal

**Files:**
- Modify: `src/app/page.tsx`

**Step 1: Left pane stays PDF**

No change.

**Step 2: Right pane lists applications**

Replace the single job-description/metadata view with a list of applications. Each application shows company, role, outcome badge, date, and an editable outcome dropdown.

**Step 3: Add "Apply to new job" button**

In the modal, add a button that opens a small form to create a new application for this version (company, role, job description, outcome). Calls `POST /api/versions/[id]/applications`.

**Step 4: Edit existing application**

Allow inline editing of outcome per application via a select dropdown; PATCH `/api/applications/[id]`.

**Step 5: Run dev server smoke check**

```bash
npm run dev
# curl / and /master return 200
```

**Step 6: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(ui): version detail shows applications list and add-application flow"
```

---

### Task 6: Update builder save flow

**Files:**
- Modify: `src/app/builder/page.tsx`
- Modify: `src/app/api/versions/route.ts` (already touched in Task 2)

**Step 1: Builder still prompts for company/role/outcome**

On save, POST to `/api/versions` with both `tailoredContent` and the application object.

```ts
body: JSON.stringify({
  tailoredContent: draft.content,
  application: { company, role, jobDescription: draft.jobDescription, outcome },
}),
```

**Step 2: Verify save creates both records**

After saving, the version appears in the Library with one application.

**Step 3: Commit**

```bash
git add src/app/builder/page.tsx
git commit -m "feat(builder): save creates version + application"
```

---

### Task 7: Update existing tests

**Files:**
- Modify: `src/__tests__/api/versions.test.ts`
- Modify: `src/__tests__/versions-pdf.test.ts`
- Modify: `src/app/api/versions/similar/route.test.ts`

**Step 1: Update versions tests**

Change assertions to expect `applications` array instead of `company`/`role`/`outcome` top-level fields. Create versions with applications where needed.

**Step 2: Update similar test**

The endpoint still returns `company`/`role` for display, but the underlying SQL joins applications. Update test setup to insert applications.

**Step 3: Update versions-pdf test**

PDF compile path is unchanged; update any field assertions.

**Step 4: Run full test suite**

```bash
npx vitest run
```

Expected: all pass.

**Step 5: Commit**

```bash
git add src/__tests__ src/app/api/versions/similar/route.test.ts
git commit -m "test: update version tests for applications schema"
```

---

### Task 8: Final verification

**Step 1: Type check**

```bash
npx tsc --noEmit
```

Expected: no errors.

**Step 2: Build**

```bash
npm run build
```

Expected: success.

**Step 3: Full test suite**

```bash
npx vitest run
```

Expected: all pass.

**Step 4: Dev server smoke check**

```bash
npm run dev
# verify /, /master, /builder load and header is present
```

**Step 5: Commit any remaining changes**

```bash
git add -A
git commit -m "chore: final verification for versions/applications split"
```

---

## Testing Commands Summary

```bash
cd /Users/lloydalba/code/apted-site-nav
npx tsc --noEmit
npx vitest run
npm run build
npm run dev
```

## Out of Scope

- Changing the extension drawer UI (it consumes `/api/versions/similar`, which still returns display company/role).
- Changing the settings page.
- Adding a dedicated "Jobs" dashboard page (can be added later on top of applications).
- Backend compile service changes.
