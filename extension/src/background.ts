import { scrapeJob } from "./scrapers";
import { getSettings } from "./storage";
import type { FetchPdfResult, Msg } from "./messages";
import type { Draft, ScrapedJob, SimilarResume, Version } from "./types";
import { mapVersionList, type ApiVersionRow } from "./version-list";

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
  // Always clear the popup so chrome.action.onClicked fires.
  // The drawer opens directly on the active job-site tab.
  await chrome.action.setPopup({ popup: "" });
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

// Try to open the drawer on the active tab. If the tab isn't a supported job
// site (no content script injected), dynamically inject the drawer script
// so the drawer works on any careers page.
async function openDrawerOnActiveTab(): Promise<void> {
  const tab = await getSourceTab();
  if (!tab?.id) {
    void openInWindow();
    return;
  }
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "open-drawer" });
  } catch {
    // Content script not present — inject the drawer script and open it.
    // Inject into the MAIN world (default); activeTab grants access for this
    // when invoked by clicking the extension icon. The drawer listens for a
    // custom DOM event as well as chrome.runtime.onMessage so it works in
    // both MAIN and ISOLATED worlds.
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["drawer.js"],
      });
      // Wait for the IIFE to finish setting up the DOM and listeners.
      await new Promise((r) => setTimeout(r, 200));
      // Dispatch a DOM event to open the drawer (works in MAIN world).
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          window.dispatchEvent(new CustomEvent("apted-open-drawer"));
        },
      });
    } catch (e) {
      console.warn("[apted] drawer injection failed, falling back to popup:", e);
      void openInWindow();
    }
  }
}

chrome.action.onClicked.addListener(() => {
  void openDrawerOnActiveTab();
});

// Keyboard shortcut entry point. Arc swallows icon clicks before they reach
// the extension, so the keyboard shortcut is the reliable open-trigger there.
chrome.commands.onCommand.addListener((command) => {
  if (command === "open-apted") void openDrawerOnActiveTab();
});

// Omnibox: type "apted" + space in the URL bar to invoke. Anything after the
// space is treated as the JD (so you can paste a one-liner JD inline if you
// have one). Hitting Enter with no extra text just opens the drawer on the
// active tab (or falls back to the popup window).
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
  await openDrawerOnActiveTab();
});

chrome.windows.onRemoved.addListener(async (closedId) => {
  const { aptedWindowId } = await chrome.storage.session.get({ aptedWindowId: null });
  if (aptedWindowId === closedId) {
    await chrome.storage.session.remove("aptedWindowId");
  }
});

let tailorAbortController: AbortController | null = null;

