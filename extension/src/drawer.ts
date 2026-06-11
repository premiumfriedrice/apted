// Floating drawer content script for supported job sites.
// Injects a handle + drawer into the page via shadow DOM.

import { getSettings } from "./storage";
import { clearPdfCache, fetchPdfForPreview, getDraftPdfBlob, suggestPdfFilename } from "./pdf";
import { clearSession, readSession, writeSession, type StoredChatTurn } from "./session";
import type { Msg, Reply } from "./messages";
import type { Draft, Outcome, ScrapedJob, SimilarResume, Version } from "./types";

export const DRAWSER_WIDTH = 384;
export const HANDLE_SIZE = 48;
export const ACCENT_COLOR = "#2563eb";

const SUPPORTED_URL_RE =
  /linkedin\.com\/jobs\/|greenhouse\.io|lever\.co|myworkdayjobs\.com|ashbyhq\.com/;

export function getPulseKeyframes(): string {
  return `
@keyframes apted-pulse {
  0%, 100% { transform: scale(1); }
  7%, 30% { transform: scale(1.05); }
  15%, 23% { transform: scale(1); }
}`;
}

export function getSlideKeyframes(): string {
  return `
@keyframes apted-slide-in {
  from { transform: translateX(100%); }
  to   { transform: translateX(0); }
}
@keyframes apted-slide-out {
  from { transform: translateX(0); }
  to   { transform: translateX(100%); }
}`;
}

