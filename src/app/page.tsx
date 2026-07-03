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

export default function LibraryPage() {
  const [filter, setFilter] = useState<(typeof OUTCOMES)[number]>("all");
  const [items, setItems] = useState<Version[]>([]);
  const [selected, setSelected] = useState<Version | null>(null);
  const [jsonCards, setJsonCards] = useState<Set<string>>(() => new Set());

  const toggleJson = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setJsonCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const refreshItems = useCallback(() => {
    const url =
      filter === "all"
        ? "/api/versions"
        : `/api/versions?outcome=${filter}`;
    fetch(url)
      .then((r) => r.json())
      .then((data: Version[]) => setItems(data));
  }, [filter]);

  useEffect(() => {
    refreshItems();
  }, [refreshItems]);

  return (
    <main className="px-lg py-lg">
      {/* Header + outcome filter chips */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="headline-lg">Library</h1>
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

      {/* PDF card grid */}
      <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {items.map((v) => {
          const primary = primaryApplication(v);
          return (
            <button
              key={v.id}
              onClick={() => setSelected(v)}
              className="group overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest text-left transition-all duration-200 hover:border-on-surface-variant hover:shadow-sm"
            >
              {/* PDF preview / JSON toggle area */}
              <div className="relative h-40 overflow-hidden border-b border-outline-variant bg-surface">
                {jsonCards.has(v.id) ? (
                  <pre className="h-full w-full overflow-auto p-3 text-[10px] leading-relaxed text-on-surface-variant">
                    {JSON.stringify(v.tailoredContent, null, 2)}
                  </pre>
                ) : v.pdfBase64 ? (
                  <iframe
                    src={`data:application/pdf;base64,${v.pdfBase64}${pdfToolbar}`}
                    title={primary ? `${primary.company} - ${primary.role}` : "Resume"}
                    className="pointer-events-none h-full w-full border-0"
                    scrolling="no"
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-1 text-on-surface-variant">
                    <svg
                      className="h-8 w-8"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                      />
                    </svg>
                    <span className="text-xs">No PDF</span>
                  </div>
                )}

                {/* View toggle button */}
                <button
                  onClick={(e) => toggleJson(v.id, e)}
                  className={`absolute right-2 top-2 rounded-lg border border-outline-variant bg-surface-container-lowest/90 px-2 py-1 text-[10px] font-medium backdrop-blur transition hover:bg-surface-container-lowest ${
                    jsonCards.has(v.id)
                      ? "text-on-surface"
                      : "text-on-surface-variant"
                  }`}
                >
                  {jsonCards.has(v.id) ? "PDF" : "JSON"}
                </button>
              </div>

              {/* Card info */}
              <div className="p-3">
                <div className="truncate headline-md group-hover:text-on-surface">
                  {primary?.company ?? "Untitled version"}
                </div>
                <div className="truncate body-sm text-on-surface-variant">
                  {primary?.role ?? "No role"}
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    {primary && (
                      <span
                        className={`rounded-full px-2 py-0.5 label-sm uppercase tracking-wider capitalize ${OUTCOME_COLORS[primary.outcome] || OUTCOME_COLORS.draft}`}
                      >
                        {primary.outcome}
                      </span>
                    )}
                    {v.applications.length > 1 && (
                      <span className="text-[10px] text-on-surface-variant">
                        +{v.applications.length - 1} more
                      </span>
                    )}
                  </div>
                  <span className="body-sm text-on-surface-variant">
                    {formatDate(v.createdAt)}
                  </span>
                </div>
              </div>
            </button>
          );
        })}

        {/* Empty state */}
        {items.length === 0 && (
          <div className="col-span-full rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest p-8 text-center">
            <p className="body-sm text-on-surface-variant">No saved versions yet.</p>
            <p className="mt-1 text-xs text-on-surface-variant">
              Tailor a resume from the Builder and save it to see it here.
            </p>
            <Link
              href="/builder"
              className="mt-3 inline-block rounded-lg bg-on-surface px-3 py-1.5 text-xs font-medium text-surface-container-lowest transition hover:bg-on-surface/90"
            >
              Start your first tailor
            </Link>
          </div>
        )}
      </div>

      {/* Detail view modal */}
      {selected && (
        <VersionDetailModal
          version={selected}
          onClose={() => setSelected(null)}
          onUpdate={refreshItems}
        />
      )}
    </main>
  );
}

function emptyForm() {
  return {
    company: "",
    role: "",
    jobDescription: "",
    outcome: "draft" as Outcome,
    interviewRound: "",
    rejectedAfterRound: "",
  };
}

function stagePayload(form: {
  outcome: Outcome;
  interviewRound: string;
  rejectedAfterRound: string;
}) {
  const payload: Record<string, unknown> = { outcome: form.outcome };
  if (form.outcome === "interviewing") {
    payload.interviewRound = form.interviewRound ? Number(form.interviewRound) : 1;
  }
  if (form.outcome === "rejected") {
    payload.rejectedAfterRound = form.rejectedAfterRound !== "" ? Number(form.rejectedAfterRound) : 0;
  }
  return payload;
}

function VersionDetailModal({
  version,
  onClose,
  onUpdate,
}: {
  version: Version;
  onClose: () => void;
  onUpdate: () => void;
}) {
  const [applications, setApplications] = useState<Application[]>(version.applications);
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(emptyForm());

  const primary = primaryApplication(version);

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
    setApplications((prev) =>
      prev.map((a) => (a.id === appId ? { ...a, ...updates } : a))
    );
    onUpdate();
  }, [onUpdate]);

  const addApplication = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    const res = await fetch(`/api/versions/${version.id}/applications`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        company: form.company,
        role: form.role,
        jobDescription: form.jobDescription,
        ...stagePayload(form),
      }),
    });
    if (res.ok) {
      const app = (await res.json()) as Application;
      setApplications((prev) => [app, ...prev]);
      setForm(emptyForm());
      setShowAdd(false);
      onUpdate();
    }
    setAdding(false);
  }, [form, onUpdate, version.id]);

  return (
    <div
      className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="grid h-full max-h-[90vh] w-full max-w-5xl grid-cols-[1fr_1fr] overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left: full PDF viewer */}
        <section className="overflow-hidden bg-inverse-surface">
          {version.pdfBase64 ? (
            <iframe
              src={`data:application/pdf;base64,${version.pdfBase64}${pdfToolbar}`}
              title={primary ? `${primary.company} ${primary.role}` : "Resume"}
              className="h-full w-full border-0"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-inverse-on-surface">
              <svg
                className="h-12 w-12"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                />
              </svg>
              <span className="text-sm">PDF not available</span>
            </div>
          )}
        </section>

        {/* Right: metadata panel */}
        <section className="flex flex-col overflow-auto border-l border-outline-variant bg-surface-container-lowest">
          {/* Header */}
          <div className="border-b border-outline-variant px-4 py-3">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="headline-md">{primary?.company ?? "Untitled version"}</h2>
                <p className="body-sm text-on-surface-variant">{primary?.role ?? "No role"}</p>
              </div>
              <button
                onClick={onClose}
                className="rounded-lg p-1 text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Application flow diagram */}
          {applications.length > 0 && (
            <div className="border-b border-outline-variant px-4 py-3">
              <h3 className="mb-2 label-sm uppercase tracking-wider text-on-surface-variant">
                Application flow
              </h3>
              <SankeyDiagram applications={applications} />
            </div>
          )}

          {/* Applications list */}
          <div className="border-b border-outline-variant px-4 py-3">
            <div className="mb-2 flex items-center justify-between">
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

            {showAdd && (
              <form onSubmit={addApplication} className="mb-3 space-y-2 rounded-lg border border-outline-variant bg-surface p-3">
                <input
                  type="text"
                  placeholder="Company"
                  value={form.company}
                  onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                  className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-2.5 py-1.5 text-xs outline-none focus:border-primary"
                  required
                />
                <input
                  type="text"
                  placeholder="Role"
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                  className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-2.5 py-1.5 text-xs outline-none focus:border-primary"
                  required
                />
                <textarea
                  placeholder="Job description (optional)"
                  value={form.jobDescription}
                  onChange={(e) => setForm((f) => ({ ...f, jobDescription: e.target.value }))}
                  rows={3}
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
                    {adding ? "Saving..." : "Save application"}
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
                          onChange={(e) => updateStage(app.id, {
                            outcome: app.outcome,
                            interviewRound: Number(e.target.value),
                          })}
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
                          onChange={(e) => updateStage(app.id, {
                            outcome: app.outcome,
                            rejectedAfterRound: Number(e.target.value),
                          })}
                          className="w-12 rounded border border-outline-variant bg-surface-container-lowest px-1 py-0.5 text-[10px] outline-none"
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tailored JSON */}
          <div className="flex-1 px-4 py-3">
            <h3 className="mb-2 label-sm uppercase tracking-wider text-on-surface-variant">
              Tailored Content
            </h3>
            <pre className="max-h-80 overflow-auto rounded-lg border border-outline-variant bg-surface p-3 text-[11px] leading-relaxed text-on-surface-variant">
              {JSON.stringify(version.tailoredContent, null, 2)}
            </pre>
          </div>
        </section>
      </div>
    </div>
  );
}
