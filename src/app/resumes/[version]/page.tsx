"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

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

const OUTCOME_COLORS: Record<string, string> = {
  draft: "bg-surface-container-highest text-secondary",
  applied: "bg-blue-100 text-blue-700",
  ghosted: "bg-slate-200 text-slate-700",
  interviewing: "bg-amber-100 text-amber-700",
  rejected: "bg-red-100 text-red-600",
  offer: "bg-status-success/10 text-status-success",
  declined: "bg-purple-100 text-purple-700",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString();
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

  const selectedApp = version?.applications.find((a) => a.id === selectedAppId) ?? version?.applications[0];

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

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col">
      {/* Top bar */}
      <div className="flex h-16 shrink-0 items-center gap-4 border-b border-outline-variant bg-surface-white px-6">
        <Link
          href="/resumes"
          className="inline-flex items-center gap-1 rounded px-3 py-2 text-on-surface-variant text-label-md font-label-md hover:bg-surface-container-low hover:text-on-surface transition-colors"
        >
          <MaterialIcon name="arrow_back" className="text-[18px]" />
          Back
        </Link>
        <h1 className="font-headline-lg text-headline-lg text-primary truncate">
          {version.name || "Untitled version"}
        </h1>
      </div>

      {/* Split pane */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: job description */}
        <aside className="flex w-96 flex-col border-r border-outline-variant bg-surface-container-lowest">
          <div className="border-b border-outline-variant px-4 py-3">
            <h2 className="font-headline-md text-headline-md text-primary">Job Description</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {version.applications.length === 0 ? (
              <p className="text-sm text-on-surface-variant">No applications linked to this resume.</p>
            ) : (
              <div className="space-y-4">
                {version.applications.map((app) => (
                  <button
                    key={app.id}
                    onClick={() => setSelectedAppId(app.id)}
                    className={`w-full rounded-lg border p-3 text-left transition-colors ${
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
                      <div className="mt-3 border-t border-outline-variant pt-3 text-sm text-on-surface whitespace-pre-wrap">
                        {app.jobDescription}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Right: PDF preview */}
        <section className="flex flex-1 flex-col overflow-hidden bg-surface">
          <div className="flex h-12 shrink-0 items-center border-b border-outline-variant bg-surface-container-lowest px-4">
            <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">Preview</span>
          </div>
          <div className="flex-1 overflow-hidden">
            {version.pdfBase64 ? (
              <iframe
                src={`data:application/pdf;base64,${version.pdfBase64}#toolbar=0&navpanes=0&scrollbar=0`}
                title={version.name || "Resume"}
                className="h-full w-full border-0"
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-on-surface-variant">
                <MaterialIcon name="description" className="text-[40px]" />
                <span className="text-sm">PDF not available</span>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function MaterialIcon({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center align-middle ${className}`}
      style={{ fontFamily: "'Material Symbols Outlined', sans-serif", fontSize: "20px", fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
    >
      {name}
    </span>
  );
}