export function createDrawerStyles(): string {
  const pulse = getPulseKeyframes();
  const slide = getSlideKeyframes();

  return /* css */ `
    :host, .apted-drawer, .apted-handle, .apted-backdrop,
    .apted-header, .apted-section, .apted-body, .apted-chat, .apted-status,
    .apted-btn, .apted-input, .apted-textarea, .apted-select,
    .apted-dialog, .apted-dialog-backdrop {
      all: initial;
      box-sizing: border-box;
    }

    ${slide}
    ${pulse}

    :host {
      position: fixed;
      top: 0;
      right: 0;
      height: 100vh;
      z-index: 2147483646;
      font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      color: #171717;
      pointer-events: none;
    }

    /* ── Handle: geometric "a" glyph, flush right ─────────────────────── */
    .apted-handle {
      position: fixed;
      right: 0;
      top: 0;
      z-index: 2147483647;
      pointer-events: auto;
      cursor: pointer;
      background: none;
      border: none;
      padding: 0;
      margin: 0;
      width: 64px;
      height: 72px;
      font: inherit;
      color: inherit;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      overflow: visible;
      transition: transform 0.35s ease-out, right 0.35s ease-out, width 0.2s ease, height 0.2s ease, background 0.2s ease;
    }

    .apted-handle:not(.apted-handle--open):hover {
      transform: translateX(-4px);
    }

    .apted-handle--open {
      right: 12px;
      transform: translateX(-368px) translateY(9px);
      justify-content: flex-end;
      overflow: visible;
    }

    .apted-handle--open:hover {
      transform: translateX(-368px) translateY(9px);
    }

    .apted-handle--disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    .apted-handle--hidden {
      display: none;
    }

    .apted-handle-glyph {
      font-family: "Outfit", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 56px;
      font-weight: 400;
      color: #111;
      line-height: 1;
      transition: font-size 0.35s ease-out, color 0.2s ease, filter 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.12));
    }

    .apted-handle:not(.apted-handle--open):hover .apted-handle-glyph {
      filter: drop-shadow(0 3px 5px rgba(0, 0, 0, 0.18));
    }

    .apted-handle--open .apted-handle-glyph {
      font-size: 18px;
      font-weight: 500;
      color: #000 !important;
      filter: none !important;
    }

    .apted-handle--open:hover .apted-handle-glyph {
      color: #000 !important;
      filter: none !important;
    }

    /* ── Blue dot badge ───────────────────────────────────────────────── */
    .apted-handle-dot {
      position: absolute;
      top: 2px;
      right: 2px;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #2563eb;
      border: 1.5px solid #fff;
      display: none;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
    }

    .apted-handle-dot--visible {
      display: block;
    }

    /* ── Pulse animation on the glyph ─────────────────────────────────── */
    .apted-handle--pulse .apted-handle-glyph {
      animation: apted-pulse 1.8s ease-in-out 2;
      transform-origin: center;
    }

    /* ── Drawer: card overlay matching Simplified layout ──────────────── */
    .apted-drawer {
      position: fixed;
      top: 12px;
      right: 12px;
      width: ${DRAWSER_WIDTH}px;
      max-height: calc(100vh - 24px);
      background: #fff;
      border: 1px solid #e5e5e5;
      border-radius: 8px;
      display: flex;
      flex-direction: column;
      pointer-events: auto;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
      transform: translateX(calc(100% + 24px));
      transition: transform 0.35s ease-out;
      z-index: 2147483646;
      font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      color: #171717;
    }

    .apted-drawer--open {
      transform: translateX(0);
    }

    /* ── Sticky header ────────────────────────────────────────────────── */
    .apted-drawer-header {
      position: sticky;
      top: 0;
      z-index: 10;
      background: #fff;
      padding: 16px 16px 12px;
      border-bottom: 1px solid #f5f5f5;
      flex-shrink: 0;
    }

    .apted-drawer-header-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .apted-drawer-title {
      font-family: "Outfit", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 18px;
      font-weight: 500;
      color: #171717;
      margin: 0 0 0 12px;
      letter-spacing: -0.02em;
    }

    .apted-header-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border: 1px solid transparent;
      border-radius: 6px;
      background: none;
      color: #9ca3af;
      cursor: pointer;
      padding: 0;
      font: inherit;
      transition: color 0.15s, border-color 0.15s;
    }

    .apted-header-btn:hover {
      color: #374151;
      border-color: #e5e5e5;
    }

    .apted-connection-text {
      display: block;
      font-size: 10px;
      color: #9ca3af;
      margin-top: 4px;
    }

    /* ── Scrollable body ──────────────────────────────────────────────── */
    .apted-drawer-body {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 0 16px;
    }

    .apted-drawer-body::-webkit-scrollbar {
      width: 4px;
    }
    .apted-drawer-body::-webkit-scrollbar-track {
      background: transparent;
    }
    .apted-drawer-body::-webkit-scrollbar-thumb {
      background: #e5e5e5;
      border-radius: 2px;
    }

    /* ── Cards within body ────────────────────────────────────────────── */
    .apted-card {
      padding: 16px 0;
      border-bottom: 1px solid #f5f5f5;
    }

    .apted-card:last-child {
      border-bottom: none;
    }

    .apted-card-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 8px;
    }

    .apted-card-title {
      font-size: 12px;
      font-weight: 600;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin: 0;
    }

    .apted-btn-group {
      display: flex;
      gap: 4px;
    }

    /* ── Backdrop (narrow viewports) ───────────────────────────────────── */
    .apted-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.3);
      z-index: 2147483645;
      pointer-events: auto;
      display: none;
      transition: opacity 0.3s ease;
    }

    .apted-backdrop--visible {
      display: block;
    }

    /* ── Buttons ───────────────────────────────────────────────────────── */
    .apted-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: #fff;
      color: #171717;
      border: 1px solid #e5e5e5;
      border-radius: 6px;
      padding: 7px 14px;
      font: inherit;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
      white-space: nowrap;
    }

    .apted-btn:hover:not(:disabled) {
      background: #f9fafb;
      border-color: #d1d5db;
    }

    .apted-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .apted-btn--primary {
      background: ${ACCENT_COLOR};
      color: #fff;
      border-color: ${ACCENT_COLOR};
    }

    .apted-btn--primary:hover:not(:disabled) {
      background: #1d4ed8;
      border-color: #1d4ed8;
    }

    .apted-btn--sm {
      padding: 4px 10px;
      font-size: 12px;
      border-radius: 5px;
    }

    .apted-btn--full {
      width: 100%;
      justify-content: center;
    }

    /* ── Form elements ─────────────────────────────────────────────────── */
    .apted-input,
    .apted-textarea {
      display: block;
      width: 100%;
      background: #fff;
      color: #171717;
      border: 1px solid #e5e5e5;
      border-radius: 6px;
      padding: 8px 10px;
      font: inherit;
      font-size: 13px;
      outline: none;
      transition: border-color 0.15s;
      margin-bottom: 8px;
    }

    .apted-input:focus,
    .apted-textarea:focus {
      border-color: ${ACCENT_COLOR};
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
    }

    .apted-textarea {
      resize: vertical;
      min-height: 80px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 12px;
      line-height: 1.5;
    }

    .apted-input::placeholder,
    .apted-textarea::placeholder {
      color: #9ca3af;
    }

    .apted-input--chat {
      flex: 1;
      margin-bottom: 0;
      border-radius: 6px 0 0 6px;
      border-right: none;
    }

    .apted-select {
      background: #fff;
      color: #171717;
      border: 1px solid #e5e5e5;
      border-radius: 6px;
      padding: 8px 10px;
      font: inherit;
      font-size: 13px;
      width: 100%;
      outline: none;
    }

    /* ── Preview ───────────────────────────────────────────────────────── */
    .apted-preview-body {
      border: 1px solid #e5e5e5;
      background: #f9fafb;
      border-radius: 6px;
      overflow: hidden;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 280px;
    }

    .apted-preview-body .apted-empty {
      color: #9ca3af;
      text-align: center;
      font-size: 13px;
    }

    .apted-preview-embed {
      width: 100%;
      height: 100%;
      min-height: 280px;
      border: 0;
      border-radius: 6px;
    }

    .apted-preview-embed[hidden] {
      display: none;
    }

    .apted-preview-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      text-align: center;
      color: #9ca3af;
      font-size: 12px;
    }

    .apted-preview-state[hidden] {
      display: none;
    }

    .apted-spinner {
      width: 28px;
      height: 28px;
      border: 3px solid #e5e5e5;
      border-top-color: ${ACCENT_COLOR};
      border-radius: 50%;
      animation: apted-spin 0.7s linear infinite;
    }

    @keyframes apted-spin {
      to { transform: rotate(360deg); }
    }

    .apted-preview-error-msg {
      color: #dc2626;
      margin: 0;
      max-width: 260px;
      word-wrap: break-word;
    }

    /* ── Similar resumes ───────────────────────────────────────────────── */
    .apted-similar-list {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }

    .apted-similar-item {
      display: inline-flex;
      align-items: baseline;
      gap: 4px;
      font-size: 12px;
      padding: 3px 10px;
      background: #f9fafb;
      border: 1px solid #e5e5e5;
      border-radius: 999px;
    }

    .apted-similar-score {
      font-weight: 700;
      font-size: 12px;
      color: ${ACCENT_COLOR};
    }

    .apted-similar-text {
      color: #171717;
    }

    .apted-similar-company {
      color: #9ca3af;
    }

    /* ── Footer: Chat input ────────────────────────────────────────────── */
    .apted-drawer-footer {
      flex-shrink: 0;
      border-top: 1px solid #f5f5f5;
      padding: 12px 16px;
      background: #fff;
    }

    .apted-chat-form {
      display: flex;
    }

    .apted-chat-form .apted-btn--primary {
      border-radius: 0 6px 6px 0;
      flex-shrink: 0;
    }

    /* ── Status bar ────────────────────────────────────────────────────── */
    .apted-status {
      font-size: 11px;
      color: #9ca3af;
      margin-top: 6px;
      min-height: 16px;
    }

    .apted-status--error {
      color: #dc2626;
    }

    .apted-status--ok {
      color: #16a34a;
    }

    /* ── Utilities ─────────────────────────────────────────────────────── */
    .apted-spacer {
      flex: 1;
    }

    .apted-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    /* ── Save dialog overlay ───────────────────────────────────────────── */
    .apted-dialog {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 2147483647;
      background: #fff;
      color: #171717;
      border: 1px solid #e5e5e5;
      border-radius: 12px;
      padding: 20px;
      min-width: 280px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
      font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    }

    .apted-dialog[hidden] {
      display: none;
    }

    .apted-dialog h3 {
      font-size: 15px;
      font-weight: 600;
      margin: 0 0 12px;
      color: #171717;
    }

    .apted-dialog label {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-bottom: 10px;
      font-size: 12px;
      color: #6b7280;
    }

    .apted-dialog .apted-row {
      margin-top: 12px;
    }

    .apted-dialog-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.4);
      z-index: 2147483646;
    }

    .apted-dialog-backdrop[hidden] {
      display: none;
    }
  `;
}

