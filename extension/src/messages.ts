import type { Draft, Outcome, Resume, ScrapedJob, SimilarResume, Version } from "./types";

export type Msg =
  | { type: "scrape" }
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
  | { type: "fill-nearest-input" }
  | { type: "find-similar"; jobDescription: string }
  | { type: "open-options" };

// The PDF endpoint returns binary; we shuttle it across the MV3 SW boundary
// as base64 since Blob isn't reliably structured-cloneable through
// chrome.runtime.sendMessage.
export type FetchPdfResult =
  | { kind: "ok"; base64: string; etag: string; mime: "application/pdf" }
  | { kind: "not-modified"; etag: string };

export type MsgResultMap = {
  scrape: ScrapedJob;
  tailor: Draft;
  edit: Draft;
  undo: Draft;
  "save-version": Version;
  "open-window": { ok: true };
  "open-options": { ok: true };
  "fetch-pdf": FetchPdfResult;
  "get-draft": Draft | { notFound: true };
  "find-similar": { similar: SimilarResume[] };
};

export type Reply<T> = { ok: true; data: T } | { ok: false; error: string };
