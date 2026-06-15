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

const inputCls =
  "w-full rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm shadow-sm focus:border-neutral-500 focus:outline-none";
const smallBtnCls =
  "rounded border border-neutral-300 bg-white px-2 py-0.5 text-xs text-neutral-700 hover:bg-neutral-100 disabled:opacity-40";
const primaryBtnCls =
  "rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-800 disabled:opacity-40";
const dangerBtnCls =
  "rounded border border-neutral-300 bg-white px-2 py-0.5 text-xs text-red-600 hover:bg-red-50";

export default function MasterPage() {
  const [resume, setResume] = useState<Resume | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [showJson, setShowJson] = useState(false);
  const [jsonText, setJsonText] = useState("");
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

  useEffect(() => {
    fetch("/api/master").then((r) => r.json()).then((d) => {
      // Reconstruct real resume from redacted content + piiMap (PRE-54).
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

  // Append items parsed from prose into the targeted section. Items come
  // from /api/master/parse-prose already shaped for the section's kind.
  function appendItemsToSection(sectionIdx: number, items: ExperienceItem[] | ProjectItem[] | EducationItem[]) {
    setResume((r) => {
      if (!r) return r;
      const sections = r.sections.map((s, i) => {
        if (i !== sectionIdx) return s;
        // Type-safe widening: items are guaranteed to match the section's kind
        // because the caller pulled `kind` from the same section.
        if (s.kind === "experience") return { ...s, items: [...s.items, ...(items as ExperienceItem[])] };
        if (s.kind === "projects") return { ...s, items: [...s.items, ...(items as ProjectItem[])] };
        if (s.kind === "education") return { ...s, items: [...s.items, ...(items as EducationItem[])] };
        return s;
      });
      return { ...r, sections };
    });
    setStatus({ kind: "ok", msg: `Added ${items.length} item${items.length === 1 ? "" : "s"} from prose — review and Save.` });
  }

  // Replace the entire resume with imported content. Caller confirms if the
  // current resume is non-empty.
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
      const payload = showJson ? JSON.parse(jsonText) : resume;
      const res = await fetch("/api/master", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: payload }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      // Inject PII from returned piiMap so UI shows real data (PRE-54).
      const savedMap = data.piiMap as RedactionMap | null;
      const savedContent = savedMap ? injectResume(data.content, savedMap) : data.content;
      setPiiMap(savedMap);
      setResume(savedContent);
      setUpdatedAt(data.updatedAt ?? null);
      setJsonText(JSON.stringify(savedContent, null, 2));
      setShowField({});
      setStatus({ kind: "ok", msg: "Saved" });
    } catch (e) {
      setStatus({ kind: "err", msg: e instanceof Error ? e.message : "save failed" });
    } finally {
      setSaving(false);
    }
  }

  function toggleJson() {
    if (showJson) {
      // Returning to structured view — apply textbox changes to state if valid.
      try {
        const parsed = JSON.parse(jsonText);
        setResume(parsed);
        // Clear piiMap so ContactBlock doesn't mask edited JSON.
        setPiiMap(null);
        setShowField({});
        setStatus({ kind: "ok", msg: "Switched to structured view. Save to re-redact PII." });
      } catch {
        setStatus({ kind: "err", msg: "JSON is invalid — fix or revert before switching back." });
        return;
      }
    } else {
      setJsonText(JSON.stringify(resume, null, 2));
    }
    setShowJson(!showJson);
  }

  if (!resume) {
    return <main className="mx-auto max-w-4xl px-6 py-8 text-sm text-neutral-500">Loading…</main>;
  }

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Master resume</h1>
        <div className="flex items-center gap-3">
          {status.msg && (
            <span className={`text-xs ${status.kind === "err" ? "text-red-600" : "text-neutral-500"}`}>
              {status.msg}
            </span>
          )}
          <button onClick={() => setShowImport(true)} className={smallBtnCls} title="Upload a PDF or paste resume text — Claude extracts the structure">
            Import from PDF / text
          </button>
          <button onClick={toggleJson} className={smallBtnCls}>
            {showJson ? "Structured view" : "JSON view"}
          </button>
          <button onClick={save} disabled={saving} className={primaryBtnCls}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
      <p className="mt-2 text-sm text-neutral-600">
        This is the only source of truth. Dump every job, project, and side-gig here, even ones outside your current target role. The tailor step picks what fits each JD.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_520px]">
        <div>
          {showJson ? (
            <textarea
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              spellCheck={false}
              rows={30}
              className="w-full rounded-md border border-neutral-300 bg-white p-3 font-mono text-xs shadow-sm focus:border-neutral-500 focus:outline-none"
            />
          ) : (
            <div className="space-y-6">
              <ContactBlock contact={resume.contact} onChange={updateContact} piiMap={piiMap} showField={showField} onToggleField={(field) => setShowField((s) => ({ ...s, [field]: !s[field] }))} />

              {resume.sections.map((section, idx) => {
                const proseKind =
                  section.kind === "experience" || section.kind === "projects" || section.kind === "education"
                    ? (section.kind as ProseKind)
                    : null;
                return (
                  <SectionBlock
                    key={section.id}
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
                );
              })}

              <AddSectionMenu existing={resume.sections.map((s) => s.kind)} onAdd={addSection} />
            </div>
          )}
        </div>

        <PreviewPane updatedAt={updatedAt} />
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
    </main>
  );
}

