import type { Draft, Outcome, Resume, ScrapedJob, SimilarResume, Version, VersionListItem } from "./types";
import type { PipelineSuggestion, PipelineState, Outcome as PipelineOutcome } from "./pipeline";

export type ExtractedFields = {
  title: string;
  company: string;
  location: string;
  terms: string[];
};

// A captured job-application submission, assembled by a content script and
// POSTed by the service worker.
export type Capture = {
  company?: string;
  role?: string;
  jobDescription?: string;
  portalUrl?: string;
  trackedObj?: string | null;
  capturedAt: string;
  source: string;
  /** True when the user actively used apted on this tab (drawer opened). */
  active: boolean;
};

export type LogResult =
  | { kind: "logged"; id: string }
  | { kind: "duplicate"; id: string | null }
  | { kind: "queued" }
  | { kind: "skipped" };

// Gmail email as extracted by the gmail.ts content script.
export type GmailEmail = {
  messageId: string;
  sender: string;
  senderName: string;
  subject: string;
  body: string;
};

export type GmailClassification = {
  outcome: "applied" | "rejected" | "interviewing" | "offer" | null;
  subjectMatch: boolean;
  atsSender: boolean;
};

export type Msg =
  | { type: "scrape" }
  | { type: "extract"; url: string; title: string; company: string; jobDescription: string; source: string }
  | { type: "tailor"; jobDescription: string }
  | { type: "cancel-tailor" }
  | { type: "edit"; draftId: string; instruction: string }
  | { type: "undo"; draftId: string }
  | {
      type: "save-version";
      company: string;
      role: string;
      jobDescription: string;
      tailoredContent: Resume;
      outcome: Outcome;
    }
  | {
      type: "auto-save-application";
      company: string;
      role: string;
      jobDescription: string;
      portalUrl: string;
      tailoredContent: Resume;
    }
  | { type: "open-window" }
  | { type: "fetch-pdf"; draftId: string; ifNoneMatch?: string }
  | { type: "get-draft"; draftId: string }
  | { type: "fill-nearest-input"; pdfB64?: string; pdfFilename?: string }
  | { type: "find-similar"; jobDescription: string }
  | { type: "fetch-version-pdf"; versionId: string }
  | { type: "get-version"; versionId: string }
  | { type: "list-versions" }
  | { type: "open-drawer" }
  | { type: "open-options" }
  | { type: "track"; text: string; company?: string; role?: string }
  | { type: "tracker-state" }
  | { type: "tracker-log-application"; capture: Capture }
  | { type: "tracker-undo"; id: string }
  | { type: "tracker-set-outcome"; id: string; outcome: PipelineOutcome; interviewRound?: number | null }
  | { type: "tracker-apply-suggestion"; suggestionId: string }
  | { type: "tracker-dismiss-suggestion"; suggestionId: string }
  | { type: "tracker-save-lastjob"; company?: string; role?: string; jobDescription?: string; portalUrl?: string; trackedObj?: string | null; source: string }
  | { type: "tracker-mark-active" }
  | { type: "open-connect" }
  | { type: "gmail-suggest"; email: GmailEmail; classification: GmailClassification }
  | { type: "tracker-flush" };;

// The PDF endpoint returns binary; we shuttle it across the MV3 SW boundary
// as base64 since Blob isn't reliably structured-cloneable through
// chrome.runtime.sendMessage.
export type FetchPdfResult =
  | { kind: "ok"; base64: string; etag: string; mime: "application/pdf" }
  | { kind: "not-modified"; etag: string };

export type MsgResultMap = {
  scrape: ScrapedJob;
  extract: ExtractedFields;
  tailor: Draft;
  edit: Draft;
  undo: Draft;
  "save-version": Version;
  "open-window": { ok: true };
  "open-options": { ok: true };
  "fetch-pdf": FetchPdfResult;
  "get-draft": Draft | { notFound: true };
  "fill-nearest-input": { ok: boolean; error?: string };
  "find-similar": { similar: SimilarResume[] };
  "fetch-version-pdf": { base64: string | null; mime: "application/pdf" };
  "get-version": Draft;
  "list-versions": VersionListItem[];
  "auto-save-application": Version;
  "open-drawer": { ok: true };
  "track": { reply: string; summary: string[] };
  "tracker-state": PipelineState;
  "tracker-log-application": LogResult;
  "tracker-undo": { ok: true };
  "tracker-set-outcome": { ok: true };
  "tracker-apply-suggestion": { ok: true };
  "tracker-dismiss-suggestion": { ok: true };
  "tracker-save-lastjob": { ok: true };
  "tracker-mark-active": { ok: true };
  "open-connect": { ok: true };
  "gmail-suggest": { ok: true };
  "tracker-flush": { ok: true };
};

export type Reply<T> = { ok: true; data: T } | { ok: false; error: string };
