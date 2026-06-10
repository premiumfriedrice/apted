"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Version = {
  id: string;
  company: string;
  role: string;
  jobDescription: string;
  tailoredContent: unknown;
  outcome: "draft" | "applied" | "interview" | "offer" | "rejected";
  createdAt: string;
  pdf: string | null;
};

const OUTCOMES = ["all", "draft", "applied", "interview", "offer", "rejected"] as const;

const OUTCOME_COLORS: Record<string, string> = {
  draft: "bg-neutral-200 text-neutral-700",
  applied: "bg-blue-100 text-blue-700",
  interview: "bg-amber-100 text-amber-700",
  offer: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

export default function LibraryPage() {
  const [filter, setFilter] = useState<(typeof OUTCOMES)[number]>("all");
  const [items, setItems] = useState<Version[]>([]);
  const [selected, setSelected] = useState<Version | null>(null);
  // Track which cards are showing JSON view (persists per card within session).
  const [jsonCards, setJsonCards] = useState<Set<string>>(() => new Set());

  const toggleJson = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Don't open the detail modal
    setJsonCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  useEffect(() => {
    const url =
      filter === "all"
        ? "/api/versions"
        : `/api/versions?outcome=${filter}`;
    fetch(url)
      .then((r) => r.json())
      .then(setItems);
  }, [filter]);

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      {/* Header + outcome filter chips */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Library</h1>
        <div className="flex gap-1">
          {OUTCOMES.map((o) => (
            <button
              key={o}
              onClick={() => setFilter(o)}
              className={`rounded px-2 py-1 text-xs capitalize ${
                filter === o
                  ? "bg-neutral-900 text-white"
                  : "border border-neutral-300 hover:border-neutral-400"
              }`}
            >
              {o}
            </button>
          ))}
        </div>
      </div>

      {/* PDF card grid */}
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {items.map((v) => (
          <button
            key={v.id}
            onClick={() => setSelected(v)}
            className="group overflow-hidden rounded-lg border border-neutral-200 bg-white text-left shadow-sm transition hover:border-neutral-400 hover:shadow-md"
          >
            {/* PDF preview / JSON toggle area */}
            <div className="relative h-52 overflow-hidden border-b border-neutral-100 bg-neutral-50">
              {jsonCards.has(v.id) ? (
                <pre className="h-full w-full overflow-auto p-3 text-[10px] leading-relaxed text-neutral-700">
                  {JSON.stringify(v.tailoredContent, null, 2)}
                </pre>
              ) : v.pdf ? (
                <iframe
                  src={`data:application/pdf;base64,${v.pdf}#toolbar=0&navpanes=0&scrollbar=0`}
                  title={`${v.company} - ${v.role}`}
                  className="pointer-events-none h-full w-full border-0"
                  scrolling="no"
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-1 text-neutral-400">
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
                className={`absolute right-2 top-2 rounded border border-neutral-200/80 bg-white/90 px-1.5 py-0.5 text-[10px] font-medium backdrop-blur transition hover:bg-white ${
                  jsonCards.has(v.id)
                    ? "text-neutral-900"
                    : "text-neutral-500"
                }`}
              >
                {jsonCards.has(v.id) ? "PDF" : "JSON"}
              </button>
            </div>

            {/* Card info */}
            <div className="p-4">
              <div className="truncate text-sm font-semibold group-hover:text-neutral-900">
                {v.company}
              </div>
              <div className="truncate text-sm text-neutral-600">{v.role}</div>
              <div className="mt-2 flex items-center justify-between">
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${OUTCOME_COLORS[v.outcome] || OUTCOME_COLORS.draft}`}
                >
                  {v.outcome}
                </span>
                <span className="text-xs text-neutral-400">
                  {new Date(v.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          </button>
        ))}

        {/* Empty state */}
        {items.length === 0 && (
          <div className="col-span-full rounded-lg border border-dashed border-neutral-300 p-12 text-center">
            <p className="text-sm text-neutral-500">No saved versions yet.</p>
            <p className="mt-1 text-xs text-neutral-400">
              Tailor a resume from the Builder and save it to see it here.
            </p>
            <Link
              href="/builder"
              className="mt-4 inline-block rounded-md bg-neutral-900 px-4 py-2 text-xs font-medium text-white transition hover:bg-neutral-800"
            >
              Start your first tailor
            </Link>
          </div>
        )}
      </div>

      {/* Detail view modal */}
      {selected && (
        <div
          className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
          onClick={() => setSelected(null)}
        >
          <div
            className="grid h-full max-h-[90vh] w-full max-w-5xl grid-cols-[1fr_1fr] overflow-hidden rounded-lg bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Left: full PDF viewer */}
            <section className="overflow-hidden bg-neutral-100">
              {selected.pdf ? (
                <iframe
                  src={`data:application/pdf;base64,${selected.pdf}`}
                  title={`${selected.company} ${selected.role}`}
                  className="h-full w-full border-0"
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-neutral-400">
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
            <section className="flex flex-col overflow-auto border-l border-neutral-200">
              {/* Header */}
              <div className="border-b border-neutral-200 px-6 py-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">{selected.company}</h2>
                    <p className="text-sm text-neutral-600">{selected.role}</p>
                  </div>
                  <button
                    onClick={() => setSelected(null)}
                    className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${OUTCOME_COLORS[selected.outcome] || OUTCOME_COLORS.draft}`}
                  >
                    {selected.outcome}
                  </span>
                  <span className="text-xs text-neutral-400">
                    {new Date(selected.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>

              {/* Job description */}
              <div className="border-b border-neutral-100 px-6 py-4">
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Job Description
                </h3>
                <pre className="whitespace-pre-wrap text-xs leading-relaxed text-neutral-700">
                  {selected.jobDescription}
                </pre>
              </div>

              {/* Tailored JSON */}
              <div className="flex-1 px-6 py-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Tailored Content
                </h3>
                <pre className="max-h-80 overflow-auto rounded bg-neutral-50 p-3 text-[11px] leading-relaxed">
                  {JSON.stringify(selected.tailoredContent, null, 2)}
                </pre>
              </div>
            </section>
          </div>
        </div>
      )}
    </main>
  );
}
