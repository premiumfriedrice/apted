import { getSettings } from "./storage";
import { clearPdfCache, fetchPdfForPreview, getDraftPdfBlob, suggestPdfFilename } from "./pdf";
import { clearSession, readSession, writeSession, type StoredChatTurn } from "./session";
import type { Msg, Reply } from "./messages";
import type { Draft, Outcome, ScrapedJob, Version } from "./types";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el as T;
};

const els = {
  connection: $("connection"),
  openOptions: $<HTMLButtonElement>("open-options"),
  rescrape: $<HTMLButtonElement>("rescrape"),
  jdCompany: $<HTMLInputElement>("jd-company"),
  jdRole: $<HTMLInputElement>("jd-role"),
  jdText: $<HTMLTextAreaElement>("jd-text"),
  tailor: $<HTMLButtonElement>("tailor"),
  newTailor: $<HTMLButtonElement>("new-tailor"),
  undo: $<HTMLButtonElement>("undo"),
  saveVersion: $<HTMLButtonElement>("save-version"),
  downloadPdf: $<HTMLButtonElement>("download-pdf"),
  preview: $("preview"),
  previewEmpty: $("preview-empty"),
  previewLoading: $("preview-loading"),
  previewError: $("preview-error"),
  previewErrorMsg: $("preview-error-msg"),
  previewRetry: $<HTMLButtonElement>("preview-retry"),
  previewEmbed: $<HTMLIFrameElement>("preview-embed"),
  chatLog: $("chat-log"),
  chatForm: $<HTMLFormElement>("chat-form"),
  chatInput: $<HTMLInputElement>("chat-input"),
  chatSend: $<HTMLButtonElement>("chat-send"),
  status: $("status"),
  saveDialog: $<HTMLDialogElement>("save-dialog"),
  saveForm: $<HTMLFormElement>("save-form"),
  saveCompany: $<HTMLInputElement>("save-company"),
  saveRole: $<HTMLInputElement>("save-role"),
  saveOutcome: $<HTMLSelectElement>("save-outcome"),
};

type State = {
  draft: Draft | null;
  jobDescription: string;
  chat: StoredChatTurn[];
  pdfObjectUrl: string | null;
  pdfForDraftUpdatedAt: string | null;
  pdfLoading: boolean;      // true while fetching PDF for the preview
  restoring: boolean;        // suppress session writes during initial hydration
};

const state: State = {
  draft: null,
  jobDescription: "",
  chat: [],
  pdfObjectUrl: null,
  pdfForDraftUpdatedAt: null,
  pdfLoading: false,
  restoring: false,
};

// Debounce frequent writes (input events on the JD form) so we don't slam
// chrome.storage on every keystroke. setDraft / appendTurn go through this
// too — fine, those are infrequent.
let persistTimer: number | null = null;
function schedulePersist(delayMs = 250): void {
  if (state.restoring) return;
  if (persistTimer !== null) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void writeSession({
      jd: els.jdText.value,
      company: els.jdCompany.value,
      role: els.jdRole.value,
      draftId: state.draft?.id ?? null,
      chat: state.chat,
    });
  }, delayMs) as unknown as number;
}

function invalidatePdf(): void {
  if (state.pdfObjectUrl) {
    URL.revokeObjectURL(state.pdfObjectUrl);
  }
  state.pdfObjectUrl = null;
  state.pdfForDraftUpdatedAt = null;
  clearPdfCache();
  els.previewEmbed.hidden = true;
}

function showPreviewState(kind: "empty" | "loading" | "error" | "embed"): void {
  els.previewEmpty.hidden = kind !== "empty";
  els.previewLoading.hidden = kind !== "loading";
  els.previewError.hidden = kind !== "error";
  els.previewEmbed.hidden = kind !== "embed";
}

async function refreshPdfPreview(): Promise<void> {
  if (!state.draft) {
    showPreviewState("empty");
    return;
  }

  const d = state.draft;
  showPreviewState("loading");
  state.pdfLoading = true;

  try {
    const { objectUrl, changed } = await fetchPdfForPreview({
      draftId: d.id,
      draftUpdatedAt: d.updatedAt,
    });

    if (!changed && state.pdfObjectUrl === objectUrl) {
      // Same bytes, same URL — nothing to repaint.
      showPreviewState("embed");
      return;
    }

    // New object URL or first load.
    if (state.pdfObjectUrl && state.pdfObjectUrl !== objectUrl) {
      URL.revokeObjectURL(state.pdfObjectUrl);
    }
    state.pdfObjectUrl = objectUrl;
    state.pdfForDraftUpdatedAt = d.updatedAt;

    els.previewEmbed.src = objectUrl;
    showPreviewState("embed");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    els.previewErrorMsg.textContent = msg;
    showPreviewState("error");
  } finally {
    state.pdfLoading = false;
  }
}