export function createHandleSVG(): string {
  return /* svg */ `
    <span class="apted-handle-glyph">a</span>
  `;
}

export function createDrawerHTML(): string {
  return /* html */ `
    <div id="apted-backdrop" class="apted-backdrop"></div>

    <button id="apted-handle" class="apted-handle" title="Open apted" aria-label="Open apted">
      <span class="apted-handle-glyph">a</span>
      <span id="apted-handle-dot" class="apted-handle-dot"></span>
    </button>

    <div id="apted-drawer" class="apted-drawer">
      <div class="apted-drawer-header">
        <div class="apted-drawer-header-row">
          <h1 class="apted-drawer-title">pted</h1>
          <div class="apted-spacer"></div>
          <button id="apted-open-settings" class="apted-header-btn" title="Settings" aria-label="Settings">
            <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 24 24" width="18" height="18">
              <path d="M12 15.5A3.5 3.5 0 0 1 8.5 12 3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5 3.5 3.5 0 0 1-3.5 3.5zm7.43-2.53c.04-.32.07-.64.07-.97 0-.33-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98 0 .33.03.66.07.97l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65z"/>
            </svg>
          </button>
          <button id="apted-close-drawer" class="apted-header-btn" title="Minimize" aria-label="Minimize">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="18" height="18">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <span id="apted-connection" class="apted-connection-text" title="API base"></span>
      </div>

      <div class="apted-drawer-body">
        <div class="apted-card">
          <div class="apted-card-row">
            <h2 class="apted-card-title">Job description</h2>
            <button id="apted-rescrape" class="apted-btn apted-btn--sm">Scrape</button>
          </div>
          <input id="apted-jd-company" class="apted-input" placeholder="Company" />
          <input id="apted-jd-role" class="apted-input" placeholder="Role" />
          <textarea
            id="apted-jd-text"
            class="apted-textarea"
            rows="5"
            placeholder="Paste a job description, or click Scrape."
          ></textarea>
          <button id="apted-tailor" class="apted-btn apted-btn--primary apted-btn--full">Tailor Resume</button>
        </div>

        <div class="apted-card">
          <div class="apted-card-row">
            <h2 class="apted-card-title">Preview</h2>
            <div class="apted-btn-group">
              <button id="apted-download-pdf" class="apted-btn apted-btn--sm" disabled>Download</button>
              <button id="apted-save-version" class="apted-btn apted-btn--sm" disabled>Save</button>
              <button id="apted-undo" class="apted-btn apted-btn--sm" disabled>Undo</button>
            </div>
          </div>
          <div id="apted-preview" class="apted-preview-body">
            <div id="apted-preview-empty" class="apted-empty">No draft yet. Tailor a JD to get started.</div>
            <div id="apted-preview-loading" class="apted-preview-state" hidden>
              <div class="apted-spinner"></div>
              <span>Compiling PDF…</span>
            </div>
            <div id="apted-preview-error" class="apted-preview-state" hidden>
              <p id="apted-preview-error-msg" class="apted-preview-error-msg"></p>
              <button id="apted-preview-retry" class="apted-btn apted-btn--primary apted-btn--sm">Retry</button>
            </div>
            <iframe id="apted-preview-embed" class="apted-preview-embed" title="Resume preview" hidden></iframe>
          </div>
        </div>

        <div id="apted-similar-section" class="apted-card" hidden>
          <h2 class="apted-card-title">Similar resumes</h2>
          <div id="apted-similar-list" class="apted-similar-list"></div>
        </div>
      </div>

      <div class="apted-drawer-footer">
        <form id="apted-chat-form" class="apted-chat-form">
          <input
            id="apted-chat-input"
            class="apted-input apted-input--chat"
            placeholder="lead with the AI project · cut the GPA"
            autocomplete="off"
            disabled
          />
          <button id="apted-chat-send" type="submit" class="apted-btn apted-btn--primary" disabled>Send</button>
        </form>
        <div id="apted-status" class="apted-status" aria-live="polite"></div>
      </div>
    </div>

    <div id="apted-save-backdrop" class="apted-dialog-backdrop" hidden></div>
    <div id="apted-save-dialog" class="apted-dialog" hidden>
      <h3>Save as version</h3>
      <label>Company<input id="apted-save-company" class="apted-input" required /></label>
      <label>Role<input id="apted-save-role" class="apted-input" required /></label>
      <label>
        Outcome
        <select id="apted-save-outcome" class="apted-select">
          <option value="draft">draft</option>
          <option value="applied">applied</option>
          <option value="interview">interview</option>
          <option value="offer">offer</option>
          <option value="rejected">rejected</option>
        </select>
      </label>
      <div class="apted-row">
        <button id="apted-save-cancel" class="apted-btn">Cancel</button>
        <div class="apted-spacer"></div>
        <button id="apted-save-confirm" class="apted-btn apted-btn--primary">Save</button>
      </div>
    </div>
  `;
}

