"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Draft, Resume, Section } from "@/lib/resume";

type ChatTurn = { role: "user" | "system"; text: string };

export default function BuilderPage() {
  const [jd, setJd] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [master, setMaster] = useState<Resume | null>(null);
  const [chat, setChat] = useState<ChatTurn[]>([]);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        // Insert in master's relative order.
        const ordered: Section[] = [];
        for (const m of master.sections) {
          if (m.id === sectionId) ordered.push(masterSec);
          else if (draftById.has(m.id)) ordered.push(draftById.get(m.id) as Section);
        }
        // Preserve any draft-only sections (shouldn't normally happen) at end.
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

  // Live preview is the PDF, served by /api/drafts/[id]/pdf. We debounce by
  // bumping a cache-busting key whenever updatedAt changes. The browser pulls
  // a fresh PDF; Tectonic does the heavy lifting in the compile service.
  const previewKey = useMemo(
    () => (draft ? `${draft.id}:${new Date(draft.updatedAt).getTime()}` : ""),
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

  const saveAsVersion = useCallback(async () => {
    if (!draft) return;
    const company = window.prompt("Company?");
    if (!company) return;
    const role = window.prompt("Role?") ?? "";
    const outcome = window.prompt("Outcome (draft/applied/interview/offer/rejected)?", "draft") ?? "draft";
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "save failed");
    } finally { setBusy(false); }
  }, [draft]);

  if (!draft) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-2xl font-semibold">New tailor</h1>
        <p className="mt-2 text-neutral-600">Paste the job description.</p>
        <textarea
          value={jd}
          onChange={(e) => setJd(e.target.value)}
          rows={14}
          className="mt-4 w-full rounded-md border border-neutral-300 bg-white p-3 font-mono text-sm shadow-sm focus:border-neutral-500 focus:outline-none"
          placeholder="Paste a job description..."
        />
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-4 flex items-center gap-3">
          <button
            disabled={busy || !jd.trim()}
            onClick={startTailor}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {busy ? "Tailoring..." : "Tailor"}
          </button>
          <span className="text-xs text-neutral-500">Uses your master resume + prior versions for framing.</span>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto grid h-[calc(100vh-57px)] max-w-[1500px] grid-cols-[420px_1fr] gap-0">
      {/* Chat panel */}
      <section className="flex h-full flex-col border-r border-neutral-200 bg-white">
        <div className="border-b border-neutral-200 px-4 py-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Refine</h2>
            <div className="flex items-center gap-2">
              <button onClick={undo} disabled={busy || draft.history.length === 0}
                className="rounded border border-neutral-300 px-2 py-1 text-xs disabled:opacity-40">
                Undo ({draft.history.length})
              </button>
              <a href={`/api/drafts/${draft.id}/tex`}
                 className="rounded border border-neutral-300 px-2 py-1 text-xs">Download .tex</a>
              <button onClick={saveAsVersion} disabled={busy}
                className="rounded bg-neutral-900 px-2 py-1 text-xs text-white disabled:opacity-40">
                Save as version
              </button>
            </div>
          </div>
        </div>

        {master && (
          <div className="border-b border-neutral-200 px-4 py-3">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
              Sections
            </div>
            <div className="flex flex-wrap gap-2">
              {master.sections.map((s) => {
                const checked = draftSectionIds.has(s.id);
                return (
                  <label
                    key={s.id}
                    className={`flex items-center gap-2 rounded-md border px-2 py-1 text-xs ${
                      checked
                        ? "border-neutral-300 bg-white"
                        : "border-neutral-200 bg-neutral-50 text-neutral-500"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={busy}
                      onChange={() => toggleSection(s.id)}
                      className="accent-neutral-900"
                    />
                    <span>{s.title}</span>
                    <span className="text-[10px] uppercase tracking-wide text-neutral-400">
                      {s.kind}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex-1 space-y-3 overflow-auto px-4 py-3 text-sm">
          {chat.map((t, i) => (
            <div key={i} className={t.role === "user" ? "text-neutral-900" : "text-neutral-500"}>
              <span className="mr-2 text-[10px] uppercase tracking-wide">{t.role}</span>
              {t.text}
            </div>
          ))}
          {error && <div className="text-red-600">{error}</div>}
        </div>

        <div className="border-t border-neutral-200 p-3">
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendEdit();
            }}
            rows={3}
            placeholder='e.g. "lead with the AI project", "cut the GPA", "strengthen bullet 3"'
            className="w-full resize-none rounded-md border border-neutral-300 p-2 text-sm focus:border-neutral-500 focus:outline-none"
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[11px] text-neutral-500">{busy ? "Working..." : "⌘/Ctrl + Enter to send"}</span>
            <button onClick={sendEdit} disabled={busy || !instruction.trim()}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-40">
              Send
            </button>
          </div>
        </div>
      </section>

      {/* Live PDF preview */}
      <section className="h-full bg-neutral-100">
        <iframe
          key={previewKey}
          src={`/api/drafts/${draft.id}/pdf?v=${encodeURIComponent(previewKey)}`}
          title="Resume preview"
          className="h-full w-full border-0"
        />
      </section>
    </main>
  );
}
