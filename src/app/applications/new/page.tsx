"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { OUTCOMES, type Outcome } from "@/lib/applications";

type Version = {
  id: string;
  name: string | null;
  createdAt: string;
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

const smallBtnCls =
  "inline-flex items-center gap-1 px-3 py-2 text-on-surface-variant text-label-md font-label-md hover:bg-surface-container-low transition-colors duration-200 rounded";
const modeActiveBtnCls =
  "bg-surface-container-high text-on-surface text-label-md font-label-md px-3 py-2 rounded font-semibold";

// Outcomes shown as toggle buttons (includes "draft" as the default).
const TOGGLE_OUTCOMES: Outcome[] = [...OUTCOMES];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function versionLabel(v: Version) {
  return v.name || `Untitled — ${formatDate(v.createdAt)}`;
}

export default function NewApplicationPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-3xl">
          <p className="text-on-surface-variant">Loading...</p>
        </div>
      }
    >
      <NewApplicationForm />
    </Suspense>
  );
}

function NewApplicationForm() {
  const router = useRouter();
  const search = useSearchParams();
  const presetVersionId = search.get("version");

  const [versions, setVersions] = useState<Version[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(true);
  const [versionId, setVersionId] = useState<string>("");

  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [outcome, setOutcome] = useState<Outcome>("draft");
  const [interviewRound, setInterviewRound] = useState<number>(1);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/versions")
      .then((r) => r.json())
      .then((data: Version[]) => {
        if (cancelled) return;
        // Only keep the fields we need (the API returns full version objects
        // including pdfBase64 + applications; trim to keep state light).
        const slim = data.map((v) => ({
          id: v.id,
          name: v.name,
          createdAt: v.createdAt,
        }));
        setVersions(slim);
        if (presetVersionId && slim.some((v) => v.id === presetVersionId)) {
          setVersionId(presetVersionId);
        } else if (presetVersionId) {
          // Preset version not found among this user's versions.
          setError("The selected resume version no longer exists.");
        }
        if (!presetVersionId && slim[0]) setVersionId(slim[0].id);
      })
      .finally(() => {
        if (!cancelled) setVersionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [presetVersionId]);

  const canSubmit = company.trim() && role.trim() && versionId;

  async function submit() {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/versions/${versionId}/applications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: company.trim(),
          role: role.trim(),
          jobDescription,
          outcome,
          interviewRound,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Failed to create application");
      }
      const created = await res.json();
      router.push(`/applications/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create application");
      setSaving(false);
    }
  }

  if (versionsLoading) {
    return (
      <div className="mx-auto max-w-3xl">
        <p className="text-on-surface-variant">Loading...</p>
      </div>
    );
  }

  // No resume versions at all — guide the user to create one first.
  if (versions.length === 0) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center gap-2">
          <Link
            href={presetVersionId ? `/resumes/${presetVersionId}` : "/applications"}
            className="inline-flex items-center gap-1 rounded px-3 py-2 text-on-surface-variant text-label-md font-label-md hover:bg-surface-container-low hover:text-on-surface transition-colors duration-200"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          </Link>
          <h1 className="font-headline-lg text-headline-lg text-primary">New application</h1>
        </div>
        <div className="rounded-lg border border-outline-variant bg-surface-white p-lg text-center">
          <p className="text-body-md text-on-surface">You need a resume version first.</p>
          <p className="mt-xs text-body-sm text-on-surface-variant">
            Create one in the Master Resume editor, then come back to track an application.
          </p>
          <Link
            href="/master"
            className="mt-md inline-block rounded-lg bg-primary px-4 py-2 text-label-md font-label-md text-on-primary hover:opacity-90"
          >
            Open Master Resume
          </Link>
        </div>
      </div>
    );
  }

  const versionLocked = !!presetVersionId;

  return (
    <div className="mx-auto max-w-3xl">
      {/* Header */}
      <div className="mb-6 flex items-center gap-2">
        <Link
          href={presetVersionId ? `/resumes/${presetVersionId}` : "/applications"}
          className="inline-flex items-center gap-1 rounded px-3 py-2 text-on-surface-variant text-label-md font-label-md hover:bg-surface-container-low hover:text-on-surface transition-colors duration-200"
          aria-label="Back"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
        </Link>
        <h1 className="font-headline-lg text-headline-lg text-primary">New application</h1>
      </div>

      <div className="space-y-md">
        {/* Company */}
        <div>
          <label className="mb-xs block font-label-md text-label-md text-on-surface-variant">
            Company <span className="text-error">*</span>
          </label>
          <input
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Acme Corp"
            className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-body-md outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Role */}
        <div>
          <label className="mb-xs block font-label-md text-label-md text-on-surface-variant">
            Role <span className="text-error">*</span>
          </label>
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="Senior Engineer"
            className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-body-md outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Resume version */}
        {!versionLocked && (
          <div>
            <label className="mb-xs block font-label-md text-label-md text-on-surface-variant">
              Resume version <span className="text-error">*</span>
            </label>
            <select
              value={versionId}
              onChange={(e) => setVersionId(e.target.value)}
              className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-body-md outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            >
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {versionLabel(v)}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Outcome */}
        <div>
          <label className="mb-xs block font-label-md text-label-md text-on-surface-variant">
            Outcome
          </label>
          <div className="flex flex-wrap items-center gap-1">
            {TOGGLE_OUTCOMES.map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => setOutcome(o)}
                className={outcome === o ? modeActiveBtnCls : smallBtnCls}
              >
                {o}
              </button>
            ))}
          </div>
        </div>

        {/* Interview round (only when interviewing) */}
        {outcome === "interviewing" && (
          <div className="flex items-center gap-sm">
            <label className="font-label-md text-label-md text-on-surface-variant">
              Round
            </label>
            <button
              type="button"
              onClick={() => setInterviewRound((r) => Math.max(1, r - 1))}
              disabled={interviewRound <= 1}
              className="inline-flex h-7 w-7 items-center justify-center rounded text-on-surface-variant hover:bg-surface-container-low disabled:opacity-30"
              aria-label="Decrease interview round"
            >
              <span className="material-symbols-outlined text-[18px]">remove</span>
            </button>
            <span className="min-w-[2rem] text-center font-headline-md text-headline-md text-primary">
              {interviewRound}
            </span>
            <button
              type="button"
              onClick={() => setInterviewRound((r) => r + 1)}
              className="inline-flex h-7 w-7 items-center justify-center rounded text-on-surface-variant hover:bg-surface-container-low"
              aria-label="Increase interview round"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
            </button>
          </div>
        )}

        {/* Job description */}
        <div>
          <label className="mb-xs block font-label-md text-label-md text-on-surface-variant">
            Job description
          </label>
          <textarea
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            placeholder="Paste the job description this resume was tailored for..."
            className="min-h-[10rem] w-full resize-y rounded-lg border border-outline-variant bg-surface p-3 text-body-md outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Error */}
        {error && (
          <p className="rounded-lg bg-error/10 px-3 py-2 text-body-sm text-error">{error}</p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-sm pt-xs">
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit || saving}
            className="rounded-lg bg-primary px-4 py-2 text-label-md font-label-md text-on-primary hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Creating..." : "Create application"}
          </button>
          <Link
            href={presetVersionId ? `/resumes/${presetVersionId}` : "/applications"}
            className="rounded-lg px-4 py-2 text-label-md text-on-surface-variant hover:bg-surface-container-low"
          >
            Cancel
          </Link>
        </div>
      </div>
    </div>
  );
}