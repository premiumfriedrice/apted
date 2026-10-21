// Shared pipeline UI — the tracker status board.
//
// One framework-free module mounted into BOTH surfaces:
//   - the side panel (light DOM, sidepanel.html)
//   - the drawer's shadow DOM (tracker-drawer.ts)
//
// It never touches the network: hosts pass an `actions` object whose methods
// message the service worker (chrome.runtime.sendMessage), which owns every
// fetch. Inject `pipelineStyles()` into the same root (document or shadow
// root) before rendering.

export type Outcome =
  | "draft"
  | "applied"
  | "ghosted"
  | "interviewing"
  | "rejected"
  | "offer"
  | "declined";

// Same vocabulary as the web app's OUTCOMES (src/lib/applications.ts).
export const PIPELINE_OUTCOMES: Outcome[] = [
  "draft",
  "applied",
  "interviewing",
  "offer",
  "rejected",
  "ghosted",
  "declined",
];

export type PipelineApplication = {
  id: string;
  company: string;
  role: string;
  outcome: Outcome;
  interviewRound: number | null;
  portalUrl: string | null;
  createdAt: string;
};

export type PipelineSuggestion = {
  id: string;
  source: "gmail" | "capture";
  company: string;
  role: string;
  subject: string;
  suggestedOutcome: Outcome | null;
  interviewRound?: number | null;
  createdAt: string;
};

export type PipelineState = {
  status: "ready" | "signed-out" | "offline" | "error";
  applications: PipelineApplication[];
  suggestions: PipelineSuggestion[];
  queued: number;
  updatedAt: string | null;
};

export type PipelineActions = {
  /** Signed-out Connect CTA — host opens {API_BASE}/connect. */
  onConnect: () => void;
  /** Offline/error retry — host asks the SW to re-sync. */
  onRetry: () => void;
  /**
   * Optimistic outcome change. Resolve true when the PATCH succeeded, false
   * (or reject) to roll the card back to its previous outcome.
   */
  onOutcomeChange: (app: PipelineApplication, outcome: Outcome) => Promise<boolean>;
  onApplySuggestion: (s: PipelineSuggestion) => Promise<boolean>;
  onDismissSuggestion: (s: PipelineSuggestion) => void;
};

// ── Pure helpers ────────────────────────────────────────────────────────────

export function relativeDate(iso: string, now: number = Date.now()): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "";
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export type PipelineGroup = {
  key: "suggestions" | "applied" | "interviewing" | "offer" | "closed" | "drafts";
  label: string;
  collapsible: boolean;
  apps: PipelineApplication[];
};

const OPEN_GROUPS: { key: PipelineGroup["key"]; outcome: Outcome }[] = [
  { key: "applied", outcome: "applied" },
  { key: "interviewing", outcome: "interviewing" },
  { key: "offer", outcome: "offer" },
];

const CLOSED_OUTCOMES: Outcome[] = ["rejected", "ghosted", "declined"];

export function groupApplications(apps: PipelineApplication[]): PipelineGroup[] {
  const byAge = (a: PipelineApplication, b: PipelineApplication) =>
    Date.parse(b.createdAt) - Date.parse(a.createdAt);
  const groups: PipelineGroup[] = [];
  for (const g of OPEN_GROUPS) {
    const members = apps.filter((a) => a.outcome === g.outcome).sort(byAge);
    groups.push({
      key: g.key,
      label: g.key === "interviewing" ? "Interviewing" : g.key === "offer" ? "Offer" : "Applied",
      collapsible: false,
      apps: members,
    });
  }
  const drafts = apps.filter((a) => a.outcome === "draft").sort(byAge);
  if (drafts.length) {
    groups.push({ key: "drafts", label: "Drafts", collapsible: true, apps: drafts });
  }
  const closed = apps
    .filter((a) => CLOSED_OUTCOMES.includes(a.outcome))
    .sort(byAge);
  groups.push({ key: "closed", label: "Closed", collapsible: true, apps: closed });
  return groups;
}

function roundBadge(app: PipelineApplication): string | null {
  if (app.outcome === "interviewing" && app.interviewRound && app.interviewRound > 0) {
    return `R${app.interviewRound}`;
  }
  if (app.outcome === "rejected" && app.interviewRound && app.interviewRound > 0) {
    return `R${app.interviewRound}`;
  }
  return null;
}

