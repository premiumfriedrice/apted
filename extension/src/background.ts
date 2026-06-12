import { scrapeJob } from "./scrapers";
import { getSettings } from "./storage";
import type { FetchPdfResult, Msg } from "./messages";
import type { Draft, ScrapedJob, SimilarResume, Version } from "./types";

// Toolbar action UX is configurable from the options page:
//   - "popup":  anchored toolbar popover (manifest default_popup). Works in
//               Chrome. Arc renders this unreliably.
//   - "window": detached chromeless window opened via chrome.windows.create.
//               Works in every Chromium browser including Arc.
//
// We sync the action's runtime popup target with the stored openMode, and
// register an onClicked handler that only fires when the popup is cleared.

const PANEL_URL = "sidepanel.html";

async function applyOpenMode(): Promise<void> {
  const { openMode } = await chrome.storage.sync.get({ openMode: "popup" });
  // Clearing the popup ("") makes chrome.action.onClicked fire on icon clicks.
  // Setting it back to "sidepanel.html" restores the anchored popover.
  await chrome.action.setPopup({ popup: openMode === "window" ? "" : PANEL_URL });
}

chrome.runtime.onInstalled.addListener(() => void applyOpenMode());
chrome.runtime.onStartup.addListener(() => void applyOpenMode());
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.openMode) void applyOpenMode();
});

// Track the most-recent window we opened so a second click focuses it instead
// of stacking new windows. The id is stored in session storage to survive
// service-worker termination.
async function openInWindow(): Promise<void> {
  const url = chrome.runtime.getURL(PANEL_URL);
  const { aptedWindowId } = await chrome.storage.session.get({ aptedWindowId: null });

  if (typeof aptedWindowId === "number") {
    try {
      const existing = await chrome.windows.get(aptedWindowId);
      if (existing) {
        await chrome.windows.update(aptedWindowId, { focused: true });
        return;
      }
    } catch {
      // window no longer exists — fall through and create a new one
    }
  }

  const win = await chrome.windows.create({
    url,
    type: "popup",
    width: 500,
    height: 720,
    focused: true,
  });
  if (win.id !== undefined) {
    await chrome.storage.session.set({ aptedWindowId: win.id });
  }
}

// Returns the user's actual browsing tab. We can't use chrome.tabs.query with
// currentWindow:true because when apted runs in a detached popup window, that
// IS the current window. Falling back to the last-focused normal window gives
// us the tab the user was on before opening apted.
async function getSourceTab(): Promise<chrome.tabs.Tab | undefined> {
  try {
    const win = await chrome.windows.getLastFocused({
      populate: true,
      windowTypes: ["normal"],
    });
    return win.tabs?.find((t) => t.active);
  } catch {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tab;
  }
}

chrome.action.onClicked.addListener(() => {
  void openInWindow();
});

// Keyboard shortcut entry point. Arc swallows icon clicks before they reach
// the extension, so the keyboard shortcut is the reliable open-trigger there.
chrome.commands.onCommand.addListener((command) => {
  if (command === "open-apted") void openInWindow();
});

// Omnibox: type "apted" + space in the URL bar to invoke. Anything after the
// space is treated as the JD (so you can paste a one-liner JD inline if you
// have one). Hitting Enter with no extra text just opens the window.
chrome.omnibox.onInputChanged.addListener((_text, suggest) => {
  suggest([]);
});
chrome.omnibox.setDefaultSuggestion({
  description: "Open apted — tailor your resume to the active tab's JD",
});
chrome.omnibox.onInputEntered.addListener(async (text) => {
  const jd = text.trim();
  if (jd) {
    await chrome.storage.session.set({ pendingJd: jd });
  }
  await openInWindow();
});

chrome.windows.onRemoved.addListener(async (closedId) => {
  const { aptedWindowId } = await chrome.storage.session.get({ aptedWindowId: null });
  if (aptedWindowId === closedId) {
    await chrome.storage.session.remove("aptedWindowId");
  }
});