function send<K extends Msg["type"]>(msg: Extract<Msg, { type: K }>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (reply: Reply<unknown>) => {
      const err = chrome.runtime.lastError;
      if (err) return reject(new Error(err.message));
      if (!reply) return reject(new Error("No response from background."));
      if (!reply.ok) return reject(new Error(reply.error));
      resolve(reply.data);
    });
  });
}

function setStatus(text: string, kind: "" | "ok" | "error" = ""): void {
  els.status.textContent = text;
  els.status.className = "status" + (kind ? " " + kind : "");
}

function setDraft(draft: Draft | null): void {
  // When draft is cleared or replaced with a different one, drop the cached
  // PDF so the preview fetches fresh bytes.
  if (!draft) {
    invalidatePdf();
  } else if (!state.draft || state.draft.id !== draft.id) {
    // Different draft (or first draft) — clear the old preview. The new
    // preview will be fetched by refreshPdfPreview() below.
    invalidatePdf();
  }
  // When the same draft has a newer updatedAt (edit finished), we keep the
  // current PDF embed visible while refreshPdfPreview() revalidates with
  // etag. If the server returns 304 the preview doesn't flicker; if new
  // bytes arrive we swap the embed src.
  state.draft = draft;
  void refreshPdfPreview();
  // Publish the current draft to chrome.storage.local so the content-script
  // drag chip on job sites knows there's a draft ready to drop. Content
  // scripts can't share JS state with the side panel; storage is the bridge.
  if (draft) {
    void chrome.storage.local.set({
      aptedCurrentDraft: {
        id: draft.id,
        updatedAt: draft.updatedAt,
        company: els.jdCompany.value.trim() || undefined,
        role: els.jdRole.value.trim() || undefined,
      },
    });
  } else {
    void chrome.storage.local.remove("aptedCurrentDraft");
  }
  const hasDraft = !!draft;
  els.chatInput.disabled = !hasDraft;
  els.chatSend.disabled = !hasDraft;
  els.saveVersion.disabled = !hasDraft;
  els.downloadPdf.disabled = !hasDraft;
  els.undo.disabled = !hasDraft || !(draft?.history?.length);
  schedulePersist();
}

async function doDownloadPdf(): Promise<void> {
  if (!state.draft) return;
  const d = state.draft;
  const original = els.downloadPdf.textContent;
  setStatus("Preparing PDF…");
  els.downloadPdf.disabled = true;
  els.downloadPdf.textContent = "Preparing…";
  try {
    const { blob } = await getDraftPdfBlob({
      draftId: d.id,
      draftUpdatedAt: d.updatedAt,
    });
    // Cache the object URL so the drag chip / future affordances can reuse it.
    if (state.pdfObjectUrl) URL.revokeObjectURL(state.pdfObjectUrl);
    const url = URL.createObjectURL(blob);
    state.pdfObjectUrl = url;
    state.pdfForDraftUpdatedAt = d.updatedAt;
    const filename = suggestPdfFilename({
      id: d.id,
      company: els.jdCompany.value.trim() || undefined,
      role: els.jdRole.value.trim() || undefined,
    });
    // Programmatic download: build an anchor, click it, drop it. Same dialog
    // as a real link but the button stays a button.
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // After a successful download, the PDF blob is cached in pdf.ts.
    // Update the preview embed to match in case it wasn't showing yet.
    if (!state.pdfObjectUrl || state.pdfObjectUrl !== url) {
      if (state.pdfObjectUrl) URL.revokeObjectURL(state.pdfObjectUrl);
      state.pdfObjectUrl = url;
      state.pdfForDraftUpdatedAt = d.updatedAt;
      els.previewEmbed.src = url;
      showPreviewState("embed");
    }
    setStatus("Downloaded " + filename, "ok");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    setStatus("PDF failed: " + msg, "error");
  } finally {
    els.downloadPdf.disabled = !state.draft;
    els.downloadPdf.textContent = original ?? "Download PDF";
  }
}

function appendTurn(who: "you" | "apted", text: string): void {
  const div = document.createElement("div");
  div.className = "turn " + who;
  div.innerHTML = `<span class="who">${who}</span><span></span>`;
  div.lastElementChild!.textContent = text;
  els.chatLog.appendChild(div);
  els.chatLog.scrollTop = els.chatLog.scrollHeight;
  state.chat.push({ who, text });
  schedulePersist();
}

