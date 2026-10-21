// apted Tracker side panel — Sankey funnel on top, tracking dialogue below.
//
// The panel never fetches: every network call goes through the service
// worker via chrome.runtime.sendMessage (tracker.ts owns the API client).
//
// Surfaces:
//   - Funnel: Sankey of all applications (stats computed client-side from
//     the tracker state cache; same math as the web app).
//   - Current job: company/role scraped from the active tab; "Log
//     application" records it against the account.
//   - Tracking dialogue: free-text updates ("stripe rejected me after
//     round 2") parsed server-side into ops; quick chips for the common
//     outcomes on the current job.

import { getSettings } from "./storage";
import {
  computeFunnelStats,
  renderSankey,
  type FunnelStats,
  type HoverInfo,
} from "./sankey";
import type { Msg, MsgResultMap, Reply } from "./messages";
import type { Outcome, PipelineApplication, PipelineState } from "./pipeline";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el as T;
};

const els = {
  connection: $("connection"),
  openOptions: $<HTMLButtonElement>("open-options"),
  signedOut: $("signedout"),
  connect: $<HTMLButtonElement>("connect"),
  funnel: $("funnel"),
  funnelCount: $("funnel-count"),
  funnelInfo: $("funnel-info"),
  rescrape: $<HTMLButtonElement>("rescrape"),
  jdCompany: $<HTMLInputElement>("jd-company"),
  jdRole: $<HTMLInputElement>("jd-role"),
  logApplication: $<HTMLButtonElement>("log-application"),
  quick: $("quick"),
  chatLog: $("chat-log"),
  chatForm: $<HTMLFormElement>("chat-form"),
  chatInput: $<HTMLInputElement>("chat-input"),
  chatSend: $<HTMLButtonElement>("chat-send"),
  status: $("status"),
};

async function send<K extends keyof MsgResultMap>(
  msg: Extract<Msg, { type: K }>,
): Promise<MsgResultMap[K]> {
  const reply = (await chrome.runtime.sendMessage(msg)) as Reply<MsgResultMap[K]>;
  if (!reply || !reply.ok) throw new Error(reply?.error ?? "no reply from background");
  return reply.data;
}

// ── state ───────────────────────────────────────────────────────────────────

let trackerState: PipelineState | null = null;
let updateFunnel: ((next: FunnelStats) => void) | null = null;

// ── status toast ────────────────────────────────────────────────────────────

let statusTimer: number | undefined;
function flashStatus(text: string): void {
  els.status.textContent = text;
  els.status.classList.add("show");
  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = setTimeout(() => els.status.classList.remove("show"), 2400);
}

// ── funnel ──────────────────────────────────────────────────────────────────

function renderFunnel(state: PipelineState): void {
  const stats = computeFunnelStats(state.applications);
  els.funnelCount.textContent =
    stats.total === 0 ? "" : `${stats.total} application${stats.total === 1 ? "" : "s"}`;
  if (!updateFunnel) {
    updateFunnel = renderSankey(els.funnel, stats, (info: HoverInfo) => {
      els.funnelInfo.innerHTML = info
        ? `<strong>${info.label}</strong>: ${info.value} <span class="muted">(${info.pct})</span>`
        : "Hover a node or flow for details.";
    });
  } else {
    updateFunnel(stats);
  }
}

// ── chat log ────────────────────────────────────────────────────────────────

function appendMsg(who: "you" | "apted", text: string, summary?: string[]): void {
  const div = document.createElement("div");
  div.className = `msg ${who}`;
  div.textContent = text;
  if (summary?.length) {
    const s = document.createElement("div");
    s.className = "summary";
    s.textContent = summary.join(" · ");
    div.append(s);
  }
  els.chatLog.append(div);
  els.chatLog.scrollTop = els.chatLog.scrollHeight;
}

// ── state refresh ───────────────────────────────────────────────────────────