export type DrawerState = {
  draft: Draft | null;
  jobDescription: string;
  company: string;
  role: string;
  chat: StoredChatTurn[];
  pdfObjectUrl: string | null;
  pdfForDraftUpdatedAt: string | null;
  pdfLoading: boolean;
  restoring: boolean;
  open: boolean;
};

export function createInitialState(): DrawerState {
  return {
    draft: null,
    jobDescription: "",
    company: "",
    role: "",
    chat: [],
    pdfObjectUrl: null,
    pdfForDraftUpdatedAt: null,
    pdfLoading: false,
    restoring: false,
    open: false,
  };
}

(function () {
  if (!SUPPORTED_URL_RE.test(location.href)) {
    console.log("[apted] URL not supported:", location.href);
    return;
  }
  if (document.getElementById("apted-drawer-host")) {
    console.log("[apted] already injected");
    return;
  }
  console.log("[apted] injecting drawer on", location.hostname);

  // Inject @font-face globally so Outfit is available inside shadow DOM
  const fontStyle = document.createElement("style");
  fontStyle.textContent = `
    @font-face {
      font-family: 'Outfit';
      font-style: normal;
      font-weight: 400;
      font-display: swap;
      src: url('${chrome.runtime.getURL("fonts/outfit-400.ttf")}') format('truetype');
    }
    @font-face {
      font-family: 'Outfit';
      font-style: normal;
      font-weight: 500;
      font-display: swap;
      src: url('${chrome.runtime.getURL("fonts/outfit-500.ttf")}') format('truetype');
    }
    @font-face {
      font-family: 'Outfit';
      font-style: normal;
      font-weight: 700;
      font-display: swap;
      src: url('${chrome.runtime.getURL("fonts/outfit-700.ttf")}') format('truetype');
    }
  `;
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

  let shadow: ShadowRoot;
  try {
    shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>${createDrawerStyles()}</style>${createDrawerHTML()}`;
    console.log("[apted] shadow DOM populated");
  } catch (e) {
    console.error("[apted] shadow DOM setup failed:", e);
    return;
  }

  const $ = <T extends HTMLElement>(id: string): T => {
    const el = shadow.getElementById(id);
    if (!el) throw new Error(`#${id} missing in shadow DOM`);
    return el as T;
  };

  const els = {
    backdrop: $("apted-backdrop"),
    handle: $("apted-handle"),
    handleDot: $("apted-handle-dot"),
    drawer: $("apted-drawer"),
    connection: $("apted-connection"),
    openSettings: $("apted-open-settings"),
    closeDrawerBtn: $("apted-close-drawer"),
    rescrape: $("apted-rescrape"),
    jdCompany: $("apted-jd-company"),
    jdRole: $("apted-jd-role"),
    jdText: $("apted-jd-text"),
    tailor: $("apted-tailor"),
    downloadPdf: $("apted-download-pdf"),
    saveVersion: $("apted-save-version"),
    undo: $("apted-undo"),
    preview: $("apted-preview"),
    previewEmpty: $("apted-preview-empty"),
    previewLoading: $("apted-preview-loading"),
    previewError: $("apted-preview-error"),
    previewErrorMsg: $("apted-preview-error-msg"),
    previewRetry: $("apted-preview-retry"),
    previewEmbed: $("apted-preview-embed"),
    similarSection: $("apted-similar-section"),
    similarList: $("apted-similar-list"),
    chatForm: $("apted-chat-form"),
    chatInput: $("apted-chat-input"),
    chatSend: $("apted-chat-send"),
    status: $("apted-status"),
    saveBackdrop: $("apted-save-backdrop"),
    saveDialog: $("apted-save-dialog"),
    saveCompany: $("apted-save-company"),
    saveRole: $("apted-save-role"),
    saveOutcome: $("apted-save-outcome"),
    saveCancel: $("apted-save-cancel"),
    saveConfirm: $("apted-save-confirm"),
  };

  const state: DrawerState = createInitialState();
  let persistTimer: ReturnType<typeof setTimeout> | null = null;

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
    }, delayMs);
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
        showPreviewState("embed");
        return;
      }
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

  function renderSimilarResumes(similar: SimilarResume[]): void {
    if (!similar?.length) {
      els.similarSection.hidden = true;
      return;
    }
    els.similarSection.hidden = false;
    els.similarList.innerHTML = similar
      .map(
        (s) => `
        <span class="apted-similar-item">
          <span class="apted-similar-score">${s.score}%</span>
          <span class="apted-similar-text">${escHtml(s.role)} <span class="apted-similar-company">@ ${escHtml(s.company)}</span></span>
        </span>`,
      )
      .join("");
  }

  function escHtml(s: string): string {
    return s.replace(/[&<>"']/g, (ch) => {
      const map: Record<string, string> = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      };
      return map[ch] ?? ch;
    });
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
    els.status.className = "apted-status" + (kind ? " apted-status--" + kind : "");
  }

  function errMsg(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
  }

  function setDraft(draft: Draft | null): void {
    if (!draft) {
      invalidatePdf();
    } else if (!state.draft || state.draft.id !== draft.id) {
      invalidatePdf();
    }
    state.draft = draft;
    void refreshPdfPreview();
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

  let handleDisabled = false;
  let handleHidden = false;

  function updateHandleState(): void {
    const cls = els.handle.classList;
    cls.remove(
      "apted-handle--open",
      "apted-handle--pulse",
      "apted-handle--disabled",
      "apted-handle--hidden",
    );
    if (handleHidden) {
      cls.add("apted-handle--hidden");
    } else if (handleDisabled) {
      cls.add("apted-handle--disabled");
    }
    if (state.open) {
      cls.add("apted-handle--open");
    }
  }

  function triggerPulse(): void {
    els.handle.classList.remove("apted-handle--pulse");
    void els.handle.offsetWidth;
    els.handle.classList.add("apted-handle--pulse");
  }

  function showUnreadDot(visible: boolean): void {
    if (visible) {
      els.handleDot.classList.add("apted-handle-dot--visible");
    } else {
      els.handleDot.classList.remove("apted-handle-dot--visible");
    }
  }

  function openDrawer(): void {
    if (state.open) return;
    state.open = true;
    els.drawer.classList.add("apted-drawer--open");
    updateHandleState();
    els.handle.title = "Close apted";
    els.handle.setAttribute("aria-label", "Close apted");
    if (window.innerWidth <= 1200) {
      els.backdrop.classList.add("apted-backdrop--visible");
    }
    showUnreadDot(false);
    void chrome.storage.local.set({ [`aptedDrawerOpen:${location.hostname}`]: true });
  }

  function closeDrawer(): void {
    if (!state.open) return;
    state.open = false;
    els.drawer.classList.remove("apted-drawer--open");
    updateHandleState();
    els.handle.title = "Open apted";
    els.handle.setAttribute("aria-label", "Open apted");
    els.backdrop.classList.remove("apted-backdrop--visible");
    void chrome.storage.local.set({ [`aptedDrawerOpen:${location.hostname}`]: false });
  }

  function toggleDrawer(): void {
    if (state.open) {
      closeDrawer();
    } else {
      openDrawer();
    }
  }

  async function refreshConnection(): Promise<void> {
    const s = await getSettings();
    if (!s.apiBase) {
      els.connection.textContent = "not configured";
      els.connection.title = "Open Settings to set API_BASE.";
      handleDisabled = true;
      handleHidden = false;
      updateHandleState();
      return;
    }
    try {
      const host = new URL(s.apiBase).host;
      els.connection.textContent = host;
      els.connection.title = s.apiBase;
      handleDisabled = false;
      handleHidden = false;
      updateHandleState();
    } catch {
      els.connection.textContent = "invalid API_BASE";
      handleDisabled = true;
      handleHidden = false;
      updateHandleState();
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
      renderSimilarResumes(draft.similarResumes ?? []);
      triggerPulse();
      setStatus("Done.", "ok");
    } catch (e) {
      setStatus(errMsg(e), "error");
    } finally {
      els.tailor.disabled = false;
    }
  }

  async function doEdit(instruction: string): Promise<void> {
    if (!state.draft) return;
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
      setStatus("Done.", "ok");
    } catch (e) {
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

  async function doDownloadPdf(): Promise<void> {
    if (!state.draft) return;
    const d = state.draft;
    setStatus("Preparing PDF…");
    els.downloadPdf.disabled = true;
    try {
      const { blob } = await getDraftPdfBlob({
        draftId: d.id,
        draftUpdatedAt: d.updatedAt,
      });
      if (state.pdfObjectUrl) URL.revokeObjectURL(state.pdfObjectUrl);
      const url = URL.createObjectURL(blob);
      state.pdfObjectUrl = url;
      state.pdfForDraftUpdatedAt = d.updatedAt;
      const filename = suggestPdfFilename({
        id: d.id,
        company: els.jdCompany.value.trim() || undefined,
        role: els.jdRole.value.trim() || undefined,
      });
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      if (!state.pdfObjectUrl || state.pdfObjectUrl !== url) {
        if (state.pdfObjectUrl) URL.revokeObjectURL(state.pdfObjectUrl);
        state.pdfObjectUrl = url;
        state.pdfForDraftUpdatedAt = d.updatedAt;
        els.previewEmbed.src = url;
        showPreviewState("embed");
      }
      setStatus("Downloaded " + filename, "ok");
    } catch (e) {
      setStatus("PDF failed: " + errMsg(e), "error");
    } finally {
      els.downloadPdf.disabled = !state.draft;
    }
  }

  function showSaveDialog(): void {
    if (!state.draft) return;
    els.saveCompany.value = els.jdCompany.value.trim();
    els.saveRole.value = els.jdRole.value.trim();
    els.saveDialog.hidden = false;
    els.saveBackdrop.hidden = false;
  }

  function hideSaveDialog(): void {
    els.saveDialog.hidden = true;
    els.saveBackdrop.hidden = true;
  }

  async function doSaveVersion(): Promise<void> {
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
      hideSaveDialog();
      setStatus(`Saved as version ${version.id}.`, "ok");
    } catch (e) {
      setStatus(errMsg(e), "error");
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
      state.company = "";
      state.role = "";
      state.chat = [];
      setDraft(null);
      invalidatePdf();
      els.previewEmbed.src = "";
      showPreviewState("empty");
      els.similarSection.hidden = true;
      await clearSession();
      setStatus("New tailor.", "ok");
    } finally {
      state.restoring = false;
    }
  }

  async function restoreFromSession(): Promise<boolean> {
    const snap = await readSession();
    if (!snap) return false;
    state.restoring = true;
    try {
      els.jdText.value = snap.jd;
      els.jdCompany.value = snap.company;
      els.jdRole.value = snap.role;
      state.jobDescription = snap.jd;
      state.company = snap.company;
      state.role = snap.role;
      state.chat = snap.chat;
      if (snap.draftId) {
        try {
          const draft = (await send({ type: "get-draft", draftId: snap.draftId })) as
            | Draft
            | { notFound: true };
          if ("notFound" in draft) {
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
            /* ignore */
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

  els.handle.addEventListener("click", () => toggleDrawer());
  els.backdrop.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.open) {
      closeDrawer();
    }
  });
  els.openSettings.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
  els.closeDrawerBtn.addEventListener("click", closeDrawer);
  els.rescrape.addEventListener("click", () => void doScrape());
  els.tailor.addEventListener("click", () => void doTailor());
  els.undo.addEventListener("click", () => void doUndo());
  els.downloadPdf.addEventListener("click", () => void doDownloadPdf());
  els.saveVersion.addEventListener("click", showSaveDialog);
  els.previewRetry.addEventListener("click", () => void refreshPdfPreview());
  els.saveConfirm.addEventListener("click", () => void doSaveVersion());
  els.saveCancel.addEventListener("click", hideSaveDialog);
  els.saveBackdrop.addEventListener("click", hideSaveDialog);
  els.chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = els.chatInput.value.trim();
    if (!v) return;
    els.chatInput.value = "";
    void doEdit(v);
  });
  els.jdText.addEventListener("input", () => schedulePersist(500));
  els.jdCompany.addEventListener("input", () => schedulePersist(500));
  els.jdRole.addEventListener("input", () => schedulePersist(500));
  chrome.storage.onChanged.addListener((_changes, area) => {
    if (area === "sync") void refreshConnection();
  });

  const attach = () => {
    if (!document.body) return;
    document.body.appendChild(host);
    console.log("[apted] host appended to DOM, shadow attached");
    void refreshConnection();
    showPreviewState("empty");
    void (async () => {
      try {
        const key = `aptedDrawerOpen:${location.hostname}`;
        const stored = await chrome.storage.local.get(key);
        if (stored[key] === true) {
          openDrawer();
        }
      } catch {
        /* ignore */
      }
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
        /* ignore */
      }
      try {
        if (await restoreFromSession()) return;
      } catch {
        /* ignore */
      }
      try {
        await doScrape();
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
})();
