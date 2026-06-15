import type { Draft, Outcome, Resume, ScrapedJob, SimilarResume, Version } from "./types";

export type ExtractedFields = {
  title: string;
  company: string;
  location: string;
  terms: string[];
};

export type Msg =
  | { type: "scrape" }
  | { type: "extract"; url: string; title: string; company: string; jobDescription: string; source: string }
  | { type: "tailor"; jobDescription: string }
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
  | { type: "open-window" }
  | { type: "fetch-pdf"; draftId: string; ifNoneMatch?: string }
  | { type: "get-draft"; draftId: string }
  | { type: "fill-nearest-input"; pdfB64?: string; pdfFilename?: string }
  | { type: "find-similar"; jobDescription: string }
  | { type: "fetch-version-pdf"; versionId: string }
  | { type: "open-drawer" }
  | { type: "open-options" };

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
  "open-drawer": { ok: true };
};

export type Reply<T> = { ok: true; data: T } | { ok: false; error: string };
