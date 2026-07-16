import type { Outcome, VersionListItem } from "./types";

// Shape returned by GET /api/versions (only the fields the browser needs).
export type ApiVersionRow = {
  id: string;
  name: string | null;
  createdAt: string;
  applications: Array<{ company: string; role: string; outcome: string }>;
};

// Flatten a GET /api/versions row into a browse list item. company/role/
// outcome come from the version's most recent application (the API returns
// applications ordered by created_at DESC); when there is no application we
// fall back to the generated version name and a null outcome. Extracted into
// its own module so the mapping can be unit-tested without standing up the
// whole service worker.
export function mapVersionList(rows: ApiVersionRow[]): VersionListItem[] {
  return rows.map((v): VersionListItem => {
    const app = v.applications?.[0];
    return {
      id: v.id,
      name: v.name,
      company: app?.company ?? null,
      role: app?.role ?? null,
      outcome: app?.outcome ? (app.outcome as Outcome) : null,
      createdAt: v.createdAt,
    };
  });
}