async function refresh(): Promise<void> {
  try {
    const state = await send({ type: "tracker-state" });
    trackerState = state;
    els.signedOut.hidden = state.status !== "signed-out";
    renderFunnel(state);
  } catch (e) {
    flashStatus(e instanceof Error ? e.message : String(e));
  }
}

// ── current job ─────────────────────────────────────────────────────────────

function currentCompany(): string {
  return els.jdCompany.value.trim();
}
function currentRole(): string {
  return els.jdRole.value.trim();
}

async function scrapeTab(): Promise<void> {
  try {
    const job = await send({ type: "scrape" });
    if (job.company) els.jdCompany.value = job.company;
    if (job.title) els.jdRole.value = job.title;
    if (job.company || job.title) flashStatus("Scraped the active tab");
  } catch {
    /* not a job page — leave inputs as-is */
  }
}

/** Find the user's application for the current company (case-insensitive). */
function findCurrentApp(apps: PipelineApplication[]): PipelineApplication | null {
  const q = currentCompany().toLowerCase();
  if (!q) return null;
  return apps.find((a) => a.company.toLowerCase() === q) ?? null;
}

async function logCurrent(): Promise<void> {
  const company = currentCompany();
  const role = currentRole();
  if (!company) {
    flashStatus("Add a company first (Scrape tab or type it)");
    return;
  }
  const result = await send({
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

// ── quick chips ─────────────────────────────────────────────────────────────

async function quickOutcome(outcome: Outcome): Promise<void> {
  const apps = trackerState?.applications ?? [];
  const company = currentCompany();
  const existing = findCurrentApp(apps);
  try {
    if (existing) {
      const ok = await send({
        type: "tracker-set-outcome",
        id: existing.id,
        outcome,
        interviewRound: outcome === "interviewing" ? Math.max(existing.interviewRound ?? 0, 0) + 1 : undefined,
      });
      if (!ok) throw new Error("update failed");
      appendMsg("apted", `Marked ${existing.company} as ${outcome}.`);
    } else if (company) {
      // Not logged yet: create it with the chosen outcome.
      const result = await send({
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
      if (result.kind === "logged" || result.kind === "duplicate") {
        const id = result.kind === "logged" ? result.id : null;
        if (id) {
          await send({
            type: "tracker-set-outcome",
            id,
            outcome,
            interviewRound: outcome === "interviewing" ? 1 : undefined,
          });
        }
        appendMsg("apted", `Logged ${company} as ${outcome}.`);
      } else {
        appendMsg("apted", `Logged ${company} locally — will sync when you connect.`);
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

// ── tracking dialogue ───────────────────────────────────────────────────────

async function submitTrack(text: string): Promise<void> {
  els.chatSend.disabled = true;
  els.chatInput.disabled = true;
  try {
    appendMsg("you", text);
    const result = await send({
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
    els.chatInput.disabled = false;
    els.chatSend.disabled = false;
    els.chatInput.focus();
  }
}

// ── wiring ──────────────────────────────────────────────────────────────────

els.openOptions.addEventListener("click", () => send({ type: "open-options" }).catch(() => {}));
els.connect.addEventListener("click", () => send({ type: "open-connect" }).catch(() => {}));
els.rescrape.addEventListener("click", () => void scrapeTab());
els.logApplication.addEventListener("click", () => void logCurrent());

els.quick.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>("button[data-outcome]");
  if (!btn?.dataset.outcome) return;
  void quickOutcome(btn.dataset.outcome as Outcome);
});

els.chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = els.chatInput.value.trim();
  if (!text) return;
  els.chatInput.value = "";
  void submitTrack(text);
});

void (async () => {
  const { apiBase } = await getSettings();
  els.connection.textContent = apiBase?.replace(/^https?:\/\//, "") ?? "";
  await refresh();
  appendMsg(
    "apted",
    "Tell me what happened with your applications — e.g. \"stripe rejected me after round 2\" or \"just applied to Linear\".",
  );
  // Best-effort auto-scrape when opened on a job page.
  void scrapeTab();
})();
