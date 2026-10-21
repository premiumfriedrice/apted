// Shared tracker panel view — the ONE implementation of the tracker UI,
// mounted into two hosts:
//   - the side panel (light DOM, sidepanel.html)
//   - the job-site drawer (shadow DOM, tracker-drawer.ts)
//
// Layout (per product direction): Sankey funnel on top, the dialogue for
// tracking an application below. The view owns its styles (panelStyles) so
// it renders identically in a light or shadow root; hosts own only the
// chrome around it (topbar / drawer header).
//
// The view never fetches: all network calls go through the env's `send`
// (chrome.runtime.sendMessage → service worker → tracker.ts).

import {
  computeFunnelStats,
  renderSankey,
  type FunnelStats,
  type HoverInfo,
} from "./sankey";
import type { Msg, MsgResultMap, Reply } from "./messages";
import type { Outcome, PipelineApplication, PipelineState } from "./pipeline";

export type PanelJob = { company?: string; role?: string };

export type PanelEnv = {
  /** chrome.runtime.sendMessage wrapper (works in panel + content script). */
  send: <K extends keyof MsgResultMap>(msg: Extract<Msg, { type: K }>) => Promise<MsgResultMap[K]>;
  /** Job context for the page the user is on (drawer scrapes locally). */
  scrape: () => Promise<PanelJob | null>;
};

export type PanelHandle = {
  /** Re-fetch tracker state and re-render the funnel + banner. */
  refresh: () => Promise<void>;
  /** Prefill the current-job inputs (e.g. from a drawer scrape). */
  setJob: (job: PanelJob) => void;
};

// ── styles (self-contained, .pv- prefixed; safe in light or shadow DOM) ────

export function panelStyles(): string {
  return /* css */ `
    .pv { display: flex; flex-direction: column; gap: 12px; font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", system-ui, sans-serif; color: #171717; }
    .pv h2 { margin: 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #737373; font-weight: 600; }
    .pv-section { background: #fff; border: 1px solid #e5e5e5; border-radius: 10px; padding: 10px 12px; }
    .pv-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .pv-row:last-child { margin-bottom: 0; }
    .pv-two { display: grid; grid-template-columns: 1fr 1fr; }
    .pv-spacer { flex: 1; }
    .pv-muted { color: #737373; font-size: 11px; }

    .pv-banner {
      display: flex; align-items: center; gap: 10px;
      padding: 10px 12px; background: #eff6ff; border: 1px solid #bfdbfe;
      border-radius: 10px; font-size: 12px;
    }
    .pv-banner[hidden] { display: none; }

    .pv-funnel-body svg { display: block; width: 100%; height: auto; }
    .pv-funnel-info { font-size: 11px; color: #737373; min-height: 16px; border-top: 1px solid #e5e5e5; padding-top: 6px; margin-top: 6px; }
    .pv-funnel-info strong { color: #171717; }

    .pv input {
      font: inherit; color: #171717; background: #fff;
      border: 1px solid #e5e5e5; border-radius: 7px; padding: 6px 8px; width: 100%;
    }
    .pv input:focus { outline: 2px solid #2563eb; outline-offset: -1px; border-color: #2563eb; }
    .pv input::placeholder { color: #a3a3a3; }

    .pv button {
      font: inherit; color: #171717; background: #f5f5f5;
      border: 1px solid #e5e5e5; border-radius: 7px; padding: 6px 10px; cursor: pointer;
    }
    .pv button:hover:not(:disabled) { background: #ebebeb; }
    .pv button:disabled { opacity: 0.4; cursor: not-allowed; }
    .pv-primary { background: #2563eb !important; border-color: #2563eb !important; color: #fff !important; font-weight: 600; }
    .pv-primary:hover:not(:disabled) { background: #1d4ed8 !important; }

    .pv-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
    .pv-chip { font-size: 11px; padding: 3px 10px; border-radius: 999px; color: #737373; }

    .pv-chat { display: flex; flex-direction: column; }
    .pv-chatlog {
      display: flex; flex-direction: column; gap: 6px;
      max-height: 260px; overflow-y: auto; padding: 2px 0 8px; min-height: 60px;
    }
    .pv-msg { max-width: 88%; padding: 6px 10px; border-radius: 10px; font-size: 12px; white-space: pre-wrap; }
    .pv-msg-you { align-self: flex-end; background: #2563eb; color: #fff; border-bottom-right-radius: 3px; }
    .pv-msg-apted { align-self: flex-start; background: #f5f5f5; border: 1px solid #e5e5e5; border-bottom-left-radius: 3px; }
    .pv-msg-apted .pv-summary { color: #737373; font-size: 11px; }
    .pv-form { display: flex; gap: 8px; }
    .pv-form input { flex: 1; }

    .pv-status {
      position: fixed; left: 50%; bottom: 14px;
      transform: translateX(-50%) translateY(6px);
      background: #171717; color: #fff; font-size: 12px;
      padding: 6px 12px; border-radius: 8px;
      opacity: 0; pointer-events: none;
      transition: opacity 0.2s, transform 0.2s;
      max-width: 90%; text-align: center; z-index: 2147483647;
    }
    .pv-status--show { opacity: 1; transform: translateX(-50%) translateY(0); }
  `;
}