// -- Preview --------------------------------------------------------------

function PreviewPane({ updatedAt }: { updatedAt: string | null }) {
  const version = updatedAt ? new Date(updatedAt).getTime() : 0;
  const pdfSrc = `/api/master/pdf?v=${version}`;
  return (
    <aside className="lg:sticky lg:top-8 lg:self-start">
      <div className="rounded-lg border border-neutral-200 bg-white shadow-sm">
        <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Preview
          </h2>
          <a
            href="/api/master/tex"
            download
            className="rounded border border-neutral-300 bg-white px-2 py-0.5 text-xs text-neutral-700 hover:bg-neutral-100"
          >
            Download .tex
          </a>
        </header>
        {updatedAt ? (
          <iframe
            key={version}
            src={pdfSrc}
            title="Master resume PDF preview"
            className="block h-[calc(100vh-180px)] min-h-[600px] w-full rounded-b-lg bg-neutral-50"
          />
        ) : (
          <div className="px-4 py-8 text-center text-xs text-neutral-500">Loading…</div>
        )}
        <p className="border-t border-neutral-200 px-4 py-2 text-[11px] text-neutral-500">
          Requires the compile-service running at <code>COMPILE_SERVICE_URL</code>. Refreshes after each Save.
        </p>
      </div>
    </aside>
  );
}

// -- Contact --------------------------------------------------------------

