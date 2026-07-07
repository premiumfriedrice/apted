"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { SankeyDiagram } from "@/components/SankeyDiagram";

type Outcome = "draft" | "applied" | "ghosted" | "interviewing" | "rejected" | "offer" | "declined";

type Application = {
  id: string;
  versionId: string;
  company: string;
  role: string;
  jobDescription: string;
  outcome: Outcome;
  interviewRound: number | null;
  rejectedAfterRound: number | null;
  createdAt: string;
};

type Version = {
  id: string;
  name: string | null;
  tailoredContent: unknown;
  createdAt: string;
  pdfBase64: string | null;
  applications: Application[];
};

const OUTCOMES = ["all", "draft", "applied", "ghosted", "interviewing", "rejected", "offer", "declined"] as const;

const OUTCOME_COLORS: Record<string, string> = {
  draft: "bg-neutral-200 text-neutral-700",
  applied: "bg-blue-100 text-blue-700",
  ghosted: "bg-slate-200 text-slate-700",
  interviewing: "bg-amber-100 text-amber-700",
  rejected: "bg-red-100 text-red-700",
  offer: "bg-green-100 text-green-700",
  declined: "bg-purple-100 text-purple-700",
};

const pdfToolbar = "#toolbar=0&navpanes=0&scrollbar=0";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString();
}

function primaryApplication(version: Version): Application | null {
  return version.applications[0] ?? null;
}

function outcomeLabel(app: Application): string {
  if (app.outcome === "interviewing" && app.interviewRound) {
    return `Round ${app.interviewRound}`;
  }
  if (app.outcome === "rejected" && app.rejectedAfterRound !== null) {
    return app.rejectedAfterRound === 0 ? "Rejected" : `Rejected R${app.rejectedAfterRound}`;
  }
  return app.outcome;
}

function applicationSummary(version: Version): string {
  const count = version.applications.length;
  if (count === 0) return "No applications";
  const primary = version.applications[0];
  return count === 1
    ? `${primary.company} · ${primary.role}`
    : `${primary.company} · ${primary.role} +${count - 1} more`;
}