// ── Styles ───────────────────────────────────────────────────────────────────

export function pipelineStyles(): string {
  return /* css */ `
.apted-pl {
  --pl-border: #e5e5e5;
  --pl-text: #171717;
  --pl-muted: #737373;
  --pl-panel: #ffffff;
  --pl-panel-2: #f5f5f5;
  --pl-accent: #2563eb;
  --pl-accent-fg: #ffffff;
  --pl-danger: #dc2626;
  --pl-ok: #16a34a;
  font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", system-ui, sans-serif;
  color: var(--pl-text);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.apted-pl * { box-sizing: border-box; }
.apted-pl h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--pl-muted); font-weight: 600; margin: 0; }
.apted-pl-banner {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px; border-radius: 8px;
  border: 1px solid var(--pl-border); background: var(--pl-panel-2);
  font-size: 12px; color: var(--pl-muted);
}
.apted-pl-banner--error { border-color: var(--pl-danger); color: var(--pl-danger); }
.apted-pl-banner .apted-pl-spacer { flex: 1; }
.apted-pl-connect {
  display: flex; flex-direction: column; gap: 10px; align-items: center;
  padding: 32px 16px; border-radius: 8px; border: 1px solid var(--pl-border);
  background: var(--pl-panel); text-align: center;
}
.apted-pl-connect p { margin: 0; color: var(--pl-muted); font-size: 12px; }
.apted-pl-btn {
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid var(--pl-border); border-radius: 6px;
  background: var(--pl-panel); color: var(--pl-text);
  padding: 6px 12px; font-size: 12px; font-weight: 500; cursor: pointer;
}
.apted-pl-btn:hover:not(:disabled) { background: var(--pl-panel-2); }
.apted-pl-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.apted-pl-btn--primary { background: var(--pl-accent); border-color: var(--pl-accent); color: var(--pl-accent-fg); }
.apted-pl-btn--primary:hover:not(:disabled) { filter: brightness(1.05); }
.apted-pl-group { display: flex; flex-direction: column; gap: 8px; }
.apted-pl-group-head {
  display: flex; align-items: center; gap: 8px; cursor: pointer;
  background: none; border: none; padding: 2px 0; text-align: left; width: 100%;
}
.apted-pl-count {
  font-size: 10px; font-weight: 600; color: var(--pl-muted);
  background: var(--pl-panel-2); border-radius: 8px; padding: 1px 7px;
}
.apted-pl-spacer { flex: 1; }
.apted-pl-caret { color: var(--pl-muted); transition: transform 0.15s ease; }
.apted-pl-group[hidden], .apted-pl-group .apted-pl-list[hidden] { display: none; }
.apted-pl-list { display: flex; flex-direction: column; gap: 6px; }
.apted-pl-app {
  display: flex; align-items: center; gap: 8px;
  border: 1px solid var(--pl-border); border-radius: 8px;
  background: var(--pl-panel); padding: 10px 12px;
}
.apted-pl-app-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.apted-pl-app-title {
  font-size: 13px; font-weight: 500; color: var(--pl-text);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.apted-pl-app-sub { font-size: 11px; color: var(--pl-muted); }
.apted-pl-round {
  flex-shrink: 0; font-size: 9px; font-weight: 700; color: var(--pl-accent);
  border: 1px solid var(--pl-accent); border-radius: 4px; padding: 1px 5px;
}
.apted-pl-select {
  flex-shrink: 0; border: 1px solid var(--pl-border); border-radius: 6px;
  background: var(--pl-panel); color: var(--pl-text);
  font-size: 11px; padding: 4px 6px; max-width: 96px; cursor: pointer;
}
.apted-pl-portal {
  flex-shrink: 0; color: var(--pl-muted); text-decoration: none;
  font-size: 11px; padding: 2px;
}
.apted-pl-portal:hover { color: var(--pl-accent); }
.apted-pl-suggestion {
  display: flex; flex-direction: column; gap: 8px;
  border: 1px solid var(--pl-border); border-radius: 8px;
  background: var(--pl-panel); padding: 10px 12px;
}
.apted-pl-suggestion-head { font-size: 11px; color: var(--pl-muted); display: flex; gap: 6px; align-items: center; }
.apted-pl-suggestion-title { font-size: 13px; font-weight: 500; }
.apted-pl-suggestion-sub { font-size: 11px; color: var(--pl-muted); }
.apted-pl-suggestion-actions { display: flex; gap: 8px; align-items: center; }
.apted-pl-teaser {
  display: flex; align-items: center; gap: 10px;
  border: 1px dashed var(--pl-border); border-radius: 8px;
  padding: 10px 12px; background: transparent;
}
.apted-pl-teaser-main { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.apted-pl-teaser-title { font-size: 12px; font-weight: 500; color: var(--pl-muted); }
.apted-pl-teaser-sub { font-size: 11px; color: var(--pl-muted); opacity: 0.75; }
.apted-pl-empty {
  display: flex; flex-direction: column; gap: 8px; align-items: center;
  padding: 28px 16px; text-align: center; color: var(--pl-muted); font-size: 12px;
}
.apted-pl-updated { font-size: 10px; color: var(--pl-muted); }
.apted-pl-queued { font-size: 10px; color: #9a5300; }
`;
}

