"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PdfPreviewPane } from "@/components/PdfPreviewPane";
import { SankeyDiagram } from "@/components/SankeyDiagram";
import type { Application } from "@/lib/applications";

type Version = {
  id: string;
  name: string | null;
  tailoredContent: unknown;
  createdAt: string;
  pdfBase64: string | null;
  applications: Application[];
};

type Insights = {
  summary: string;
  keywords: string[];
  strengths: string[];
  tone: string;
};

const OUTCOME_COLORS: Record<string, string> = {
  draft: "bg-surface-container-highest text-secondary",
  applied: "bg-blue-100 text-blue-700",
  ghosted: "bg-slate-200 text-slate-700",
  interviewing: "bg-amber-100 text-amber-700",
  rejected: "bg-red-100 text-red-600",
  offer: "bg-status-success/10 text-status-success",
  declined: "bg-purple-100 text-purple-700",
};

const OUTCOME_LABELS: Record<string, string> = {
  draft: "Draft",
  applied: "Applied",
  ghosted: "Ghosted",
  interviewing: "Interviewing",
  rejected: "Rejected",
  offer: "Offer",
  declined: "Declined",
};

// Shared button language (matches the master resume editor header).
const smallBtnCls =
  "inline-flex items-center gap-1 px-3 py-2 text-on-surface-variant text-label-md font-label-md hover:bg-surface-container-low transition-colors duration-200 rounded";
const modeActiveBtnCls =
  "bg-surface-container-high text-on-surface text-label-md font-label-md px-3 py-2 rounded font-semibold";

const previewBtnCls =
  "px-3 py-2 text-inverse-on-surface text-label-md font-label-md hover:bg-white/10 transition-colors duration-200 rounded flex items-center gap-1";

function base64ToUint8(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Minimal click-away hook for the export dropdown.
function useClickAway<T extends HTMLElement>(active: boolean, onClickAway: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!active) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClickAway();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [active, onClickAway]);
  return ref;
}

