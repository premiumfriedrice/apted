"use client";

// Tailor a resume to a job description. Paste a JD, get a first-pass draft
// from the tailor service, then refine it with natural-language instructions.
// A live PDF preview (canvas, not an iframe) updates as the draft changes.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Draft, Resume, Section } from "@/lib/resume";
import { OUTCOMES, type Outcome } from "@/lib/applications";
import { PdfPreviewPane } from "@/components/PdfPreviewPane";

type ChatTurn = { role: "user" | "system"; text: string };

// Shared button language (matches the master resume editor, PRE-82 design system).
const smallBtnCls =
  "inline-flex items-center gap-1 px-3 py-2 text-on-surface-variant text-label-md font-label-md hover:bg-surface-container-low transition-colors duration-200 rounded disabled:opacity-40";
const primaryBtnCls =
  "inline-flex items-center justify-center gap-2 bg-primary text-on-primary text-label-md font-label-md px-4 py-2 rounded-lg hover:bg-on-primary-fixed-variant transition-colors duration-200 disabled:opacity-40";
const inputCls =
  "w-full border border-outline-variant rounded px-3 py-2 text-body-md bg-surface-container-lowest focus:border-primary focus:ring-1 focus:ring-primary outline-none";

export default function BuilderPage() {
  const [jd, setJd] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [master, setMaster] = useState<Resume | null>(null);
  const [chat, setChat] = useState<ChatTurn[]>([]);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewWidth, setPreviewWidth] = useState(55);
  const [resizing, setResizing] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);

  // Fetch the master once so we know the full set of available sections for
  // the include/exclude checkbox panel. The draft's section list is a subset.
  useEffect(() => {
    fetch("/api/master")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { content?: Resume } | null) => {
        if (d?.content) setMaster(d.content);
      })
      .catch(() => {});
  }, []);

  const draftSectionIds = useMemo(() => {
    if (!draft) return new Set<string>();
    return new Set(draft.content.sections.map((s) => s.id));
  }, [draft]);

  const toggleSection = useCallback(
    async (sectionId: string) => {
      if (!draft || !master) return;
      const inDraft = draftSectionIds.has(sectionId);
      // Build the next sections list in master order. Sections already in the
      // draft keep their tailored items; newly added sections come fresh from
      // the master so they show real content immediately.
      const draftById = new Map(draft.content.sections.map((s) => [s.id, s]));
      let nextSections: Section[];
      if (inDraft) {
        nextSections = draft.content.sections.filter((s) => s.id !== sectionId);
      } else {
        const masterSec = master.sections.find((s) => s.id === sectionId);
        if (!masterSec) return;
        const ordered: Section[] = [];
        for (const m of master.sections) {
          if (m.id === sectionId) ordered.push(masterSec);
          else if (draftById.has(m.id)) ordered.push(draftById.get(m.id) as Section);
        }
        for (const s of draft.content.sections) {
          if (!ordered.some((o) => o.id === s.id)) ordered.push(s);
        }
        nextSections = ordered;
      }
      const nextContent: Resume = { ...draft.content, sections: nextSections };
      setBusy(true); setError(null);
      try {
        const res = await fetch(`/api/drafts/${draft.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ op: "replace", content: nextContent }),
        });
        if (!res.ok) throw new Error(await res.text());
        const d = (await res.json()) as Draft;
        setDraft(d);
      } catch (e) {
        setError(e instanceof Error ? e.message : "toggle failed");
      } finally { setBusy(false); }
    },
    [draft, master, draftSectionIds],
  );

  // PdfPreviewPane reloads whenever `src` changes. Bump a cache-busting query
  // param on every draft update so the canvas re-fetches the compiled PDF.
  const pdfSrc = useMemo(
    () => (draft ? `/api/drafts/${draft.id}/pdf?v=${new Date(draft.updatedAt).getTime()}` : null),
    [draft],
  );

  const startTailor = useCallback(async () => {
    if (!jd.trim()) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/tailor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobDescription: jd }),
      });
      if (!res.ok) throw new Error(await res.text());
      const d = (await res.json()) as Draft;
      setDraft(d);
      setChat([{ role: "system", text: "First-pass draft ready. Refine it below." }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "tailor failed");
    } finally { setBusy(false); }
  }, [jd]);

  const sendEdit = useCallback(async () => {
    if (!draft || !instruction.trim()) return;
    const text = instruction.trim();
    setInstruction("");
    setChat((c) => [...c, { role: "user", text }]);
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/edit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ draftId: draft.id, instruction: text }),
      });
      if (!res.ok) throw new Error(await res.text());
      const d = (await res.json()) as Draft;
      setDraft(d);
      setChat((c) => [...c, { role: "system", text: "Updated." }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "edit failed");
    } finally { setBusy(false); }
  }, [draft, instruction]);

  const undo = useCallback(async () => {
    if (!draft || draft.history.length === 0) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/drafts/${draft.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ op: "undo" }),
      });
      if (!res.ok) throw new Error(await res.text());
      const d = (await res.json()) as Draft;
      setDraft(d);
      setChat((c) => [...c, { role: "system", text: "Reverted last change." }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "undo failed");
    } finally { setBusy(false); }
  }, [draft]);

  const saveAsVersion = useCallback(async (company: string, role: string, outcome: Outcome) => {
    if (!draft) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/versions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tailoredContent: draft.content,
          application: {
            company,
            role,
            jobDescription: draft.jobDescription,
            outcome,
          },
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setChat((c) => [...c, { role: "system", text: `Saved as version (${company} / ${role}).` }]);
      setSaveOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "save failed");
    } finally { setBusy(false); }
  }, [draft]);

  // Preview resizing via mouse drag on the resizer bar (matches master page).
  const resizeState = useRef<{ startX: number; startValue: number; mainWidth: number } | null>(null);
  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    resizeState.current = { startX: e.clientX, startValue: previewWidth, mainWidth: Math.max(1, window.innerWidth - 1) };
    setResizing(true);
    function onMove(ev: MouseEvent) {
      const s = resizeState.current;
      if (!s) return;
      const delta = ev.clientX - s.startX;
      // Resizer is the preview's left edge, so dragging left widens it.
      const pctDelta = -(delta / s.mainWidth) * 100;
      setPreviewWidth(Math.max(25, Math.min(75, s.startValue + pctDelta)));
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

  return (
    <div className="h-full flex flex-col font-body-md text-body-md text-on-surface bg-background">
      {resizing && <div className="fixed inset-0 z-[60] cursor-col-resize" />}
      <div className="flex-1 flex overflow-hidden">
        {!draft ? (
          <NewTailorView
            jd={jd}
            setJd={setJd}
            busy={busy}
            error={error}
            onStart={startTailor}
          />
        ) : (
          <>
            {/* Left: refine panel */}
            <div className="flex flex-col overflow-hidden bg-surface-container-lowest" style={{ width: `${100 - previewWidth}%` }}>
              <div className="h-12 border-b border-outline-variant flex items-center justify-between px-md shrink-0 sticky top-0 z-10">
                <h2 className="font-headline-md text-headline-md text-on-surface">Refine</h2>
                <div className="flex items-center gap-1">
                  <button onClick={undo} disabled={busy || draft.history.length === 0} className={smallBtnCls} title="Revert last change">
                    <MaterialIcon name="undo" className="text-[18px]" />
                    Undo
                    {draft.history.length > 0 && (
                      <span className="ml-1 rounded-full bg-surface-container-high px-1.5 text-[10px] font-semibold text-on-surface-variant">{draft.history.length}</span>
                    )}
                  </button>
                  <a
                    href={`/api/drafts/${draft.id}/tex`}
                    className={smallBtnCls}
                    title="Download LaTeX source"
                  >
                    <MaterialIcon name="download" className="text-[18px]" />
                    .tex
                  </a>
                  <button onClick={() => setSaveOpen(true)} disabled={busy} className={primaryBtnCls}>
                    <MaterialIcon name="save" className="text-[18px]" />
                    Save as version
                  </button>
                </div>
              </div>

              {master && (
                <div className="border-b border-outline-variant px-md py-sm">
                  <div className="mb-2 font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
                    Sections included
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {master.sections.map((s) => {
                      const checked = draftSectionIds.has(s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          disabled={busy}
                          onClick={() => toggleSection(s.id)}
                          className={`flex items-center gap-2 rounded-md border px-2 py-1 text-label-md transition-colors ${
                            checked
                              ? "border-outline-variant bg-surface-container-lowest text-on-surface"
                              : "border-border-subtle bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high"
                          } disabled:opacity-50`}
                        >
                          <MaterialIcon
                            name={checked ? "check_box" : "check_box_outline_blank"}
                            className="text-[16px] text-on-surface-variant"
                          />
                          <span>{s.title}</span>
                          <span className="text-[10px] uppercase tracking-wider text-on-surface-variant/70">{s.kind}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Chat history */}
              <div className="flex-1 space-y-3 overflow-auto px-md py-md text-body-md">
                {chat.map((t, i) => (
                  <div
                    key={i}
                    className={`flex gap-2 ${t.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {t.role === "system" && (
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-container-high text-[14px] text-on-surface-variant">
                        <MaterialIcon name="auto_awesome" className="text-[14px]" />
                      </span>
                    )}
                    <span
                      className={`max-w-[80%] rounded-lg px-3 py-2 ${
                        t.role === "user"
                          ? "bg-primary text-on-primary"
                          : "bg-surface-container-low text-on-surface"
                      }`}
                    >
                      {t.text}
                    </span>
                  </div>
                ))}
                {busy && (
                  <div className="flex items-center gap-2 text-on-surface-variant">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-on-surface-variant" />
                    <span className="text-label-md">Working…</span>
                  </div>
                )}
                {error && (
                  <div className="rounded-lg border border-error/30 bg-error-container/50 px-3 py-2 text-body-sm text-error">
                    {error}
                  </div>
                )}
              </div>

              {/* Instruction composer */}
              <div className="border-t border-outline-variant p-md">
                <textarea
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendEdit();
                  }}
                  rows={3}
                  placeholder='e.g. "lead with the AI project", "cut the GPA", "strengthen bullet 3"'
                  className={`${inputCls} resize-none`}
                />
                <div className="mt-2 flex items-center justify-between">
                  <span className="font-label-md text-label-md text-on-surface-variant">
                    {busy ? "Working…" : "⌘/Ctrl + Enter to send"}
                  </span>
                  <button onClick={sendEdit} disabled={busy || !instruction.trim()} className={primaryBtnCls}>
                    <MaterialIcon name="send" className="text-[18px]" />
                    Send
                  </button>
                </div>
              </div>
            </div>

            {/* Resizer */}
            <div
              onMouseDown={(e) => startResize(e)}
              className="hidden lg:flex w-1 bg-surface border-l border-outline-variant hover:bg-surface-container-high cursor-col-resize shrink-0 items-center justify-center relative z-10 group select-none"
            >
              <div className="h-8 w-[2px] bg-outline-variant group-hover:bg-on-surface-variant rounded-full" />
            </div>

            {/* Right: live PDF preview */}
            <div className="hidden lg:flex">
              <PdfPreviewPane
                src={pdfSrc}
                ready={!!draft}
                width={100}
                headerExtra={
                  <span className="font-label-md text-label-md text-inverse-on-surface font-semibold">
                    Live preview
                  </span>
                }
              />
            </div>
          </>
        )}
      </div>

      {saveOpen && draft && (
        <SaveVersionModal
          onClose={() => setSaveOpen(false)}
          onSave={saveAsVersion}
          disabled={busy}
        />
      )}
    </div>
  );
}

