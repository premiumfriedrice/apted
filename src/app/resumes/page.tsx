"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ResumePreview } from "@/components/ResumePreview";

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
  const [search, setSearch] = useState("");
  const [versions, setVersions] = useState<Version[]>([]);

  useEffect(() => {
    fetch("/api/versions")
      .then((r) => r.json())
      .then((data: Version[]) => setVersions(data));
  }, []);

  const displayedVersions = useMemo(() => {
    const sorted = [...versions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    let result = sorted;
    if (activeTab === "Active Applications") {
      result = sorted.filter((v) => v.applications.some((a) => ["applied", "interviewing", "ghosted"].includes(a.outcome)));
    } else if (activeTab === "Archived") {
      result = sorted.filter((v) => v.applications.every((a) => ["rejected", "offer", "declined"].includes(a.outcome)));
    }
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter((v) => {
        const name = (v.name || "").toLowerCase();
        const apps = v.applications.map((a) => `${a.company} ${a.role}`.toLowerCase()).join(" ");
        return name.includes(q) || apps.includes(q);
      });
    }
    return result;
  }, [versions, activeTab, search]);

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
        <div className="relative w-full max-w-xs">
          <MaterialIcon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-on-surface-variant" />
          <input
            type="text"
            placeholder="Search resumes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest py-2 pl-10 pr-4 text-body-md outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>
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
          <Link
            href="/builder"
            className="group flex cursor-pointer flex-col items-center justify-center gap-2 border border-dashed border-border-subtle bg-surface-white p-3 transition-all hover:border-primary"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-container-low text-secondary transition-colors group-hover:text-primary">
              <MaterialIcon name="add" className="text-[32px]" />
            </div>
            <p className="font-bold text-primary">New Resume</p>
            <p className="px-4 text-center text-xs text-secondary">Start from a template or import a PDF</p>
          </Link>
          {displayedVersions.map((v) => {
            const app = v.applications[0];
            return (
              <div
                key={v.id}
                onClick={() => router.push(`/resumes/${v.id}`)}
                className="group flex cursor-pointer flex-col gap-3 border border-border-subtle bg-surface-white p-3 transition-all hover:border-primary"
              >
                <div className="relative aspect-[1/1.4] overflow-hidden border border-border-subtle bg-surface-container-low resume-preview-mask">
                  <ResumePreview pdfBase64={v.pdfBase64} />
                  <div className="absolute inset-0 flex items-center justify-center bg-primary/0 opacity-0 transition-all group-hover:bg-primary/5 group-hover:opacity-100">
                    <button className={primaryBtnCls}>View Resume</button>
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