// ── Render ───────────────────────────────────────────────────────────────────

function h(tag: string, attrs: Record<string, string | null>, ...children: (Node | string | null)[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else el.setAttribute(k, v);
  }
  for (const c of children) {
    if (c === null || c === undefined) continue;
    el.append(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return el;
}

/**
 * Mount (or re-mount) the pipeline board into `el`. Idempotent: clears the
 * container first. Hosts call this whenever tracker state changes.
 */
export function renderPipeline(
  el: HTMLElement,
  state: PipelineState,
  actions: PipelineActions,
): void {
  el.textContent = "";

  const root = h("div", { class: "apted-pl" });
  el.append(root);

  if (state.status === "signed-out") {
    root.append(
      h(
        "div",
        { class: "apted-pl-connect" },
        h("h3", { text: "apted Tracker" }),
        h(
          "p",
          { text: "Connect your apted account to log applications automatically and sync your pipeline." },
        ),
        h("button", { class: "apted-pl-btn apted-pl-btn--primary", text: "Connect apted" })
      ),
    );
    const btn = root.querySelector<HTMLButtonElement>(".apted-pl-btn--primary");
    btn?.addEventListener("click", () => actions.onConnect());
    root.append(teaserCard());
    return;
  }

  if (state.status === "offline" || state.status === "error") {
    const banner = h(
      "div",
      { class: "apted-pl-banner" + (state.status === "error" ? " apted-pl-banner--error" : "") },
      h("span", {
        text:
          state.status === "error"
            ? "Couldn't reach apted — showing cached pipeline."
            : "Offline — showing cached pipeline.",
      }),
      state.queued > 0 ? h("span", { class: "apted-pl-queued", text: `${state.queued} queued` }) : null,
      h("span", { class: "apted-pl-spacer" }),
      h("button", { class: "apted-pl-btn", text: "Retry" }),
    );
    banner.querySelector("button")?.addEventListener("click", () => actions.onRetry());
    root.append(banner);
  }

  // Suggestions pinned to the top.
  for (const s of state.suggestions) {
    root.append(suggestionCard(s, actions));
  }

  const groups = groupApplications(state.applications);
  const hasApps = groups.some((g) => g.apps.length);

  if (!hasApps && !state.suggestions.length) {
    root.append(
      h(
        "div",
        { class: "apted-pl-empty" },
        h("h3", { text: "No applications yet" }),
        h(
          "p",
          {
            text:
              "Apply on a supported job board (Greenhouse, Lever, Workday, Ashby, LinkedIn) and apted logs it automatically.",
          },
        ),
      ),
    );
  }

  for (const g of groups) {
    if (!g.apps.length) continue;
    const list = h("div", { class: "apted-pl-list" });
    for (const app of g.apps) list.append(appCard(app, actions));
    const groupEl = h(
      "div",
      { class: "apted-pl-group" },
      h(
        "button",
        { class: "apted-pl-group-head", type: "button" },
        h("span", { class: "apted-pl-caret", text: g.collapsible ? "▸" : "" }),
        h("h3", { text: g.label }),
        h("span", { class: "apted-pl-count", text: String(g.apps.length) }),
      ),
      list,
    );
    if (g.collapsible) {
      list.hidden = true;
      const head = groupEl.querySelector<HTMLButtonElement>(".apted-pl-group-head");
      const caret = groupEl.querySelector<HTMLElement>(".apted-pl-caret");
      head?.addEventListener("click", () => {
        list.hidden = !list.hidden;
        if (caret) caret.textContent = list.hidden ? "▸" : "▾";
      });
    }
    root.append(groupEl);
  }

  if (state.updatedAt) {
    root.append(
      h("span", { class: "apted-pl-updated", text: `Synced ${relativeDate(state.updatedAt)}` }),
    );
  }
  root.append(teaserCard());
}

function appCard(app: PipelineApplication, actions: PipelineActions): HTMLElement {
  const badge = roundBadge(app);
  const card = h(
    "div",
    { class: "apted-pl-app" },
    h(
      "div",
      { class: "apted-pl-app-main" },
      h("span", { class: "apted-pl-app-title", text: `${app.company} · ${app.role}` }),
      h("span", { class: "apted-pl-app-sub", text: relativeDate(app.createdAt) }),
    ),
    badge ? h("span", { class: "apted-pl-round", text: badge }) : null,
    app.portalUrl
      ? h("a", { class: "apted-pl-portal", href: app.portalUrl, target: "_blank", rel: "noreferrer", title: "Open application portal", text: "↗" })
      : null,
  );

  const select = h(
    "select",
    { class: "apted-pl-select", title: "Outcome" },
    ...PIPELINE_OUTCOMES.map((o) => {
      const opt = document.createElement("option");
      opt.value = o;
      opt.textContent = o;
      if (o === app.outcome) opt.selected = true;
      return opt;
    }),
  ) as HTMLSelectElement;

  // Optimistic outcome change: flip immediately, PATCH via the host's action,
  // roll the select back if the action reports failure.
  select.addEventListener("change", () => {
    const next = select.value as Outcome;
    const prev = app.outcome;
    select.disabled = true;
    void actions
      .onOutcomeChange({ ...app, outcome: next }, next)
      .then((ok) => {
        if (!ok) select.value = prev;
      })
      .catch(() => {
        select.value = prev;
      })
      .finally(() => {
        select.disabled = false;
      });
  });
  card.append(select);
  return card;
}

function suggestionCard(s: PipelineSuggestion, actions: PipelineActions): HTMLElement {
  const card = h(
    "div",
    { class: "apted-pl-suggestion" },
    h(
      "div",
      { class: "apted-pl-suggestion-head" },
      h("span", { text: s.source === "gmail" ? "✉ Email detected" : "✎ Capture" }),
      h("span", { class: "apted-pl-spacer" }),
      s.suggestedOutcome ? h("span", { text: `suggests: ${s.suggestedOutcome}` }) : null,
    ),
    h("span", { class: "apted-pl-suggestion-title", text: `${s.company || "?"} · ${s.role || "?"}` }),
    h("span", { class: "apted-pl-suggestion-sub", text: s.subject }),
  );
  const apply = document.createElement("button");
  apply.className = "apted-pl-btn apted-pl-btn--primary";
  apply.textContent = "Apply";
  const dismiss = document.createElement("button");
  dismiss.className = "apted-pl-btn";
  dismiss.textContent = "Dismiss";
  apply.addEventListener("click", () => {
    apply.disabled = true;
    void actions
      .onApplySuggestion(s)
      .then((ok) => {
        if (ok) card.remove();
        else apply.disabled = false;
      })
      .catch(() => {
        apply.disabled = false;
      });
  });
  dismiss.addEventListener("click", () => {
    dismiss.disabled = true;
    void Promise.resolve(actions.onDismissSuggestion(s)).then(() => card.remove());
  });
  card.append(h("div", { class: "apted-pl-suggestion-actions" }, apply, dismiss));
  return card;
}

function teaserCard(): HTMLElement {
  return h(
    "div",
    { class: "apted-pl-teaser" },
    h(
      "div",
      { class: "apted-pl-teaser-main" },
      h("span", { class: "apted-pl-teaser-title", text: "Resume tailoring — coming soon" }),
      h(
        "span",
        { class: "apted-pl-teaser-sub", text: "Tailored resumes and PDF export are on the way." },
      ),
    ),
  );
}
