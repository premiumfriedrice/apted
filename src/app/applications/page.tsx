"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import FunnelChart from "@/components/FunnelChart";
import type { FunnelStats } from "@/components/types";

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
  const [search, setSearch] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

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
    let result = filter === "all" ? applications : applications.filter((a) => a.outcome === filter);
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter((a) => `${a.company} ${a.role} ${a.versionName || ""}`.toLowerCase().includes(q));
    }
    return result;
  }, [applications, filter, search]);

  // Global funnel stats across ALL applications (not filtered).
  const funnelStats: FunnelStats = useMemo(() => {
    let screening = 0;
    let technical = 0;
    let final = 0;
    let offers = 0;
    let screeningRejections = 0;
    let technicalRejections = 0;
    let finalRejections = 0;
    for (const a of applications) {
      if (a.outcome === "draft") continue;
      screening++;
      const rejR = a.rejectedAfterRound ?? 0;
      const intR = a.interviewRound ?? 0;
      if (a.outcome === "rejected") {
        if (rejR === 0) { screeningRejections++; continue; }
        technical++;
        if (rejR === 1) { technicalRejections++; continue; }
        final++;
        finalRejections++; continue;
      }
      if (a.outcome === "ghosted" || a.outcome === "applied") continue;
      technical++;
      if (intR >= 2 || a.outcome === "offer" || a.outcome === "declined") final++;
      if (a.outcome === "offer") offers++;
    }
    return {
      total: applications.length,
      screening,
      technical,
      final,
      offers,
      screeningRejections,
      technicalRejections,
      finalRejections,
    };
  }, [applications]);

  async function updateOutcome(appId: string, outcome: Outcome) {
    setUpdatingId(appId);
    // Optimistic: update local state immediately.
    setVersions((prev) =>
      prev.map((v) => ({
        ...v,
        applications: v.applications.map((a) =>
          a.id === appId ? { ...a, outcome } : a,
        ),
      })),
    );
    try {
      const res = await fetch(`/api/applications/${appId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome }),
      });
      if (!res.ok) throw new Error("update failed");
    } catch {
      // Revert on failure by reloading.
      fetch("/api/versions").then((r) => r.json()).then((data: Version[]) => setVersions(data));
    } finally {
      setUpdatingId(null);
    }
  }

  const STATUSES: (Outcome | "all")[] = ["all", "applied", "interviewing", "offer", "rejected", "ghosted", "declined"];

// Button language shared with the master resume editor (PRE-82 design system).
const smallBtnCls =
  "inline-flex items-center gap-1 px-3 py-2 text-on-surface-variant text-label-md font-label-md hover:bg-surface-container-low transition-colors duration-200 rounded";
const modeActiveBtnCls =
  "bg-surface-container-high text-on-surface text-label-md font-label-md px-3 py-2 rounded font-semibold";

  return (
    <div className="mx-auto max-w-[1440px]">
      <div className="mb-8 flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <div>
          <h2 className="font-headline-xl text-headline-xl text-primary">Applications</h2>
          <p className="mt-1 text-secondary">Track every job application across all your resume versions.</p>
        </div>
        <div className="relative w-full max-w-xs">
          <MaterialIcon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-on-surface-variant" />
          <input
            type="text"
            placeholder="Search applications..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest py-2 pl-10 pr-4 text-body-md outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {applications.length > 0 && (
        <div className="mb-6 rounded-lg border border-border-subtle bg-surface-white p-md">
          <FunnelChart stats={funnelStats} compact />
        </div>
      )}

      <div className="mb-4 flex items-center gap-1">
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
            <tr>
              <td colSpan={5} className="py-3 px-4">
                <Link
                  href="/applications/new"
                  className="flex items-center gap-3 rounded-lg border border-dashed border-outline-variant bg-surface-container-lowest px-4 py-3 text-on-surface-variant transition-colors hover:border-primary hover:text-primary"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded text-on-surface-variant">
                    <span className="material-symbols-outlined text-[20px]">add</span>
                  </span>
                  <span className="text-body-md font-semibold">New application</span>
                </Link>
              </td>
            </tr>
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
                  <Link href={`/applications/${app.id}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                    <div className={`flex h-8 w-8 items-center justify-center rounded text-xs font-bold text-white ${companyColor(app.company)}`}>
                      {companyInitial(app.company)}
                    </div>
                    <span className="font-bold text-primary">{app.company}</span>
                  </Link>
                </td>
                <td className="py-3 px-4 text-body-md">
                  <Link href={`/applications/${app.id}`} className="text-body-md text-on-surface hover:text-primary hover:underline">
                    {app.role}
                  </Link>
                </td>
                <td className="py-3 px-4">
                  <Link
                    href={`/builder?version=${app.versionId}`}
                    className="text-secondary transition-colors hover:text-primary hover:underline"
                  >
                    {app.versionName || "Untitled version"}.pdf
                  </Link>
                </td>
                <td className="py-3 px-4 text-center">
                  <select
                    value={app.outcome}
                    disabled={updatingId === app.id}
                    onChange={(e) => updateOutcome(app.id, e.target.value as Outcome)}
                    className={`cursor-pointer rounded-full border-0 px-2 py-0.5 text-[10px] font-bold uppercase tracking-tighter outline-none ring-1 ring-inset ring-transparent transition focus:ring-primary ${OUTCOME_COLORS[app.outcome]} ${updatingId === app.id ? "opacity-50" : ""}`}
                  >
                    {(["draft", "applied", "ghosted", "interviewing", "rejected", "offer", "declined"] as Outcome[]).map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
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