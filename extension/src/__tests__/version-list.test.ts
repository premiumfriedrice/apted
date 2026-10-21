import { describe, it, expect } from "vitest";
import { mapVersionList, type ApiVersionRow } from "../version-list";

describe("mapVersionList", () => {
  it("derives company/role/outcome from the most recent application", () => {
    const rows: ApiVersionRow[] = [
      {
        id: "v1",
        name: "Generated name",
        createdAt: "2026-07-01T00:00:00.000Z",
        applications: [
          { company: "Rivian", role: "Android Engineer", outcome: "interviewing" },
          { company: "Older Co", role: "Old role", outcome: "rejected" },
        ],
      },
    ];
    const out = mapVersionList(rows);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      id: "v1",
      name: "Generated name",
      company: "Rivian",
      role: "Android Engineer",
      outcome: "interviewing",
      createdAt: "2026-07-01T00:00:00.000Z",
    });
  });

  it("falls back to null company/role/outcome when there are no applications", () => {
    const rows: ApiVersionRow[] = [
      {
        id: "v2",
        name: "Untitled resume",
        createdAt: "2026-07-10T00:00:00.000Z",
        applications: [],
      },
    ];
    const out = mapVersionList(rows);
    expect(out[0]).toEqual({
      id: "v2",
      name: "Untitled resume",
      company: null,
      role: null,
      outcome: null,
      createdAt: "2026-07-10T00:00:00.000Z",
    });
  });

  it("handles missing applications array defensively", () => {
    const rows = [
      { id: "v3", name: null, createdAt: "2026-07-10T00:00:00.000Z" },
    ] as unknown as ApiVersionRow[];
    const out = mapVersionList(rows);
    const first = out[0]!;
    expect(first.company).toBeNull();
    expect(first.role).toBeNull();
    expect(first.outcome).toBeNull();
    expect(first.name).toBeNull();
  });

  it("maps multiple rows preserving order", () => {
    const rows: ApiVersionRow[] = [
      { id: "a", name: "A", createdAt: "2026-07-11", applications: [{ company: "A Co", role: "A role", outcome: "applied" }] },
      { id: "b", name: "B", createdAt: "2026-07-12", applications: [] },
    ];
    const out = mapVersionList(rows);
    expect(out.map((x) => x.id)).toEqual(["a", "b"]);
  });
});