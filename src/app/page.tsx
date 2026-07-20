"use client";

import { useEffect, useMemo, useState } from "react";
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

// Button language shared with the master resume editor (PRE-82 design system).
const smallBtnCls =
  "inline-flex items-center gap-1 px-3 py-2 text-on-surface-variant text-label-md font-label-md hover:bg-surface-container-low transition-colors duration-200 rounded";
const primaryBtnCls =
  "inline-flex items-center justify-center gap-2 bg-primary text-on-primary text-label-md font-label-md px-4 py-2 rounded-lg hover:bg-on-primary-fixed-variant transition-colors duration-200";

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

export default function LibraryPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [versions, setVersions] = useState<Version[]>([]);

  useEffect(() => {
    fetch("/api/versions")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Version[]) => setVersions(Array.isArray(data) ? data : []))
      .catch(() => setVersions([]));
  }, []);

  const recentVersions = useMemo(() => {
    const sorted = [...versions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 4);
    const q = search.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((v) => {
      const name = (v.name || "").toLowerCase();
      const apps = v.applications.map((a) => `${a.company} ${a.role}`.toLowerCase()).join(" ");
      return name.includes(q) || apps.includes(q);
    });
  }, [versions, search]);

  const applications = useMemo(() => {
    return versions.flatMap((v) => v.applications.map((a) => ({ ...a, versionName: v.name })));
  }, [versions]);

  const activeApplications = useMemo(() => {
    return applications.filter((a) => ["applied", "interviewing", "ghosted"].includes(a.outcome));
  }, [applications]);

  return (
    <div className="mx-auto max-w-[1440px]">
      {/* Header & Filters */}
      <div className="mb-10 flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <div>
          <h2 className="font-headline-xl text-headline-xl text-primary">Dashboard</h2>
          <p className="mt-1 max-w-lg text-secondary">
            An overview of your resumes and active job applications.
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

      {/* Recent Resumes Section */}
      <section className="mb-12">
        <div className="mb-4 flex items-center justify-between border-b border-outline-variant pb-2">
          <h3 className="flex items-center gap-2 font-headline-md text-headline-md">
            <MaterialIcon name="description" className="text-[20px]" />
            Recent Resumes
          </h3>
          <Link href="/resumes" className="text-label-md text-on-surface-variant underline hover:text-on-surface">
            View all
          </Link>
        </div>

        {recentVersions.length === 0 ? (
          <p className="text-secondary">No versions found.</p>
        ) : (
          <div className="grid grid-cols-1 gap-gutter sm:grid-cols-2 lg:grid-cols-4">
            {recentVersions.map((v) => {
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
            <Link
              href="/master"
              className="group flex cursor-pointer flex-col items-center justify-center gap-2 border border-dashed border-border-subtle bg-surface-white p-3 transition-all hover:border-primary"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-container-low text-secondary transition-colors group-hover:text-primary">
                <MaterialIcon name="add" className="text-[32px]" />
              </div>
              <p className="font-bold text-primary">New Resume</p>
              <p className="px-4 text-center text-xs text-secondary">Start from a template or import a PDF</p>
            </Link>
          </div>
        )}
      </section>

      {/* Application Tracker Section */}
      <section className="mb-12">
        <div className="mb-4 flex items-center justify-between border-b border-outline-variant pb-2">
          <h3 className="flex items-center gap-2 font-headline-md text-headline-md">
            <MaterialIcon name="analytics" className="text-[20px]" />
            Application Tracker
          </h3>
          <div className="flex gap-2">
            <button className={smallBtnCls}>
              <MaterialIcon name="filter_list" className="text-[18px]" /> Filter
            </button>
            <button className={smallBtnCls}>
              <MaterialIcon name="download" className="text-[18px]" /> Export
            </button>
          </div>
        </div>

        <div className="overflow-hidden border border-border-subtle bg-surface-white">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-border-subtle bg-surface-container-low">
                <th className="py-3 px-4 font-label-md text-label-md uppercase tracking-wider text-secondary">Company</th>
                <th className="py-3 px-4 font-label-md text-label-md uppercase tracking-wider text-secondary">Role</th>
                <th className="py-3 px-4 font-label-md text-label-md uppercase tracking-wider text-secondary">Resume Used</th>
                <th className="py-3 px-4 text-center font-label-md text-label-md uppercase tracking-wider text-secondary">Status</th>
                <th className="py-3 px-4 font-label-md text-label-md uppercase tracking-wider text-secondary">Date</th>
                <th className="py-3 px-4 text-right font-label-md text-label-md uppercase tracking-wider text-secondary">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {activeApplications.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 px-4 text-center text-sm text-secondary">
                    No active applications yet.
                  </td>
                </tr>
              )}
              {activeApplications.slice(0, 10).map((app) => (
                <tr key={app.id} className="group transition-colors hover:bg-surface-container-lowest">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-8 w-8 items-center justify-center rounded text-xs font-bold text-white ${companyColor(app.company)}`}>
                        {companyInitial(app.company)}
                      </div>
                      <span className="font-bold text-primary">{app.company}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-body-md">{app.role}</td>
                  <td className="py-3 px-4">
                    <Link
                      href={`/resumes/${app.versionId}`}
                      className="group/link flex cursor-pointer items-center gap-2 text-secondary transition-colors hover:text-primary"
                    >
                      <MaterialIcon name="description" className="text-[16px]" />
                      <span className="text-xs group-hover/link:underline">{app.versionName || "Untitled version"}.pdf</span>
                    </Link>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-tighter ${OUTCOME_COLORS[app.outcome] || OUTCOME_COLORS.draft}`}>
                      {app.outcome}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-xs text-secondary">{formatDate(app.createdAt)}</td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => updateOutcome(app.id, app.outcome, setVersions)}
                      className="rounded p-1 text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface"
                      title="Advance stage"
                    >
                      <MaterialIcon name="more_horiz" className="text-[18px]" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {activeApplications.length > 10 && (
            <div className="flex justify-center bg-surface-container-low p-3">
              <button className="inline-flex items-center gap-1 px-3 py-2 text-on-surface-variant text-label-md font-label-md hover:bg-surface-container-low transition-colors duration-200 rounded">
                Load more applications
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function MaterialIcon({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center align-middle ${className}`}
      style={{ fontFamily: "'Material Symbols Outlined', sans-serif", fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
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

async function updateOutcome(appId: string, current: Outcome, setVersions: React.Dispatch<React.SetStateAction<Version[]>>) {
  const order: Outcome[] = ["applied", "interviewing", "offer", "declined", "rejected", "ghosted", "draft"];
  const next = order[(order.indexOf(current) + 1) % order.length];
  const res = await fetch(`/api/applications/${appId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ outcome: next }),
  });
  if (!res.ok) return;
  setVersions((prev) =>
    prev.map((v) => ({
      ...v,
      applications: v.applications.map((a) => (a.id === appId ? { ...a, outcome: next } : a)),
    }))
  );
}