async function refreshConnection(): Promise<void> {
  const s = await getSettings();
  if (!s.apiBase) {
    els.connection.textContent = "not configured";
    els.connection.title = "Open Settings to set API_BASE.";
    return;
  }
  try {
    const host = new URL(s.apiBase).host;
    els.connection.textContent = host;
    els.connection.title = s.apiBase;
  } catch {
    els.connection.textContent = "invalid API_BASE";
  }
}

async function doScrape(): Promise<void> {
  setStatus("Scraping active tab…");
  try {
    const scraped = (await send({ type: "scrape" })) as ScrapedJob;
    els.jdText.value = scraped.jobDescription;
    state.jobDescription = scraped.jobDescription;
    if (!els.jdCompany.value) els.jdCompany.value = scraped.company;
    if (!els.jdRole.value) els.jdRole.value = scraped.title;
    // Programmatic input changes don't fire the input event, so the input
    // listener wouldn't capture the scrape into the session. Persist directly.
    schedulePersist(0);
    setStatus(`Scraped from ${scraped.source}.`, "ok");
  } catch (e) {
    setStatus(errMsg(e), "error");
  }
}

async function doTailor(): Promise<void> {
  const jd = els.jdText.value.trim();
  if (!jd) {
    setStatus("Paste or scrape a job description first.", "error");
    return;
  }
  state.jobDescription = jd;
  setStatus("Tailoring… this can take 10–30s.");
  els.tailor.disabled = true;
  try {
    const draft = (await send({ type: "tailor", jobDescription: jd })) as Draft;
    setDraft(draft);
    appendTurn("apted", "First-pass tailor ready.");
    setStatus("Done.", "ok");
  } catch (e) {
    setStatus(errMsg(e), "error");
  } finally {
    els.tailor.disabled = false;
  }
}

async function doEdit(instruction: string): Promise<void> {
  if (!state.draft) return;
  appendTurn("you", instruction);
  setStatus("Editing…");
  els.chatInput.disabled = true;
  els.chatSend.disabled = true;
  try {
    const draft = (await send({
      type: "edit",
      draftId: state.draft.id,
      instruction,
    })) as Draft;
    setDraft(draft);
    appendTurn("apted", "Draft updated.");
    setStatus("Done.", "ok");
  } catch (e) {
    appendTurn("apted", "Error: " + errMsg(e));
    setStatus(errMsg(e), "error");
  } finally {
    els.chatInput.disabled = false;
    els.chatSend.disabled = false;
    els.chatInput.focus();
  }
}

async function doUndo(): Promise<void> {
  if (!state.draft) return;
  setStatus("Undoing…");
  try {
    const draft = (await send({ type: "undo", draftId: state.draft.id })) as Draft;
    setDraft(draft);
    setStatus("Reverted.", "ok");
  } catch (e) {
    setStatus(errMsg(e), "error");
  }
}

async function doSaveVersion(): Promise<void> {
  if (!state.draft) return;
  els.saveCompany.value = els.jdCompany.value.trim();
  els.saveRole.value = els.jdRole.value.trim();
  els.saveDialog.showModal();
}