export default function ResumeDetailPage() {
  const params = useParams();
  const versionId = params.version as string;
  const [version, setVersion] = useState<Version | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [previewWidth, setPreviewWidth] = useState(50);
  const [resizing, setResizing] = useState(false);
  const [leftMode, setLeftMode] = useState<"insights" | "jobs">("insights");
  const [insights, setInsights] = useState<Insights | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);

  const [exportOpen, setExportOpen] = useState(false);
  const [exportName, setExportName] = useState("Resume");
  const exportRef = useClickAway<HTMLDivElement>(exportOpen, () => setExportOpen(false));

  useEffect(() => {
    if (!versionId) return;
    fetch(`/api/versions/${versionId}`)
      .then((r) => r.json())
      .then((data: Version) => {
        setVersion(data);
        if (data.applications[0]) setSelectedAppId(data.applications[0].id);
        const base = (data.name || "Resume").replace(/\s+/g, "").trim();
        setExportName(base || "Resume");
      })
      .finally(() => setLoading(false));
  }, [versionId]);

  // Fetch AI insights when entering the Insights tab.
  useEffect(() => {
    if (leftMode !== "insights" || !versionId || insights || insightsLoading) return;
    setInsightsLoading(true);
    fetch(`/api/versions/${versionId}/insights`)
      .then((r) => r.json())
      .then((data: Insights) => setInsights(data))
      .catch(() => {})
      .finally(() => setInsightsLoading(false));
  }, [leftMode, versionId, insights, insightsLoading]);

  // Preview resizing via mouse drag on the resizer bar (same as master editor).
  const resizeState = useRef<{ startX: number; startValue: number; mainWidth: number } | null>(null);
  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    resizeState.current = {
      startX: e.clientX,
      startValue: previewWidth,
      mainWidth: Math.max(1, window.innerWidth - 1),
    };
    setResizing(true);
    function onMove(ev: MouseEvent) {
      const state = resizeState.current;
      if (!state) return;
      const delta = ev.clientX - state.startX;
      const pctDelta = -(delta / state.mainWidth) * 100;
      setPreviewWidth(Math.max(20, Math.min(75, state.startValue + pctDelta)));
    }
    function onUp() {
      resizeState.current = null;
      setResizing(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-on-surface-variant">
        Loading resume...
      </div>
    );
  }

  if (!version) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-on-surface-variant">
        <p>Resume not found.</p>
        <Link href="/resumes" className="rounded-lg bg-primary px-4 py-2 text-label-md font-label-md text-on-primary">
          Back to Resumes
        </Link>
      </div>
    );
  }

  const pdfBytes = version.pdfBase64 ? base64ToUint8(version.pdfBase64) : null;
  const apps = version.applications;

  // Compute usage stats from applications.
  const outcomeCounts: Record<string, number> = {};
  for (const a of apps) {
    outcomeCounts[a.outcome] = (outcomeCounts[a.outcome] ?? 0) + 1;
  }
  const totalApps = apps.length;
  const interviewCount = apps.filter((a) => a.outcome === "interviewing" || a.outcome === "offer" || a.outcome === "declined" || a.outcome === "rejected").length;
  const offerCount = outcomeCounts.offer ?? 0;
  const responseRate = totalApps > 0 ? Math.round(((totalApps - (outcomeCounts.ghosted ?? 0) - (outcomeCounts.draft ?? 0)) / totalApps) * 100) : 0;

  function exportAs(kind: "pdf" | "json") {
    const base = exportName.trim() || "Resume";
    try {
      if (kind === "pdf" && version?.pdfBase64) {
        const bytes = base64ToUint8(version.pdfBase64);
        downloadBlob(new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" }), `${base}.pdf`);
      } else if (kind === "json" && version?.tailoredContent) {
        downloadBlob(
          new Blob([JSON.stringify(version.tailoredContent, null, 2)], { type: "application/json" }),
          `${base}.json`,
        );
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "export failed");
    }
    setExportOpen(false);
  }

  const headerExtra = (
    <span className="text-label-md font-label-md text-inverse-on-surface font-semibold flex items-center gap-2">
      <input
        value={exportName}
        onChange={(e) => setExportName(e.target.value)}
        size={Math.max(20, exportName.length)}
        className="bg-transparent border-none focus:ring-0 outline-none p-0 text-label-md font-label-md text-inverse-on-surface"
        aria-label="Export filename"
      />
    </span>
  );

  const actionsExtra = (
    <>
      <div ref={exportRef} className="relative">
        <button onClick={() => setExportOpen((s) => !s)} className={previewBtnCls}>
          <span className="material-symbols-outlined text-[18px]">download</span> Export
          <span className="material-symbols-outlined text-[16px]">expand_more</span>
        </button>
        {exportOpen && (
          <div className="absolute right-0 top-full mt-1 bg-inverse-surface border border-inverse-on-surface/20 rounded-lg shadow-lg py-1 min-w-[9rem] z-20">
            <button
              onClick={() => exportAs("pdf")}
              className="w-full text-left px-3 py-1.5 text-body-md font-body-md text-inverse-on-surface hover:bg-white/10"
            >
              Export as PDF
            </button>
            <button
              onClick={() => exportAs("json")}
              className="w-full text-left px-3 py-1.5 text-body-md font-body-md text-inverse-on-surface hover:bg-white/10"
            >
              Export as JSON
            </button>
          </div>
        )}
      </div>
      <div className="w-px h-5 bg-inverse-on-surface/20 mx-1" />
    </>
  );

  return (
    <div className="flex h-screen flex-col font-body-md text-body-md text-on-surface bg-background">
      {/* Full-screen overlay during resize so iframes/panels don't steal mouse events. */}
      {resizing && <div className="fixed inset-0 z-[60] cursor-col-resize" />}

      {/* Split pane — fills the full viewport height */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: header matches the master resume editor; toggles switch content */}
        <aside className="flex flex-1 flex-col overflow-hidden bg-surface-container-lowest">
          <div className="h-12 shrink-0 border-b border-outline-variant bg-surface-container-lowest px-md sticky top-0 z-10 flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Link
                href="/resumes"
                title="Back to Resumes"
                className="inline-flex items-center gap-1 rounded px-3 py-2 text-on-surface-variant text-label-md font-label-md hover:bg-surface-container-low hover:text-on-surface transition-colors duration-200"
              >
                <span className="material-symbols-outlined text-[18px]">arrow_back</span>
              </Link>
              <button onClick={() => setLeftMode("insights")} className={leftMode === "insights" ? modeActiveBtnCls : smallBtnCls}>
                Insights
              </button>
              <button onClick={() => setLeftMode("jobs")} className={leftMode === "jobs" ? modeActiveBtnCls : smallBtnCls}>
                Jobs
              </button>
            </div>
          </div>

          {/* Left content — toggled by Insights / Jobs */}
          {leftMode === "insights" ? (
            <>
              {/* Top half: Sankey funnel diagram */}
              <div className="flex min-h-0 flex-1 flex-col overflow-auto border-b border-outline-variant p-md">
                <h2 className="mb-sm font-label-lg text-label-lg text-on-surface">Application Funnel</h2>
                {apps.length > 0 ? (
                  <SankeyDiagram applications={apps} />
                ) : (
                  <p className="text-sm text-on-surface-variant">No applications to visualize yet.</p>
                )}
              </div>

              {/* Bottom half: AI insights + usage stats */}
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-md space-y-md">
                {/* Usage stats */}
                <div className="grid grid-cols-3 gap-sm">
                  <StatCard label="Times Used" value={totalApps} />
                  <StatCard label="Interviews" value={interviewCount} />
                  <StatCard label="Offers" value={offerCount} />
                </div>

                <div className="grid grid-cols-2 gap-sm">
                  <StatCard label="Response Rate" value={`${responseRate}%`} />
                  <StatCard label="Created" value={new Date(version.createdAt).toLocaleDateString()} />
                </div>

                {/* Outcome breakdown */}
                {totalApps > 0 && (
                  <div className="rounded-lg border border-outline-variant bg-surface-white p-md">
                    <h3 className="mb-sm font-label-md text-label-md text-on-surface-variant">Outcome Breakdown</h3>
                    <div className="space-y-xs">
                      {Object.entries(outcomeCounts).map(([outcome, count]) => (
                        <div key={outcome} className="flex items-center justify-between text-sm">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-tighter ${OUTCOME_COLORS[outcome] || OUTCOME_COLORS.draft}`}>
                            {OUTCOME_LABELS[outcome] ?? outcome}
                          </span>
                          <span className="font-semibold text-on-surface">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* AI Summary */}
                <div className="rounded-lg border border-outline-variant bg-surface-white p-md">
                  <h3 className="mb-sm flex items-center gap-1 font-label-md text-label-md text-on-surface-variant">
                    <span className="material-symbols-outlined text-[16px] text-primary">auto_awesome</span>
                    AI Summary
                  </h3>
                  {insightsLoading ? (
                    <p className="text-sm text-on-surface-variant">Analyzing resume...</p>
                  ) : insights ? (
                    <div className="space-y-sm">
                      {insights.tone && (
                        <p className="font-semibold text-primary text-sm">{insights.tone}</p>
                      )}
                      <p className="text-sm text-on-surface">{insights.summary}</p>
                    </div>
                  ) : (
                    <p className="text-sm text-on-surface-variant">Unable to generate summary.</p>
                  )}
                </div>

                {/* Strengths */}
                {insights?.strengths && insights.strengths.length > 0 && (
                  <div className="rounded-lg border border-outline-variant bg-surface-white p-md">
                    <h3 className="mb-sm font-label-md text-label-md text-on-surface-variant">Strengths</h3>
                    <ul className="space-y-xs">
                      {insights.strengths.map((s, i) => (
                        <li key={i} className="flex items-start gap-xs text-sm text-on-surface">
                          <span className="material-symbols-outlined text-[14px] text-status-success mt-0.5">check_circle</span>
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Keywords */}
                {insights?.keywords && insights.keywords.length > 0 && (
                  <div className="rounded-lg border border-outline-variant bg-surface-white p-md">
                    <h3 className="mb-sm font-label-md text-label-md text-on-surface-variant">Keywords</h3>
                    <div className="flex flex-wrap gap-xs">
                      {insights.keywords.map((k, i) => (
                        <span key={i} className="rounded-full bg-secondary-container px-2 py-0.5 text-xs font-medium text-secondary">
                          {k}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-md">
              {apps.length === 0 ? (
                <p className="text-sm text-on-surface-variant">No applications linked to this resume.</p>
              ) : (
                <div className="space-y-md">
                  {apps.map((app) => {
                    const expanded = selectedAppId === app.id;
                    return (
                    <button
                      key={app.id}
                      onClick={() => setSelectedAppId(expanded ? null : app.id)}
                      className={`w-full rounded-lg border p-md text-left transition-colors ${
                        expanded
                          ? "border-primary bg-surface-white"
                          : "border-outline-variant bg-surface-white hover:border-outline"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-primary">{app.company}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-tighter ${OUTCOME_COLORS[app.outcome] || OUTCOME_COLORS.draft}`}>
                          {app.outcome}
                        </span>
                      </div>
                      <div className="text-xs text-on-surface-variant">{app.role}</div>
                      {expanded && app.jobDescription && (
                        <div className="mt-sm border-t border-outline-variant pt-sm text-sm text-on-surface whitespace-pre-wrap">
                          {app.jobDescription}
                        </div>
                      )}
                    </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </aside>

        {/* Resizer */}
        <div
          onMouseDown={(e) => startResize(e)}
          className="hidden lg:flex w-1 bg-surface border-l border-outline-variant hover:bg-surface-container-high cursor-col-resize shrink-0 items-center justify-center relative z-10 group select-none"
        >
          <div className="h-8 w-[2px] bg-outline-variant group-hover:bg-on-surface-variant rounded-full" />
        </div>

        {/* Right: PDF preview — exactly like the master resume editor */}
        <PdfPreviewPane
          src={pdfBytes}
          ready={!!pdfBytes}
          width={previewWidth}
          headerExtra={headerExtra}
          actionsExtra={actionsExtra}
        />
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-outline-variant bg-surface-white p-md">
      <p className="text-label-sm font-label-sm text-on-surface-variant">{label}</p>
      <p className="font-headline-md text-headline-md text-primary">{value}</p>
    </div>
  );
}