export default function LibraryPage() {
  const [filter, setFilter] = useState<(typeof OUTCOMES)[number]>("all");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<Version[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showJson, setShowJson] = useState(false);

  const selected = useMemo(
    () => items.find((v) => v.id === selectedId) ?? items[0] ?? null,
    [items, selectedId],
  );

  const refreshItems = useCallback(() => {
    const url = filter === "all" ? "/api/versions" : `/api/versions?outcome=${filter}`;
    fetch(url)
      .then((r) => r.json())
      .then((data: Version[]) => {
        setItems(data);
        if (data.length > 0 && !data.find((v) => v.id === selectedId)) {
          setSelectedId(data[0].id);
        }
      });
  }, [filter, selectedId]);

  useEffect(() => {
    refreshItems();
  }, [refreshItems]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((v) => {
      const name = (v.name || "").toLowerCase();
      const apps = v.applications
        .map((a) => `${a.company} ${a.role} ${a.jobDescription}`.toLowerCase())
        .join(" ");
      return name.includes(q) || apps.includes(q);
    });
  }, [items, search]);

  const deleteVersion = useCallback(async (id: string, name: string | null) => {
    if (!window.confirm(`Delete "${name || "Untitled version"}"?`)) return;
    const res = await fetch(`/api/versions/${id}`, { method: "DELETE" });
    if (res.ok) {
      setItems((prev) => {
        const next = prev.filter((v) => v.id !== id);
        if (selectedId === id && next.length > 0) setSelectedId(next[0].id);
        return next;
      });
    }
  }, [selectedId]);

  return (
    <main className="flex h-[calc(100vh-64px)] flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant bg-surface-container-lowest px-lg py-3">
        <h1 className="headline-lg">Library</h1>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="Search versions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 rounded-lg border border-outline-variant bg-surface-container-lowest px-3 text-xs outline-none focus:border-primary"
          />
          <div className="flex gap-1">
            {OUTCOMES.map((o) => (
              <button
                key={o}
                onClick={() => setFilter(o)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium capitalize transition-colors duration-200 ${
                  filter === o
                    ? "bg-on-surface text-surface-container-lowest"
                    : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
                }`}
              >
                {o}
              </button>
            ))}
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* Left: version list */}
          <aside className="flex w-80 flex-col border-r border-outline-variant bg-surface-container-lowest">
            <div className="flex-1 overflow-y-auto">
              {filteredItems.length === 0 ? (
                <p className="p-4 text-sm text-on-surface-variant">No versions match.</p>
              ) : (
                <ul className="divide-y divide-outline-variant">
                  {filteredItems.map((v) => {
                    const isSelected = v.id === selected?.id;
                    const primary = primaryApplication(v);
                    return (
                      <li
                        key={v.id}
                        onClick={() => {
                          setSelectedId(v.id);
                          setShowJson(false);
                        }}
                        className={`group relative cursor-pointer px-4 py-3 transition-colors ${
                          isSelected
                            ? "bg-surface-container-low"
                            : "hover:bg-surface-container-low/50"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="truncate headline-md text-on-surface">
                              {v.name || "Untitled version"}
                            </div>
                            <div className="mt-0.5 truncate body-sm text-on-surface-variant">
                              {applicationSummary(v)}
                            </div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteVersion(v.id, v.name);
                            }}
                            className="rounded p-1 text-on-surface-variant opacity-0 transition hover:bg-error-container hover:text-error group-hover:opacity-100"
                            title="Delete version"
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          {primary && (
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider capitalize ${OUTCOME_COLORS[primary.outcome] || OUTCOME_COLORS.draft}`}
                            >
                              {outcomeLabel(primary)}
                            </span>
                          )}
                          <span className="text-[10px] text-on-surface-variant">
                            {v.applications.length} {v.applications.length === 1 ? "application" : "applications"}
                          </span>
                          <span className="ml-auto text-[10px] text-on-surface-variant">
                            {formatDate(v.createdAt)}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </aside>

          {/* Right: preview + applications */}
          <section className="flex flex-1 flex-col overflow-hidden bg-surface">
            {selected ? (
              <>
                {/* Preview toolbar */}
                <div className="flex h-12 shrink-0 items-center justify-between border-b border-outline-variant bg-surface-container-lowest px-4">
                  <div className="min-w-0">
                    <div className="truncate headline-md">{selected.name || "Untitled version"}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowJson((s) => !s)}
                      className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
                    >
                      {showJson ? "PDF" : "JSON"}
                    </button>
                  </div>
                </div>

                {/* Preview body */}
                <div className="flex-1 overflow-hidden">
                  {showJson ? (
                    <pre className="h-full w-full overflow-auto p-4 text-xs leading-relaxed text-on-surface-variant">
                      {JSON.stringify(selected.tailoredContent, null, 2)}
                    </pre>
                  ) : selected.pdfBase64 ? (
                    <iframe
                      src={`data:application/pdf;base64,${selected.pdfBase64}${pdfToolbar}`}
                      title={selected.name || "Resume"}
                      className="h-full w-full border-0"
                    />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-2 text-on-surface-variant">
                      <svg className="h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                      <span className="text-sm">PDF not available</span>
                    </div>
                  )}
                </div>

                {/* Applications panel */}
                <div className="h-64 shrink-0 overflow-y-auto border-t border-outline-variant bg-surface-container-lowest">
                  <ApplicationsPanel version={selected} onUpdate={refreshItems} />
                </div>
              </>
            ) : (
              <div className="flex h-full items-center justify-center text-on-surface-variant">
                Select a version to preview
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest p-8 text-center">
        <p className="body-sm text-on-surface-variant">No saved versions yet.</p>
        <p className="mt-1 text-xs text-on-surface-variant">
          Tailor a resume from the Builder and save it to see it here.
        </p>
        <Link
          href="/builder"
          className="mt-4 inline-block rounded-lg bg-on-surface px-3 py-1.5 text-xs font-medium text-surface-container-lowest transition hover:bg-on-surface/90"
        >
          Start your first tailor
        </Link>
      </div>
    </div>
  );
}

function ApplicationsPanel({ version, onUpdate }: { version: Version; onUpdate: () => void }) {
  const [applications, setApplications] = useState<Application[]>(version.applications);
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    company: "",
    role: "",
    jobDescription: "",
    outcome: "draft" as Outcome,
    interviewRound: "",
    rejectedAfterRound: "",
  });

  useEffect(() => {
    setApplications(version.applications);
  }, [version.applications]);

  const updateStage = useCallback(async (
    appId: string,
    updates: { outcome: Outcome; interviewRound?: number | null; rejectedAfterRound?: number | null },
  ) => {
    const body: Record<string, unknown> = { outcome: updates.outcome };
    if (updates.interviewRound !== undefined) body.interviewRound = updates.interviewRound;
    if (updates.rejectedAfterRound !== undefined) body.rejectedAfterRound = updates.rejectedAfterRound;

    await fetch(`/api/applications/${appId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setApplications((prev) => prev.map((a) => (a.id === appId ? { ...a, ...updates } : a)));
    onUpdate();
  }, [onUpdate]);

  const addApplication = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    const payload: Record<string, unknown> = {
      company: form.company,
      role: form.role,
      jobDescription: form.jobDescription,
      outcome: form.outcome,
    };
    if (form.outcome === "interviewing") {
      payload.interviewRound = form.interviewRound ? Number(form.interviewRound) : 1;
    }
    if (form.outcome === "rejected") {
      payload.rejectedAfterRound = form.rejectedAfterRound !== "" ? Number(form.rejectedAfterRound) : 0;
    }

    const res = await fetch(`/api/versions/${version.id}/applications`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const app = (await res.json()) as Application;
      setApplications((prev) => [app, ...prev]);
      setForm({ company: "", role: "", jobDescription: "", outcome: "draft", interviewRound: "", rejectedAfterRound: "" });
      setShowAdd(false);
      onUpdate();
    }
    setAdding(false);
  }, [form, onUpdate, version.id]);

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="label-sm uppercase tracking-wider text-on-surface-variant">
          Applications
        </h3>
        <button
          onClick={() => setShowAdd((s) => !s)}
          className="rounded-lg px-2 py-1 text-xs font-medium text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
        >
          {showAdd ? "Cancel" : "+ Apply to job"}
        </button>
      </div>

      {applications.length > 0 && (
        <div className="mb-4">
          <SankeyDiagram applications={applications} />
        </div>
      )}

      {showAdd && (
        <form onSubmit={addApplication} className="mb-3 space-y-2 rounded-lg border border-outline-variant bg-surface p-3">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Company"
              value={form.company}
              onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
              className="flex-1 rounded-lg border border-outline-variant bg-surface-container-lowest px-2.5 py-1.5 text-xs outline-none focus:border-primary"
              required
            />
            <input
              type="text"
              placeholder="Role"
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              className="flex-1 rounded-lg border border-outline-variant bg-surface-container-lowest px-2.5 py-1.5 text-xs outline-none focus:border-primary"
              required
            />
          </div>
          <textarea
            placeholder="Job description (optional)"
            value={form.jobDescription}
            onChange={(e) => setForm((f) => ({ ...f, jobDescription: e.target.value }))}
            rows={2}
            className="w-full resize-none rounded-lg border border-outline-variant bg-surface-container-lowest px-2.5 py-1.5 text-xs outline-none focus:border-primary"
          />
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={form.outcome}
              onChange={(e) => setForm((f) => ({ ...f, outcome: e.target.value as Outcome }))}
              className="rounded-lg border border-outline-variant bg-surface-container-lowest px-2 py-1 text-xs outline-none"
            >
              {OUTCOMES.slice(1).map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
            {form.outcome === "interviewing" && (
              <input
                type="number"
                min={1}
                placeholder="Round"
                value={form.interviewRound}
                onChange={(e) => setForm((f) => ({ ...f, interviewRound: e.target.value }))}
                className="w-20 rounded-lg border border-outline-variant bg-surface-container-lowest px-2 py-1 text-xs outline-none focus:border-primary"
              />
            )}
            {form.outcome === "rejected" && (
              <input
                type="number"
                min={0}
                placeholder="After round"
                value={form.rejectedAfterRound}
                onChange={(e) => setForm((f) => ({ ...f, rejectedAfterRound: e.target.value }))}
                className="w-28 rounded-lg border border-outline-variant bg-surface-container-lowest px-2 py-1 text-xs outline-none focus:border-primary"
              />
            )}
            <button
              type="submit"
              disabled={adding}
              className="ml-auto rounded-lg bg-on-surface px-3 py-1.5 text-xs font-medium text-surface-container-lowest disabled:opacity-50"
            >
              {adding ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {applications.length === 0 && (
          <p className="body-sm text-on-surface-variant">No applications yet.</p>
        )}
        {applications.map((app) => (
          <div
            key={app.id}
            className="flex items-start justify-between gap-2 rounded-lg border border-outline-variant bg-surface p-2"
          >
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold text-on-surface">{app.company}</div>
              <div className="truncate text-[11px] text-on-surface-variant">{app.role}</div>
              <div className="mt-1 text-[10px] text-on-surface-variant">{formatDate(app.createdAt)}</div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <select
                value={app.outcome}
                onChange={(e) => {
                  const outcome = e.target.value as Outcome;
                  const updates: Parameters<typeof updateStage>[1] = { outcome };
                  if (outcome === "interviewing") updates.interviewRound = app.interviewRound ?? 1;
                  if (outcome === "rejected") updates.rejectedAfterRound = app.rejectedAfterRound ?? 0;
                  updateStage(app.id, updates);
                }}
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider outline-none ${OUTCOME_COLORS[app.outcome] || OUTCOME_COLORS.draft}`}
              >
                {OUTCOMES.slice(1).map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
              {app.outcome === "interviewing" && (
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-on-surface-variant">Round</span>
                  <input
                    type="number"
                    min={1}
                    value={app.interviewRound ?? 1}
                    onChange={(e) => updateStage(app.id, { outcome: app.outcome, interviewRound: Number(e.target.value) })}
                    className="w-12 rounded border border-outline-variant bg-surface-container-lowest px-1 py-0.5 text-[10px] outline-none"
                  />
                </div>
              )}
              {app.outcome === "rejected" && (
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-on-surface-variant">After</span>
                  <input
                    type="number"
                    min={0}
                    value={app.rejectedAfterRound ?? 0}
                    onChange={(e) => updateStage(app.id, { outcome: app.outcome, rejectedAfterRound: Number(e.target.value) })}
                    className="w-12 rounded border border-outline-variant bg-surface-container-lowest px-1 py-0.5 text-[10px] outline-none"
                  />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
