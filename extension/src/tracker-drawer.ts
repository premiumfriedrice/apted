// Tracker drawer — the job-site surface (shadow DOM, framework-free).
//
// Mounted by drawer.ts. Shell: handle + slide-in drawer + toast with 8 s
// Undo. Body: the SHARED tracker panel view (panel-view.ts — Sankey funnel
// on top, current-job strip, tracking dialogue below) that also powers the
// side panel.
//
// Submission detection combines three channels (see submit-detection.ts):
//   - final submit control clicked (registry labels / native submit)
//   - confirmation URL reached (MPA + SPA navigations)
//   - success element absent ≥1.5 s then reappeared while the user interacted
// Dedupe lives in the service worker (per-ATS trackedObj, never-downgrade
// rank); this script adds a per-tab 30 s cooldown.

import { matchAts, buildTrackedObj, extractFieldsFromDoc } from "./ats-registry";
import { scrapeCurrentPage } from "./scrapers";
import {
  isConfirmationUrl,
  isFinalSubmitLabel,
  SUBMITTED_ABSENCE_MS,
  SuccessMonitor,
} from "./submit-detection";
import { mountPanelView, panelStyles, type PanelHandle } from "./panel-view";
import type { Msg, Reply } from "./messages";
import type { ScrapedJob } from "./types";

const DRAWER_WIDTH = 384;
const CAPTURE_COOLDOWN_MS = 30_000;

function send<T>(msg: Msg): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (reply: Reply<T> | undefined) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (reply && reply.ok) {
        resolve(reply.data);
      } else {
        reject(new Error(reply && !reply.ok ? reply.error : "no reply from background"));
      }
    });
  });
}

function styles(): string {
  return /* css */ `
    :host { all: initial; }

    .td-handle {
      position: fixed; top: 0; right: 0; z-index: 2147483647;
      width: 64px; height: 72px; padding: 0; margin: 0;
      background: none; border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: flex-end;
      font: 56px/1 Outfit, -apple-system, BlinkMacSystemFont, sans-serif;
      color: #000;
      transition: transform 0.2s ease-out;
    }
    .td-handle:hover { transform: translateX(-4px); }
    .td-handle--hidden { display: none; }

    .td-drawer {
      position: fixed; top: 12px; right: 12px; bottom: 12px;
      width: ${DRAWER_WIDTH}px; z-index: 2147483646;
      display: flex; flex-direction: column;
      background: #fff; color: #171717;
      border: 1px solid #e5e5e5; border-radius: 12px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
      font: 14px/1.5 Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      overflow: hidden;
      transform: translateX(calc(100% + 24px));
      transition: transform 0.2s ease-out;
    }
    .td-drawer--open { transform: translateX(0); }

    .td-header {
      flex-shrink: 0; height: 48px;
      display: flex; align-items: center; gap: 8px; padding: 0 16px;
      border-bottom: 1px solid #e5e5e5;
    }
    .td-title {
      margin: 0; font-family: Outfit, sans-serif;
      font-size: 16px; font-weight: 500; letter-spacing: -0.02em; color: #191c1d;
    }
    .td-spacer { flex: 1; }
    .td-icon-btn {
      width: 28px; height: 28px; padding: 0;
      display: inline-flex; align-items: center; justify-content: center;
      background: transparent; border: none; border-radius: 6px;
      color: #434655; cursor: pointer;
    }
    .td-icon-btn:hover { background: #f3f4f5; color: #191c1d; }

    .td-body {
      flex: 1; overflow-y: auto; overscroll-behavior: contain;
      padding: 12px; background: #fafafa;
    }
    .td-body::-webkit-scrollbar { width: 4px; }
    .td-body::-webkit-scrollbar-thumb { background: #c3c6d7; border-radius: 2px; }

    .td-toast {
      position: sticky; top: 0; z-index: 20;
      display: flex; align-items: center; gap: 10px;
      margin: -12px -12px 12px; padding: 10px 12px;
      background: #16a34a; color: #fff; border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
      opacity: 0; transform: translateY(-8px);
      transition: opacity 0.2s ease, transform 0.2s ease;
      pointer-events: none;
    }
    .td-toast--visible { opacity: 1; transform: translateY(0); pointer-events: auto; }
    .td-toast--muted { background: #434655; }
    .td-toast-main { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .td-toast-headline { font-size: 13px; font-weight: 600; }
    .td-toast-sub {
      font-size: 11px; opacity: 0.85;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .td-toast-undo {
      flex-shrink: 0; padding: 4px 10px;
      background: rgba(255, 255, 255, 0.18); color: #fff;
      border: none; border-radius: 6px; font-size: 12px; font-weight: 500;
      cursor: pointer;
    }
    .td-toast-undo:hover { background: rgba(255, 255, 255, 0.3); }
  `;
}

