"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { PdfPreviewPane } from "@/components/PdfPreviewPane";
import type { Application, Outcome } from "@/lib/applications";

type Version = {
  id: string;
  name: string | null;
  tailoredContent: unknown;
  createdAt: string;
  pdfBase64: string | null;
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

// Toggle buttons shown for the outcome quick-control (excludes "draft").
const TOGGLE_OUTCOMES: Outcome[] = [
  "applied",
  "interviewing",
  "offer",
  "rejected",
  "ghosted",
  "declined",
];

const smallBtnCls =
  "inline-flex items-center gap-1 px-3 py-2 text-on-surface-variant text-label-md font-label-md hover:bg-surface-container-low transition-colors duration-200 rounded";
const modeActiveBtnCls =
  "bg-surface-container-high text-on-surface text-label-md font-label-md px-3 py-2 rounded font-semibold";

function base64ToUint8(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function normalizeUrl(value: string): string {
  const v = value.trim();
  if (!v) return "";
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

export default function ApplicationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const appId = params.id as string;

  const [app, setApp] = useState<Application | null>(null);
  const [version, setVersion] = useState<Version | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewWidth, setPreviewWidth] = useState(50);
  const [resizing, setResizing] = useState(false);

  // Portal URL editor state.
  const [editingPortal, setEditingPortal] = useState(false);
  const [portalDraft, setPortalDraft] = useState("");
  const [savingPortal, setSavingPortal] = useState(false);

  // Notes editor state.
  const [notesDraft, setNotesDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesDirty, setNotesDirty] = useState(false);

  // Job description expansion.
  const [jdExpanded, setJdExpanded] = useState(false);

  const [outcomeBusy, setOutcomeBusy] = useState(false);
  const [roundBusy, setRoundBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function deleteApplication() {
    if (!app) return;
    if (
      !window.confirm(
        `Delete the application to "${app.company}"? This cannot be undone.`,
      )
    )
      return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/applications/${appId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("delete failed");
      router.push("/applications");
      router.refresh();
    } catch {
      setDeleting(false);
      // Leave the page intact; the user can retry.
    }
  }

  useEffect(() => {
    if (!appId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/applications/${appId}`);
        if (!res.ok) {
          if (res.status === 404) setError("Application not found.");
          else setError("Failed to load application.");
          return;
        }
        const data: Application = await res.json();
        if (cancelled) return;
        setApp(data);
        setPortalDraft(data.portalUrl ?? "");
        setNotesDraft(data.notes ?? "");
        // Fetch the associated resume version for the PDF preview (if linked).
        if (data.versionId) {
          const vres = await fetch(`/api/versions/${data.versionId}`);
          if (vres.ok) {
            const vdata: Version = await vres.json();
            if (!cancelled) setVersion(vdata);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [appId]);

  async function patch(body: Record<string, unknown>): Promise<Application | null> {
    const res = await fetch(`/api/applications/${appId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("update failed");
    const data: Application = await res.json();
    setApp(data);
    return data;
  }

  async function updateOutcome(outcome: Outcome) {
    if (!app || app.outcome === outcome) return;
    // Optimistic local update.
    setApp({ ...app, outcome });
    setOutcomeBusy(true);
    try {
      const updated = await patch({ outcome });
      if (updated) {
        setPortalDraft(updated.portalUrl ?? "");
        setNotesDraft(updated.notes ?? "");
      }
    } catch {
      // Revert by reloading.
      const res = await fetch(`/api/applications/${appId}`);
      if (res.ok) setApp(await res.json());
    } finally {
      setOutcomeBusy(false);
    }
  }

  async function updateRound(round: number) {
    if (!app) return;
    const next = Math.max(1, round);
    setApp({ ...app, interviewRound: next });
    setRoundBusy(true);
    try {
      await patch({ interviewRound: next });
    } catch {
      const res = await fetch(`/api/applications/${appId}`);
      if (res.ok) setApp(await res.json());
    } finally {
      setRoundBusy(false);
    }
  }

  async function savePortalUrl() {
    if (!app) return;
    const value = normalizeUrl(portalDraft);
    setSavingPortal(true);
    try {
      const updated = await patch({ portalUrl: value });
      if (updated) setPortalDraft(updated.portalUrl ?? "");
      setEditingPortal(false);
    } catch {
      // keep editor open on failure
    } finally {
      setSavingPortal(false);
    }
  }

  async function saveNotes() {
    if (!app || !notesDirty) return;
    setSavingNotes(true);
    try {
      const updated = await patch({ notes: notesDraft });
      if (updated) {
        setNotesDraft(updated.notes ?? "");
        setNotesDirty(false);
      }
    } catch {
      // leave dirty state on failure
    } finally {
      setSavingNotes(false);
    }
  }

  // Preview resizing via mouse drag on the resizer bar.
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
      setPreviewWidth(Math.max(25, Math.min(70, state.startValue + pctDelta)));
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
        Loading application...
      </div>
    );
  }

  if (error || !app) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-on-surface-variant">
        <p>{error || "Application not found."}</p>
        <Link href="/applications" className="rounded-lg bg-primary px-4 py-2 text-label-md font-label-md text-on-primary">
          Back to Applications
        </Link>
      </div>
    );
  }

  const pdfBytes = version?.pdfBase64 ? base64ToUint8(version.pdfBase64) : null;
  const versionName = version?.name || "Untitled version";

  const portalUrl = app.portalUrl ?? "";
  const jd = app.jobDescription ?? "";

  return (
    <div className="flex h-screen flex-col font-body-md text-body-md text-on-surface bg-background">
      {/* Full-screen overlay during resize so iframes/panels don't steal mouse events. */}
      {resizing && <div className="fixed inset-0 z-[60] cursor-col-resize" />}

      <div className="flex flex-1 overflow-hidden">
        {/* Left: application details */}
        <aside className="flex flex-1 flex-col overflow-hidden bg-surface-container-lowest">
          {/* Sticky header */}
          <div className="h-12 shrink-0 border-b border-outline-variant bg-surface-container-lowest px-md sticky top-0 z-10 flex items-center gap-1">
            <Link
              href="/applications"
              title="Back to Applications"
              className="inline-flex items-center gap-1 rounded px-3 py-2 text-on-surface-variant text-label-md font-label-md hover:bg-surface-container-low hover:text-on-surface transition-colors duration-200"
            >
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            </Link>
            <span className="font-label-md text-label-md text-on-surface-variant truncate">
              Application
            </span>
            <button
              onClick={deleteApplication}
              disabled={deleting}
              title={deleting ? "Deleting..." : "Delete application"}
              className="ml-auto inline-flex items-center gap-1 rounded px-3 py-2 text-on-surface-variant text-label-md font-label-md hover:bg-surface-container-low hover:text-red-600 transition-colors duration-200 disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[18px]">delete</span>
            </button>
          </div>

          {/* Scrollable details */}
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-md space-y-md">
            {/* Header card */}
            <div>
              <h1 className="font-headline-lg text-headline-lg text-primary">{app.company}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-sm">
                <span className="text-body-md text-on-surface-variant">{app.role}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-tighter ${OUTCOME_COLORS[app.outcome] || OUTCOME_COLORS.draft}`}>
                  {app.outcome}
                </span>
              </div>
              <p className="mt-xs text-label-sm text-on-surface-variant">
                Applied {formatDate(app.createdAt)}
              </p>
            </div>

            {/* Outcome quick-toggle */}
            <div className="rounded-lg border border-outline-variant bg-surface-white p-md">
              <h3 className="mb-sm font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
                Outcome
              </h3>
              <div className="flex flex-wrap items-center gap-1">
                {TOGGLE_OUTCOMES.map((o) => (
                  <button
                    key={o}
                    onClick={() => updateOutcome(o)}
                    disabled={outcomeBusy}
                    className={app.outcome === o ? modeActiveBtnCls : smallBtnCls}
                  >
                    {o}
                  </button>
                ))}
              </div>

              {/* Interview round info */}
              {app.outcome === "interviewing" && (
                <div className="mt-sm flex items-center gap-sm border-t border-outline-variant pt-sm">
                  <span className="text-label-md text-label-md text-on-surface">Round</span>
                  <button
                    onClick={() => updateRound((app.interviewRound ?? 1) - 1)}
                    disabled={roundBusy || (app.interviewRound ?? 1) <= 1}
                    className="inline-flex h-7 w-7 items-center justify-center rounded text-on-surface-variant hover:bg-surface-container-low disabled:opacity-30"
                    aria-label="Decrease interview round"
                  >
                    <span className="material-symbols-outlined text-[18px]">remove</span>
                  </button>
                  <span className="min-w-[2rem] text-center font-headline-md text-headline-md text-primary">
                    {app.interviewRound ?? 1}
                  </span>
                  <button
                    onClick={() => updateRound((app.interviewRound ?? 1) + 1)}
                    disabled={roundBusy}
                    className="inline-flex h-7 w-7 items-center justify-center rounded text-on-surface-variant hover:bg-surface-container-low disabled:opacity-30"
                    aria-label="Increase interview round"
                  >
                    <span className="material-symbols-outlined text-[18px]">add</span>
                  </button>
                </div>
              )}
              {app.outcome === "rejected" && app.rejectedAfterRound != null && (
                <div className="mt-sm border-t border-outline-variant pt-sm text-label-md text-label-md text-on-surface-variant">
                  Rejected after round {app.rejectedAfterRound}
                </div>
              )}
            </div>

            {/* Portal URL */}
            <div className="rounded-lg border border-outline-variant bg-surface-white p-md">
              <h3 className="mb-sm flex items-center gap-1 font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
                <span className="material-symbols-outlined text-[16px] text-primary">link</span>
                Application Portal
              </h3>
              {portalUrl && !editingPortal ? (
                <div className="flex items-center gap-sm">
                  <a
                    href={portalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 truncate text-body-md text-primary hover:underline"
                  >
                    {portalUrl}
                    <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                  </a>
                  <button
                    onClick={() => {
                      setPortalDraft(portalUrl);
                      setEditingPortal(true);
                    }}
                    className="ml-auto inline-flex items-center gap-1 rounded px-2 py-1 text-label-md text-on-surface-variant hover:bg-surface-container-low"
                  >
                    <span className="material-symbols-outlined text-[16px]">edit</span>
                    Edit
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-sm">
                  <input
                    type="url"
                    value={portalDraft}
                    onChange={(e) => setPortalDraft(e.target.value)}
                    placeholder="https://careers.company.com/jobs/123"
                    autoFocus={editingPortal}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") savePortalUrl();
                      if (e.key === "Escape") {
                        setPortalDraft(portalUrl);
                        setEditingPortal(false);
                      }
                    }}
                    className="min-w-0 flex-1 rounded-lg border border-outline-variant bg-surface px-3 py-2 text-body-md outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                  <button
                    onClick={savePortalUrl}
                    disabled={savingPortal}
                    className="rounded-lg bg-primary px-4 py-2 text-label-md font-label-md text-on-primary hover:opacity-90 disabled:opacity-50"
                  >
                    {savingPortal ? "Saving..." : "Save"}
                  </button>
                  {editingPortal && (
                    <button
                      onClick={() => {
                        setPortalDraft(portalUrl);
                        setEditingPortal(false);
                      }}
                      className="rounded-lg px-3 py-2 text-label-md text-on-surface-variant hover:bg-surface-container-low"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="rounded-lg border border-outline-variant bg-surface-white p-md">
              <div className="mb-sm flex items-center justify-between">
                <h3 className="flex items-center gap-1 font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
                  <span className="material-symbols-outlined text-[16px] text-primary">notes</span>
                  Notes
                </h3>
                <div className="flex items-center gap-sm">
                  {notesDirty && (
                    <span className="text-label-sm text-on-surface-variant">Unsaved changes</span>
                  )}
                  <button
                    onClick={saveNotes}
                    disabled={!notesDirty || savingNotes}
                    className="rounded-lg bg-primary px-3 py-1.5 text-label-sm font-label-sm text-on-primary hover:opacity-90 disabled:opacity-50"
                  >
                    {savingNotes ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
              <textarea
                value={notesDraft}
                onChange={(e) => {
                  setNotesDraft(e.target.value);
                  setNotesDirty(e.target.value !== (app.notes ?? ""));
                }}
                onBlur={saveNotes}
                placeholder="Interview prep, contact info, follow-up reminders..."
                className="min-h-[8rem] w-full resize-y rounded-lg border border-outline-variant bg-surface p-3 text-body-md outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Job description */}
            {jd && (
              <div className="rounded-lg border border-outline-variant bg-surface-white p-md">
                <button
                  onClick={() => setJdExpanded((s) => !s)}
                  className="flex w-full items-center justify-between text-left"
                >
                  <h3 className="font-label-md text-label-md text-on-surface">
                    Job Description
                  </h3>
                  <span className="material-symbols-outlined text-[18px] text-on-surface-variant transition-transform duration-200" style={{ transform: jdExpanded ? "rotate(180deg)" : "none" }}>
                    expand_more
                  </span>
                </button>
                {jdExpanded ? (
                  <div className="mt-sm whitespace-pre-wrap border-t border-outline-variant pt-sm text-body-md text-on-surface">
                    {jd}
                  </div>
                ) : (
                  <p className="mt-xs line-clamp-2 text-body-sm text-on-surface-variant">{jd}</p>
                )}
              </div>
            )}

            {/* Link to the resume version */}
            <div>
              <Link
                href={`/resumes/${app.versionId}`}
                className="inline-flex items-center gap-1 text-label-md text-on-surface-variant hover:text-primary hover:underline"
              >
                <span className="material-symbols-outlined text-[16px]">description</span>
                {versionName}
              </Link>
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

        {/* Right: resume PDF preview (or placeholder if no version linked) */}
        {pdfBytes ? (
          <PdfPreviewPane
            src={pdfBytes}
            ready={!!pdfBytes}
            width={previewWidth}
            headerExtra={
              <span className="truncate text-label-md font-label-md text-inverse-on-surface font-semibold">
                {versionName}.pdf
              </span>
            }
          />
        ) : (
          <div className="flex flex-1 items-center justify-center bg-inverse-surface text-inverse-on-surface">
            <div className="text-center">
              <span className="material-symbols-outlined text-[48px] opacity-40">description</span>
              <p className="mt-2 text-body-sm opacity-60">No resume linked to this application</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}