// ── No-draft landing: paste a JD and start tailoring ─────────────────────

function NewTailorView({
  jd,
  setJd,
  busy,
  error,
  onStart,
}: {
  jd: string;
  setJd: (v: string) => void;
  busy: boolean;
  error: string | null;
  onStart: () => void;
}) {
  return (
    <div className="flex-1 overflow-auto bg-surface">
      <div className="mx-auto max-w-2xl px-lg py-xl">
        <div className="mb-md flex items-center gap-2 text-on-surface-variant">
          <MaterialIcon name="auto_awesome" className="text-[20px]" />
          <span className="font-label-md text-label-md uppercase tracking-wider">New tailored resume</span>
        </div>
        <h1 className="font-headline-xl text-headline-xl text-primary">Tailor to a job description</h1>
        <p className="mt-2 text-body-md text-on-surface-variant">
          Paste the job description below. We&apos;ll draft a tailored resume from your master, then you can
          refine it with plain-English instructions.
        </p>

        <div className="mt-lg">
          <label className="mb-1 block font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
            Job description
          </label>
          <textarea
            value={jd}
            onChange={(e) => setJd(e.target.value)}
            rows={14}
            className={`${inputCls} min-h-[18rem] resize-y font-mono text-body-sm`}
            placeholder="Paste a job description here..."
          />
        </div>

        {error && (
          <div className="mt-sm rounded-lg border border-error/30 bg-error-container/50 px-3 py-2 text-body-md text-error">
            {error}
          </div>
        )}

        <div className="mt-lg flex items-center gap-3">
          <button
            disabled={busy || !jd.trim()}
            onClick={onStart}
            className={primaryBtnCls}
          >
            <MaterialIcon name="bolt" className="text-[18px]" />
            {busy ? "Tailoring…" : "Tailor resume"}
          </button>
          <span className="text-label-md text-label-md text-on-surface-variant">
            Uses your master resume and prior versions for framing.
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Save-as-version modal ────────────────────────────────────────────────

function SaveVersionModal({
  onClose,
  onSave,
  disabled,
}: {
  onClose: () => void;
  onSave: (company: string, role: string, outcome: Outcome) => void;
  disabled: boolean;
}) {
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [outcome, setOutcome] = useState<Outcome>("draft");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!company.trim() || !role.trim()) return;
    onSave(company.trim(), role.trim(), outcome);
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-primary/30 p-md" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-md rounded-xl border border-outline-variant bg-surface-container-lowest p-lg shadow-xl"
      >
        <div className="mb-md flex items-center justify-between">
          <h2 className="font-headline-lg text-headline-lg text-on-surface">Save as version</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface">
            <MaterialIcon name="close" className="text-[20px]" />
          </button>
        </div>

        <div className="space-y-md">
          <label className="block">
            <span className="mb-1 block font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">Company</span>
            <input
              autoFocus
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              required
              className={inputCls}
              placeholder="Acme Corp"
            />
          </label>
          <label className="block">
            <span className="mb-1 block font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">Role</span>
            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              required
              className={inputCls}
              placeholder="Senior Engineer"
            />
          </label>
          <label className="block">
            <span className="mb-1 block font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">Outcome</span>
            <select
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as Outcome)}
              className={inputCls}
            >
              {OUTCOMES.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-lg flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className={smallBtnCls}>Cancel</button>
          <button type="submit" disabled={disabled} className={primaryBtnCls}>
            <MaterialIcon name="save" className="text-[18px]" />
            Save
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Material Symbols icon wrapper (matches AppShell/page convention) ─────

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