async function apiFetch<T>(path: string, init: RequestInit & { json?: unknown }): Promise<T> {
  const { apiBase, authToken } = await getSettings();
  if (!apiBase) throw new Error("API_BASE not set — open the options page.");
  const url = apiBase.replace(/\/+$/, "") + path;

  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (authToken) headers["authorization"] = `Bearer ${authToken}`;

  const res = await fetch(url, {
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
      (parsed && typeof parsed === "object" && "error" in parsed
        ? String((parsed as { error: unknown }).error)
        : null) || `HTTP ${res.status}`;
    throw new Error(errMsg);
  }
  return parsed as T;
}

// Binary sibling of apiFetch. The PDF endpoint streams application/pdf; we
// need the raw bytes plus the etag header (exposed via CORS by middleware).
//
// Two layers of cache discipline:
//   1. cache: "no-store" prevents the browser's HTTP cache from serving a
//      stale response without hitting the network (chrome-extension fetch
//      contexts handle revalidation inconsistently).
//   2. A `?v=...` cache-buster on the URL is belt-and-suspenders: even if
//      something downstream of fetch holds onto the URL, the URL is unique
//      per call so it can't serve a prior payload.
async function apiFetchPdf(
  path: string,
  ifNoneMatch?: string,
): Promise<{ status: number; bytes: Uint8Array | null; etag: string }> {
  const { apiBase, authToken } = await getSettings();
  if (!apiBase) throw new Error("API_BASE not set — open the options page.");
  const sep = path.includes("?") ? "&" : "?";
  const buster = encodeURIComponent(ifNoneMatch ?? Date.now().toString());
  const url = apiBase.replace(/\/+$/, "") + path + sep + "v=" + buster;

  const headers: Record<string, string> = {};
  if (authToken) headers["authorization"] = `Bearer ${authToken}`;
  if (ifNoneMatch) headers["if-none-match"] = ifNoneMatch;

  const res = await fetch(url, { method: "GET", headers, cache: "no-store" });
  const etag = res.headers.get("etag") ?? "";
  if (res.status === 304) return { status: 304, bytes: null, etag };
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  return { status: res.status, bytes, etag };
}

// MV3 SW message channels can't carry Blobs reliably, so we serialize the
// PDF as base64 here and the sidepanel reconstructs the Blob on the other
// end. The encoder chunks to avoid blowing the call stack on large PDFs.
function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as unknown as number[]);
  }
  return btoa(bin);
}

async function fetchDraftPdf(
  draftId: string,
  ifNoneMatch?: string,
): Promise<FetchPdfResult> {
  const { status, bytes, etag } = await apiFetchPdf(
    `/api/drafts/${encodeURIComponent(draftId)}/pdf`,
    ifNoneMatch,
  );
  if (status === 304 || !bytes) {
    return { kind: "not-modified", etag };
  }
  return { kind: "ok", base64: bytesToBase64(bytes), etag, mime: "application/pdf" };
}

async function scrapeActiveTab(): Promise<ScrapedJob> {
  const tab = await getSourceTab();
  if (!tab?.id) throw new Error("No active tab to scrape.");
  if (!tab.url || /^chrome:|^edge:|^about:|^chrome-extension:/.test(tab.url)) {
    throw new Error("Cannot scrape this page. Switch to a job posting tab.");
  }
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: scrapeJob,
  });
  const result = results[0]?.result;
  if (!result) throw new Error("Scrape returned nothing — try Re-scrape after the page finishes loading.");
  return result as ScrapedJob;
}

