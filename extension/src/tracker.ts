// Tracker service-worker module — owns every tracker network call and all
// persisted tracker state. Surfaces (drawer, side panel) only message the
// background script; they never fetch.
//
// State (chrome.storage.local):
//   aptedTrackerCache     { applications, updatedAt }  — pipeline snapshot
//   aptedSuggestions      PipelineSuggestion[]         — pinned suggestion cards
//   aptedTrackerQueue     Capture[]                    — offline/signed-out queue
//   aptedTrackerQueueState { attempt, nextAttemptAt }  — capped exp. backoff
//   aptedTrackedObjs      { [trackedObj]: { rank, id, ts } } — dedupe (never downgrades)
//   aptedGmailSeen        { [messageId]: ts }          — Gmail suggestion memory
//
// Dedupe rank order (never downgrades): noRecord < analyticOnly < submitted.

import { getSettings } from "./storage";
import type { Capture, LogResult, GmailEmail, GmailClassification } from "./messages";
import type { Outcome, PipelineApplication, PipelineSuggestion, PipelineState } from "./pipeline";

const CACHE_KEY = "aptedTrackerCache";
const SUGGESTIONS_KEY = "aptedSuggestions";
const QUEUE_KEY = "aptedTrackerQueue";
const QUEUE_STATE_KEY = "aptedTrackerQueueState";
const TRACKED_KEY = "aptedTrackedObjs";
const GMAIL_SEEN_KEY = "aptedGmailSeen";
const LAST_JOB_KEY = "aptedLastJob";
const ACTIVE_KEY = "aptedTrackerActive"; // chrome.storage.session

export const RANK_NO_RECORD = 0;
export const RANK_ANALYTIC_ONLY = 1;
export const RANK_SUBMITTED = 2;

const MAX_QUEUE = 200;
const MAX_SUGGESTIONS = 20;
const MAX_GMAIL_SEEN = 500;
const BACKOFF_BASE_MS = 30_000;
const BACKOFF_CAP_MS = 60 * 60_000;

// ── storage helpers ─────────────────────────────────────────────────────────

async function lsGet<T>(key: string, fallback: T): Promise<T> {
  try {
    const o = await chrome.storage.local.get(key);
    const v = o[key];
    return (v === undefined || v === null ? fallback : v) as T;
  } catch {
    return fallback;
  }
}

async function lsSet(key: string, value: unknown): Promise<void> {
  try {
    await chrome.storage.local.set({ [key]: value });
  } catch {
    /* best-effort */
  }
}

// ── api ─────────────────────────────────────────────────────────────────────

