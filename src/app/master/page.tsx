"use client";

// Structured editor for the master resume. The master is the only source of
// truth for Claude, so this page is the most important data-entry surface in
// the app — dump every job, project, and side-gig here. The tailor step will
// curate per JD.

import { useEffect, useRef, useState } from "react";
import type {
  AchievementItem,
  Bullet,
  Contact,
  EducationItem,
  ExperienceItem,
  ProjectItem,
  Resume,
  Section,
  SkillGroup,
} from "@/lib/resume";
import { injectResume } from "@/lib/redact";
import type { RedactionMap } from "@/lib/redact";

type ProseKind = "experience" | "projects" | "education";

type ProseModalState = {
  sectionIdx: number;
  kind: ProseKind;
};

type ExpSection = Extract<Section, { kind: "experience" }>;
type ProjSection = Extract<Section, { kind: "projects" }>;
type EduSection = Extract<Section, { kind: "education" }>;
type SkillSection = Extract<Section, { kind: "skills" }>;
type AchieveSection = Extract<Section, { kind: "achievements" }>;

const mkId = (prefix: string): string =>
  `${prefix}-${Math.random().toString(36).slice(2, 8)}`;

const newBullet = (): Bullet => ({ id: mkId("b"), text: "" });
const newExp = (): ExperienceItem => ({
  id: mkId("exp"), title: "", org: "", location: "", start: "", end: "",
  bullets: [], notes: "", tags: [],
});
const newProj = (): ProjectItem => ({
  id: mkId("proj"), name: "", stack: "", start: "", end: "",
  bullets: [], notes: "", tags: [],
});
const newEdu = (): EducationItem => ({
  id: mkId("edu"), school: "", degree: "", location: "", start: "", end: "",
  bullets: [], tags: [],
});
const newSkill = (): SkillGroup => ({ id: mkId("skill"), category: "", items: "" });
const newAchievement = (): AchievementItem => ({ id: mkId("ach"), text: "" });

function moveInArray<T>(arr: T[], idx: number, delta: number): T[] {
  const j = idx + delta;
  if (j < 0 || j >= arr.length) return arr;
  const out = arr.slice();
  [out[idx], out[j]] = [out[j]!, out[idx]!];
  return out;
}

function reorderArray<T>(arr: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return arr;
  const out = arr.slice();
  const [moved] = out.splice(from, 1);
  out.splice(to, 0, moved);
  return out;
}

function useDragReorder(onReorder: (from: number, to: number) => void) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);
  return (idx: number) => ({
    draggable: true,
    onDragStart: () => setDragIdx(idx),
    onDragOver: () => setDropIdx(idx),
    onDrop: () => {
      if (dragIdx !== null && dropIdx !== null && dragIdx !== dropIdx) {
        onReorder(dragIdx, dropIdx);
      }
      setDragIdx(null);
      setDropIdx(null);
    },
    onDragEnd: () => {
      setDragIdx(null);
      setDropIdx(null);
    },
    isDragOver: dropIdx === idx && dragIdx !== idx,
  });
}

function useClickAway<T extends HTMLElement>(enabled: boolean, onClickAway: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!enabled) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClickAway();
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [enabled, onClickAway]);
  return ref;
}

// Material-style utility classes used across the redesigned editor.
const inputCls =
  "w-full border border-outline-variant rounded-lg px-3 py-2 text-body-md bg-surface-container-lowest focus:border-primary focus:ring-1 focus:ring-primary outline-none";
const ghostInputCls =
  "w-full bg-transparent border-b border-transparent hover:border-outline-variant focus:border-primary focus:ring-0 outline-none px-1 py-1";
const smallBtnCls =
  "px-3 py-2 text-on-surface-variant dark:text-surface-variant text-label-md font-label-md hover:bg-surface-container-low dark:hover:bg-surface-container-high transition-colors duration-200 rounded";
const primaryBtnCls =
  "bg-primary text-on-primary text-label-md font-label-md px-4 py-2 rounded-lg hover:bg-on-primary-fixed-variant transition-colors duration-200";
const dangerBtnCls =
  "text-on-surface-variant hover:text-error p-1 transition-colors";

