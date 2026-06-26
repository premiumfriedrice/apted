// Floating drawer content script for supported job sites.
// Injects a handle + drawer into the page via shadow DOM.

import { getSettings } from "./storage";
import { clearPdfCache, fetchPdfForPreview, getDraftPdfBlob, suggestPdfFilename } from "./pdf";
import { clearSession, readSession, writeSession, type StoredChatTurn } from "./session";
import type { Msg, Reply } from "./messages";
import type { Draft, Outcome, ScrapedJob, SimilarResume, Version } from "./types";

export const DRAWSER_WIDTH = 384;
export const HANDLE_SIZE = 48;

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
      --apted-surface: #f8f9fa;
      --apted-surface-container-lowest: #ffffff;
      --apted-surface-container-low: #f3f4f5;
      --apted-surface-container-high: #e7e8e9;
      --apted-outline-variant: #c3c6d7;
      --apted-on-surface: #191c1d;
      --apted-on-surface-variant: #434655;
      --apted-inverse-surface: #2e3132;
      --apted-inverse-on-surface: #f0f1f2;
      --apted-primary: #000000;
      --apted-black-btn: #000000;
      --apted-on-primary: #ffffff;
      --apted-error: #b3261e;
      --apted-success: #16a34a;

      position: fixed;
      top: 0;
      right: 0;
      height: 100vh;
      z-index: 2147483646;
      font: 14px/1.5 Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      color: var(--apted-on-surface);
      pointer-events: none;
    }

    /* ── Handle ───────────────────────────────────────────────────────── */
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
      transition: transform 0.2s ease-out, right 0.2s ease-out;
    }

    .apted-handle:not(.apted-handle--open):hover {
      transform: translateX(-4px);
    }

    .apted-handle--open {
      right: 12px;
      transform: translateX(-360px) translateY(7px);
      opacity: 0;
      pointer-events: none;
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
      color: var(--apted-primary);
      line-height: 1;
      transition: font-size 0.2s ease-out, color 0.15s ease;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .apted-handle:not(.apted-handle--open):hover .apted-handle-glyph {
      text-shadow: 0 2px 3px rgba(0, 0, 0, 0.18);
    }

    .apted-handle--open .apted-handle-glyph {
      font-size: 18px;
      font-weight: 500;
      text-rendering: geometricPrecision;
    }

    .apted-handle-dot {
      position: absolute;
      top: 2px;
      right: 2px;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--apted-primary);
      border: 1.5px solid var(--apted-surface-container-lowest);
      display: none;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
    }

    .apted-handle-dot--visible {
      display: block;
    }

    .apted-handle--pulse .apted-handle-glyph {
      animation: apted-pulse 1.8s ease-in-out 2;
      transform-origin: center;
    }

    /* ── Drawer shell ─────────────────────────────────────────────────── */
    .apted-drawer {
      position: fixed;
      top: 12px;
      right: 12px;
      bottom: 12px;
      width: ${DRAWSER_WIDTH}px;
      background: var(--apted-surface);
      border: 1px solid var(--apted-outline-variant);
      border-radius: 8px;
      display: flex;
      flex-direction: column;
      pointer-events: auto;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
      overflow: hidden;
      transform: translateX(calc(100% + 24px));
      transition: transform 0.2s ease-out;
      z-index: 2147483646;
      font: inherit;
      color: inherit;
    }

    .apted-drawer--open {
      transform: translateX(0);
    }

    /* ── Sticky header ────────────────────────────────────────────────── */
    .apted-drawer-header {
      position: sticky;
      top: 0;
      z-index: 10;
      height: 48px;
      background: var(--apted-surface-container-lowest);
      border-bottom: 1px solid var(--apted-outline-variant);
      flex-shrink: 0;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0 16px;
    }

    .apted-drawer-title {
      font-family: "Outfit", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 18px;
      line-height: 24px;
      font-weight: 600;
      color: var(--apted-on-surface);
      margin: 0;
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
      background: transparent;
      color: var(--apted-on-surface-variant);
      cursor: pointer;
      padding: 0;
      font: inherit;
      transition: background 0.15s, color 0.15s;
    }

    .apted-header-btn:hover {
      color: var(--apted-on-surface);
      background: var(--apted-surface-container-low);
    }

    .apted-header-btn svg {
      pointer-events: none;
    }

    /* ── Scrollable body ──────────────────────────────────────────────── */
    .apted-drawer-body {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 8px 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      overscroll-behavior: contain;
    }

    .apted-drawer-body::-webkit-scrollbar {
      width: 4px;
    }
    .apted-drawer-body::-webkit-scrollbar-track {
      background: transparent;
    }
    .apted-drawer-body::-webkit-scrollbar-thumb {
      background: var(--apted-outline-variant);
      border-radius: 2px;
    }

    /* ── Cards ────────────────────────────────────────────────────────── */
    .apted-card {
      background: var(--apted-surface-container-lowest);
      border: 1px solid var(--apted-outline-variant);
      border-radius: 8px;
      padding: 12px;
    }

    .apted-card-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 12px;
    }

    .apted-card-row:last-child {
      margin-bottom: 0;
    }

    .apted-card-title {
      font-size: 11px;
      line-height: 14px;
      font-weight: 600;
      color: var(--apted-on-surface-variant);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin: 0;
    }

    .apted-connection-chip {
      display: inline-flex;
      align-items: center;
      font-size: 11px;
      line-height: 14px;
      color: var(--apted-on-surface-variant);
      margin-bottom: 12px;
    }

    .apted-btn-group {
      display: flex;
      gap: 4px;
    }

    /* ── Backdrop ─────────────────────────────────────────────────────── */
    .apted-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.3);
      z-index: 2147483645;
      pointer-events: auto;
      display: none;
      transition: opacity 0.2s ease;
    }

    .apted-backdrop--visible {
      display: block;
    }

    /* ── Buttons ──────────────────────────────────────────────────────── */
    .apted-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: var(--apted-surface-container-lowest);
      color: var(--apted-on-surface);
      border: 1px solid var(--apted-outline-variant);
      border-radius: 6px;
      padding: 8px 16px;
      font: inherit;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
      white-space: nowrap;
    }

    .apted-btn:hover:not(:disabled) {
      background: var(--apted-surface-container-low);
      border-color: var(--apted-outline-variant);
    }

    .apted-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .apted-btn--primary {
      background: var(--apted-primary);
      color: var(--apted-on-primary);
      border-color: var(--apted-primary);
    }

    .apted-btn--primary:hover:not(:disabled) {
      background: var(--apted-on-surface-variant);
      border-color: var(--apted-on-surface-variant);
    }

    .apted-btn--success {
      background: var(--apted-success);
      color: var(--apted-on-primary);
      border-color: var(--apted-success);
    }

    .apted-btn--sm {
      padding: 4px 10px;
      font-size: 12px;
      border-radius: 6px;
    }

    .apted-btn--sm svg {
      display: block;
      margin: 0 auto;
    }

    .apted-btn--full {
      width: 100%;
      justify-content: center;
    }

    .apted-btn--inverse {
      background: transparent;
      color: var(--apted-inverse-on-surface);
      border-color: transparent;
    }

    .apted-btn--inverse:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.1);
    }

    /* ── Form elements ────────────────────────────────────────────────── */
    .apted-input,
    .apted-textarea {
      display: block;
      width: 100%;
      background: var(--apted-surface);
      color: var(--apted-on-surface);
      border: 1px solid var(--apted-outline-variant);
      border-radius: 6px;
      padding: 8px 10px;
      font: inherit;
      font-size: 13px;
      outline: none;
      transition: border-color 0.15s, box-shadow 0.15s;
      margin-bottom: 8px;
    }

    .apted-input:focus,
    .apted-textarea:focus {
      border-color: var(--apted-primary);
      box-shadow: 0 0 0 1px var(--apted-primary);
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
      color: var(--apted-on-surface-variant);
      opacity: 0.7;
    }

    .apted-select {
      background: var(--apted-surface);
      color: var(--apted-on-surface);
      border: 1px solid var(--apted-outline-variant);
      border-radius: 6px;
      padding: 8px 10px;
      font: inherit;
      font-size: 13px;
      width: 100%;
      outline: none;
    }

    /* ── Preview ──────────────────────────────────────────────────────── */
    .apted-card--preview {
      padding: 0;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
    }

    .apted-card--black {
      width: 100%;
      background: var(--apted-black-btn);
      color: #fff;
      border-color: var(--apted-black-btn);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 14px 12px;
      cursor: pointer;
      transition: opacity 0.15s;
    }

    .apted-card--black:hover:not(:disabled) {
      opacity: 0.9;
    }

    .apted-card--black:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .apted-card--cancel {
      background: var(--apted-error);
      border-color: var(--apted-error);
      color: #fff;
    }

    .apted-card--cancel:hover:not(:disabled) {
      opacity: 0.9;
    }

    .apted-card-black-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .apted-card-black-text {
      font-size: 13px;
      font-weight: 500;
    }

    .apted-preview-header {
      height: 40px;
      background: var(--apted-inverse-surface);
      color: var(--apted-inverse-on-surface);
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0 12px;
      flex-shrink: 0;
    }

    .apted-preview-header-title {
      font-size: 12px;
      font-weight: 600;
      color: var(--apted-inverse-on-surface);
    }

    .apted-preview-body {
      background: var(--apted-surface-container-low);
      border-radius: 6px;
      overflow: hidden;
      position: relative;
      display: block;
      min-height: 440px;
      resize: vertical;
      flex: 1;
    }

    .apted-preview-embed {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      border: 0;
      border-radius: 6px;
      background: var(--apted-surface-container-low);
    }

    .apted-preview-body .apted-empty {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      color: var(--apted-outline);
      text-align: center;
      font-size: 11px;
    }

    .apted-preview-body .apted-empty p {
      max-width: 160px;
    }

    .apted-preview-embed[hidden] {
      display: none;
    }

    .apted-preview-state {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;
      text-align: center;
      color: var(--apted-on-surface-variant);
      font-size: 12px;
    }

    .apted-preview-state[hidden] {
      display: none;
    }

    .apted-spinner {
      width: 28px;
      height: 28px;
      border: 3px solid var(--apted-surface-container-high);
      border-top-color: var(--apted-primary);
      border-radius: 50%;
      animation: apted-spin 0.7s linear infinite;
    }

    @keyframes apted-spin {
      to { transform: rotate(360deg); }
    }

    .apted-preview-error-msg {
      color: var(--apted-error);
      margin: 0;
      max-width: 260px;
      word-wrap: break-word;
    }

    /* ── Similar resumes ──────────────────────────────────────────────── */
    .apted-similar-section {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 0 4px 8px;
    }

    .apted-similar-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .apted-similar-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 14px 12px;
      background: var(--apted-surface-container-lowest);
      border: 1px solid var(--apted-outline-variant);
      border-radius: 6px;
      cursor: pointer;
      transition: border-color 0.15s;
    }

    .apted-similar-item:hover {
      border-color: var(--apted-outline);
    }

    .apted-current-draft-card {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      padding: 14px 12px;
      background: var(--apted-surface-container-lowest);
      border: 1.5px solid var(--apted-primary);
      border-radius: 6px;
      cursor: pointer;
      transition: border-color 0.15s, background 0.15s;
    }

    .apted-current-draft-card:hover {
      background: var(--apted-surface-container-low);
    }

    .apted-current-draft-main {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 0;
    }

    .apted-current-draft-badge {
      display: inline-flex;
      align-self: flex-start;
      padding: 2px 6px;
      border-radius: 4px;
      background: var(--apted-primary);
      color: #fff;
      font-size: 9px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .apted-similar-main {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 0;
    }

    .apted-similar-field {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    .apted-similar-label {
      color: var(--apted-on-surface-variant);
      font-size: 9px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .apted-similar-value {
      color: var(--apted-on-surface);
      font-size: 14px;
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .apted-similar-when {
      color: var(--apted-on-surface-variant);
      font-size: 11px;
    }

    .apted-similar-score-wrap {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 4px;
      flex-shrink: 0;
    }

    .apted-similar-score {
      color: var(--apted-on-surface);
      font-size: 10px;
      font-weight: 600;
    }

    .apted-similar-bar {
      width: 48px;
      height: 4px;
      background: var(--apted-surface-variant);
      border-radius: 999px;
      overflow: hidden;
    }

    .apted-similar-bar-fill {
      height: 100%;
      background: var(--apted-on-surface);
    }

    /* ── Footer: Chat input ───────────────────────────────────────────── */
    .apted-drawer-footer {
      flex-shrink: 0;
      background: var(--apted-surface-container-lowest);
      border-top: 1px solid var(--apted-outline-variant);
      padding: 12px 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .apted-chat-form {
      display: flex;
      align-items: flex-end;
      gap: 8px;
      background: var(--apted-surface-container-lowest);
      border: 1px solid var(--apted-outline-variant);
      border-radius: 6px;
      padding: 4px;
    }

    .apted-chat-form .apted-input {
      flex: 1;
      margin-bottom: 0;
      border: none;
      background: transparent;
      resize: none;
      min-height: 32px;
      max-height: 64px;
      overflow-y: auto;
      padding: 6px 8px;
    }

    .apted-chat-form .apted-input:focus {
      box-shadow: none;
    }

    .apted-chat-send {
      width: 32px;
      height: 32px;
      padding: 0;
      border-radius: 6px;
      background: var(--apted-black-btn);
      color: #fff;
      border: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      flex-shrink: 0;
    }

    .apted-chat-send:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .apted-chat-send-glyph {
      font-family: "Outfit", sans-serif;
      font-size: 16px;
      font-weight: 500;
      line-height: 1;
    }

    .apted-status-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0 4px;
      font-size: 10px;
      color: var(--apted-on-surface-variant);
    }

    .apted-status {
      font-size: 10px;
      line-height: 14px;
      color: inherit;
      min-height: 14px;
    }

    .apted-status--error {
      color: var(--apted-error);
    }

    .apted-status--ok {
      color: var(--apted-success);
    }

    .apted-status-spinner {
      display: inline-flex;
      align-items: center;
      height: 10px;
      margin-left: 4px;
    }

    .apted-status-spinner svg {
      width: 18px;
      height: 18px;
      color: var(--apted-on-surface-variant);
    }

    .apted-version {
      font-size: 10px;
      color: var(--apted-on-surface-variant);
    }

    /* ── Utilities ────────────────────────────────────────────────────── */
    .apted-spacer {
      flex: 1;
    }

    .apted-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    /* ── Save dialog ──────────────────────────────────────────────────── */
    .apted-dialog {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 2147483647;
      background: var(--apted-surface-container-lowest);
      color: var(--apted-on-surface);
      border: 1px solid var(--apted-outline-variant);
      border-radius: 12px;
      padding: 20px;
      min-width: 280px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
      font: inherit;
    }

    .apted-dialog[hidden] {
      display: none;
    }

    .apted-dialog h3 {
      font-size: 15px;
      line-height: 20px;
      font-weight: 600;
      margin: 0 0 12px;
      color: var(--apted-on-surface);
    }

    .apted-dialog label {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-bottom: 10px;
      font-size: 12px;
      color: var(--apted-on-surface-variant);
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

    /* ── Fullscreen overlay ───────────────────────────────────────────── */
    .apted-fullscreen-overlay {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      background: transparent;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: auto;
    }

    .apted-fullscreen-overlay[hidden] {
      display: none;
    }

    .apted-fullscreen-wrap {
      position: relative;
      width: min(640px, 85vw);
      height: min(960px, 94vh);
    }

    .apted-fullscreen-wrap::before {
      content: "";
      position: absolute;
      inset: -16px;
      backdrop-filter: blur(40px) saturate(1.3);
      -webkit-backdrop-filter: blur(40px) saturate(1.3);
      background: rgba(255, 255, 255, 0.06);
      border-radius: 16px;
      box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.12),
                  0 20px 60px rgba(0, 0, 0, 0.3);
      z-index: 1;
      pointer-events: none;
    }

    .apted-fullscreen-embed {
      position: relative;
      z-index: 2;
      width: 100%;
      height: 100%;
      border: 0;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.88);
      box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.2),
                  0 24px 80px rgba(0, 0, 0, 0.4);
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
        <h1 class="apted-drawer-title">apted</h1>
        <div class="apted-spacer"></div>
        <button type="button" id="apted-open-settings" class="apted-header-btn" title="Settings" aria-label="Settings">
          <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 24 24" width="18" height="18">
            <path d="M12 15.5A3.5 3.5 0 0 1 8.5 12 3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5 3.5 3.5 0 0 1-3.5 3.5zm7.43-2.53c.04-.32.07-.64.07-.97 0-.33-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98 0 .33.03.66.07.97l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65z"/>
          </svg>
        </button>
        <button type="button" id="apted-close-drawer" class="apted-header-btn" title="Minimize" aria-label="Minimize">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="18" height="18">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <div id="apted-drawer-body" class="apted-drawer-body">
        <div class="apted-card">
          <div class="apted-card-row">
            <h2 class="apted-card-title">Job description</h2>
            <div class="apted-btn-group">
              <button id="apted-clear-jd" class="apted-btn apted-btn--sm" title="Clear job description fields">clear</button>
              <button id="apted-rescrape" class="apted-btn apted-btn--sm">scrape</button>
            </div>
          </div>
          <span id="apted-connection" class="apted-connection-chip" title="API base"></span>
          <input id="apted-jd-company" class="apted-input" placeholder="Company" />
          <input id="apted-jd-role" class="apted-input" placeholder="Role" />
          <textarea
            id="apted-jd-text"
            class="apted-textarea"
            rows="4"
            placeholder="Paste a job description, or click Scrape."
          ></textarea>
        </div>

        <div id="apted-similar-section" class="apted-similar-section" hidden>
          <h2 class="apted-card-title">Matching Resumes</h2>
          <div id="apted-current-draft-card" class="apted-current-draft-card" hidden>
            <div class="apted-current-draft-main">
              <span class="apted-current-draft-badge">Current draft</span>
              <div class="apted-similar-field">
                <span class="apted-similar-label">Company</span>
                <span id="apted-current-draft-company" class="apted-similar-value"></span>
              </div>
              <div class="apted-similar-field">
                <span class="apted-similar-label">Role</span>
                <span id="apted-current-draft-role" class="apted-similar-value"></span>
              </div>
            </div>
            <button id="apted-current-draft-save" class="apted-btn apted-btn--inverse apted-btn--sm" type="button" title="Save version">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                <polyline points="17 21 17 13 7 13 7 21"></polyline>
                <polyline points="7 3 7 8 15 8"></polyline>
              </svg>
            </button>
          </div>
          <div id="apted-similar-list" class="apted-similar-list"></div>
          <button id="apted-tailor-new" class="apted-card apted-card--black" type="button">
            <span class="apted-card-black-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                <polyline points="14 2 14 8 20 8"/>
                <path d="M8 13h2l2 6 2-6h2"/>
              </svg>
            </span>
            <span class="apted-card-black-text">Tailor new draft</span>
          </button>
        </div>

        <div id="apted-preview-card" class="apted-card apted-card--preview" hidden>
          <div class="apted-preview-header">
            <span class="apted-preview-header-title">Preview</span>
            <div class="apted-spacer"></div>
            <div class="apted-btn-group">
              <button id="apted-inject-pdf" class="apted-btn apted-btn--inverse apted-btn--sm" disabled>Inject to page</button>
              <button id="apted-fullscreen-btn" class="apted-btn apted-btn--inverse apted-btn--sm" title="Fullscreen" disabled>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
                </svg>
              </button>
              <button id="apted-download-pdf" class="apted-btn apted-btn--inverse apted-btn--sm" title="Download PDF" disabled>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
              </button>
              <button id="apted-save-version" class="apted-btn apted-btn--inverse apted-btn--sm" title="Save version" disabled>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                  <polyline points="17 21 17 13 7 13 7 21"></polyline>
                  <polyline points="7 3 7 8 15 8"></polyline>
                </svg>
              </button>
            </div>
          </div>
          <div id="apted-preview" class="apted-preview-body">
            <div id="apted-preview-empty" class="apted-empty">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
              <p>No draft yet.</p>
            </div>
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

      </div>

      <div class="apted-drawer-footer">
        <form id="apted-chat-form" class="apted-chat-form">
          <input
            id="apted-chat-input"
            class="apted-input"
            placeholder="lead with the AI project..."
            autocomplete="off"
            disabled
          />
          <button id="apted-chat-send" type="submit" class="apted-chat-send" disabled>
            <span class="apted-chat-send-glyph">A</span>
          </button>
        </form>
        <div class="apted-status-row">
          <div class="apted-row">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/>
            </svg>
            <span id="apted-status" class="apted-status" aria-live="polite"></span>
            <span id="apted-status-spinner" class="apted-status-spinner" hidden>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <circle cx="4" cy="12" r="2" fill="currentColor">
                  <animate id="apted-spinner-qFRN" begin="0;apted-spinner-OcgL.end+0.25s" attributeName="cy" calcMode="spline" dur="0.6s" values="12;6;12" keySplines=".33,.66,.66,1;.33,0,.66,.33" />
                </circle>
                <circle cx="12" cy="12" r="2" fill="currentColor">
                  <animate begin="apted-spinner-qFRN.begin+0.1s" attributeName="cy" calcMode="spline" dur="0.6s" values="12;6;12" keySplines=".33,.66,.66,1;.33,0,.66,.33" />
                </circle>
                <circle cx="20" cy="12" r="2" fill="currentColor">
                  <animate id="apted-spinner-OcgL" begin="apted-spinner-qFRN.begin+0.2s" attributeName="cy" calcMode="spline" dur="0.6s" values="12;6;12" keySplines=".33,.66,.66,1;.33,0,.66,.33" />
                </circle>
              </svg>
            </span>
          </div>
          <span class="apted-version">v0.1.0</span>
        </div>
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

    <div id="apted-fullscreen-overlay" class="apted-fullscreen-overlay" hidden>
      <div class="apted-fullscreen-wrap">
        <iframe id="apted-fullscreen-embed" class="apted-fullscreen-embed" title="Resume fullscreen preview"></iframe>
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
  tailoring: boolean;
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
    tailoring: false,
    open: false,
  };
}

(function () {
  if (document.getElementById("apted-drawer-host")) {
    console.log("[apted] already injected");
    return;
  }
  // Don't inject on browser-internal pages or in test environments
  // where chrome.runtime.getURL isn't available.
  if (!chrome?.runtime?.getURL) {
    console.log("[apted] not an extension context, skipping drawer injection");
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
    backdrop: $<HTMLElement>("apted-backdrop"),
    handle: $<HTMLButtonElement>("apted-handle"),
    handleDot: $<HTMLElement>("apted-handle-dot"),
    drawer: $<HTMLElement>("apted-drawer"),
    connection: $<HTMLElement>("apted-connection"),
    openSettings: $<HTMLButtonElement>("apted-open-settings"),
    closeDrawerBtn: $<HTMLButtonElement>("apted-close-drawer"),
    rescrape: $<HTMLButtonElement>("apted-rescrape"),
    clearJd: $<HTMLButtonElement>("apted-clear-jd"),
    jdCompany: $<HTMLInputElement>("apted-jd-company"),
    jdRole: $<HTMLInputElement>("apted-jd-role"),
    jdText: $<HTMLTextAreaElement>("apted-jd-text"),
    tailorNew: $<HTMLButtonElement>("apted-tailor-new"),
    downloadPdf: $<HTMLButtonElement>("apted-download-pdf"),
    saveVersion: $<HTMLButtonElement>("apted-save-version"),
    fullscreenBtn: $<HTMLButtonElement>("apted-fullscreen-btn"),
    injectPdf: $<HTMLButtonElement>("apted-inject-pdf"),
    fullscreenOverlay: $<HTMLElement>("apted-fullscreen-overlay"),
    fullscreenEmbed: $<HTMLIFrameElement>("apted-fullscreen-embed"),
    drawerBody: $<HTMLElement>("apted-drawer-body"),
    previewCard: $<HTMLElement>("apted-preview-card"),
    preview: $<HTMLElement>("apted-preview"),
    previewEmpty: $<HTMLElement>("apted-preview-empty"),
    previewLoading: $<HTMLElement>("apted-preview-loading"),
    previewError: $<HTMLElement>("apted-preview-error"),
    previewErrorMsg: $<HTMLElement>("apted-preview-error-msg"),
    previewRetry: $<HTMLButtonElement>("apted-preview-retry"),
    previewEmbed: $<HTMLIFrameElement>("apted-preview-embed"),

    similarSection: $<HTMLElement>("apted-similar-section"),
    similarList: $<HTMLElement>("apted-similar-list"),
    currentDraftCard: $<HTMLElement>("apted-current-draft-card"),
    currentDraftCompany: $<HTMLElement>("apted-current-draft-company"),
    currentDraftRole: $<HTMLElement>("apted-current-draft-role"),
    currentDraftSave: $<HTMLButtonElement>("apted-current-draft-save"),
    chatForm: $<HTMLFormElement>("apted-chat-form"),
    chatInput: $<HTMLInputElement>("apted-chat-input"),
    chatSend: $<HTMLButtonElement>("apted-chat-send"),
    status: $<HTMLElement>("apted-status"),
    statusSpinner: $<HTMLElement>("apted-status-spinner"),
    saveBackdrop: $<HTMLElement>("apted-save-backdrop"),
    saveDialog: $<HTMLElement>("apted-save-dialog"),
    saveCompany: $<HTMLInputElement>("apted-save-company"),
    saveRole: $<HTMLInputElement>("apted-save-role"),
    saveOutcome: $<HTMLSelectElement>("apted-save-outcome"),
    saveCancel: $<HTMLButtonElement>("apted-save-cancel"),
    saveConfirm: $<HTMLButtonElement>("apted-save-confirm"),
  };

  const state: DrawerState = createInitialState();
  let persistTimer: ReturnType<typeof setTimeout> | null = null;

  function schedulePersist(delayMs = 250): void {
    if (state.restoring) return;
    if (persistTimer !== null) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      persistTimer = null;
      void writeSession({
        url: location.href,
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
      els.previewEmbed.src = withPdfToolbarSuppressed(objectUrl);
      showPreviewState("embed");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      els.previewErrorMsg.textContent = msg;
      showPreviewState("error");
    } finally {
      state.pdfLoading = false;
    }
  }

  function relativeTime(iso?: string): string {
    if (!iso) return "";
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return "";
    const diff = Date.now() - then;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days <= 0) return "today";
    if (days === 1) return "1 day ago";
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    return `${Math.floor(days / 30)} months ago`;
  }

  function renderCurrentDraftCard(): void {
    if (!state.draft) {
      els.currentDraftCard.hidden = true;
      return;
    }
    const company = els.jdCompany.value.trim() || "Untitled company";
    const role = els.jdRole.value.trim() || "Untitled role";
    els.currentDraftCompany.textContent = company;
    els.currentDraftRole.textContent = role;
    els.currentDraftCard.hidden = false;
  }

  function renderSimilarResumes(similar: SimilarResume[]): void {
    const hasContent = !!similar?.length || !!state.draft;
    if (!hasContent) {
      els.similarSection.hidden = true;
      return;
    }
    els.similarSection.hidden = false;
    renderCurrentDraftCard();
    if (!similar?.length) {
      els.similarList.innerHTML = "";
      return;
    }
    els.similarList.innerHTML = similar
      .slice(0, 3)
      .map((s) => {
        const score = Math.round(s.score ?? 0);
        return `
        <div class="apted-similar-item" data-version-id="${escHtml(s.id ?? "")}">
          <div class="apted-similar-main">
            <div class="apted-similar-field">
              <span class="apted-similar-label">Company</span>
              <span class="apted-similar-value">${escHtml(s.company)}</span>
            </div>
            <div class="apted-similar-field">
              <span class="apted-similar-label">Role</span>
              <span class="apted-similar-value">${escHtml(s.role)}</span>
            </div>
            <span class="apted-similar-when">${escHtml(relativeTime(s.createdAt))}</span>
          </div>
          <div class="apted-similar-score-wrap">
            <span class="apted-similar-score">${score}% Match</span>
            <div class="apted-similar-bar">
              <div class="apted-similar-bar-fill" style="width: ${score}%;"></div>
            </div>
          </div>
        </div>`;
      })
      .join("");
  }  function withPdfToolbarSuppressed(url: string): string {
    if (!url) return url;
    const sep = url.includes("#") ? "&" : "#";
    return url + sep + "toolbar=0&navpanes=0";
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
      els.previewCard.hidden = true;
    } else if (!state.draft || state.draft.id !== draft.id) {
      invalidatePdf();
      els.previewCard.hidden = false;
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
    els.fullscreenBtn.disabled = !hasDraft;
    els.injectPdf.disabled = !hasDraft;
    renderCurrentDraftCard();
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
      els.jdCompany.value = scraped.company;
      els.jdRole.value = scraped.title;
      schedulePersist(0);
      setStatus(`Scraped from ${scraped.source}. Extracting fields…`, "ok");

      // Extract company/role/location via LLM for better accuracy.
      // This runs in parallel with similar-resumes so the user sees
      // scraped fields immediately and the LLM values update shortly after.
      const jd = scraped.jobDescription;
      if (jd.trim()) {
        try {
          const extracted = (await send({
            type: "extract",
            url: scraped.url,
            title: scraped.title,
            company: scraped.company,
            jobDescription: jd,
            source: scraped.source,
          })) as { title: string; company: string; location: string; terms: string[] };
          // Only overwrite if the LLM returned non-empty values.
          if (extracted.company) els.jdCompany.value = extracted.company;
          if (extracted.title) els.jdRole.value = extracted.title;
          schedulePersist(0);
          setStatus(`Extracted fields.`, "ok");
        } catch {
          // Non-fatal: scraped values are already filled in.
          setStatus(`Scraped from ${scraped.source}.`, "ok");
        }
      } else {
        setStatus(`Scraped from ${scraped.source}.`, "ok");
      }

      // Find similar resumes after a successful scrape.
      try {
        const { similar } = (await send({
          type: "find-similar",
          jobDescription: scraped.jobDescription,
        })) as { similar: SimilarResume[] };
        renderSimilarResumes(similar);
      } catch {
        // Non-fatal: similar resumes are a bonus feature.
        els.similarSection.hidden = true;
      }
    } catch (e) {
      setStatus(errMsg(e), "error");
    }
  }

  function setTailoring(tailoring: boolean): void {
    state.tailoring = tailoring;
    const btn = els.tailorNew;
    const icon = btn.querySelector(".apted-card-black-icon svg");
    const text = btn.querySelector(".apted-card-black-text");
    if (tailoring) {
      btn.classList.add("apted-card--cancel");
      btn.disabled = false;
      if (icon) icon.innerHTML = `<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>`;
      if (text) text.textContent = "Cancel tailoring";
    } else {
      btn.classList.remove("apted-card--cancel");
      if (icon) icon.innerHTML = `<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="M8 13h2l2 6 2-6h2"/>`;
      if (text) text.textContent = "Tailor new draft";
    }
  }

  async function cancelTailor(): Promise<void> {
    setStatus("Cancelling…");
    try {
      await send({ type: "cancel-tailor" });
    } catch {
      /* ignore */
    }
    setTailoring(false);
    els.statusSpinner.hidden = true;
    setStatus("Tailoring cancelled.", "ok");
  }

  async function doTailor(): Promise<void> {
    if (state.tailoring) {
      await cancelTailor();
      return;
    }
    const jd = els.jdText.value.trim();
    if (!jd) {
      setStatus("Paste or scrape a job description first.", "error");
      return;
    }
    state.jobDescription = jd;
    setStatus("Tailoring… this can take 10–30s.");
    setTailoring(true);
    els.statusSpinner.hidden = false;
    try {
      const draft = (await send({ type: "tailor", jobDescription: jd })) as Draft;
      setDraft(draft);
      renderSimilarResumes(draft.similarResumes ?? []);
      triggerPulse();
      setStatus("Done.", "ok");
    } catch (e) {
      if (errMsg(e).includes("abort")) {
        setStatus("Tailoring cancelled.", "ok");
      } else {
        setStatus(errMsg(e), "error");
      }
    } finally {
      setTailoring(false);
      els.statusSpinner.hidden = true;
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
        els.previewEmbed.src = withPdfToolbarSuppressed(url);
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
              url: location.href,
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
              url: location.href,
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
  // Prevent wheel events from the drawer body from scrolling the main page
  els.drawerBody.addEventListener("wheel", (e) => {
    e.stopPropagation();
  }, { passive: true });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!els.fullscreenOverlay.hidden) {
        els.fullscreenOverlay.hidden = true;
        els.fullscreenEmbed.src = "";
      } else if (state.open) {
        closeDrawer();
      }
    }
  });
  els.openSettings.addEventListener("click", () => {
    void send({ type: "open-options" });
  });
  els.closeDrawerBtn.addEventListener("click", closeDrawer);
  els.rescrape.addEventListener("click", () => void doScrape());
  els.clearJd.addEventListener("click", () => {
    els.jdText.value = "";
    els.jdCompany.value = "";
    els.jdRole.value = "";
    state.jobDescription = "";
    state.company = "";
    state.role = "";
    schedulePersist(0);
  });
  els.tailorNew.addEventListener("click", () => void doTailor());
  els.injectPdf.addEventListener("click", async () => {
    if (!state.draft) return;
    els.injectPdf.disabled = true;
    els.injectPdf.textContent = "Injecting…";
    try {
      const d = state.draft;
      const { blob } = await getDraftPdfBlob({
        draftId: d.id,
        draftUpdatedAt: d.updatedAt,
      });
      const b64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const parts = (reader.result as string).split(",");
          resolve(parts[1] ?? "");
        };
        reader.onerror = () => reject(new Error("Failed to read PDF"));
        reader.readAsDataURL(blob);
      });
      const reply = (await send({
        type: "fill-nearest-input",
        pdfB64: b64,
        pdfFilename: "resume.pdf",
      })) as { ok: boolean; error?: string };
      if (reply.ok) {
        els.injectPdf.textContent = "Injected ✓";
        els.injectPdf.classList.add("apted-btn--success");
        setTimeout(() => {
          els.injectPdf.textContent = "Inject to page";
          els.injectPdf.classList.remove("apted-btn--success");
          els.injectPdf.disabled = false;
        }, 2000);
      } else {
        els.injectPdf.textContent = "Failed";
        els.injectPdf.disabled = false;
      }
    } catch (e) {
      els.injectPdf.textContent = "Inject to page";
      els.injectPdf.disabled = false;
      setStatus(errMsg(e), "error");
    }
  });
  // Click the fullscreen button to open the current draft PDF in fullscreen
  els.fullscreenBtn.addEventListener("click", () => {
    if (!state.draft || !state.pdfObjectUrl) return;
    els.fullscreenEmbed.src = withPdfToolbarSuppressed(state.pdfObjectUrl);
    els.fullscreenOverlay.hidden = false;
  });
  // Click the current draft card to focus the preview pane.
  els.currentDraftCard.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest("#apted-current-draft-save")) return;
    if (!state.draft) return;
    els.previewCard.hidden = false;
    els.previewCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
  els.currentDraftSave.addEventListener("click", (e) => {
    e.stopPropagation();
    showSaveDialog();
  });
  // Click a similar resume card to load it as the current draft.
  els.similarList.addEventListener("click", async (e) => {
    const item = (e.target as HTMLElement).closest(".apted-similar-item") as HTMLElement | null;
    if (!item) return;
    const versionId = item.dataset.versionId;
    if (!versionId) return;
    setStatus("Loading past version…");
    try {
      const draft = (await send({ type: "get-version", versionId })) as Draft;
      setDraft(draft);
      setStatus("Loaded past version.", "ok");
    } catch (e) {
      setStatus(errMsg(e), "error");
    }
  });
  // Prevent wheel events from the preview iframe from bubbling to the main page
  els.preview.addEventListener("wheel", (e) => {
    e.stopPropagation();
  }, { passive: true });
  // Prevent wheel events from the fullscreen overlay from bubbling to the main page
  els.fullscreenOverlay.addEventListener("wheel", (e) => {
    e.stopPropagation();
  }, { passive: true });
  // Click outside the wrap (on the overlay background) to close fullscreen
  els.fullscreenOverlay.addEventListener("click", (e) => {
    if (e.target === els.fullscreenOverlay) {
      els.fullscreenOverlay.hidden = true;
      els.fullscreenEmbed.src = "";
    }
  });
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

  // Listen for open-drawer from the background service worker.
  // On supported pages (content_scripts in manifest), the message arrives
  // via chrome.runtime.onMessage. On non-supported pages (dynamic injection),
  // the message arrives via a DOM event because chrome.runtime isn't available
  // in the main world.
  window.addEventListener("apted-open-drawer", () => {
    openDrawer();
  });
  try {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg && typeof msg === "object" && (msg as { type: string }).type === "open-drawer") {
        openDrawer();
        sendResponse({ ok: true });
        return true;
      }
      return false;
    });
  } catch {
    // chrome.runtime not available (main world injection) — DOM event above handles it.
  }

  const attach = () => {
    if (!document.body) return;
    document.body.appendChild(host);
    console.log("[apted] host appended to DOM, shadow attached");
    void refreshConnection();
    showPreviewState("empty");
    void (async () => {
      try {
        /* restored preview height / zoom removed */
      } catch {
        /* ignore */
      }
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
