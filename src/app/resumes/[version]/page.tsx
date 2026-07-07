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

const OUTCOME_COLORS: Record<string, string> = {
  draft: "bg-surface-container-highest text-secondary",
  applied: "bg-blue-100 text-blue-700",
  ghosted: "bg-slate-200 text-slate-700",
  interviewing: "bg-amber-100 text-amber-700",
  rejected: "bg-red-100 text-red-600",
  offer: "bg-status-success/10 text-status-success",
  declined: "bg-purple-100 text-purple-700",
};

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
  const [topPane, setTopPane] = useState<"funnel" | "applications">("funnel");

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
        Loading resume…
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
  const selectedApp = version.applications.find((a) => a.id === selectedAppId) ?? version.applications[0];

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
    <div className="flex h-screen overflow-hidden font-body-md text-body-md text-on-surface bg-background">
      {/* Full-screen overlay during resize so iframes/panels don't steal mouse events. */}
      {resizing && <div className="fixed inset-0 z-[60] cursor-col-resize" />}

      {/* Split pane — fills the full viewport height */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: two even halves (toggle pane on top, job description on bottom) */}
        <aside className="flex flex-1 flex-col overflow-hidden border-r border-outline-variant bg-surface-container-lowest">
          {/* Top half: toggle between Funnel (Sankey) and Applications list */}
          <div className="flex min-h-0 flex-1 flex-col border-b border-outline-variant">
            <div className="flex shrink-0 items-center justify-between border-b border-outline-variant bg-surface-container-low px-md py-sm">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setTopPane("funnel")}
                  className={`rounded px-3 py-1.5 text-label-md font-label-md transition-colors ${
                    topPane === "funnel"
                      ? "bg-surface-container-high text-on-surface font-semibold"
                      : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
                  }`}
                >
                  Funnel
                </button>
                <button
                  onClick={() => setTopPane("applications")}
                  className={`rounded px-3 py-1.5 text-label-md font-label-md transition-colors ${
                    topPane === "applications"
                      ? "bg-surface-container-high text-on-surface font-semibold"
                      : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
                  }`}
                >
                  Applications
                </button>
              </div>
              <Link
                href="/resumes"
                title="Back to Resumes"
                className="rounded p-1.5 text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">arrow_back</span>
              </Link>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {topPane === "funnel" ? (
                <div className="flex min-h-0 flex-1 flex-col overflow-auto p-md">
                  <SankeyDiagram applications={version.applications} />
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-md">
                  {version.applications.length === 0 ? (
                    <p className="text-sm text-on-surface-variant">No applications tracked for this resume.</p>
                  ) : (
                    <div className="space-y-sm">
                      {version.applications.map((app) => (
                        <button
                          key={app.id}
                          onClick={() => {
                            setSelectedAppId(app.id);
                            setTopPane("funnel");
                          }}
                          className={`w-full rounded-lg border p-md text-left transition-colors ${
                            selectedAppId === app.id
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
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Bottom half: job description of the selected application */}
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="shrink-0 border-b border-outline-variant bg-surface-container-low px-md py-sm">
              <h2 className="font-label-lg text-label-lg text-on-surface">Job Description</h2>
              {selectedApp && (
                <p className="text-xs text-on-surface-variant">
                  {selectedApp.company} · {selectedApp.role}
                </p>
              )}
            </div>
            <div className="flex min-h-0 flex-1 overflow-y-auto p-md">
              {!selectedApp ? (
                <p className="text-sm text-on-surface-variant">No applications linked to this resume.</p>
              ) : !selectedApp.jobDescription ? (
                <p className="text-sm text-on-surface-variant">No job description provided for this application.</p>
              ) : (
                <div className="whitespace-pre-wrap text-sm text-on-surface">{selectedApp.jobDescription}</div>
              )}
            </div>
          </div>
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