async function api<T>(path: string, init: RequestInit & { json?: unknown }): Promise<T> {
  const { apiBase, authToken } = await getSettings();
  const base = (apiBase || "https://apted.vercel.app").replace(/\/+$/, "");
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (authToken) headers["authorization"] = `Bearer ${authToken}`;
  const res = await fetch(base + path, {
    ...init,
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (!res.ok) {
    const errMsg =
      parsed && typeof parsed === "object" && "error" in parsed
        ? String((parsed as { error: unknown }).error)
        : null;
    throw new Error(errMsg || `HTTP ${res.status}`);
  }
  return parsed as T;
}

export async function isSignedIn(): Promise<boolean> {
  const { authToken, apiBase } = await getSettings();
  if (authToken) return true;
  // Local-mode servers run with auth disabled (no BETTER_AUTH_SECRET) and
  // accept unauthenticated calls — treat them as signed in so the panel
  // syncs immediately in local dev instead of showing the Connect banner.
  try {
    const host = new URL((apiBase || "").replace(/\/+$/, "")).hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
}

// ── applications cache / pipeline state ──────────────────────────────────────

type ApiApplicationRow = {
  id: string;
  company: string;
  role: string;
  outcome: Outcome;
  interviewRound: number | null;
  rejectedAfterRound: number | null;
  portalUrl: string | null;
  createdAt: string;
};

function toPipelineApp(row: ApiApplicationRow): PipelineApplication {
  return {
    id: row.id,
    company: row.company,
    role: row.role,
    outcome: row.outcome,
    interviewRound: row.interviewRound,
    rejectedAfterRound: row.rejectedAfterRound,
    portalUrl: row.portalUrl,
    createdAt: row.createdAt,
  };
}

async function refreshCache(): Promise<PipelineApplication[]> {
  const rows = await api<ApiApplicationRow[]>("/api/applications", { method: "GET" });
  const applications = rows.map(toPipelineApp);
  await lsSet(CACHE_KEY, { applications, updatedAt: new Date().toISOString() });
  return applications;
}

export async function getTrackerState(): Promise<PipelineState> {
  const suggestions = await lsGet<PipelineSuggestion[]>(SUGGESTIONS_KEY, []);
  const queue = await lsGet<Capture[]>(QUEUE_KEY, []);
  const cache = await lsGet<{ applications: PipelineApplication[]; updatedAt: string | null }>(CACHE_KEY, {
    applications: [],
    updatedAt: null,
  });

  if (!(await isSignedIn())) {
    return { status: "signed-out", applications: [], suggestions, queued: queue.length, updatedAt: null };
  }
  try {
    const queued = await flushQueue();
    const applications = await refreshCache();
    return { status: "ready", applications, suggestions, queued, updatedAt: new Date().toISOString() };
  } catch {
    return {
      status: "offline",
      applications: cache.applications ?? [],
      suggestions,
      queued: queue.length,
      updatedAt: cache.updatedAt ?? null,
    };
  }
}

// ── trackedObj dedupe ────────────────────────────────────────────────────────

type TrackedObjState = { rank: number; id: string | null; ts: number };

async function getTrackedMap(): Promise<Record<string, TrackedObjState>> {
  return lsGet<Record<string, TrackedObjState>>(TRACKED_KEY, {});
}

async function markTrackedObj(trackedObj: string, rank: number, id: string | null): Promise<void> {
  const map = await getTrackedMap();
  const prev = map[trackedObj];
  // Never downgrade the rank; an equal-rank write upgrades the id.
  if (prev && prev.rank > rank) return;
  map[trackedObj] = {
    rank: Math.max(rank, prev?.rank ?? 0),
    id: id ?? prev?.id ?? null,
    ts: Date.now(),
  };
  await lsSet(TRACKED_KEY, map);
}

async function unmarkTrackedObjById(id: string): Promise<void> {
  const map = await getTrackedMap();
  let changed = false;
  for (const [k, v] of Object.entries(map)) {
    if (v.id === id) {
      delete map[k];
      changed = true;
    }
  }
  if (changed) await lsSet(TRACKED_KEY, map);
}

// ── last job (posting the user was on when they submitted) ───────────────────

export async function saveLastJob(job: {
  company?: string;
  role?: string;
  jobDescription?: string;
  portalUrl?: string;
  trackedObj?: string | null;
  source: string;
}): Promise<void> {
  await lsSet(LAST_JOB_KEY, { ...job, savedAt: Date.now() });
}

async function getLastJob(): Promise<{
  company?: string;
  role?: string;
  jobDescription?: string;
  portalUrl?: string;
  trackedObj?: string | null;
  source: string;
} | null> {
  const job = await lsGet<{
    company?: string;
    role?: string;
    jobDescription?: string;
    portalUrl?: string;
    trackedObj?: string | null;
    source: string;
    savedAt: number;
  } | null>(LAST_JOB_KEY, null);
  if (!job || Date.now() - (job.savedAt ?? 0) > 24 * 3600_000) return null;
  return job;
}

// ── capture logging ──────────────────────────────────────────────────────────

async function postCapture(capture: Capture): Promise<{ id: string }> {
  if (capture.company && capture.role) {
    const row = await api<{ id: string }>("/api/applications", {
      method: "POST",
      json: {
        company: capture.company,
        role: capture.role,
        jobDescription: capture.jobDescription ?? "",
        outcome: "applied",
        portalUrl: capture.portalUrl ?? null,
      },
    });
    return { id: row.id };
  }
  // Partial capture: event-first write so it always lands and can be
  // upgraded later (the event route fills in fallback names).
  const row = await api<{ id: string }>("/api/applications/event", {
    method: "POST",
    json: {
      trackedObj: capture.trackedObj ?? null,
      url: capture.portalUrl ?? "",
      capturedAt: capture.capturedAt,
      partial: {
        company: capture.company,
        role: capture.role,
        jobDescription: capture.jobDescription,
        portalUrl: capture.portalUrl,
        source: capture.source,
      },
    },
  });
  return { id: row.id };
}

// The user opened an apted surface in this browsing session — captures
// count as active even when the submit fires on a later page load.
export async function markActive(): Promise<void> {
  try {
    await chrome.storage.session.set({ [ACTIVE_KEY]: true });
  } catch {
    /* best-effort */
  }
}

async function wasActive(): Promise<boolean> {
  try {
    const o = await chrome.storage.session.get(ACTIVE_KEY);
    return o[ACTIVE_KEY] === true;
  } catch {
    return false;
  }
}

export async function logApplication(capture: Capture): Promise<LogResult> {
  const settings = await getSettings();

  // Passive-tracking opt-out: skip captures the user made without apted's
  // involvement (no surface opened in this browsing session).
  const active = capture.active || (await wasActive());
  if (!active && !settings.passiveTracking) return { kind: "skipped" };

  // Merge the last-seen job so confirmation-page captures (which carry no
  // posting context) still land with company/role/portal URL.
  const lastJob = await getLastJob();
  const merged: Capture = {
    ...capture,
    company: capture.company || lastJob?.company,
    role: capture.role || lastJob?.role,
    jobDescription: capture.jobDescription || lastJob?.jobDescription,
    portalUrl: capture.portalUrl || lastJob?.portalUrl,
    trackedObj: capture.trackedObj || lastJob?.trackedObj || null,
  };
  capture = merged;

  const trackedObj = capture.trackedObj || null;
  if (trackedObj) {
    const map = await getTrackedMap();
    const prev = map[trackedObj];
    if (prev && prev.rank >= RANK_SUBMITTED) {
      return { kind: "duplicate", id: prev.id };
    }
    // Mark BEFORE the network call so a burst of submit events can't all
    // pass the dedupe check.
    await markTrackedObj(trackedObj, RANK_SUBMITTED, null);
  }

  try {
    const { id } = await postCapture(capture);
    if (trackedObj) await markTrackedObj(trackedObj, RANK_SUBMITTED, id);
    // Best-effort cache refresh so surfaces converge without a reload.
    void refreshCache().catch(() => {});
    return { kind: "logged", id };
  } catch {
    // Offline / signed-out / server error: queue with capped exponential
    // backoff on the next service-worker wake.
    const queue = await lsGet<Capture[]>(QUEUE_KEY, []);
    queue.push(capture);
    await lsSet(QUEUE_KEY, queue.slice(-MAX_QUEUE));
    return { kind: "queued" };
  }
}

// ── queue flush ──────────────────────────────────────────────────────────────

export async function flushQueue(): Promise<number> {
  const queue = await lsGet<Capture[]>(QUEUE_KEY, []);
  if (!queue.length) return 0;

  const state = await lsGet<{ attempt: number; nextAttemptAt: number }>(QUEUE_STATE_KEY, {
    attempt: 0,
    nextAttemptAt: 0,
  });
  if (state.nextAttemptAt && Date.now() < state.nextAttemptAt) return queue.length;

  const lastJob = await getLastJob();
  const remaining: Capture[] = [];
  for (const c of queue) {
    // Fill in anything that can be recovered from the last job seen.
    const merged: Capture = {
      ...c,
      company: c.company || lastJob?.company,
      role: c.role || lastJob?.role,
      jobDescription: c.jobDescription || lastJob?.jobDescription,
      portalUrl: c.portalUrl || lastJob?.portalUrl,
    };
    try {
      const { id } = await postCapture(merged);
      if (merged.trackedObj) await markTrackedObj(merged.trackedObj, RANK_SUBMITTED, id);
    } catch {
      remaining.push(merged);
    }
  }

  if (remaining.length) {
    const fullFailure = remaining.length === queue.length;
    const attempt = fullFailure ? (state.attempt || 0) + 1 : 0;
    const delay = Math.min(BACKOFF_BASE_MS * 2 ** attempt, BACKOFF_CAP_MS);
    await lsSet(QUEUE_KEY, remaining.slice(-MAX_QUEUE));
    await lsSet(QUEUE_STATE_KEY, { attempt, nextAttemptAt: Date.now() + delay });
  } else {
    await lsSet(QUEUE_KEY, []);
    await lsSet(QUEUE_STATE_KEY, { attempt: 0, nextAttemptAt: 0 });
  }
  return remaining.length;
}

// ── outcome updates / undo ───────────────────────────────────────────────────

export async function setOutcome(id: string, outcome: Outcome, interviewRound?: number | null): Promise<boolean> {
  try {
    await api(`/api/applications/${encodeURIComponent(id)}`, {
      method: "PATCH",
      json: interviewRound !== undefined && interviewRound !== null
        ? { outcome, interviewRound }
        : { outcome },
    });
    void refreshCache().catch(() => {});
    return true;
  } catch {
    return false;
  }
}

export async function undoLog(id: string): Promise<boolean> {
  try {
    await api(`/api/applications/${encodeURIComponent(id)}`, { method: "DELETE" });
    await unmarkTrackedObjById(id);
    void refreshCache().catch(() => {});
    return true;
  } catch {
    return false;
  }
}

// ── tracking dialogue ────────────────────────────────────────────────────────

export type TrackResult = { reply: string; summary: string[] };

/**
 * Free-text tracking update ("stripe rejected me after round 2"). The server
 * route parses the text into ops (create/update) via the LLM and applies
 * them; we refresh the pipeline cache so the next tracker-state is fresh.
 */
export async function trackApplication(
  text: string,
  context: { company?: string; role?: string },
): Promise<TrackResult> {
  const result = await api<TrackResult>("/api/applications/track", {
    method: "POST",
    json: { text, currentCompany: context.company, currentRole: context.role },
  });
  try {
    await refreshCache();
  } catch {
    /* cache refresh is best-effort; ops were applied server-side */
  }
  return result;
}

// ── suggestions (Gmail + captures) ────────────────────────────────────────────

export async function addSuggestion(s: PipelineSuggestion): Promise<void> {
  const list = await lsGet<PipelineSuggestion[]>(SUGGESTIONS_KEY, []);
  if (list.some((x) => x.id === s.id)) return;
  list.unshift(s);
  await lsSet(SUGGESTIONS_KEY, list.slice(0, MAX_SUGGESTIONS));
}

export async function dismissSuggestion(id: string): Promise<void> {
  const list = await lsGet<PipelineSuggestion[]>(SUGGESTIONS_KEY, []);
  await lsSet(SUGGESTIONS_KEY, list.filter((s) => s.id !== id));
}

export async function applySuggestion(id: string): Promise<boolean> {
  const list = await lsGet<PipelineSuggestion[]>(SUGGESTIONS_KEY, []);
  const s = list.find((x) => x.id === id);
  if (!s) return false;
  const outcome: Outcome = s.suggestedOutcome ?? "applied";
  try {
    await api("/api/applications", {
      method: "POST",
      json: {
        company: s.company,
        role: s.role,
        jobDescription: "",
        outcome,
        // interviewing rows require a round >= 1 (DB check constraint).
        ...(outcome === "interviewing"
          ? { interviewRound: s.interviewRound ?? 1 }
          : {}),
      },
    });
    await dismissSuggestion(id);
    void refreshCache().catch(() => {});
    return true;
  } catch {
    return false;
  }
}

// ── Gmail email → suggestion card ────────────────────────────────────────────

function companyFromSenderName(senderName: string, sender: string): string {
  // "Stripe via Greenhouse" → "Stripe". Domain fallback happens only after
  // the LLM extract attempt (companyFromSenderDomain).
  return senderName.replace(/\s+via\s+.*$/i, "").trim();
}

function companyFromSenderDomain(sender: string): string {
  const domain = (sender.match(/@([\w.-]+)/)?.[1] ?? "").split(".")[0] ?? "";
  if (!domain) return "";
  return domain.charAt(0).toUpperCase() + domain.slice(1);
}

function roleFromSubject(subject: string): string {
  const m = subject.match(
    /(?:application|applying|interview|offer) (?:for|to)\s+(.{2,80}?)(?:[.,!?]|$)/i,
  );
  return m?.[1]?.trim() ?? "";
}

/**
 * Turn a locally-classified Gmail email into a pipeline suggestion card.
 * Company/role are filled from the sender name + subject; anything still
 * missing goes through the /api/extract LLM fallback (the user's own account
 * — disclosed in the privacy policy). v1 suggests only — no silent writes.
 */
export async function handleGmailEmail(
  email: GmailEmail,
  classification: GmailClassification,
): Promise<void> {
  let company = companyFromSenderName(email.senderName, email.sender);
  let role = roleFromSubject(email.subject);

  if (!company || !role) {
    try {
      const ext = await api<{ company: string; title: string }>("/api/extract", {
        method: "POST",
        json: {
          jobDescription: `${email.subject}\n\n${email.body}`,
          url: "",
          title: role,
          company,
          source: "gmail",
        },
      });
      company = company || ext.company || "";
      role = role || ext.title || "";
    } catch {
      /* LLM unavailable — keep local heuristics */
    }
  }

  if (!company) company = companyFromSenderDomain(email.sender);
  if (!company) company = "Unknown company";
  if (!role) role = email.subject.slice(0, 60) || "Application";

  await addSuggestion({
    id: `gmail:${email.messageId}`,
    source: "gmail",
    company,
    role,
    subject: email.subject || email.sender,
    suggestedOutcome: classification.outcome,
    interviewRound: classification.outcome === "interviewing" ? 1 : null,
    createdAt: new Date().toISOString(),
  });
}

// ── Gmail per-message memory ─────────────────────────────────────────────────

export async function isGmailMessageSeen(messageId: string): Promise<boolean> {
  const seen = await lsGet<Record<string, number>>(GMAIL_SEEN_KEY, {});
  return typeof seen[messageId] === "number";
}

export async function rememberGmailMessage(messageId: string): Promise<void> {
  const seen = await lsGet<Record<string, number>>(GMAIL_SEEN_KEY, {});
  seen[messageId] = Date.now();
  const entries = Object.entries(seen).sort((a, b) => b[1] - a[1]);
  await lsSet(
    GMAIL_SEEN_KEY,
    Object.fromEntries(entries.slice(0, MAX_GMAIL_SEEN)),
  );
}
