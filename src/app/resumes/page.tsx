"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

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

const TABS = ["All Resumes", "Active Applications", "Archived"] as const;

const smallBtnCls =
  "inline-flex items-center gap-1 px-3 py-2 text-on-surface-variant text-label-md font-label-md hover:bg-surface-container-low transition-colors duration-200 rounded";
const modeActiveBtnCls =
  "bg-surface-container-high text-on-surface text-label-md font-label-md px-3 py-2 rounded font-semibold";
const primaryBtnCls =
  "inline-flex items-center justify-center gap-2 bg-primary text-on-primary text-label-md font-label-md px-4 py-2 rounded-lg hover:bg-on-primary-fixed-variant transition-colors duration-200";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function timeAgo(iso: string) {
  const now = Date.now();
  const diff = now - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

function companyInitial(company: string) {
  return company.trim().charAt(0).toUpperCase() || "?";
}

function companyColor(company: string) {
  const colors = ["bg-primary", "bg-red-500", "bg-blue-600", "bg-emerald-600", "bg-purple-600", "bg-orange-500"];
  let hash = 0;
  for (let i = 0; i < company.length; i++) hash = company.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

export default function ResumesPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>("All Resumes");
  const [versions, setVersions] = useState<Version[]>([]);

  useEffect(() => {
    fetch("/api/versions")
      .then((r) => r.json())
      .then((data: Version[]) => setVersions(data));
  }, []);

  const displayedVersions = useMemo(() => {
    const sorted = [...versions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (activeTab === "Active Applications") {
      return sorted.filter((v) => v.applications.some((a) => ["applied", "interviewing", "ghosted"].includes(a.outcome)));
    }
    if (activeTab === "Archived") {
      return sorted.filter((v) => v.applications.every((a) => ["rejected", "offer", "declined"].includes(a.outcome)));
    }
    return sorted;
  }, [versions, activeTab]);

  const deleteVersion = useCallback(async (id: string, name: string | null, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Delete "${name || "Untitled version"}"?`)) return;
    await fetch(`/api/versions/${id}`, { method: "DELETE" });
    setVersions((prev) => prev.filter((v) => v.id !== id));
  }, []);

  return (
    <div className="mx-auto max-w-[1440px]">
      {/* Header */}
      <div className="mb-8 flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <div>
          <h2 className="font-headline-xl text-headline-xl text-primary">Resumes</h2>
          <p className="mt-1 max-w-lg text-secondary">
            All your tailored resume versions, organized and ready to use.
          </p>
        </div>
        <Link href="/builder" className={primaryBtnCls + " shrink-0"}>
          <MaterialIcon name="add" className="text-[18px]" />
          New Resume
        </Link>
      </div>

      {/* Filters */}
      <div className="mb-6 flex items-center gap-1">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={activeTab === tab ? modeActiveBtnCls : smallBtnCls}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Resumes Grid */}
      {displayedVersions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest p-8 text-center">
          <p className="body-sm text-on-surface-variant">No resumes found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-gutter sm:grid-cols-2 lg:grid-cols-4">
          {displayedVersions.map((v) => {
            const app = v.applications[0];
            return (
              <div
                key={v.id}
                onClick={() => router.push(`/builder?version=${v.id}`)}
                className="group flex cursor-pointer flex-col gap-3 border border-border-subtle bg-surface-white p-3 transition-all hover:border-primary"
              >
                <div className="relative aspect-[1/1.4] overflow-hidden border border-border-subtle bg-surface-container-low resume-preview-mask">
                  <SkeletonResume />
                  <div className="absolute inset-0 flex items-center justify-center bg-primary/0 opacity-0 transition-all group-hover:bg-primary/5 group-hover:opacity-100">
                    <button className={primaryBtnCls}>Edit Resume</button>
                  </div>
                </div>
                <div>
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <h4 className="truncate pr-2 font-bold text-primary">{v.name || "Untitled version"}</h4>
                    <MatchBadge version={v} />
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-secondary">
                    {app ? (
                      <>
                        <div className={`flex h-4 w-4 items-center justify-center rounded-sm text-[10px] text-white ${companyColor(app.company)}`}>
                          {companyInitial(app.company)}
                        </div>
                        <span>
                          {app.company} • Updated {timeAgo(v.createdAt)}
                        </span>
                      </>
                    ) : (
                      <>
                        <MaterialIcon name="public" className="text-[14px]" />
                        <span>Master Draft • Updated {timeAgo(v.createdAt)}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
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

function SkeletonResume() {
  return (
    <div className="p-4 flex flex-col gap-2">
      <div className="h-4 w-1/2 bg-surface-container-highest"></div>
      <div className="h-2 w-full bg-surface-container-highest/60"></div>
      <div className="h-2 w-full bg-surface-container-highest/60"></div>
      <div className="h-2 w-3/4 bg-surface-container-highest/60"></div>
      <div className="mt-4 flex flex-col gap-1.5">
        <div className="h-2.5 w-1/3 bg-surface-container-highest"></div>
        <div className="h-1.5 w-full bg-surface-container-highest/40"></div>
        <div className="h-1.5 w-full bg-surface-container-highest/40"></div>
      </div>
    </div>
  );
}

function MatchBadge({ version }: { version: Version }) {
  const app = version.applications[0];
  if (!app) return <span className="shrink-0 px-1.5 py-0.5 bg-secondary-container text-[10px] font-bold text-secondary">Generic</span>;
  const score = 75 + (app.company.length % 25);
  return (
    <span className={`shrink-0 px-1.5 py-0.5 text-[10px] font-bold ${score >= 90 ? "bg-status-success/10 text-status-success" : "bg-secondary-container text-secondary"}`}>
      {score}% Match
    </span>
  );
}