export default function MasterPage() {
  const [resume, setResume] = useState<Resume | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<"structured" | "latex" | "json">("structured");
  const [jsonText, setJsonText] = useState("");
  const [customTex, setCustomTex] = useState<string | null>(null);
  const [compiledPdfUrl, setCompiledPdfUrl] = useState<string | null>(null);
  const compiledPdfUrlRef = useRef<string | null>(null);
  useEffect(() => {
    compiledPdfUrlRef.current = compiledPdfUrl;
  }, [compiledPdfUrl]);
  const [status, setStatus] = useState<{ kind: "ok" | "err" | null; msg: string }>({
    kind: null, msg: "",
  });
  const [saving, setSaving] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [proseModal, setProseModal] = useState<ProseModalState | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [piiMap, setPiiMap] = useState<RedactionMap | null>(null);
  // Per-field visibility toggles for PII masking (PRE-54).
  const [showField, setShowField] = useState<Record<string, boolean>>({});
  const [activeSection, setActiveSection] = useState<string>("contact");
  const [sidebarWidth, setSidebarWidth] = useState<number>(220);
  const [previewWidth, setPreviewWidth] = useState<number>(50);
  const [resizing, setResizing] = useState<"sidebar" | "preview" | null>(null);

  // Sidebar / preview resizing via mouse drag on the resizer bars.
  const resizeState = useRef<{
    kind: "sidebar" | "preview";
    startX: number;
    startValue: number;
    mainWidth: number;
  } | null>(null);

  function startResize(kind: "sidebar" | "preview", e: React.MouseEvent) {
    e.preventDefault();
    // Main content width = viewport minus sidebar and the two 1px resizer bars.
    const mainWidth = Math.max(1, window.innerWidth - sidebarWidth - 2);
    resizeState.current = {
      kind,
      startX: e.clientX,
      startValue: kind === "sidebar" ? sidebarWidth : previewWidth,
      mainWidth,
    };
    setResizing(kind);

    function onMove(ev: MouseEvent) {
      const state = resizeState.current;
      if (!state) return;
      const delta = ev.clientX - state.startX;
      if (state.kind === "sidebar") {
        setSidebarWidth(Math.max(0, Math.min(400, state.startValue + delta)));
      } else {
        // previewWidth is stored as a percentage of the main content area.
        // The resizer is the preview's left edge, so dragging left widens it.
        const pctDelta = -(delta / state.mainWidth) * 100;
        setPreviewWidth(Math.max(20, Math.min(75, state.startValue + pctDelta)));
      }
    }

    function onUp() {
      resizeState.current = null;
      setResizing(null);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  useEffect(() => {
    fetch("/api/master").then((r) => r.json()).then((d) => {
      const stored = d.content as Resume;
      const map = d.piiMap as RedactionMap | null;
      setPiiMap(map);
      setResume(map ? injectResume(stored, map) : stored);
      setUpdatedAt(d.updatedAt ?? null);
      setJsonText(JSON.stringify(map ? injectResume(stored, map) : stored, null, 2));
    });
  }, []);

  const updateContact = (patch: Partial<Contact>) =>
    setResume((r) => (r ? { ...r, contact: { ...r.contact, ...patch } } : r));

  const updateSection = (idx: number, updater: (s: Section) => Section) =>
    setResume((r) =>
      r ? { ...r, sections: r.sections.map((s, i) => (i === idx ? updater(s) : s)) } : r,
    );

  const moveSection = (idx: number, delta: number) =>
    setResume((r) =>
      r ? { ...r, sections: moveInArray(r.sections, idx, delta) } : r,
    );

  const addSection = (kind: Section["kind"]) =>
    setResume((r) => {
      if (!r) return r;
      const titleByKind: Record<Section["kind"], string> = {
        experience: "Experience",
        projects: "Projects",
        education: "Education",
        skills: "Technical Skills",
        achievements: "Achievements",
      };
      const id = `${kind}-${Math.random().toString(36).slice(2, 6)}`;
      const sec = { id, kind, title: titleByKind[kind], items: [] } as Section;
      return { ...r, sections: [...r.sections, sec] };
    });

  function appendItemsToSection(sectionIdx: number, items: ExperienceItem[] | ProjectItem[] | EducationItem[]) {
    setResume((r) => {
      if (!r) return r;
      const sections = r.sections.map((s, i) => {
        if (i !== sectionIdx) return s;
        if (s.kind === "experience") return { ...s, items: [...s.items, ...(items as ExperienceItem[])] };
        if (s.kind === "projects") return { ...s, items: [...s.items, ...(items as ProjectItem[])] };
        if (s.kind === "education") return { ...s, items: [...s.items, ...(items as EducationItem[])] };
        return s;
      });
      return { ...r, sections };
    });
    setStatus({ kind: "ok", msg: `Added ${items.length} item${items.length === 1 ? "" : "s"} from prose — review and Save.` });
  }

  function applyImportedResume(next: Resume) {
    setResume(next);
    setJsonText(JSON.stringify(next, null, 2));
    setStatus({ kind: "ok", msg: "Imported — review and Save to persist." });
  }

  async function save() {
    if (!resume) return;
    setSaving(true);
    setStatus({ kind: null, msg: "" });
    try {
      const payload = editorMode === "json" ? JSON.parse(jsonText) : resume;
      const res = await fetch("/api/master", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: payload }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const savedMap = data.piiMap as RedactionMap | null;
      const savedContent = savedMap ? injectResume(data.content, savedMap) : data.content;
      setPiiMap(savedMap);
      setResume(savedContent);
      setUpdatedAt(data.updatedAt ?? null);
      setJsonText(JSON.stringify(savedContent, null, 2));
      setShowField({});

      // When editing LaTeX, Save also compiles the custom source for preview.
      if (editorMode === "latex" && customTex?.trim()) {
        const compileRes = await fetch("/api/master/compile", {
          method: "POST",
          headers: { "content-type": "application/x-tex" },
          body: customTex,
        });
        if (!compileRes.ok) throw new Error(await compileRes.text());
        const blob = await compileRes.blob();
        const url = URL.createObjectURL(blob);
        setCompiledPdfUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
      }

      setStatus({ kind: "ok", msg: "Saved" });
    } catch (e) {
      setStatus({ kind: "err", msg: e instanceof Error ? e.message : "save failed" });
    } finally {
      setSaving(false);
    }
  }

  async function switchMode(mode: "structured" | "latex" | "json") {
    if (mode === "structured" && editorMode === "json") {
      try {
        const parsed = JSON.parse(jsonText);
        setResume(parsed);
        setPiiMap(null);
        setShowField({});
        setStatus({ kind: "ok", msg: "Switched to structured view. Save to re-redact PII." });
      } catch {
        setStatus({ kind: "err", msg: "JSON is invalid — fix or revert before switching back." });
        return;
      }
    }
    if (mode === "json" && editorMode !== "json") {
      setJsonText(JSON.stringify(resume, null, 2));
    }
    if (mode === "latex" && customTex === null) {
      try {
        const res = await fetch("/api/master/tex");
        if (!res.ok) throw new Error(await res.text());
        setCustomTex(await res.text());
      } catch (e) {
        setStatus({ kind: "err", msg: e instanceof Error ? e.message : "failed to load .tex" });
        return;
      }
    }
    setEditorMode(mode);
  }

  // Clean up compiled PDF blob URL on unmount.
  useEffect(() => () => {
    if (compiledPdfUrlRef.current) {
      URL.revokeObjectURL(compiledPdfUrlRef.current);
    }
  }, []);

  if (!resume) {
    return (
      <div className="h-full flex items-center justify-center text-body-md text-on-surface-variant">
        Loading…
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col font-body-md text-body-md text-on-surface bg-background dark:bg-on-background" style={{ zoom: 0.9 }}>
      {/* Full-screen overlay during resize so iframes/panels don&apos;t steal mouse events. */}
      {resizing && <div className="fixed inset-0 z-[60] cursor-col-resize" />}
      {/* TopNavBar */}
      <header className="bg-surface-container-lowest dark:bg-surface-dim text-primary dark:text-primary-fixed w-full h-16 sticky top-0 border-b border-outline-variant dark:border-outline flex items-center px-lg w-full z-50">
        <div className="flex items-center gap-md">
          <span className="text-[22px] font-medium tracking-tight text-on-surface dark:text-inverse-on-surface" style={{ fontFamily: "'Outfit', sans-serif" }}>apted</span>
          <div className="hidden lg:block text-on-surface-variant dark:text-surface-variant text-body-sm font-body-sm border-l border-outline-variant dark:border-outline pl-md ml-md">
            The master resume is your complete career record. Add everything — the tailor curates per job.
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* SideNavBar */}
        <SideNavBar
          sections={resume.sections}
          active={activeSection}
          onSelect={setActiveSection}
          onReorder={(next) => setResume((r) => r ? { ...r, sections: next } : r)}
          width={sidebarWidth}
          onExpand={() => setSidebarWidth(220)}
        />

        {/* Resizer 1 */}
        <div
          onMouseDown={(e) => startResize("sidebar", e)}
          className="hidden md:flex w-1 bg-surface border-r border-outline-variant hover:bg-surface-container-high cursor-col-resize shrink-0 items-center justify-center relative z-10 group select-none"
        >
          <div className="h-8 w-[2px] bg-outline-variant group-hover:bg-on-surface-variant rounded-full" />
        </div>

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col lg:flex-row overflow-hidden bg-background">
          {/* Left Column (Editor) */}
          <div className="flex-1 w-full flex flex-col overflow-hidden">
            <div className="px-lg pt-lg pb-sm flex items-center justify-between gap-sm shrink-0">
              <div className="flex items-center gap-sm">
                <button onClick={() => switchMode("structured")} className={editorMode === "structured" ? primaryBtnCls : smallBtnCls}>
                  Structured
                </button>
                <button onClick={() => switchMode("latex")} className={editorMode === "latex" ? primaryBtnCls : smallBtnCls}>
                  LaTeX
                </button>
                <button onClick={() => switchMode("json")} className={editorMode === "json" ? primaryBtnCls : smallBtnCls}>
                  JSON
                </button>
              </div>
              <div className="flex items-center gap-sm">
                <button onClick={() => setShowImport(true)} className={smallBtnCls}>
                  Import from PDF
                </button>
                <button onClick={save} disabled={saving} className={primaryBtnCls}>
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
            <div
              className={[
                "flex-1 w-full px-lg flex flex-col gap-lg items-center",
                editorMode === "latex" ? "overflow-hidden pb-0" : "overflow-y-auto pb-[100px]",
              ].join(" ")}
            >
              <div className={["w-full flex flex-col", editorMode === "latex" ? "h-full max-w-none" : "max-w-[800px] gap-lg"].join(" ")}>
                {status.msg && (
                  <div className={`text-label-md font-label-md ${status.kind === "err" ? "text-error" : "text-on-surface-variant"}`}>
                    {status.msg}
                  </div>
                )}

                {editorMode === "json" && (
                <section className="bg-surface-container-lowest border border-outline-variant rounded-xl p-lg">
                  <h3 className="text-headline-md font-headline-md text-on-surface mb-md">JSON</h3>
                  <textarea
                    value={jsonText}
                    onChange={(e) => setJsonText(e.target.value)}
                    spellCheck={false}
                    rows={30}
                    className="w-full rounded-lg border border-outline-variant bg-surface p-3 font-mono text-xs focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                  />
                </section>
              )}

              {editorMode === "latex" && (
                <div className="flex flex-col h-full w-full">
                  <textarea
                    value={customTex ?? ""}
                    onChange={(e) => setCustomTex(e.target.value)}
                    spellCheck={false}
                    className="flex-1 w-full bg-surface font-mono text-xs p-3 focus:outline-none resize-none"
                  />
                </div>
              )}

              {editorMode === "structured" && (
                <>
                  <section id="contact">
                    <ContactCard
                      contact={resume.contact}
                      onChange={updateContact}
                      piiMap={piiMap}
                      showField={showField}
                      onToggleField={(field) => setShowField((s) => ({ ...s, [field]: !s[field] }))}
                    />
                  </section>

                  {resume.sections.map((section, idx) => {
                    const proseKind =
                      section.kind === "experience" || section.kind === "projects" || section.kind === "education"
                        ? (section.kind as ProseKind)
                        : null;
                    return (
                      <section key={section.id} id={section.id}>
                        <SectionCard
                          section={section}
                          collapsed={!!collapsed[section.id]}
                          onToggleCollapse={() =>
                            setCollapsed((c) => ({ ...c, [section.id]: !c[section.id] }))
                          }
                          onChange={(next) => updateSection(idx, () => next)}
                          onMoveUp={() => moveSection(idx, -1)}
                          onMoveDown={() => moveSection(idx, 1)}
                          isFirst={idx === 0}
                          isLast={idx === resume.sections.length - 1}
                          onAddFromProse={
                            proseKind ? () => setProseModal({ sectionIdx: idx, kind: proseKind }) : undefined
                          }
                        />
                      </section>
                    );
                  })}

                  <AddSectionMenu existing={resume.sections.map((s) => s.kind)} onAdd={addSection} />
                </>
              )}
              </div>
            </div>
          </div>

          {/* Resizer 2 */}
          <div
            onMouseDown={(e) => startResize("preview", e)}
            className="hidden lg:flex w-1 bg-surface border-l border-outline-variant hover:bg-surface-container-high cursor-col-resize shrink-0 items-center justify-center relative z-10 group select-none"
          >
            <div className="h-8 w-[2px] bg-outline-variant group-hover:bg-on-surface-variant rounded-full" />
          </div>

          {/* Right Column (Preview Pane) */}
          <PreviewPane
            updatedAt={updatedAt}
            width={previewWidth}
            editorMode={editorMode}
            compiledPdfUrl={compiledPdfUrl}
            resume={resume}
            customTex={customTex}
          />
        </main>
      </div>

      {proseModal && (
        <AddFromProseModal
          kind={proseModal.kind}
          onClose={() => setProseModal(null)}
          onParsed={(items) => {
            appendItemsToSection(proseModal.sectionIdx, items);
            setProseModal(null);
          }}
        />
      )}

      {showImport && (
        <ImportResumeModal
          hasExistingContent={resume.sections.some((s) => s.items.length > 0) || !!resume.contact.name}
          onClose={() => setShowImport(false)}
          onImported={(next) => {
            applyImportedResume(next);
            setShowImport(false);
          }}
        />
      )}
    </div>
  );
}

// -- SideNavBar ----------------------------------------------------------

function SideNavBar({
  sections,
  active,
  onSelect,
  onReorder,
  width,
  onExpand,
}: {
  sections: Section[];
  active: string;
  onSelect: (id: string) => void;
  onReorder: (next: Section[]) => void;
  width: number;
  onExpand: () => void;
}) {
  const collapsed = width < 60;
  const iconByKind: Record<Section["kind"], string> = {
    experience: "work",
    projects: "rebase_edit",
    education: "school",
    skills: "psychology",
    achievements: "verified",
  };
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragIdRef = useRef<string | null>(null);

  function handleDrop(targetId: string) {
    const dragId = dragIdRef.current;
    dragIdRef.current = null;
    setDragOverId(null);
    if (!dragId || dragId === targetId) return;
    const fromIdx = sections.findIndex((s) => s.id === dragId);
    const toIdx = sections.findIndex((s) => s.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const next = sections.slice();
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    onReorder(next);
  }

  const Item = ({
    id,
    icon,
    label,
    draggable,
  }: {
    id: string;
    icon: string;
    label: string;
    draggable?: boolean;
  }) => {
    const selected = active === id;
    const isOver = dragOverId === id && dragOverId !== dragIdRef.current;
    return (
      <a
        href={`#${id}`}
        draggable={draggable}
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", id);
          e.dataTransfer.effectAllowed = "move";
          dragIdRef.current = id;
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setDragOverId(id);
        }}
        onDragLeave={() => setDragOverId((cur) => (cur === id ? null : cur))}
        onDrop={(e) => {
          e.preventDefault();
          handleDrop(id);
        }}
        onDragEnd={() => {
          dragIdRef.current = null;
          setDragOverId(null);
        }}
        onClick={() => onSelect(id)}
        className={[
          "flex items-center gap-3 px-3 py-2 rounded-lg transition-all",
          selected
            ? "text-primary dark:text-primary-fixed font-semibold bg-primary-container dark:bg-secondary-container"
            : "text-on-surface-variant dark:text-surface-variant hover:bg-surface-container-highest",
          isOver ? "ring-2 ring-primary ring-inset" : "",
        ].join(" ")}
      >
        <span className="material-symbols-outlined text-[16px] text-on-surface-variant cursor-grab opacity-50 hover:opacity-100">drag_indicator</span>
        <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 0" }}>{icon}</span>
        <span className="text-label-md font-label-md">{label}</span>
      </a>
    );
  };

  if (collapsed) {
    return (
      <nav
        className="hidden md:flex flex-col items-center py-md bg-surface-container-low dark:bg-surface-container-high shrink-0"
        style={{ width }}
      >
        <button onClick={onExpand} className="p-1 text-on-surface-variant hover:text-on-surface rounded" aria-label="Expand sidebar">
          <span className="material-symbols-outlined text-[20px]">chevron_right</span>
        </button>
      </nav>
    );
  }

  return (
    <nav
      className="hidden md:flex flex-col p-md gap-sm bg-surface-container-low dark:bg-surface-container-high shrink-0 overflow-y-auto"
      style={{ width }}
    >
      <div className="mb-lg px-2">
        <h2 className="text-headline-md font-headline-md font-bold text-primary">Editor Sections</h2>
        <p className="text-label-md font-label-md text-on-surface-variant">Resume Structure</p>
      </div>
      <Item id="contact" icon="person" label="Contact" />
      {sections.map((s) => (
        <Item key={s.id} id={s.id} icon={iconByKind[s.kind]} label={s.title} draggable />
      ))}
    </nav>
  );
}

// -- PDF helpers ---------------------------------------------------------

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function fetchBlob(input: string | URL, init?: RequestInit) {
  const res = await fetch(input, init);
  if (!res.ok) throw new Error(await res.text());
  return res.blob();
}

// -- Preview Pane --------------------------------------------------------

const previewBtnCls =
  "px-3 py-2 text-inverse-on-surface text-label-md font-label-md hover:bg-white/10 transition-colors duration-200 rounded flex items-center gap-1";
const previewIconBtnCls =
  "p-2 text-inverse-on-surface hover:bg-white/10 transition-colors duration-200 rounded disabled:opacity-30";

function PreviewPane({
  updatedAt,
  width,
  editorMode,
  compiledPdfUrl,
  resume,
  customTex,
}: {
  updatedAt: string | null;
  width: number;
  editorMode: "structured" | "latex" | "json";
  compiledPdfUrl: string | null;
  resume: Resume | null;
  customTex: string | null;
}) {
  const version = updatedAt ? new Date(updatedAt).getTime() : 0;
  const pdfSrc = editorMode === "latex" && compiledPdfUrl ? compiledPdfUrl : `/api/master/pdf?v=${version}`;
  const [pdf, setPdf] = useState<any>(null);
  const [numPages, setNumPages] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useClickAway<HTMLDivElement>(exportOpen, () => setExportOpen(false));
  const viewerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<(HTMLCanvasElement | null)[]>([]);

  // Load PDF and fit first page to viewer width.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      setPage(1);
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
        const doc = await pdfjsLib.getDocument(pdfSrc).promise;
        if (cancelled) return;
        setPdf(doc);
        setNumPages(doc.numPages);
        const container = viewerRef.current;
        if (container) {
          const firstPage = await doc.getPage(1);
          const unscaled = firstPage.getViewport({ scale: 1 });
          const targetWidth = container.clientWidth - 48;
          if (targetWidth > 0 && unscaled.width > 0) {
            setZoom(Math.round((targetWidth / unscaled.width) * 100));
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "failed to load PDF");
      } finally {
        setLoading(false);
      }
    }
    if (updatedAt || compiledPdfUrl) load();
    return () => { cancelled = true; };
  }, [pdfSrc, updatedAt, compiledPdfUrl]);

  // Render all pages at current zoom with device-pixel-ratio scaling.
  useEffect(() => {
    if (!pdf || numPages === 0) return;
    let cancelled = false;
    async function renderAll() {
      const dpr = window.devicePixelRatio || 1;
      for (let i = 1; i <= numPages; i++) {
        if (cancelled) return;
        const canvas = pageRefs.current[i - 1];
        if (!canvas) continue;
        const pg = await pdf.getPage(i);
        const viewport = pg.getViewport({ scale: (zoom / 100) * dpr });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width / dpr}px`;
        canvas.style.height = `${viewport.height / dpr}px`;
        const ctx = canvas.getContext("2d")!;
        await pg.render({ canvasContext: ctx, viewport }).promise;
      }
    }
    renderAll();
    return () => { cancelled = true; };
  }, [pdf, zoom, numPages]);

  // Track the currently visible page while scrolling.
  useEffect(() => {
    if (!viewerRef.current || numPages === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) {
          const idx = pageRefs.current.findIndex((c) => c === visible.target);
          if (idx !== -1) setPage(idx + 1);
        }
      },
      { root: viewerRef.current, threshold: [0, 0.25, 0.5, 0.75, 1] }
    );
    pageRefs.current.forEach((c) => c && observer.observe(c));
    return () => observer.disconnect();
  }, [pdf, numPages, zoom]);

  // Trackpad / ctrl+wheel zoom inside the viewer.
  useEffect(() => {
    const el = viewerRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -3 : 3;
        setZoom((z) => Math.max(25, Math.min(300, z + delta)));
      }
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  function scrollToPage(p: number) {
    const canvas = pageRefs.current[Math.max(0, Math.min(numPages - 1, p - 1))];
    if (canvas && viewerRef.current) {
      canvas.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  async function exportAs(kind: "pdf" | "tex" | "json") {
    try {
      if (kind === "pdf") {
        const blob = await fetchBlob(pdfSrc);
        downloadBlob(blob, "apted-master.pdf");
      } else if (kind === "tex") {
        if (editorMode === "latex" && customTex) {
          downloadBlob(new Blob([customTex], { type: "application/x-tex" }), "apted-master.tex");
        } else {
          const blob = await fetchBlob("/api/master/tex");
          downloadBlob(blob, "apted-master.tex");
        }
      } else if (kind === "json" && resume) {
        downloadBlob(new Blob([JSON.stringify(resume, null, 2)], { type: "application/json" }), "apted-master.json");
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "export failed");
    }
    setExportOpen(false);
  }

  return (
    <div className="hidden lg:flex flex-col bg-inverse-surface relative" style={{ width: `${width}%` }}>
      <div className="h-12 border-b border-inverse-on-surface/10 bg-inverse-surface flex items-center justify-between px-md sticky top-0 z-10">
        <span className="text-label-md font-label-md text-inverse-on-surface font-semibold flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">visibility</span> Preview
        </span>
        <div className="flex items-center gap-1">
          <div ref={exportRef} className="relative">
            <button onClick={() => setExportOpen((s) => !s)} className={previewBtnCls}>
              <span className="material-symbols-outlined text-[18px]">download</span> Export
              <span className="material-symbols-outlined text-[16px]">expand_more</span>
            </button>
            {exportOpen && (
              <div className="absolute right-0 top-full mt-1 bg-inverse-surface border border-inverse-on-surface/20 rounded-lg shadow-lg py-1 min-w-[9rem] z-20">
                {(["pdf", "tex", "json"] as const).map((k) => (
                  <button
                    key={k}
                    onClick={() => exportAs(k)}
                    className="w-full text-left px-3 py-1.5 text-body-md font-body-md text-inverse-on-surface hover:bg-white/10 capitalize"
                  >
                    Export as {k.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="w-px h-5 bg-inverse-on-surface/20 mx-1" />
          <button
            onClick={() => scrollToPage(page - 1)}
            disabled={page <= 1 || !pdf}
            className={previewIconBtnCls}
            aria-label="Previous page"
          >
            <span className="material-symbols-outlined text-[18px]">chevron_left</span>
          </button>
          <div className="flex items-center gap-1 px-2 py-1 rounded bg-inverse-on-surface/10 text-body-sm font-body-sm text-inverse-on-surface min-w-[4rem] justify-center">
            {page}<span className="text-inverse-on-surface/60">/</span>{numPages || "-"}
          </div>
          <button
            onClick={() => scrollToPage(page + 1)}
            disabled={page >= (numPages || 1) || !pdf}
            className={previewIconBtnCls}
            aria-label="Next page"
          >
            <span className="material-symbols-outlined text-[18px]">chevron_right</span>
          </button>
          <div className="w-px h-5 bg-inverse-on-surface/20 mx-1" />
          <button
            onClick={() => setZoom((z) => Math.max(25, z - 25))}
            disabled={!pdf}
            className={previewIconBtnCls}
            aria-label="Zoom out"
          >
            <span className="material-symbols-outlined text-[18px]">remove</span>
          </button>
          <span className="text-body-sm font-body-sm text-inverse-on-surface min-w-[3rem] text-center">{zoom}%</span>
          <button
            onClick={() => setZoom((z) => Math.min(300, z + 25))}
            disabled={!pdf}
            className={previewIconBtnCls}
            aria-label="Zoom in"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
          </button>
        </div>
      </div>
      <div ref={viewerRef} className="flex-1 overflow-auto bg-inverse-surface">
        {updatedAt || compiledPdfUrl ? (
          loading ? (
            <div className="w-full h-full flex items-center justify-center text-body-sm text-inverse-on-surface/70">
              Loading preview…
            </div>
          ) : error ? (
            <div className="w-full h-full flex items-center justify-center text-body-sm text-error px-8 text-center">
              {error}
            </div>
          ) : (
            <div className="min-w-full w-fit flex flex-col items-center py-6 gap-4">
              {Array.from({ length: numPages }, (_, i) => (
                <canvas
                  key={i}
                  ref={(el) => { pageRefs.current[i] = el; }}
                  className="bg-white shadow-2xl shrink-0"
                />
              ))}
            </div>
          )
        ) : (
          <div className="w-full h-full flex items-center justify-center text-body-sm text-inverse-on-surface/70">
            Loading preview…
          </div>
        )}
      </div>
    </div>
  );
}

// -- Contact -------------------------------------------------------------

function ContactCard({
  contact,
  onChange,
  piiMap,
  showField,
  onToggleField,
}: {
  contact: Contact;
  onChange: (patch: Partial<Contact>) => void;
  piiMap: RedactionMap | null;
  showField: Record<string, boolean>;
  onToggleField: (field: string) => void;
}) {
  const links = contact.links ?? [];
  const setLinks = (next: { label: string; href: string }[]) => onChange({ links: next });

  const mask = (field: string, real: string) => {
    if (!piiMap) return real;
    if (showField[field]) return real;
    if (field === "name") return "[NAME]";
    if (field === "phone") return "[PHONE]";
    if (field === "email") return "[EMAIL]";
    return real;
  };

  const handleFocus = (field: string, real: string, onChangeFn: (value: string) => void) => {
    if (piiMap && !showField[field]) {
      onToggleField(field);
      onChangeFn(real);
    }
  };

  return (
    <section className="bg-surface-container-lowest border border-outline-variant rounded-xl p-lg flex flex-col gap-md">
      <h3 className="text-headline-md font-headline-md text-on-surface flex items-center gap-2">
        <span className="material-symbols-outlined text-[20px] text-on-surface-variant">person</span>
        Contact Info
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
        <Labeled
          label="Full Name"
          action={
            piiMap ? (
              <button type="button" onClick={() => onToggleField("name")} className="text-on-surface-variant hover:text-primary p-0 leading-none">
                <span className="material-symbols-outlined" style={{ fontSize: 14, lineHeight: 1 }}>{showField.name ? "visibility" : "visibility_off"}</span>
              </button>
            ) : null
          }
        >
          <input
            className={inputCls}
            type="text"
            value={mask("name", contact.name)}
            onFocus={() => handleFocus("name", contact.name, (v) => onChange({ name: v }))}
            onChange={(e) => onChange({ name: e.target.value })}
          />
        </Labeled>
        <Labeled label="Title / Role">
          <input
            className={inputCls}
            type="text"
            value={contact.title ?? ""}
            onChange={(e) => onChange({ title: e.target.value })}
          />
        </Labeled>
        <Labeled
          label="Email"
          action={
            piiMap ? (
              <button type="button" onClick={() => onToggleField("email")} className="text-on-surface-variant hover:text-primary p-0 leading-none">
                <span className="material-symbols-outlined" style={{ fontSize: 14, lineHeight: 1 }}>{showField.email ? "visibility" : "visibility_off"}</span>
              </button>
            ) : null
          }
        >
          <input
            className={inputCls}
            type="email"
            value={mask("email", contact.email ?? "")}
            onFocus={() => handleFocus("email", contact.email ?? "", (v) => onChange({ email: v }))}
            onChange={(e) => onChange({ email: e.target.value })}
          />
        </Labeled>
        <Labeled
          label="Phone"
          action={
            piiMap ? (
              <button type="button" onClick={() => onToggleField("phone")} className="text-on-surface-variant hover:text-primary p-0 leading-none">
                <span className="material-symbols-outlined" style={{ fontSize: 14, lineHeight: 1 }}>{showField.phone ? "visibility" : "visibility_off"}</span>
              </button>
            ) : null
          }
        >
          <input
            className={inputCls}
            type="tel"
            value={mask("phone", contact.phone ?? "")}
            onFocus={() => handleFocus("phone", contact.phone ?? "", (v) => onChange({ phone: v }))}
            onChange={(e) => onChange({ phone: e.target.value })}
          />
        </Labeled>
      </div>
      <div className="border-t border-outline-variant pt-md mt-sm flex flex-col gap-sm">
        <h4 className="text-label-md font-label-md text-on-surface-variant">Links</h4>
        <div className="flex flex-col gap-xs">
          {links.map((l, i) => (
            <div key={i} className="flex items-center gap-sm">
              <div className="flex-1 flex items-center border border-outline-variant rounded-lg bg-surface px-2 h-8">
                <span className="material-symbols-outlined text-[16px] text-on-surface-variant mr-2">link</span>
                <input
                  className="bg-transparent border-none p-0 w-full text-body-md focus:ring-0 outline-none"
                  placeholder="Label"
                  type="text"
                  value={l.label}
                  onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                />
              </div>
              <div className="flex-[2] flex items-center border border-outline-variant rounded-lg bg-surface px-2 h-8 relative">
                <span className="material-symbols-outlined text-[16px] text-on-surface-variant mr-2">language</span>
                <input
                  className="bg-transparent border-none p-0 w-full text-body-md focus:ring-0 outline-none"
                  placeholder="https://…"
                  type="text"
                  value={l.href}
                  onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, href: e.target.value } : x)))}
                />
              </div>
              <button onClick={() => setLinks(links.filter((_, j) => j !== i))} className="text-on-surface-variant hover:text-error p-0 leading-none h-8 flex items-center">
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={() => setLinks([...links, { label: "", href: "" }])}
          className="text-primary text-label-md font-label-md flex items-center gap-1 self-start mt-1 hover:underline"
        >
          <span className="material-symbols-outlined text-[16px]">add</span> Add link
        </button>
      </div>
    </section>
  );
}

function Labeled({ label, children, wide, action }: { label: string; children: React.ReactNode; wide?: boolean; action?: React.ReactNode }) {
  return (
    <label className={`flex flex-col gap-1 text-label-md font-label-md text-on-surface-variant ${wide ? "md:col-span-2" : ""}`}>
      <span className="flex items-center gap-1 w-full justify-between">
        {label}
        {action}
      </span>
      {children}
    </label>
  );
}

// -- Section -------------------------------------------------------------

function SectionCard({
  section, collapsed, onToggleCollapse, onChange, onMoveUp, onMoveDown, isFirst, isLast, onAddFromProse,
}: {
  section: Section;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onChange: (next: Section) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
  onAddFromProse?: () => void;
}) {
  const iconByKind: Record<Section["kind"], string> = {
    experience: "work",
    projects: "rebase_edit",
    education: "school",
    skills: "psychology",
    achievements: "verified",
  };

  return (
    <section className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md flex flex-col gap-md">
      <div className="flex justify-between items-center cursor-pointer" onClick={onToggleCollapse}>
        <h3 className="text-headline-md font-headline-md text-on-surface flex items-center gap-2">
          <span className="material-symbols-outlined text-[20px] text-on-surface-variant">{iconByKind[section.kind]}</span>
          <input
            className="bg-transparent border-none focus:ring-0 outline-none p-0 text-headline-md font-headline-md"
            value={section.title}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onChange({ ...section, title: e.target.value })}
          />
        </h3>
        <div className="flex items-center gap-1">
          <button onClick={(e) => { e.stopPropagation(); onMoveUp(); }} disabled={isFirst} className={smallBtnCls} aria-label="Move up">
            <span className="material-symbols-outlined text-[16px]">arrow_upward</span>
          </button>
          <button onClick={(e) => { e.stopPropagation(); onMoveDown(); }} disabled={isLast} className={smallBtnCls} aria-label="Move down">
            <span className="material-symbols-outlined text-[16px]">arrow_downward</span>
          </button>
          <button onClick={(e) => { e.stopPropagation(); onToggleCollapse(); }} className={smallBtnCls} aria-label="Toggle">
            <span className="material-symbols-outlined text-[20px]">{collapsed ? "expand_more" : "expand_less"}</span>
          </button>
        </div>
      </div>
      {!collapsed && (
        <div className="flex flex-col gap-md">
          {section.kind === "experience" && <ExpSectionBody section={section} onChange={onChange} onAddFromProse={onAddFromProse} />}
          {section.kind === "projects" && <ProjSectionBody section={section} onChange={onChange} onAddFromProse={onAddFromProse} />}
          {section.kind === "education" && <EduSectionBody section={section} onChange={onChange} onAddFromProse={onAddFromProse} />}
          {section.kind === "skills" && <SkillSectionBody section={section} onChange={onChange} />}
          {section.kind === "achievements" && <AchieveSectionBody section={section} onChange={onChange} />}
        </div>
      )}
    </section>
  );
}

function SectionFooter({
  onAdd,
  label,
  onAddFromProse,
}: {
  onAdd: () => void;
  label: string;
  onAddFromProse?: () => void;
}) {
  return (
    <div className="flex flex-col gap-sm">
      <button onClick={onAdd} className="w-full py-3 border-2 border-dashed border-outline-variant rounded-lg text-on-surface-variant font-label-md text-label-md hover:bg-surface-container-low transition-colors flex items-center justify-center gap-2">
        <span className="material-symbols-outlined text-[18px]">add</span> Add {label}
      </button>
      {onAddFromProse && (
        <button onClick={onAddFromProse} className="w-full py-2 border border-outline-variant rounded-lg text-primary font-label-md text-label-md hover:bg-surface-container-low transition-colors flex items-center justify-center gap-2">
          <span className="material-symbols-outlined text-[16px]">auto_awesome</span> Add from prose
        </button>
      )}
    </div>
  );
}

// -- Experience ----------------------------------------------------------

function ExpSectionBody({ section, onChange, onAddFromProse }: { section: ExpSection; onChange: (s: Section) => void; onAddFromProse?: () => void }) {
  const setItems = (items: ExperienceItem[]) => onChange({ ...section, items });
  const drag = useDragReorder((from, to) => setItems(reorderArray(section.items, from, to)));
  return (
    <>
      {section.items.map((it, i) => (
        <ItemFrame
          key={it.id}
          onDelete={() => setItems(section.items.filter((_, j) => j !== i))}
          {...drag(i)}
        >
          <div className="flex flex-col gap-sm w-full">
            {/* Jake layout: title (left) | dates (right) */}
            <div className="flex flex-col sm:flex-row justify-between items-start gap-sm">
              <input
                className={`${ghostInputCls} flex-1 text-headline-md font-headline-md`}
                placeholder="Job Title"
                type="text"
                value={it.title}
                onChange={(e) => setItems(section.items.map((x, j) => j === i ? { ...x, title: e.target.value } : x))}
              />
              <input
                className={`${ghostInputCls} sm:w-48 text-right text-body-sm font-body-sm text-on-surface-variant`}
                placeholder="Dates"
                type="text"
                value={`${it.start ?? ""}${it.end ? ` - ${it.end}` : ""}`}
                onChange={(e) => {
                  const [start, end] = e.target.value.split(" - ");
                  setItems(section.items.map((x, j) => j === i ? { ...x, start: start ?? "", end: end ?? "" } : x));
                }}
              />
            </div>
            {/* Jake layout: company (left) | location (right) */}
            <div className="flex flex-col sm:flex-row justify-between items-start gap-sm">
              <input
                className={`${ghostInputCls} flex-1 text-body-sm font-body-sm text-on-surface-variant`}
                placeholder="Company"
                type="text"
                value={it.org}
                onChange={(e) => setItems(section.items.map((x, j) => j === i ? { ...x, org: e.target.value } : x))}
              />
              <input
                className={`${ghostInputCls} sm:w-48 text-right text-body-sm font-body-sm text-on-surface-variant`}
                placeholder="Location"
                type="text"
                value={it.location ?? ""}
                onChange={(e) => setItems(section.items.map((x, j) => j === i ? { ...x, location: e.target.value } : x))}
              />
            </div>
            <ProseInput
              value={it.notes ?? ""}
              onChange={(v) => setItems(section.items.map((x, j) => j === i ? { ...x, notes: v } : x))}
              bullets={it.bullets}
              onGenerate={(bs, notes) => setItems(section.items.map((x, j) => j === i ? { ...x, bullets: bs, notes } : x))}
            />
            <BulletList
              bullets={it.bullets}
              onChange={(bs) => setItems(section.items.map((x, j) => j === i ? { ...x, bullets: bs } : x))}
            />
            <TagsInput
              tags={it.tags ?? []}
              onChange={(tags) => setItems(section.items.map((x, j) => j === i ? { ...x, tags } : x))}
            />
          </div>
        </ItemFrame>
      ))}
      <SectionFooter label="Experience" onAdd={() => setItems([...section.items, newExp()])} onAddFromProse={onAddFromProse} />
    </>
  );
}

// -- Projects ------------------------------------------------------------

function ProjSectionBody({ section, onChange, onAddFromProse }: { section: ProjSection; onChange: (s: Section) => void; onAddFromProse?: () => void }) {
  const setItems = (items: ProjectItem[]) => onChange({ ...section, items });
  const drag = useDragReorder((from, to) => setItems(reorderArray(section.items, from, to)));
  return (
    <>
      {section.items.map((it, i) => (
        <ItemFrame
          key={it.id}
          onDelete={() => setItems(section.items.filter((_, j) => j !== i))}
          {...drag(i)}
        >
          <div className="flex flex-col gap-sm w-full">
            {/* Jake layout: name | stack (left) | dates (right) */}
            <div className="flex flex-col sm:flex-row justify-between items-start gap-sm">
              <div className="flex-1 flex flex-col sm:flex-row items-start gap-2">
                <input
                  className={`${ghostInputCls} flex-1 text-headline-md font-headline-md`}
                  placeholder="Project Name"
                  type="text"
                  value={it.name}
                  onChange={(e) => setItems(section.items.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                />
                <span className="hidden sm:inline text-on-surface-variant self-center">|</span>
                <input
                  className={`${ghostInputCls} sm:w-40 text-headline-md font-headline-md text-on-surface-variant`}
                  placeholder="Stack"
                  type="text"
                  value={it.stack ?? ""}
                  onChange={(e) => setItems(section.items.map((x, j) => j === i ? { ...x, stack: e.target.value } : x))}
                />
              </div>
              <input
                className={`${ghostInputCls} sm:w-48 text-right text-body-sm font-body-sm text-on-surface-variant`}
                placeholder="Dates"
                type="text"
                value={`${it.start ?? ""}${it.end ? ` - ${it.end}` : ""}`}
                onChange={(e) => {
                  const [start, end] = e.target.value.split(" - ");
                  setItems(section.items.map((x, j) => j === i ? { ...x, start: start ?? "", end: end ?? "" } : x));
                }}
              />
            </div>
            <ProseInput
              value={it.notes ?? ""}
              onChange={(v) => setItems(section.items.map((x, j) => j === i ? { ...x, notes: v } : x))}
              bullets={it.bullets}
              onGenerate={(bs, notes) => setItems(section.items.map((x, j) => j === i ? { ...x, bullets: bs, notes } : x))}
            />
            <BulletList
              bullets={it.bullets}
              onChange={(bs) => setItems(section.items.map((x, j) => j === i ? { ...x, bullets: bs } : x))}
            />
            <TagsInput
              tags={it.tags ?? []}
              onChange={(tags) => setItems(section.items.map((x, j) => j === i ? { ...x, tags } : x))}
            />
          </div>
        </ItemFrame>
      ))}
      <SectionFooter label="Project" onAdd={() => setItems([...section.items, newProj()])} onAddFromProse={onAddFromProse} />
    </>
  );
}

// -- Education -----------------------------------------------------------

function EduSectionBody({ section, onChange, onAddFromProse }: { section: EduSection; onChange: (s: Section) => void; onAddFromProse?: () => void }) {
  const setItems = (items: EducationItem[]) => onChange({ ...section, items });
  const drag = useDragReorder((from, to) => setItems(reorderArray(section.items, from, to)));
  return (
    <>
      {section.items.map((it, i) => (
        <ItemFrame
          key={it.id}
          onDelete={() => setItems(section.items.filter((_, j) => j !== i))}
          {...drag(i)}
        >
          <div className="flex flex-col gap-sm w-full">
            {/* Jake layout: school (left) | location (right) */}
            <div className="flex flex-col sm:flex-row justify-between items-start gap-sm">
              <input
                className={`${ghostInputCls} flex-1 text-headline-md font-headline-md`}
                placeholder="School"
                type="text"
                value={it.school}
                onChange={(e) => setItems(section.items.map((x, j) => j === i ? { ...x, school: e.target.value } : x))}
              />
              <input
                className={`${ghostInputCls} sm:w-48 text-right text-body-sm font-body-sm text-on-surface-variant`}
                placeholder="Location"
                type="text"
                value={it.location ?? ""}
                onChange={(e) => setItems(section.items.map((x, j) => j === i ? { ...x, location: e.target.value } : x))}
              />
            </div>
            {/* Jake layout: degree (left) | dates (right) */}
            <div className="flex flex-col sm:flex-row justify-between items-start gap-sm">
              <input
                className={`${ghostInputCls} flex-1 text-body-sm font-body-sm text-on-surface-variant`}
                placeholder="Degree"
                type="text"
                value={it.degree ?? ""}
                onChange={(e) => setItems(section.items.map((x, j) => j === i ? { ...x, degree: e.target.value } : x))}
              />
              <input
                className={`${ghostInputCls} sm:w-48 text-right text-body-sm font-body-sm text-on-surface-variant`}
                placeholder="Dates"
                type="text"
                value={`${it.start ?? ""}${it.end ? ` - ${it.end}` : ""}`}
                onChange={(e) => {
                  const [start, end] = e.target.value.split(" - ");
                  setItems(section.items.map((x, j) => j === i ? { ...x, start: start ?? "", end: end ?? "" } : x));
                }}
              />
            </div>
            <BulletList
              bullets={it.bullets}
              onChange={(bs) => setItems(section.items.map((x, j) => j === i ? { ...x, bullets: bs } : x))}
            />
            <TagsInput
              tags={it.tags ?? []}
              onChange={(tags) => setItems(section.items.map((x, j) => j === i ? { ...x, tags } : x))}
            />
          </div>
        </ItemFrame>
      ))}
      <SectionFooter label="Education" onAdd={() => setItems([...section.items, newEdu()])} onAddFromProse={onAddFromProse} />
    </>
  );
}

// -- Skills --------------------------------------------------------------

function SkillSectionBody({ section, onChange }: { section: SkillSection; onChange: (s: Section) => void }) {
  const setItems = (items: SkillGroup[]) => onChange({ ...section, items });
  const drag = useDragReorder((from, to) => setItems(reorderArray(section.items, from, to)));
  return (
    <>
      {section.items.map((g, i) => (
        <ItemFrame
          key={g.id}
          onDelete={() => setItems(section.items.filter((_, j) => j !== i))}
          {...drag(i)}
        >
          <div className="flex flex-col gap-sm w-full">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Labeled label="Category">
                <input
                  className={inputCls}
                  placeholder="Languages"
                  value={g.category}
                  onChange={(e) => setItems(section.items.map((x, j) => j === i ? { ...x, category: e.target.value } : x))}
                />
              </Labeled>
              <label className="sm:col-span-2 flex flex-col gap-1 text-label-md font-label-md text-on-surface-variant">
                <span>Items (comma-separated)</span>
                <input
                  className={inputCls}
                  placeholder="TypeScript, Python, Go"
                  value={g.items}
                  onChange={(e) => setItems(section.items.map((x, j) => j === i ? { ...x, items: e.target.value } : x))}
                />
              </label>
            </div>
          </div>
        </ItemFrame>
      ))}
      <SectionFooter label="Skill Group" onAdd={() => setItems([...section.items, newSkill()])} />
    </>
  );
}

// -- Achievements --------------------------------------------------------

function AchieveSectionBody({ section, onChange }: { section: AchieveSection; onChange: (s: Section) => void }) {
  const setItems = (items: AchievementItem[]) => onChange({ ...section, items });
  const drag = useDragReorder((from, to) => setItems(reorderArray(section.items, from, to)));
  return (
    <>
      {section.items.map((it, i) => (
        <ItemFrame
          key={it.id}
          onDelete={() => setItems(section.items.filter((_, j) => j !== i))}
          {...drag(i)}
        >
          <div className="flex flex-col gap-sm w-full">
            <label className="flex flex-col gap-1 text-label-md font-label-md text-on-surface-variant">
              <span>Achievement</span>
              <input
                className={inputCls}
                placeholder='1st Place Overall - TAMUHack 2026 Hackathon (650+ competitors)'
                value={it.text}
                onChange={(e) => setItems(section.items.map((x, j) => j === i ? { ...x, text: e.target.value } : x))}
              />
              <span className="text-body-sm font-body-sm text-on-surface-variant">
                Use " - " (space-dash-space) to split bold title from detail.
              </span>
            </label>
          </div>
        </ItemFrame>
      ))}
      <SectionFooter label="Achievement" onAdd={() => setItems([...section.items, newAchievement()])} />
    </>
  );
}

// -- Add-section menu ----------------------------------------------------

function AddSectionMenu({
  existing,
  onAdd,
}: {
  existing: Section["kind"][];
  onAdd: (kind: Section["kind"]) => void;
}) {
  const labelByKind: Record<Section["kind"], string> = {
    experience: "Experience",
    projects: "Projects",
    education: "Education",
    achievements: "Achievements",
    skills: "Technical Skills",
  };
  const kinds: Section["kind"][] = ["experience", "projects", "education", "achievements", "skills"];
  const missing = kinds.filter((k) => !existing.includes(k));
  if (missing.length === 0) return null;
  return (
    <button className="w-full py-3 border-2 border-dashed border-outline-variant rounded-lg text-on-surface-variant font-label-md text-label-md hover:bg-surface-container-low transition-colors flex items-center justify-center gap-2">
      <span className="material-symbols-outlined text-[18px]">add</span>
      <select
        className="bg-transparent border-none outline-none text-on-surface-variant font-label-md text-label-md cursor-pointer"
        onChange={(e) => {
          const kind = e.target.value as Section["kind"];
          if (kind) onAdd(kind);
          e.target.value = "";
        }}
        value=""
      >
        <option value="">Add section</option>
        {missing.map((k) => (
          <option key={k} value={k}>{labelByKind[k]}</option>
        ))}
      </select>
    </button>
  );
}

// -- Item frame ----------------------------------------------------------

function ItemFrame({
  children, onDelete,
  draggable, onDragStart, onDragOver, onDrop, isDragOver,
}: {
  children: React.ReactNode;
  onDelete: () => void;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragOver?: () => void;
  onDrop?: () => void;
  isDragOver?: boolean;
}) {
  const [showDelete, setShowDelete] = useState(false);
  const handleRef = useClickAway<HTMLDivElement>(showDelete, () => setShowDelete(false));
  return (
    <div
      draggable={!showDelete && draggable}
      onDragStart={onDragStart}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver?.();
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop?.();
      }}
      className={[
        "border rounded-lg p-md flex flex-col gap-sm relative bg-surface-bright transition-all",
        isDragOver ? "border-primary ring-1 ring-primary" : "border-outline-variant",
      ].join(" ")}
    >
      <div
        ref={handleRef}
        onClick={() => setShowDelete((s) => !s)}
        className={[
          "absolute left-0 top-0 bottom-0 w-7 flex flex-col items-center justify-center border-r border-outline-variant bg-surface select-none",
          showDelete ? "opacity-100 cursor-pointer" : "opacity-30 hover:opacity-100 cursor-grab",
        ].join(" ")}
      >
        {showDelete ? (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="text-error hover:text-error-container"
            aria-label="Delete"
          >
            <span className="material-symbols-outlined text-[18px]">delete</span>
          </button>
        ) : (
          <span className="material-symbols-outlined text-[18px] text-on-surface-variant">drag_indicator</span>
        )}
      </div>
      <div className="pl-lg flex flex-col gap-sm w-full">
        {children}
      </div>
    </div>
  );
}

// -- Bullets -------------------------------------------------------------

function BulletList({
  bullets, onChange,
}: {
  bullets: Bullet[];
  onChange: (bullets: Bullet[]) => void;
}) {
  const drag = useDragReorder((from, to) => onChange(reorderArray(bullets, from, to)));
  return (
    <div className="flex flex-col gap-1 mt-2 border-t border-outline-variant pt-sm">
      <h4 className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider">Curated Bullets</h4>
      <div className="flex flex-col gap-1">
        {bullets.map((b, i) => (
          <BulletRow
            key={b.id}
            bullet={b}
            drag={drag(i)}
            onChange={(text) => onChange(bullets.map((x, j) => j === i ? { ...x, text } : x))}
            onDelete={() => onChange(bullets.filter((_, j) => j !== i))}
          />
        ))}
        <button onClick={() => onChange([...bullets, newBullet()])} className="text-on-surface-variant text-label-md font-label-md flex items-center gap-1 self-start hover:text-on-surface">
          <span className="material-symbols-outlined text-[14px]">add</span> Add bullet manually
        </button>
      </div>
    </div>
  );
}

function BulletRow({
  bullet,
  drag,
  onChange,
  onDelete,
}: {
  bullet: Bullet;
  drag: ReturnType<ReturnType<typeof useDragReorder>>;
  onChange: (text: string) => void;
  onDelete: () => void;
}) {
  const [showDelete, setShowDelete] = useState(false);
  const handleRef = useClickAway<HTMLDivElement>(showDelete, () => setShowDelete(false));
  return (
    <div
      draggable={!showDelete}
      onDragStart={drag.onDragStart}
      onDragOver={drag.onDragOver}
      onDrop={drag.onDrop}
      onDragEnd={drag.onDragEnd}
      className={[
        "flex items-center gap-1 group rounded transition-all",
        drag.isDragOver ? "ring-1 ring-primary bg-surface-container-low" : "",
      ].join(" ")}
    >
      <div
        ref={handleRef}
        onClick={() => setShowDelete((s) => !s)}
        className={[
          "select-none",
          showDelete ? "cursor-pointer text-error" : "cursor-grab text-on-surface-variant opacity-50 group-hover:opacity-100",
        ].join(" ")}
      >
        {showDelete ? (
          <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="text-error hover:text-error-container" aria-label="Delete">
            <span className="material-symbols-outlined text-[16px]">delete</span>
          </button>
        ) : (
          <span className="material-symbols-outlined text-[16px]">drag_indicator</span>
        )}
      </div>
      <textarea
        rows={2}
        className="flex-1 bg-surface-container-lowest border border-outline-variant rounded p-1.5 text-body-sm font-body-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none resize-y"
        value={bullet.text}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

// -- Tags ----------------------------------------------------------------

function TagsInput({
  tags, onChange,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const clean = raw.trim().toLowerCase();
    if (!clean) return;
    if (tags.includes(clean)) return;
    onChange([...tags, clean]);
  };
  return (
    <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-outline-variant">
      {tags.map((t) => (
        <span key={t} className="bg-surface-container-high text-on-surface text-label-sm font-label-sm px-1.5 py-0.5 rounded-full border border-outline-variant inline-flex items-center gap-1">
          {t}
          <button onClick={() => onChange(tags.filter((x) => x !== t))} className="text-on-surface-variant hover:text-error" aria-label={`Remove ${t}`}>
            <span className="material-symbols-outlined text-[10px]">close</span>
          </button>
        </span>
      ))}
      <div className="inline-flex items-center text-on-surface-variant text-label-sm px-1.5 py-0.5 rounded-full border border-dashed border-outline-variant hover:bg-surface">
        <span className="material-symbols-outlined text-[12px] mr-1">add</span>
        <input
          className="bg-transparent border-none outline-none text-label-sm font-label-sm w-20 focus:w-32 transition-all"
          placeholder="Tag"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(draft);
              setDraft("");
            } else if (e.key === "Backspace" && draft === "" && tags.length) {
              onChange(tags.slice(0, -1));
            }
          }}
          onBlur={() => {
            if (draft.trim()) {
              add(draft);
              setDraft("");
            }
          }}
        />
      </div>
    </div>
  );
}

// -- Prose / Brain dump --------------------------------------------------

function ProseInput({
  value,
  onChange,
  bullets,
  onGenerate,
}: {
  value: string;
  onChange: (v: string) => void;
  bullets: Bullet[];
  onGenerate: (bullets: Bullet[], notes: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    if (!value.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/master/generate-bullets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId: "unused", prose: value, existingBullets: bullets }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          data && typeof data === "object" && "error" in data
            ? String(data.error)
            : `HTTP ${res.status}`,
        );
      }
      onGenerate(data.bullets ?? bullets, data.notes ?? value);
    } catch (e) {
      setError(e instanceof Error ? e.message : "generation failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1 mt-1">
      <label className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider">Brain dump / Raw Notes</label>
      <textarea
        className="w-full bg-[#FFFBF2] dark:bg-surface-container-high border-none rounded-lg p-2 text-body-md focus:ring-2 focus:ring-primary outline-none resize-y"
        placeholder="Dump everything you remember... led a team of 5, increased conversion by 20%, redesigned the core dashboard..."
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        onClick={generate}
        disabled={busy || !value.trim()}
        className="self-start mt-1 bg-surface border border-outline-variant text-primary text-label-md font-label-md px-3 py-1 rounded-lg flex items-center gap-1 hover:bg-surface-container-low transition-colors disabled:opacity-50"
      >
        <span className="material-symbols-outlined text-[16px]">auto_awesome</span>
        {busy ? "Generating…" : "Generate Bullets"}
      </button>
      {error && <p className="text-body-sm text-error">{error}</p>}
    </div>
  );
}

// -- Date ----------------------------------------------------------------

const MONTHS = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

function parseDate(s: string): { month: string; year: string; present: boolean } {
  if (!s) return { month: "", year: "", present: false };
  if (s.toLowerCase() === "present") return { month: "", year: "", present: true };
  const match = s.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (match) {
    const idx = MONTHS.findIndex((m) => m.label.toLowerCase() === match[1].toLowerCase());
    if (idx !== -1) return { month: String(idx + 1), year: match[2], present: false };
  }
  const yearMatch = s.match(/\b(\d{4})\b/);
  return { month: "", year: yearMatch ? yearMatch[1] : "", present: false };
}

function formatDate(month: string, year: string): string {
  if (!month || !year) return "";
  const m = MONTHS.find((x) => x.value === month);
  return m ? `${m.label} ${year}` : "";
}

function DateInput({
  value,
  onChange,
  allowPresent,
}: {
  value: string;
  onChange: (v: string) => void;
  allowPresent?: boolean;
}) {
  const parsed = parseDate(value);
  const [month, setMonth] = useState(parsed.month);
  const [year, setYear] = useState(parsed.year);
  const [present, setPresent] = useState(parsed.present);

  useEffect(() => {
    const p = parseDate(value);
    setMonth(p.month);
    setYear(p.year);
    setPresent(p.present);
  }, [value]);

  function update(nextMonth: string, nextYear: string, nextPresent: boolean) {
    setMonth(nextMonth);
    setYear(nextYear);
    setPresent(nextPresent);
    if (nextPresent) {
      onChange("Present");
    } else if (nextMonth && nextYear) {
      onChange(formatDate(nextMonth, nextYear));
    } else {
      onChange("");
    }
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <select
        className={inputCls}
        value={month}
        disabled={present}
        onChange={(e) => update(e.target.value, year, false)}
      >
        <option value="">Month</option>
        {MONTHS.map((m) => (
          <option key={m.value} value={m.value}>{m.label}</option>
        ))}
      </select>
      <input
        type="number"
        className={inputCls}
        placeholder="Year"
        value={year}
        disabled={present}
        onChange={(e) => update(month, e.target.value, false)}
      />
      {allowPresent && (
        <label className="col-span-2 flex items-center gap-2 text-body-sm font-body-sm text-on-surface-variant">
          <input
            type="checkbox"
            checked={present}
            onChange={(e) => update(month, year, e.target.checked)}
          />
          Present
        </label>
      )}
    </div>
  );
}

// -- Modal shell ---------------------------------------------------------

function ModalShell({
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-surface-container-lowest shadow-xl border border-outline-variant"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between border-b border-outline-variant px-5 py-3">
          <div>
            <h2 className="text-headline-md font-headline-md text-on-surface">{title}</h2>
            {subtitle && <p className="mt-0.5 text-body-sm text-on-surface-variant">{subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="text-on-surface-variant hover:text-on-surface">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </header>
        <div className="flex-1 overflow-auto px-5 py-4">{children}</div>
        <footer className="flex items-center justify-end gap-2 border-t border-outline-variant px-5 py-3">{footer}</footer>
      </div>
    </div>
  );
}

// -- Add-from-prose modal ------------------------------------------------

function AddFromProseModal({
  kind,
  onClose,
  onParsed,
}: {
  kind: ProseKind;
  onClose: () => void;
  onParsed: (items: ExperienceItem[] | ProjectItem[] | EducationItem[]) => void;
}) {
  const [prose, setProse] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const labels: Record<ProseKind, { title: string; placeholder: string }> = {
    experience: {
      title: "Add experience from prose",
      placeholder:
        "e.g. Software Engineer Intern at Arrive Logistics, summer 2024 in Austin TX. Migrated three production services from GUI configs to YAML pipelines, eliminating manual setup. Mentored two interns.",
    },
    projects: {
      title: "Add a project from prose",
      placeholder:
        "e.g. ARS – built a graph-similarity engine that mines GitHub repos and scores them against job postings. Next.js + Claude API. Shipped to 80+ users.",
    },
    education: {
      title: "Add education from prose",
      placeholder:
        "e.g. Texas A&M University, BS in Computer Science, expected Dec 2027. College Station, TX.",
    },
  };

  async function submit() {
    if (!prose.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/master/parse-prose", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, prose: prose.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = (data && typeof data === "object" && "error" in data ? String(data.error) : null) || `HTTP ${res.status}`;
        throw new Error(msg);
      }
      onParsed(data.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "parse failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell
      title={labels[kind].title}
      subtitle="Describe what you did in plain prose. Claude turns it into structured items you can edit normally."
      onClose={onClose}
      footer={
        <>
          {error && <span className="mr-auto text-body-sm text-error">{error}</span>}
          <button onClick={onClose} className={smallBtnCls} disabled={busy}>
            Cancel
          </button>
          <button onClick={submit} disabled={busy || !prose.trim()} className={primaryBtnCls}>
            {busy ? "Parsing…" : "Add"}
          </button>
        </>
      }
    >
      <textarea
        autoFocus
        value={prose}
        onChange={(e) => setProse(e.target.value)}
        placeholder={labels[kind].placeholder}
        rows={10}
        className="w-full resize-none rounded-lg border border-outline-variant bg-surface p-3 text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none"
      />
      <p className="mt-2 text-body-sm text-on-surface-variant">
        Tip: include dates and your role/title explicitly so Claude doesn&apos;t have to guess. Bullets and metrics come straight from what you write — anything not in the prose stays empty.
      </p>
    </ModalShell>
  );
}

// -- Import-resume modal -------------------------------------------------

type ImportMode = "paste" | "upload";

async function extractPdfText(file: File): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const out: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((it) => ("str" in it ? (it as { str: string }).str : ""))
      .join(" ");
    out.push(text);
  }
  return out.join("\n\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function ImportResumeModal({
  hasExistingContent,
  onClose,
  onImported,
}: {
  hasExistingContent: boolean;
  onClose: () => void;
  onImported: (content: Resume) => void;
}) {
  const [mode, setMode] = useState<ImportMode>("paste");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfStatus, setPdfStatus] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handlePdf(file: File) {
    setError(null);
    setPdfStatus(`Extracting "${file.name}"…`);
    try {
      const extracted = await extractPdfText(file);
      if (!extracted) throw new Error("No text found in the PDF — is it a scanned image rather than a text PDF?");
      setText(extracted);
      setPdfStatus(`Extracted ${extracted.length.toLocaleString()} chars from "${file.name}". Review below, then Import.`);
    } catch (e) {
      setPdfStatus("");
      setError(e instanceof Error ? e.message : "PDF parse failed");
    }
  }

  async function submit() {
    if (!text.trim()) return;
    if (hasExistingContent && !window.confirm("This will replace your current master resume. Continue?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/master/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: text.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = (data && typeof data === "object" && "error" in data ? String(data.error) : null) || `HTTP ${res.status}`;
        throw new Error(msg);
      }
      onImported(data.content);
    } catch (e) {
      setError(e instanceof Error ? e.message : "import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell
      title="Import resume"
      subtitle="Upload a PDF or paste resume text. Claude extracts the structure."
      onClose={onClose}
      footer={
        <>
          {error && <span className="mr-auto text-body-sm text-error">{error}</span>}
          <button onClick={onClose} className={smallBtnCls} disabled={busy}>
            Cancel
          </button>
          <button onClick={submit} disabled={busy || !text.trim()} className={primaryBtnCls}>
            {busy ? "Importing…" : "Import"}
          </button>
        </>
      }
    >
      <div className="mb-3 flex gap-2">
        <button
          onClick={() => setMode("paste")}
          className={`rounded-lg px-3 py-1 text-label-md font-label-md ${mode === "paste" ? "bg-primary text-on-primary" : "border border-outline-variant text-on-surface-variant"}`}
        >
          Paste text
        </button>
        <button
          onClick={() => setMode("upload")}
          className={`rounded-lg px-3 py-1 text-label-md font-label-md ${mode === "upload" ? "bg-primary text-on-primary" : "border border-outline-variant text-on-surface-variant"}`}
        >
          Upload PDF
        </button>
      </div>

      {mode === "upload" && (
        <div className="mb-3 rounded-lg border border-dashed border-outline-variant p-4 text-center text-body-md text-on-surface-variant bg-surface">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handlePdf(f);
            }}
          />
          <button onClick={() => fileInputRef.current?.click()} className={smallBtnCls}>
            Choose a PDF
          </button>
          {pdfStatus && <div className="mt-2 text-body-sm text-on-surface-variant">{pdfStatus}</div>}
          <p className="mt-3 text-body-sm text-on-surface-variant">
            Text PDFs only — scanned image PDFs won&apos;t produce extractable text.
          </p>
        </div>
      )}

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={
          mode === "paste"
            ? "Paste the full text of your resume here — sections, dates, bullets, all of it. Whitespace doesn't have to be perfect."
            : "Extracted text will appear here. You can edit before importing."
        }
        rows={14}
        className="w-full resize-none rounded-lg border border-outline-variant bg-surface p-3 font-mono text-body-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
      />
      <p className="mt-2 text-body-sm text-on-surface-variant">
        Claude is told to be faithful to your input — it won&apos;t invent dates or metrics. You can still edit everything after import.
      </p>
    </ModalShell>
  );
}