function ContactBlock({
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

  // Mask a PII field value for display (PRE-54).
  const mask = (field: string, real: string) => {
    if (!piiMap) return real;
    if (showField[field]) return real;
    // Show placeholder based on field type.
    if (field === "name") return "[NAME]";
    if (field === "phone") return "[PHONE]";
    if (field === "email") return "[EMAIL]";
    return real;
  };

  // Auto-unmask when user focuses a masked field so they edit real data.
  const handleFocus = (field: string, real: string, onChangeFn: (value: string) => void) => {
    if (piiMap && !showField[field]) {
      onToggleField(field);
      // Replace the placeholder with real value so user edits real data.
      onChangeFn(real);
    }
  };

  const toggleBtnCls = "rounded border border-neutral-300 bg-white px-1.5 py-0.5 text-[10px] text-neutral-500 hover:bg-neutral-100";

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Contact</h2>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Labeled label="Name">
          <div className="flex gap-1">
            <input
              className={inputCls}
              value={mask("name", contact.name)}
              onFocus={() => handleFocus("name", contact.name, (v) => onChange({ name: v }))}
              onChange={(e) => onChange({ name: e.target.value })}
            />
            {piiMap && (
              <button type="button" onClick={() => onToggleField("name")} className={toggleBtnCls} title="Show/hide">
                {showField.name ? "👁" : "👁‍🗨"}
              </button>
            )}
          </div>
        </Labeled>
        <Labeled label="Phone">
          <div className="flex gap-1">
            <input
              className={inputCls}
              value={mask("phone", contact.phone ?? "")}
              onFocus={() => handleFocus("phone", contact.phone ?? "", (v) => onChange({ phone: v }))}
              onChange={(e) => onChange({ phone: e.target.value })}
            />
            {piiMap && (
              <button type="button" onClick={() => onToggleField("phone")} className={toggleBtnCls} title="Show/hide">
                {showField.phone ? "👁" : "👁‍🗨"}
              </button>
            )}
          </div>
        </Labeled>
        <Labeled label="Email" wide>
          <div className="flex gap-1">
            <input
              className={inputCls}
              value={mask("email", contact.email ?? "")}
              onFocus={() => handleFocus("email", contact.email ?? "", (v) => onChange({ email: v }))}
              onChange={(e) => onChange({ email: e.target.value })}
            />
            {piiMap && (
              <button type="button" onClick={() => onToggleField("email")} className={toggleBtnCls} title="Show/hide">
                {showField.email ? "👁" : "👁‍🗨"}
              </button>
            )}
          </div>
        </Labeled>
      </div>
      <div className="mt-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">Links</span>
          <button
            onClick={() => setLinks([...links, { label: "", href: "" }])}
            className={smallBtnCls}
          >
            + Add link
          </button>
        </div>
        <div className="mt-2 space-y-2">
          {links.map((l, i) => (
            <div key={i} className="flex gap-2">
              <input
                className={`${inputCls} sm:max-w-[180px]`}
                placeholder="Label (e.g. GitHub)"
                value={l.label}
                onChange={(e) =>
                  setLinks(links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                }
              />
              <input
                className={inputCls}
                placeholder="https://…"
                value={l.href}
                onChange={(e) =>
                  setLinks(links.map((x, j) => (j === i ? { ...x, href: e.target.value } : x)))
                }
              />
              <button
                onClick={() => setLinks(links.filter((_, j) => j !== i))}
                className={dangerBtnCls}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Labeled({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`flex flex-col gap-1 text-xs text-neutral-600 ${wide ? "sm:col-span-2" : ""}`}>
      <span className="font-medium uppercase tracking-wide">{label}</span>
      {children}
    </label>
  );
}

// -- Section --------------------------------------------------------------

function SectionBlock({
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
  const itemCount = section.items.length;
  return (
    <section className="rounded-lg border border-neutral-200 bg-white shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3">
        <div className="flex flex-1 items-center gap-3">
          <button onClick={onToggleCollapse} className="text-xs text-neutral-500 hover:text-neutral-800" aria-label="Toggle">
            {collapsed ? "▸" : "▾"}
          </button>
          <input
            className={`${inputCls} max-w-xs font-medium`}
            value={section.title}
            onChange={(e) => onChange({ ...section, title: e.target.value })}
          />
          <span className="text-xs text-neutral-500">
            {itemCount} {itemCount === 1 ? "item" : "items"} · {section.kind}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onMoveUp} disabled={isFirst} className={smallBtnCls} aria-label="Move up">↑</button>
          <button onClick={onMoveDown} disabled={isLast} className={smallBtnCls} aria-label="Move down">↓</button>
        </div>
      </header>
      {!collapsed && (
        <div className="space-y-4 p-4">
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
    <div className="flex gap-2 pt-2">
      <button onClick={onAdd} className={smallBtnCls}>
        + Add {label}
      </button>
      {onAddFromProse && (
        <button onClick={onAddFromProse} className={smallBtnCls} title="Describe in prose and let Claude parse it">
          ✎ Add from prose
        </button>
      )}
    </div>
  );
}

// -- Experience ----------------------------------------------------------

function ExpSectionBody({ section, onChange, onAddFromProse }: { section: ExpSection; onChange: (s: Section) => void; onAddFromProse?: () => void }) {
  const setItems = (items: ExperienceItem[]) => onChange({ ...section, items });
  return (
    <>
      {section.items.map((it, i) => (
        <ItemFrame
          key={it.id}
          onMoveUp={() => setItems(moveInArray(section.items, i, -1))}
          onMoveDown={() => setItems(moveInArray(section.items, i, 1))}
          onDelete={() => setItems(section.items.filter((_, j) => j !== i))}
          isFirst={i === 0}
          isLast={i === section.items.length - 1}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Labeled label="Title">
              <input className={inputCls} value={it.title}
                onChange={(e) => setItems(section.items.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} />
            </Labeled>
            <Labeled label="Organization">
              <input className={inputCls} value={it.org}
                onChange={(e) => setItems(section.items.map((x, j) => j === i ? { ...x, org: e.target.value } : x))} />
            </Labeled>
            <Labeled label="Location">
              <input className={inputCls} value={it.location ?? ""}
                onChange={(e) => setItems(section.items.map((x, j) => j === i ? { ...x, location: e.target.value } : x))} />
            </Labeled>
            <div className="grid grid-cols-2 gap-3">
              <Labeled label="Start">
                <input className={inputCls} placeholder="May 2024" value={it.start ?? ""}
                  onChange={(e) => setItems(section.items.map((x, j) => j === i ? { ...x, start: e.target.value } : x))} />
              </Labeled>
              <Labeled label="End">
                <input className={inputCls} placeholder="Present" value={it.end ?? ""}
                  onChange={(e) => setItems(section.items.map((x, j) => j === i ? { ...x, end: e.target.value } : x))} />
              </Labeled>
            </div>
          </div>
          <BulletList
            bullets={it.bullets}
            onChange={(bs) => setItems(section.items.map((x, j) => j === i ? { ...x, bullets: bs } : x))}
          />
          <NotesInput
            value={it.notes ?? ""}
            onChange={(v) => setItems(section.items.map((x, j) => j === i ? { ...x, notes: v } : x))}
          />
          <TagsInput
            tags={it.tags ?? []}
            onChange={(tags) => setItems(section.items.map((x, j) => j === i ? { ...x, tags } : x))}
          />
        </ItemFrame>
      ))}
      <SectionFooter label="experience" onAdd={() => setItems([...section.items, newExp()])} onAddFromProse={onAddFromProse} />
    </>
  );
}

// -- Projects ------------------------------------------------------------

function ProjSectionBody({ section, onChange, onAddFromProse }: { section: ProjSection; onChange: (s: Section) => void; onAddFromProse?: () => void }) {
  const setItems = (items: ProjectItem[]) => onChange({ ...section, items });
  return (
    <>
      {section.items.map((it, i) => (
        <ItemFrame
          key={it.id}
          onMoveUp={() => setItems(moveInArray(section.items, i, -1))}
          onMoveDown={() => setItems(moveInArray(section.items, i, 1))}
          onDelete={() => setItems(section.items.filter((_, j) => j !== i))}
          isFirst={i === 0}
          isLast={i === section.items.length - 1}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Labeled label="Name">
              <input className={inputCls} value={it.name}
                onChange={(e) => setItems(section.items.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
            </Labeled>
            <Labeled label="Stack">
              <input className={inputCls} placeholder="Python, FastAPI, Postgres" value={it.stack ?? ""}
                onChange={(e) => setItems(section.items.map((x, j) => j === i ? { ...x, stack: e.target.value } : x))} />
            </Labeled>
            <div className="grid grid-cols-2 gap-3 sm:col-span-2">
              <Labeled label="Start">
                <input className={inputCls} value={it.start ?? ""}
                  onChange={(e) => setItems(section.items.map((x, j) => j === i ? { ...x, start: e.target.value } : x))} />
              </Labeled>
              <Labeled label="End">
                <input className={inputCls} value={it.end ?? ""}
                  onChange={(e) => setItems(section.items.map((x, j) => j === i ? { ...x, end: e.target.value } : x))} />
              </Labeled>
            </div>
          </div>
          <BulletList
            bullets={it.bullets}
            onChange={(bs) => setItems(section.items.map((x, j) => j === i ? { ...x, bullets: bs } : x))}
          />
          <NotesInput
            value={it.notes ?? ""}
            onChange={(v) => setItems(section.items.map((x, j) => j === i ? { ...x, notes: v } : x))}
          />
          <TagsInput
            tags={it.tags ?? []}
            onChange={(tags) => setItems(section.items.map((x, j) => j === i ? { ...x, tags } : x))}
          />
        </ItemFrame>
      ))}
      <SectionFooter label="project" onAdd={() => setItems([...section.items, newProj()])} onAddFromProse={onAddFromProse} />
    </>
  );
}

// -- Education -----------------------------------------------------------

function EduSectionBody({ section, onChange, onAddFromProse }: { section: EduSection; onChange: (s: Section) => void; onAddFromProse?: () => void }) {
  const setItems = (items: EducationItem[]) => onChange({ ...section, items });
  return (
    <>
      {section.items.map((it, i) => (
        <ItemFrame
          key={it.id}
          onMoveUp={() => setItems(moveInArray(section.items, i, -1))}
          onMoveDown={() => setItems(moveInArray(section.items, i, 1))}
          onDelete={() => setItems(section.items.filter((_, j) => j !== i))}
          isFirst={i === 0}
          isLast={i === section.items.length - 1}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Labeled label="School">
              <input className={inputCls} value={it.school}
                onChange={(e) => setItems(section.items.map((x, j) => j === i ? { ...x, school: e.target.value } : x))} />
            </Labeled>
            <Labeled label="Degree">
              <input className={inputCls} value={it.degree ?? ""}
                onChange={(e) => setItems(section.items.map((x, j) => j === i ? { ...x, degree: e.target.value } : x))} />
            </Labeled>
            <Labeled label="Location">
              <input className={inputCls} value={it.location ?? ""}
                onChange={(e) => setItems(section.items.map((x, j) => j === i ? { ...x, location: e.target.value } : x))} />
            </Labeled>
            <div className="grid grid-cols-2 gap-3">
              <Labeled label="Start">
                <input className={inputCls} value={it.start ?? ""}
                  onChange={(e) => setItems(section.items.map((x, j) => j === i ? { ...x, start: e.target.value } : x))} />
              </Labeled>
              <Labeled label="End">
                <input className={inputCls} value={it.end ?? ""}
                  onChange={(e) => setItems(section.items.map((x, j) => j === i ? { ...x, end: e.target.value } : x))} />
              </Labeled>
            </div>
          </div>
          <BulletList
            bullets={it.bullets}
            onChange={(bs) => setItems(section.items.map((x, j) => j === i ? { ...x, bullets: bs } : x))}
          />
          <TagsInput
            tags={it.tags ?? []}
            onChange={(tags) => setItems(section.items.map((x, j) => j === i ? { ...x, tags } : x))}
          />
        </ItemFrame>
      ))}
      <SectionFooter label="education" onAdd={() => setItems([...section.items, newEdu()])} onAddFromProse={onAddFromProse} />
    </>
  );
}

// -- Skills --------------------------------------------------------------

function SkillSectionBody({ section, onChange }: { section: SkillSection; onChange: (s: Section) => void }) {
  const setItems = (items: SkillGroup[]) => onChange({ ...section, items });
  return (
    <>
      {section.items.map((g, i) => (
        <ItemFrame
          key={g.id}
          onMoveUp={() => setItems(moveInArray(section.items, i, -1))}
          onMoveDown={() => setItems(moveInArray(section.items, i, 1))}
          onDelete={() => setItems(section.items.filter((_, j) => j !== i))}
          isFirst={i === 0}
          isLast={i === section.items.length - 1}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Labeled label="Category">
              <input className={inputCls} placeholder="Languages" value={g.category}
                onChange={(e) => setItems(section.items.map((x, j) => j === i ? { ...x, category: e.target.value } : x))} />
            </Labeled>
            <label className="sm:col-span-2 flex flex-col gap-1 text-xs text-neutral-600">
              <span className="font-medium uppercase tracking-wide">Items (comma-separated)</span>
              <input className={inputCls} placeholder="TypeScript, Python, Go" value={g.items}
                onChange={(e) => setItems(section.items.map((x, j) => j === i ? { ...x, items: e.target.value } : x))} />
            </label>
          </div>
        </ItemFrame>
      ))}
      <SectionFooter label="skill group" onAdd={() => setItems([...section.items, newSkill()])} />
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
    <div className="flex items-center gap-2 rounded-md border border-dashed border-neutral-300 bg-white p-3 text-xs">
      <span className="text-neutral-500">Add section:</span>
      {missing.map((k) => (
        <button key={k} onClick={() => onAdd(k)} className={smallBtnCls}>
          + {labelByKind[k]}
        </button>
      ))}
    </div>
  );
}

// -- Achievements --------------------------------------------------------

function AchieveSectionBody({ section, onChange }: { section: AchieveSection; onChange: (s: Section) => void }) {
  const setItems = (items: AchievementItem[]) => onChange({ ...section, items });
  return (
    <>
      {section.items.map((it, i) => (
        <ItemFrame
          key={it.id}
          onMoveUp={() => setItems(moveInArray(section.items, i, -1))}
          onMoveDown={() => setItems(moveInArray(section.items, i, 1))}
          onDelete={() => setItems(section.items.filter((_, j) => j !== i))}
          isFirst={i === 0}
          isLast={i === section.items.length - 1}
        >
          <label className="flex flex-col gap-1 text-xs text-neutral-600">
            <span className="font-medium uppercase tracking-wide">Achievement</span>
            <input
              className={inputCls}
              placeholder="1st Place Overall - TAMUHack 2026 Hackathon (650+ competitors)"
              value={it.text}
              onChange={(e) => setItems(section.items.map((x, j) => j === i ? { ...x, text: e.target.value } : x))}
            />
            <span className="text-[10px] text-neutral-400">
              Use " - " (space-dash-space) to split bold title from detail.
            </span>
          </label>
        </ItemFrame>
      ))}
      <SectionFooter label="achievement" onAdd={() => setItems([...section.items, newAchievement()])} />
    </>
  );
}

// -- Item frame ----------------------------------------------------------

function ItemFrame({
  children, onMoveUp, onMoveDown, onDelete, isFirst, isLast,
}: {
  children: React.ReactNode;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  return (
    <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3">
      <div className="mb-2 flex items-center justify-end gap-1">
        <button onClick={onMoveUp} disabled={isFirst} className={smallBtnCls} aria-label="Move up">↑</button>
        <button onClick={onMoveDown} disabled={isLast} className={smallBtnCls} aria-label="Move down">↓</button>
        <button onClick={onDelete} className={dangerBtnCls}>Delete</button>
      </div>
      <div className="space-y-3">{children}</div>
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
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">Bullets</span>
        <button onClick={() => onChange([...bullets, newBullet()])} className={smallBtnCls}>
          + Add bullet
        </button>
      </div>
      <ul className="mt-2 space-y-2">
        {bullets.map((b, i) => (
          <li key={b.id} className="flex items-start gap-2">
            <textarea
              rows={1}
              className={`${inputCls} flex-1 resize-y`}
              value={b.text}
              onChange={(e) => onChange(bullets.map((x, j) => j === i ? { ...x, text: e.target.value } : x))}
            />
            <div className="flex flex-col gap-1">
              <button
                onClick={() => onChange(moveInArray(bullets, i, -1))}
                disabled={i === 0}
                className={smallBtnCls}
                aria-label="Move up"
              >↑</button>
              <button
                onClick={() => onChange(moveInArray(bullets, i, 1))}
                disabled={i === bullets.length - 1}
                className={smallBtnCls}
                aria-label="Move down"
              >↓</button>
            </div>
            <button
              onClick={() => onChange(bullets.filter((_, j) => j !== i))}
              className={dangerBtnCls}
              aria-label="Delete"
            >×</button>
          </li>
        ))}
      </ul>
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
    <div>
      <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        Tags <span className="font-normal lowercase text-neutral-400">(soft signal for the tailor step — e.g. swe, sales, leadership)</span>
      </span>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {tags.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-neutral-200 px-2 py-0.5 text-xs text-neutral-700">
            {t}
            <button
              onClick={() => onChange(tags.filter((x) => x !== t))}
              className="text-neutral-500 hover:text-red-600"
              aria-label={`Remove ${t}`}
            >×</button>
          </span>
        ))}
        <input
          className={`${inputCls} max-w-[200px]`}
          placeholder="add tag, then enter"
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

function NotesInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="mt-3">
      <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        Notes <span className="font-normal lowercase text-neutral-400">(raw detail for tailoring — metrics, scope, outcomes. Never shown on the resume.)</span>
      </span>
      <textarea
        className={`${inputCls} mt-1 min-h-[80px] w-full resize-y`}
        placeholder="E.g. Built a notification system that handles 10k events/sec, reduced latency from 5s to 300ms, adopted by 3 teams"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
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
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between border-b border-neutral-200 px-5 py-3">
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-neutral-500">{subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="text-sm text-neutral-500 hover:text-neutral-900">
            ✕
          </button>
        </header>
        <div className="flex-1 overflow-auto px-5 py-4">{children}</div>
        <footer className="flex items-center justify-end gap-2 border-t border-neutral-200 px-5 py-3">{footer}</footer>
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
          {error && <span className="mr-auto text-xs text-red-600">{error}</span>}
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
        className="w-full resize-none rounded-md border border-neutral-300 p-3 text-sm focus:border-neutral-500 focus:outline-none"
      />
      <p className="mt-2 text-xs text-neutral-500">
        Tip: include dates and your role/title explicitly so Claude doesn&apos;t have to guess. Bullets and metrics come straight from what you write — anything not in the prose stays empty.
      </p>
    </ModalShell>
  );
}

// -- Import-resume modal -------------------------------------------------

type ImportMode = "paste" | "upload";

async function extractPdfText(file: File): Promise<string> {
  // Dynamic import — pdfjs-dist is ~500kb gzipped, no reason to ship it on
  // every /master visit. CDN worker keeps the Next bundle slim and avoids the
  // webpack/Turbopack worker-config dance.
  const pdfjsLib = await import("pdfjs-dist");
  // The CDN URL must match the installed package version exactly.
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
          {error && <span className="mr-auto text-xs text-red-600">{error}</span>}
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
          className={`rounded-md px-3 py-1 text-xs ${mode === "paste" ? "bg-neutral-900 text-white" : "border border-neutral-300"}`}
        >
          Paste text
        </button>
        <button
          onClick={() => setMode("upload")}
          className={`rounded-md px-3 py-1 text-xs ${mode === "upload" ? "bg-neutral-900 text-white" : "border border-neutral-300"}`}
        >
          Upload PDF
        </button>
      </div>

      {mode === "upload" && (
        <div className="mb-3 rounded-md border border-dashed border-neutral-300 p-4 text-center text-sm text-neutral-600">
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
          {pdfStatus && <div className="mt-2 text-xs text-neutral-500">{pdfStatus}</div>}
          <p className="mt-3 text-xs text-neutral-500">
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
        className="w-full resize-none rounded-md border border-neutral-300 p-3 font-mono text-xs focus:border-neutral-500 focus:outline-none"
      />
      <p className="mt-2 text-xs text-neutral-500">
        Claude is told to be faithful to your input — it won&apos;t invent dates or metrics. You can still edit everything after import.
      </p>
    </ModalShell>
  );
}