export function mountTrackerDrawer(): void {
  if (document.getElementById("apted-drawer-host")) return; // already injected
  if (!chrome?.runtime?.getURL) return; // not an extension context

  // Registry entry for this page (may be null on confirmation pages).
  const atsMatch = matchAts(location.href);

  // Inject the Outfit font faces globally (shadow DOM can't reach page CSS).
  const fontStyle = document.createElement("style");
  fontStyle.textContent = [400, 500, 700]
    .map(
      (w) => `@font-face { font-family: 'Outfit'; font-style: normal; font-weight: ${w};
      font-display: swap; src: url('${chrome.runtime.getURL(`fonts/outfit-${w}.ttf`)}') format('truetype'); }`,
    )
    .join("\n");
  document.head.appendChild(fontStyle);

  const host = document.createElement("div");
  host.id = "apted-drawer-host";
  Object.assign(host.style, {
    position: "fixed",
    top: "0",
    right: "0",
    width: "0",
    height: "0",
    zIndex: "2147483646",
  } as Partial<CSSStyleDeclaration>);

  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `<style>${styles()}${panelStyles()}</style>
    <button class="td-handle" title="Open apted Tracker" aria-label="Open apted Tracker">a</button>
    <div class="td-drawer">
      <div class="td-header">
        <h1 class="td-title">apted Tracker</h1>
        <span class="td-spacer"></span>
        <button class="td-icon-btn" id="td-settings" title="Settings" aria-label="Settings">
          <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 24 24" width="18" height="18"><path d="M12 15.5A3.5 3.5 0 0 1 8.5 12 3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5 3.5 3.5 0 0 1-3.5 3.5zm7.43-2.53c.04-.32.07-.64.07-.97 0-.33-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98 0 .33.03.66.07.97l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l-2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65z"/></svg>
        </button>
        <button class="td-icon-btn" id="td-close" title="Minimize" aria-label="Minimize">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="18" height="18"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="td-body">
        <div id="td-toast" class="td-toast" hidden role="status" aria-live="polite">
          <div class="td-toast-main">
            <span id="td-toast-headline" class="td-toast-headline"></span>
            <span id="td-toast-sub" class="td-toast-sub"></span>
          </div>
          <button id="td-toast-undo" class="td-toast-undo" hidden>Undo</button>
        </div>
        <div id="td-panel"></div>
      </div>
    </div>`;

  const $ = <T extends HTMLElement>(sel: string): T => shadow.querySelector(sel) as T;
  const handle = $<HTMLButtonElement>(".td-handle");
  const drawer = $<HTMLElement>(".td-drawer");
  const panelEl = $<HTMLElement>("#td-panel");
  const toast = $<HTMLElement>("#td-toast");
  const toastHeadline = $<HTMLElement>("#td-toast-headline");
  const toastSub = $<HTMLElement>("#td-toast-sub");
  const toastUndo = $<HTMLButtonElement>("#td-toast-undo");

  // ── open/close ────────────────────────────────────────────────────────────

  let open = false;
  async function setOpen(next: boolean): Promise<void> {
    open = next;
    drawer.classList.toggle("td-drawer--open", open);
    handle.classList.toggle("td-handle--hidden", open);
    if (open) {
      void send({ type: "tracker-mark-active" }).catch(() => {});
      void panel.refresh();
    }
    try {
      await chrome.storage.local.set({ [`aptedDrawerOpen:${location.hostname}`]: next });
    } catch {
      /* best-effort */
    }
  }

  handle.addEventListener("click", () => void setOpen(true));
  $<HTMLButtonElement>("#td-close").addEventListener("click", () => void setOpen(false));
  $<HTMLButtonElement>("#td-settings").addEventListener("click", () => {
    void send({ type: "open-options" }).catch(() => {});
  });

  chrome.runtime.onMessage.addListener((msg: Msg) => {
    if ((msg as { type: string }).type === "open-drawer") {
      void setOpen(true);
      return true; // keep handled — background expects a channel ack
    }
    return false;
  });
  window.addEventListener("apted-open-drawer", () => void setOpen(true));

  // ── panel view (shared with the side panel: funnel + tracking dialogue) ──

  const panel: PanelHandle = mountPanelView(panelEl, {
    send,
    scrape: async () => {
      try {
        const job = scrapeCurrentPage();
        return { company: job.company, role: job.title };
      } catch {
        return null;
      }
    },
  });

  // Re-render when tracker state changes elsewhere (e.g. a capture in
  // another tab), or when the auth token changes.
  chrome.storage.onChanged.addListener((changes, area) => {
    const relevant =
      (area === "local" &&
        (changes["aptedTrackerCache"] || changes["aptedSuggestions"])) ||
      (area === "sync" && changes["authToken"]);
    if (relevant && open) void panel.refresh();
  });

  // ── tracked job (scrape only; nothing is saved while browsing) ───────────

  let currentJob: ScrapedJob | null = null;
  async function scrapeAndShow(): Promise<void> {
    if (isConfirmationUrl(location.href)) return; // confirmation page — no job to track
    try {
      const job = scrapeCurrentPage();
      if (!job.company && !job.title && !job.jobDescription) return;
      currentJob = job;
      panel.setJob({ company: job.company || undefined, role: job.title || undefined });
      const trackedObj = buildTrackedObj(location.href);
      void send({
        type: "tracker-save-lastjob",
        company: job.company,
        role: job.title,
        jobDescription: job.jobDescription,
        portalUrl: job.url,
        trackedObj,
        source: job.source,
      }).catch(() => {});
    } catch {
      /* scraping is best-effort */
    }
  }

  // ── fill-phase auto-tracking ─────────────────────────────────────────────
  //
  // While the user FILLS OUT an application form on a recognized job page,
  // log the application as a draft right away (the submit capture upgrades
  // it to "applied"). Heuristic: interaction with enough distinct form
  // fields — a lower bar on URLs that are already the apply flow.

  const APPLY_URL_RE = /\/apply|\/application\/|jobapplication|apply\.aspx/i;
  const FILL_FIELDS_NEEDED = APPLY_URL_RE.test(location.pathname + location.search) ? 1 : 3;
  const fillFields = new Set<HTMLElement>();
  let fillFired = false;

  function maybeTrackFill(): void {
    if (fillFired || fillFields.size < FILL_FIELDS_NEEDED) return;
    fillFired = true; // once per page load; SW dedupe guards navigations
    void trackFill();
  }

  async function trackFill(): Promise<void> {
    // Only on recognized job context — a posting we scraped, or an
    // ATS-registry match for this page.
    const job = currentJob;
    if (!job && !atsMatch) return;
    const trackedObj =
      buildTrackedObj(location.href) ?? (job ? buildTrackedObj(job.url) : null);
    const fields = atsMatch
      ? extractFieldsFromDoc(atsMatch.entry, document, location.href)
      : { company: "", role: "" };
    const company = job?.company || fields.company || "";
    if (!company) return; // can't identify the employer — wait for submit
    const capture = {
      company,
      role: job?.title || fields.role || "Unknown Role",
      jobDescription: job?.jobDescription || undefined,
      portalUrl: job?.url || location.href,
      trackedObj: trackedObj ?? undefined,
      capturedAt: new Date().toISOString(),
      source: job?.source ?? atsMatch?.key ?? "generic",
      active: open,
      inProgress: true,
    };
    try {
      const result = await send<{ kind: string; id?: string }>({
        type: "tracker-log-application",
        capture,
      });
      if (result.kind === "logged") {
        showToast(
          "Tracking this application",
          "Saved as draft — it becomes applied when you submit",
          undefined,
          true,
        );
      }
    } catch {
      /* fill-phase tracking is best-effort */
    }
  }

  document.addEventListener(
    "input",
    (e) => {
      const t = e.target as HTMLElement | null;
      if (!t || host.contains(t)) return;
      if (
        !(t instanceof HTMLInputElement) &&
        !(t instanceof HTMLSelectElement) &&
        !(t instanceof HTMLTextAreaElement)
      ) {
        return;
      }
      if (t.type === "search") return; // job-board search boxes aren't applications
      fillFields.add(t);
      userInteracted = true;
      maybeTrackFill();
    },
    { capture: true },
  );
  document.addEventListener(
    "change",
    (e) => {
      const t = e.target as HTMLElement | null;
      if (!t || host.contains(t)) return;
      if (t instanceof HTMLSelectElement) {
        fillFields.add(t);
        userInteracted = true;
        maybeTrackFill();
      }
    },
    { capture: true },
  );

  // ── submission detection ──────────────────────────────────────────────────

  let submitClicked = false;
  let userInteracted = false;
  let lastCaptureAt = 0;
  const monitor = new SuccessMonitor({
    selectors: () => atsMatch?.entry.successSelectors ?? [],
  });

  document.addEventListener(
    "submit",
    (e) => {
      if (host.contains(e.target as Node)) return;
      submitClicked = true;
      userInteracted = true;
    },
    { capture: true },
  );

  document.addEventListener(
    "click",
    (e) => {
      const t = e.target as HTMLElement | null;
      if (!t || host.contains(t)) return;
      userInteracted = true;
      const btn = t.closest(
        "button, input[type='submit'], input[type='image'], [role='button']",
      ) as HTMLElement | null;
      if (!btn) return;
      const label = (
        (btn as HTMLInputElement).value || btn.textContent || ""
      ).trim();
      if (isFinalSubmitLabel(label, atsMatch?.entry ?? null)) {
        submitClicked = true;
      }
    },
    { capture: true },
  );

  function shouldCapture(): boolean {
    const urlConfirm = isConfirmationUrl(location.href);
    const successVisible = monitor.lastVisible || urlConfirm;
    if (!successVisible && !submitClicked) return false;
    if (submitClicked) return true; // a tracked final submit click is enough (matches v0 behavior)
    return (
      (urlConfirm || successVisible) &&
      userInteracted &&
      (urlConfirm || (monitor.absenceMs ?? 0) >= SUBMITTED_ABSENCE_MS)
    );
  }

  async function capture(): Promise<void> {
    const now = Date.now();
    if (now - lastCaptureAt < CAPTURE_COOLDOWN_MS) return; // per-tab cooldown
    lastCaptureAt = now;

    // Prefer what this page knows; the service worker merges the last-seen
    // job for confirmation-page captures.
    const job = currentJob;
    const trackedObj =
      buildTrackedObj(location.href) ??
      (job ? buildTrackedObj(job.url) : null) ??
      undefined;
    const fields = atsMatch
      ? extractFieldsFromDoc(atsMatch.entry, document, location.href)
      : { company: "", role: "" };

    const capture = {
      company: job?.company || fields.company || undefined,
      role: job?.title || fields.role || undefined,
      jobDescription: job?.jobDescription || undefined,
      portalUrl: job?.url || location.href,
      trackedObj: trackedObj ?? undefined,
      capturedAt: new Date().toISOString(),
      source: job?.source ?? atsMatch?.key ?? "generic",
      active: open,
    };

    try {
      const result = await send<{ kind: string; id?: string }>({
        type: "tracker-log-application",
        capture,
      });
      if (result.kind === "logged" && result.id) {
        showToast("Logged to apted ✓", [capture.company, capture.role].filter(Boolean).join(" · "), result.id);
      } else if (result.kind === "queued") {
        showToast("Saved — will sync when online", "", undefined, true);
      } else if (result.kind === "duplicate") {
        // Already logged for this trackedObj — stay quiet.
      }
      // skipped: passive tracking disabled — respect silently.
    } catch {
      showToast("Couldn't log application", "", undefined, true);
    }
    submitClicked = false; // consume the click; cooldown guards re-fires
    if (open) void panel.refresh();
  }

  // Poll for the success-element channel (SPA flows without URL changes).
  window.setInterval(() => {
    monitor.tick(document);
    if (shouldCapture()) void capture();
  }, 800);

  // Confirmation-URL channel (MPA + SPA navigations).
  let lastUrl = location.href;
  const checkUrl = () => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      if (isConfirmationUrl(location.href)) void capture();
    }
  };
  window.addEventListener("popstate", checkUrl);
  window.addEventListener("hashchange", checkUrl);
  for (const method of ["pushState", "replaceState"] as const) {
    const original = history[method] as (...args: unknown[]) => void;
    try {
      history[method] = function (this: History, ...args: unknown[]): void {
        original.apply(this, args);
        checkUrl();
      };
    } catch {
      /* history not patchable */
    }
  }

  // ── toast with Undo (8 s) ─────────────────────────────────────────────────

  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let undoTimer: ReturnType<typeof setTimeout> | null = null;
  let undoId: string | null = null;

  function hideToast(): void {
    if (toastTimer !== null) clearTimeout(toastTimer);
    if (undoTimer !== null) clearTimeout(undoTimer);
    toast.classList.remove("td-toast--visible");
    toast.hidden = true;
    toastUndo.hidden = true;
    undoId = null;
  }

  function showToast(headline: string, sub: string, id: string | undefined, muted = false): void {
    if (!open) void setOpen(true); // make the toast visible
    hideToast();
    toastHeadline.textContent = headline;
    toastSub.textContent = sub;
    toast.classList.toggle("td-toast--muted", muted);
    if (id) {
      undoId = id;
      toastUndo.hidden = false;
      undoTimer = setTimeout(() => {
        toastUndo.hidden = true;
        undoId = null;
      }, 8_000);
    }
    toast.hidden = false;
    requestAnimationFrame(() => toast.classList.add("td-toast--visible"));
    toastTimer = setTimeout(hideToast, id ? 8_000 : 4_000);
  }

  toastUndo.addEventListener("click", () => {
    const id = undoId;
    if (!id) return;
    toastUndo.disabled = true;
    void send({ type: "tracker-undo", id })
      .then(() => {
        hideToast();
        void panel.refresh();
      })
      .catch(() => {})
      .finally(() => {
        toastUndo.disabled = false;
      });
  });

  // ── attach ────────────────────────────────────────────────────────────────

  const attach = () => {
    if (!document.body) return;
    document.body.appendChild(host);
    void scrapeAndShow();
    void (async () => {
      try {
        const key = `aptedDrawerOpen:${location.hostname}`;
        const stored = await chrome.storage.local.get(key);
        if (stored[key] === true) await setOpen(true);
      } catch {
        /* ignore */
      }
    })();
  };

  if (document.body) {
    attach();
  } else {
    document.addEventListener("DOMContentLoaded", attach, { once: true });
  }
}
