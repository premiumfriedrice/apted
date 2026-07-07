"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Outcome = "draft" | "applied" | "ghosted" | "interviewing" | "rejected" | "offer" | "declined";

type Application = {
  id: string;
  versionId: string;
  company: string;
  role: string;
  outcome: Outcome;
  interviewRound: number | null;
  rejectedAfterRound: number | null;
  createdAt: string;
};

type Version = {
  id: string;
  name: string | null;
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
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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

export default function ApplicationsPage() {
  const [versions, setVersions] = useState<Version[]>([]);
  const [filter, setFilter] = useState<Outcome | "all">("all");

  useEffect(() => {
    fetch("/api/versions")
      .then((r) => r.json())
      .then((data: Version[]) => setVersions(data));
  }, []);

  const applications = useMemo(() => {
    return versions
      .flatMap((v) => v.applications.map((a) => ({ ...a, versionName: v.name })))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [versions]);

  const filtered = useMemo(() => {
    if (filter === "all") return applications;
    return applications.filter((a) => a.outcome === filter);
  }, [applications, filter]);

  const STATUSES: (Outcome | "all")[] = ["all", "applied", "interviewing", "offer", "rejected", "ghosted", "declined"];

// Button language shared with the master resume editor (PRE-82 design system).
const smallBtnCls =
  "inline-flex items-center gap-1 px-3 py-2 text-on-surface-variant text-label-md font-label-md hover:bg-surface-container-low transition-colors duration-200 rounded";
const modeActiveBtnCls =
  "bg-surface-container-high text-on-surface text-label-md font-label-md px-3 py-2 rounded font-semibold";

  return (
    <div className="mx-auto max-w-[1440px]">
      <div className="mb-10">
        <h2 className="font-headline-xl text-headline-xl text-primary">Applications</h2>
        <p className="mt-1 text-secondary">Track every job application across all your resume versions.</p>
      </div>

      <div className="mb-6 flex items-center gap-1">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={filter === s ? modeActiveBtnCls : smallBtnCls}
          >
            {s === "all" ? "All" : s}
          </button>
        ))}
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
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 px-4 text-center text-sm text-secondary">
                  No applications found.
                </td>
              </tr>
            )}
            {filtered.map((app) => (
              <tr key={app.id} className="transition-colors hover:bg-surface-container-lowest">
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
                    href={`/builder?version=${app.versionId}`}
                    className="text-secondary transition-colors hover:text-primary hover:underline"
                  >
                    {app.versionName || "Untitled version"}.pdf
                  </Link>
                </td>
                <td className="py-3 px-4 text-center">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-tighter ${OUTCOME_COLORS[app.outcome]}`}>
                    {app.outcome}
                  </span>
                </td>
                <td className="py-3 px-4 text-xs text-secondary">{formatDate(app.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}