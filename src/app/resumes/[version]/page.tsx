"use client";

import { useEffect, useState } from "react";
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

function base64ToUint8(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export default function ResumeDetailPage() {
  const params = useParams();
  const versionId = params.version as string;
  const [version, setVersion] = useState<Version | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);

  useEffect(() => {
    if (!versionId) return;
    fetch(`/api/versions/${versionId}`)
      .then((r) => r.json())
      .then((data: Version) => {
        setVersion(data);
        if (data.applications[0]) setSelectedAppId(data.applications[0].id);
      })
      .finally(() => setLoading(false));
  }, [versionId]);

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

  return (
    <div className="flex h-screen flex-col font-body-md text-body-md text-on-surface bg-background">
      {/* Top bar */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-outline-variant bg-surface-container-lowest px-md">
        <Link
          href="/resumes"
          className="inline-flex items-center gap-1 rounded px-3 py-2 text-on-surface-variant text-label-md font-label-md hover:bg-surface-container-low hover:text-on-surface transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          Back
        </Link>
        <h1 className="font-headline-md text-headline-md text-primary truncate">
          {version.name || "Untitled version"}
        </h1>
      </div>

      {/* Split pane */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Sankey diagram + job descriptions stacked */}
        <aside className="flex w-[45%] flex-col overflow-hidden border-r border-outline-variant bg-surface-container-lowest">
          <div className="shrink-0 border-b border-outline-variant px-md py-md">
            <h2 className="font-label-lg text-label-lg text-on-surface mb-sm">Application Funnel</h2>
            <SankeyDiagram applications={version.applications} />
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="shrink-0 border-b border-outline-variant px-md py-sm">
              <h2 className="font-label-lg text-label-lg text-on-surface">Job Descriptions</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-md">
              {version.applications.length === 0 ? (
                <p className="text-sm text-on-surface-variant">No applications linked to this resume.</p>
              ) : (
                <div className="space-y-md">
                  {version.applications.map((app) => (
                    <button
                      key={app.id}
                      onClick={() => setSelectedAppId(app.id)}
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
                      {selectedAppId === app.id && app.jobDescription && (
                        <div className="mt-sm border-t border-outline-variant pt-sm text-sm text-on-surface whitespace-pre-wrap">
                          {app.jobDescription}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Right: PDF preview (same pane as the master resume editor) */}
        <PdfPreviewPane
          src={pdfBytes}
          ready={!!pdfBytes}
          width={55}
        />
      </div>
    </div>
  );
}