// ── mount ───────────────────────────────────────────────────────────────────

const CHIPS: Array<{ outcome: Outcome; label: string }> = [
  { outcome: "applied", label: "Applied" },
  { outcome: "interviewing", label: "Interviewing" },
  { outcome: "offer", label: "Offer" },
  { outcome: "rejected", label: "Rejected" },
  { outcome: "ghosted", label: "Ghosted" },
];

export function mountPanelView(root: HTMLElement, env: PanelEnv): PanelHandle {
  root.innerHTML = `
    <div class="pv">
      <div class="pv-banner" hidden>
        <span>Connect your apted account to sync your pipeline.</span>
        <button class="pv-connect pv-primary">Connect</button>
      </div>
      <section class="pv-section">
        <div class="pv-row">
          <h2>Application funnel</h2>
          <span class="pv-spacer"></span>
          <span class="pv-count pv-muted"></span>
        </div>
        <div class="pv-funnel-body"></div>
        <div class="pv-funnel-info">Hover a node or flow for details.</div>
      </section>
      <section class="pv-section">
        <div class="pv-row">
          <h2>Current job</h2>
          <span class="pv-spacer"></span>
          <button class="pv-scrape" title="Scrape the active tab">Scrape</button>
        </div>
        <div class="pv-row pv-two">
          <input class="pv-company" placeholder="Company" />
          <input class="pv-role" placeholder="Role" />
        </div>
        <div class="pv-row">
          <span class="pv-spacer"></span>
          <button class="pv-log pv-primary">Log application</button>
        </div>
      </section>
      <section class="pv-section pv-chat">
        <div class="pv-row"><h2>Tracking</h2></div>
        <div class="pv-chips">
          ${CHIPS.map((c) => `<button class="pv-chip" data-outcome="${c.outcome}">${c.label}</button>`).join("")}
        </div>
        <div class="pv-chatlog"></div>
        <form class="pv-form">
          <input class="pv-input" placeholder="stripe rejected me after round 2…" autocomplete="off" />
          <button class="pv-send pv-primary" type="submit">Send</button>
        </form>
      </section>
      <div class="pv-status" aria-live="polite"></div>
    </div>`;

  const $ = <T extends HTMLElement>(sel: string): T => root.querySelector(sel) as T;
  const banner = $<HTMLElement>(".pv-banner");
  const funnelBody = $<HTMLElement>(".pv-funnel-body");
  const funnelCount = $<HTMLElement>(".pv-count");
  const funnelInfo = $<HTMLElement>(".pv-funnel-info");
  const companyInput = $<HTMLInputElement>(".pv-company");
  const roleInput = $<HTMLInputElement>(".pv-role");
  const chatlog = $<HTMLElement>(".pv-chatlog");
  const chatInput = $<HTMLInputElement>(".pv-input");
  const chatSend = $<HTMLButtonElement>(".pv-send");
  const statusEl = $<HTMLElement>(".pv-status");

  let trackerState: PipelineState | null = null;
  let updateFunnel: ((next: FunnelStats) => void) | null = null;

  // ── status toast ──────────────────────────────────────────────────────
  let statusTimer: ReturnType<typeof setTimeout> | undefined;
  function flashStatus(text: string): void {
    statusEl.textContent = text;
    statusEl.classList.add("pv-status--show");
    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = setTimeout(() => statusEl.classList.remove("pv-status--show"), 2400);
  }

  // ── funnel ────────────────────────────────────────────────────────────
  function renderFunnel(state: PipelineState): void {
    const stats = computeFunnelStats(state.applications);
    funnelCount.textContent =
      stats.total === 0 ? "" : `${stats.total} application${stats.total === 1 ? "" : "s"}`;
    if (!updateFunnel) {
      updateFunnel = renderSankey(funnelBody, stats, (info: HoverInfo) => {
        funnelInfo.innerHTML = info
          ? `<strong>${info.label}</strong>: ${info.value} <span class="pv-muted">(${info.pct})</span>`
          : "Hover a node or flow for details.";
      });
    } else {
      updateFunnel(stats);
    }
  }

  // ── chat log ──────────────────────────────────────────────────────────
  function appendMsg(who: "you" | "apted", text: string, summary?: string[]): void {
    const div = document.createElement("div");
    div.className = `pv-msg ${who === "you" ? "pv-msg-you" : "pv-msg-apted"}`;
    div.textContent = text;
    if (summary?.length) {
      const s = document.createElement("div");
      s.className = "pv-summary";
      s.textContent = summary.join(" · ");
      div.append(s);
    }
    chatlog.append(div);
    chatlog.scrollTop = chatlog.scrollHeight;
  }

  // ── current job helpers ───────────────────────────────────────────────
  const currentCompany = () => companyInput.value.trim();
  const currentRole = () => roleInput.value.trim();

  function findCurrentApp(apps: PipelineApplication[]): PipelineApplication | null {
    const q = currentCompany().toLowerCase();
    if (!q) return null;
    return apps.find((a) => a.company.toLowerCase() === q) ?? null;
  }

  async function logCurrent(): Promise<void> {
    const company = currentCompany();
    const role = currentRole();
    if (!company) {
      flashStatus("Add a company first (Scrape or type it)");
      return;
    }
    const result = await env.send({
      type: "tracker-log-application",
      capture: {
        company,
        role: role || "Unknown Role",
        jobDescription: "",
        capturedAt: new Date().toISOString(),
        source: "panel",
        active: true,
      },
    });
    if (result.kind === "logged") {
      appendMsg("apted", `Logged ${company} — ${role || "Unknown Role"} as applied.`);
      await refresh();
    } else if (result.kind === "queued") {
      appendMsg("apted", `Logged ${company} locally — will sync when you connect.`);
    } else if (result.kind === "duplicate") {
      appendMsg("apted", `${company} is already in your pipeline.`);
    } else {
      appendMsg("apted", `Skipped logging ${company}.`);
    }
  }

  // ── quick chips ───────────────────────────────────────────────────────
  async function quickOutcome(outcome: Outcome): Promise<void> {
    const apps = trackerState?.applications ?? [];
    const company = currentCompany();
    const existing = findCurrentApp(apps);
    try {
      if (existing) {
        const ok = await env.send({
          type: "tracker-set-outcome",
          id: existing.id,
          outcome,
          interviewRound:
            outcome === "interviewing" ? Math.max(existing.interviewRound ?? 0, 0) + 1 : undefined,
        });
        if (!ok) throw new Error("update failed");
        appendMsg("apted", `Marked ${existing.company} as ${outcome}.`);
      } else if (company) {
        const result = await env.send({
          type: "tracker-log-application",
          capture: {
            company,
            role: currentRole() || "Unknown Role",
            jobDescription: "",
            capturedAt: new Date().toISOString(),
            source: "panel",
            active: true,
          },
        });
        if (result.kind === "logged" && result.id) {
          await env.send({
            type: "tracker-set-outcome",
            id: result.id,
            outcome,
            interviewRound: outcome === "interviewing" ? 1 : undefined,
          });
          appendMsg("apted", `Logged ${company} as ${outcome}.`);
        } else if (result.kind === "queued") {
          appendMsg("apted", `Logged ${company} locally — will sync when you connect.`);
        } else {
          appendMsg("apted", `${company} is already in your pipeline.`);
        }
      } else {
        flashStatus("Scrape or type a company first");
        return;
      }
      await refresh();
    } catch (e) {
      flashStatus(e instanceof Error ? e.message : String(e));
    }
  }

  // ── tracking dialogue ─────────────────────────────────────────────────
  async function submitTrack(text: string): Promise<void> {
    chatSend.disabled = true;
    chatInput.disabled = true;
    try {
      appendMsg("you", text);
      const result = await env.send({
        type: "track",
        text,
        company: currentCompany() || undefined,
        role: currentRole() || undefined,
      });
      appendMsg("apted", result.reply, result.summary);
      await refresh();
    } catch (e) {
      appendMsg("apted", e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      chatInput.disabled = false;
      chatSend.disabled = false;
      chatInput.focus();
    }
  }

  // ── state refresh ─────────────────────────────────────────────────────
  async function refresh(): Promise<void> {
    try {
      const state = await env.send({ type: "tracker-state" });
      trackerState = state;
      banner.hidden = state.status !== "signed-out";
      renderFunnel(state);
    } catch (e) {
      flashStatus(e instanceof Error ? e.message : String(e));
    }
  }

  // ── wiring ────────────────────────────────────────────────────────────
  $<HTMLButtonElement>(".pv-connect").addEventListener("click", () => {
    void env.send({ type: "open-connect" }).catch(() => {});
  });
  $<HTMLButtonElement>(".pv-scrape").addEventListener("click", () => void (async () => {
    const job = await env.scrape();
    if (job?.company) companyInput.value = job.company;
    if (job?.role) roleInput.value = job.role;
    if (job?.company || job?.role) flashStatus("Scraped the active tab");
  })());
  $<HTMLButtonElement>(".pv-log").addEventListener("click", () => void logCurrent());

  root.querySelector(".pv-chips")!.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>("button[data-outcome]");
    if (!btn?.dataset.outcome) return;
    void quickOutcome(btn.dataset.outcome as Outcome);
  });

  $<HTMLFormElement>(".pv-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;
    chatInput.value = "";
    void submitTrack(text);
  });

  return {
    refresh,
    setJob(job: PanelJob): void {
      if (job.company) companyInput.value = job.company;
      if (job.role) roleInput.value = job.role;
    },
  };
}