async function handle(msg: Msg): Promise<unknown> {
  switch (msg.type) {
    case "scrape":
      return scrapeActiveTab();

    case "tailor":
      if (!msg.jobDescription.trim()) throw new Error("Empty job description.");
      return apiFetch<Draft>("/api/tailor", {
        method: "POST",
        json: { jobDescription: msg.jobDescription },
      });

    case "edit":
      if (!msg.instruction.trim()) throw new Error("Empty instruction.");
      return apiFetch<Draft>("/api/edit", {
        method: "POST",
        json: { draftId: msg.draftId, instruction: msg.instruction },
      });

    case "undo":
      return apiFetch<Draft>(`/api/drafts/${encodeURIComponent(msg.draftId)}`, {
        method: "PATCH",
        json: { op: "undo" },
      });

    case "save-version":
      return apiFetch<Version>("/api/versions", {
        method: "POST",
        json: {
          company: msg.company,
          role: msg.role,
          jobDescription: msg.jobDescription,
          tailoredContent: msg.tailoredContent,
          outcome: msg.outcome,
        },
      });

    case "open-window":
      await openInWindow();
      return { ok: true };

    case "open-options":
      await chrome.runtime.openOptionsPage();
      return { ok: true };

    case "fetch-pdf":
      return fetchDraftPdf(msg.draftId, msg.ifNoneMatch);

    case "find-similar":
      return apiFetch<{ similar: SimilarResume[] }>("/api/versions/similar", {
        method: "POST",
        json: { jobDescription: msg.jobDescription },
      });

    case "fill-nearest-input":
      // The drawer/sidepanel can't fill file inputs directly. We inject a small
      // script into the active tab that creates a File from the base64 PDF
      // and fills the nearest file input. Works on ANY page.
      // The PDF data can be sent inline (from drawer content script) or via
      // session storage (from sidepanel, which can access chrome.storage.session).
      try {
        const tab = await getSourceTab();
        if (!tab?.id) return { ok: false, error: "No active tab" };
        let b64 = msg.pdfB64;
        let filename = msg.pdfFilename ?? "resume.pdf";
        // Fallback: read from session storage (sidepanel path).
        if (!b64) {
          const stored = await chrome.storage.session.get(["aptedDragPdfB64", "aptedDragPdfFilename"]);
          b64 = stored.aptedDragPdfB64 as string | undefined;
          if (!b64) return { ok: false, error: "No PDF staged" };
          filename = (stored.aptedDragPdfFilename as string) ?? "resume.pdf";
          await chrome.storage.session.remove(["aptedDragPdfB64", "aptedDragPdfFilename"]);
        }
        // Inject a function that converts base64 to a File and fills the input.
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          args: [b64, filename],
          func: (base64: string, name: string) => {
            const bin = atob(base64);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            const file = new File([bytes], name, { type: "application/pdf", lastModified: Date.now() });
            const inputs = Array.from(document.querySelectorAll<HTMLInputElement>("input[type='file']"));
            if (!inputs.length) return;
            const target = inputs.find((i) => /pdf/i.test(i.accept))
              ?? inputs.find((i) => i.offsetParent !== null)
              ?? inputs[0]!;
            if (!target) return;
            const dt = new DataTransfer();
            dt.items.add(file);
            target.files = dt.files;
            target.dispatchEvent(new Event("change", { bubbles: true }));
          },
        });
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }

    case "get-draft":
      try {
        return await apiFetch<Draft>(
          `/api/drafts/${encodeURIComponent(msg.draftId)}`,
          { method: "GET" },
        );
      } catch (e) {
        // Distinguish 404 (draft deleted server-side) from network errors so
        // the session restore can clear draftId without alarming the user.
        const msgStr = e instanceof Error ? e.message : String(e);
        if (/HTTP 404/.test(msgStr) || /not found/i.test(msgStr)) {
          return { notFound: true };
        }
        throw e;
      }
  }
}

// Context menu entries: a page-context "Open apted" plus a selection-context
// "Tailor with apted" that stashes the highlighted text as the JD for the
// next side-panel open. Registered on install / startup (idempotent).
function setupContextMenus(): void {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "apted-open",
      title: "Open apted",
      contexts: ["page", "action"],
    });
    chrome.contextMenus.create({
      id: "apted-tailor-selection",
      title: "Tailor with apted",
      contexts: ["selection"],
    });
  });
}
chrome.runtime.onInstalled.addListener(setupContextMenus);
chrome.runtime.onStartup.addListener(setupContextMenus);

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId === "apted-tailor-selection" && info.selectionText) {
    await chrome.storage.session.set({ pendingJd: info.selectionText });
  }
  await openInWindow();
});

chrome.runtime.onMessage.addListener((msg: Msg, _sender, sendResponse) => {
  handle(msg)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((e: unknown) => {
      const error = e instanceof Error ? e.message : String(e);
      sendResponse({ ok: false, error });
    });
  return true; // keep the message channel open for async response
});