async function apiFetch<T>(path: string, init: RequestInit & { json?: unknown }): Promise<T> {
  const { apiBase, authToken } = await getSettings();
  const base = apiBase || "https://apted.vercel.app";
  const url = base.replace(/\/+$/, "") + path;

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
    console.error(`[apted] API ${path} failed: HTTP ${res.status}`, text);
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
  const base = apiBase || "https://apted.vercel.app";
  const sep = path.includes("?") ? "&" : "?";
  const buster = encodeURIComponent(ifNoneMatch ?? Date.now().toString());
  const url = base.replace(/\/+$/, "") + path + sep + "v=" + buster;

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

    case "extract":
      return apiFetch<{ title: string; company: string; location: string; terms: string[] }>("/api/extract", {
        method: "POST",
        json: {
          url: msg.url,
          title: msg.title,
          company: msg.company,
          jobDescription: msg.jobDescription,
          source: msg.source,
        },
      });

    case "tailor":
      if (!msg.jobDescription.trim()) throw new Error("Empty job description.");
      tailorAbortController?.abort();
      tailorAbortController = new AbortController();
      try {
        const result = await apiFetch<Draft>("/api/tailor", {
          method: "POST",
          json: { jobDescription: msg.jobDescription },
          signal: tailorAbortController.signal,
        });
        tailorAbortController = null;
        return result;
      } catch (e) {
        tailorAbortController = null;
        throw e;
      }

    case "cancel-tailor":
      if (tailorAbortController) {
        tailorAbortController.abort();
        tailorAbortController = null;
      }
      return { ok: true };

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
          tailoredContent: msg.tailoredContent,
          application: {
            company: msg.company,
            role: msg.role,
            jobDescription: msg.jobDescription,
            outcome: msg.outcome,
          },
        },
      });

    case "auto-save-application":
      // Save the current draft as a new version AND create an application for
      // it in one atomic POST, marking the outcome as "applied" and stamping
      // the portal URL the user submitted from.
      return apiFetch<Version>("/api/versions", {
        method: "POST",
        json: {
          tailoredContent: msg.tailoredContent,
          application: {
            company: msg.company,
            role: msg.role,
            jobDescription: msg.jobDescription,
            outcome: "applied",
            portalUrl: msg.portalUrl,
          },
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

    case "fetch-version-pdf": {
      const data = await apiFetch<{ pdfBase64: string | null }>(
        `/api/versions/${encodeURIComponent(msg.versionId)}`,
        { method: "GET" },
      );
      return { base64: data.pdfBase64, mime: "application/pdf" };
    }

    case "list-versions": {
      // GET /api/versions returns each version with its aggregated applications
      // (most recent first). Flatten to a browse row: company/role/outcome come
      // from the latest application, falling back to the version's generated name.
      const data = await apiFetch<ApiVersionRow[]>("/api/versions", { method: "GET" });
      return mapVersionList(data);
    }

    case "get-version": {
      // Load a saved version as the current draft. The /use endpoint creates a
      // fresh draft row from the version's tailoredContent + JD each call, so
      // the drawer gets a canonical Draft it can edit / fetch a PDF for.
      const data = await apiFetch<Draft>(
        `/api/versions/${encodeURIComponent(msg.versionId)}/use`,
        { method: "POST" },
      );
      return data;
    }

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
        // Returns diagnostic info so the caller can report what happened.
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          args: [b64, filename],
          func: (base64: string, name: string) => {
            const log: string[] = [];
            try {
              const bin = atob(base64);
              const bytes = new Uint8Array(bin.length);
              for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
              const file = new File([bytes], name, { type: "application/pdf", lastModified: Date.now() });
              log.push(`File created: ${file.size} bytes, ${file.type}`);

              const inputs = Array.from(document.querySelectorAll<HTMLInputElement>("input[type='file']"));
              log.push(`Found ${inputs.length} file input(s) on document`);

              // Also check inside iframes (Ashby nests application form in an iframe sometimes)
              let iframeInputs: HTMLInputElement[] = [];
              try {
                for (const frame of document.querySelectorAll('iframe')) {
                  try {
                    const doc = frame.contentDocument;
                    if (doc) {
                      const fInputs = Array.from(doc.querySelectorAll<HTMLInputElement>("input[type='file']"));
                      if (fInputs.length) {
                        log.push(`Found ${fInputs.length} file input(s) in iframe src=${frame.src.slice(0, 80)}`);
                        iframeInputs.push(...fInputs);
                      }
                    }
                  } catch { /* cross-origin iframe — can't peek inside */ }
                }
              } catch { /* ignore */ }

              const allInputs = [...inputs, ...iframeInputs];
              if (!allInputs.length) {
                log.push("NO file inputs found anywhere");
                return { ok: false, log };
              }

              const target = allInputs.find((i) => /pdf/i.test(i.accept))
                ?? allInputs.find((i) => i.offsetParent !== null)
                ?? allInputs[0]!;
              if (!target) {
                log.push("No suitable target input");
                return { ok: false, log };
              }

              log.push(`Target input found: accept="${target.accept}" hidden=${target.hidden} parent=${target.offsetParent !== null}`);

              const dt = new DataTransfer();
              dt.items.add(file);
              target.files = dt.files;
              log.push(`Set target.files to ${target.files?.length ?? 0} file(s)`);

              // Dispatch both change and input events for React/other frameworks
              target.dispatchEvent(new Event("change", { bubbles: true }));
              target.dispatchEvent(new Event("input", { bubbles: true }));
              log.push("Dispatched change + input events");

              return { ok: true, log };
            } catch (e) {
              log.push(`EXCEPTION: ${e instanceof Error ? e.message : String(e)}`);
              return { ok: false, log };
            }
          },
        });
        // executeScript returns an array of results (one per frame injected)
        const injectResult = results?.[0] as { ok: boolean; log: string[] } | undefined;
        if (injectResult && !injectResult.ok) {
          return { ok: false, error: injectResult.log.join("\n") };
        }
        // Also log the success case so we can see what happened
        if (injectResult?.log) console.log("[apted] inject diagnostics:", injectResult.log.join("\n"));
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
    // "open-drawer" is sent FROM background TO content scripts via
    // chrome.tabs.sendMessage, so it should never arrive here. If it
    // somehow does, respond with an error rather than silently dropping.
    case "open-drawer":
      throw new Error("open-drawer should not be sent to background");
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
  await openDrawerOnActiveTab();
});

chrome.runtime.onMessage.addListener((msg: Msg, _sender, sendResponse) => {
  // "open-drawer" is sent FROM background TO content scripts via
  // chrome.tabs.sendMessage — it should never arrive here.
  if ((msg as { type: string }).type === "open-drawer") {
    return false; // not for us — don't keep the channel open
  }

  Promise.resolve()
    .then(() => handle(msg))
    .then((data) => sendResponse({ ok: true, data }))
    .catch((e: unknown) => {
      const error = e instanceof Error ? e.message : String(e);
      sendResponse({ ok: false, error });
    });
  return true; // keep the message channel open for async response
});