async function onSaveDialogClose(): Promise<void> {
  if (els.saveDialog.returnValue !== "confirm") return;
  if (!state.draft) return;
  const company = els.saveCompany.value.trim();
  const role = els.saveRole.value.trim();
  if (!company || !role) {
    setStatus("Company and role are required.", "error");
    return;
  }
  setStatus("Saving version…");
  try {
    const version = (await send({
      type: "save-version",
      company,
      role,
      jobDescription: state.draft.jobDescription,
      tailoredContent: state.draft.content,
      outcome: els.saveOutcome.value as Outcome,
    })) as Version;
    setStatus(`Saved as version ${version.id}.`, "ok");
  } catch (e) {
    setStatus(errMsg(e), "error");
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// Restore the JD form, chat log, and draft from the persisted session if one
// exists within the TTL window. Returns true when something was restored.
async function restoreFromSession(): Promise<boolean> {
  const snap = await readSession();
  if (!snap) return false;

  state.restoring = true;
  try {
    els.jdText.value = snap.jd;
    els.jdCompany.value = snap.company;
    els.jdRole.value = snap.role;
    state.jobDescription = snap.jd;

    // Replay chat into the DOM and into state.chat.
    state.chat = [];
    els.chatLog.innerHTML = "";
    for (const t of snap.chat) appendTurn(t.who, t.text);

    if (snap.draftId) {
      try {
        const draft = (await send({ type: "get-draft", draftId: snap.draftId })) as
          | Draft
          | { notFound: true };
        if ("notFound" in draft) {
          // Draft was deleted server-side — keep the JD form, drop the draft
          // from the snapshot so next reload doesn't try the dead id again.
          setStatus("Previous draft is no longer available; JD restored.", "ok");
          await writeSession({
            jd: snap.jd,
            company: snap.company,
            role: snap.role,
            draftId: null,
            chat: snap.chat,
          });
        } else {
          setDraft(draft);
          setStatus("Session restored.", "ok");
        }
      } catch (e) {
        // Any network error during restore: don't leave the user looking at a
        // half-restored session. Drop the draftId from the snapshot so the
        // next open starts clean from this point, but keep JD + chat so the
        // user doesn't lose their notes.
        setStatus("Couldn't load previous draft: " + errMsg(e), "error");
        try {
          await writeSession({
            jd: snap.jd,
            company: snap.company,
            role: snap.role,
            draftId: null,
            chat: snap.chat,
          });
        } catch {
          /* ignore — best-effort cleanup */
        }
      }
    } else {
      setStatus("Session restored.", "ok");
    }
    return true;
  } finally {
    state.restoring = false;
  }
}

async function newTailor(): Promise<void> {
  if (state.draft || state.chat.length > 0 || els.jdText.value) {
    if (!window.confirm("Discard the current draft and start a new tailor?")) return;
  }
  state.restoring = true;
  try {
    els.jdText.value = "";
    els.jdCompany.value = "";
    els.jdRole.value = "";
    state.jobDescription = "";
    state.chat = [];
    els.chatLog.innerHTML = "";
    setDraft(null);
    invalidatePdf();
    els.previewEmbed.src = "";
    showPreviewState("empty");
    await clearSession();
    setStatus("New tailor.", "ok");
  } finally {
    state.restoring = false;
  }
}

// Wire up.
els.openOptions.addEventListener("click", () => chrome.runtime.openOptionsPage());
els.rescrape.addEventListener("click", () => void doScrape());
els.tailor.addEventListener("click", () => void doTailor());
els.undo.addEventListener("click", () => void doUndo());
els.saveVersion.addEventListener("click", () => void doSaveVersion());
els.downloadPdf.addEventListener("click", () => void doDownloadPdf());
els.newTailor.addEventListener("click", () => void newTailor());
els.previewRetry.addEventListener("click", () => void refreshPdfPreview());

// Persist on form-field changes. Debounced inside schedulePersist so we
// don't slam storage on every keystroke.
els.jdText.addEventListener("input", () => schedulePersist(500));
els.jdCompany.addEventListener("input", () => schedulePersist(500));
els.jdRole.addEventListener("input", () => schedulePersist(500));
els.saveDialog.addEventListener("close", () => void onSaveDialogClose());
els.chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const v = els.chatInput.value.trim();
  if (!v) return;
  els.chatInput.value = "";
  void doEdit(v);
});

chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === "sync") void refreshConnection();
});

void refreshConnection();
showPreviewState("empty");

void (async () => {
  // 1) Context menu "Tailor with apted" wins over everything — that's an
  //    explicit "tailor THIS new selection" intent. Discard the session.
  try {
    const stored = await chrome.storage.session.get({ pendingJd: null });
    if (stored.pendingJd) {
      await clearSession();
      const jd = String(stored.pendingJd);
      els.jdText.value = jd;
      state.jobDescription = jd;
      await chrome.storage.session.remove("pendingJd");
      setStatus("JD loaded from your selection. Click Tailor to start.", "ok");
      return;
    }
  } catch {
    /* ignore — fall through */
  }

  // 2) Try to restore the prior session (within 6h TTL).
  try {
    if (await restoreFromSession()) return;
  } catch {
    /* ignore — fall through to auto-scrape */
  }

  // 3) Otherwise, auto-scrape the user's actual browsing tab on supported sites.
  try {
    const win = await chrome.windows.getLastFocused({
      populate: true,
      windowTypes: ["normal"],
    });
    const tab = win.tabs?.find((t) => t.active);
    const url = tab?.url ?? "";
    if (/linkedin\.com|greenhouse\.io|lever\.co|myworkdayjobs\.com|workday\.com/.test(url)) {
      await doScrape();
    }
  } catch {
    /* ignore */
  }
})();
