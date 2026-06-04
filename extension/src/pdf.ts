// Public PDF cache + helpers consumed by both the sidepanel and the
// drag-and-drop content script. Holds the rendered PDF as a Blob keyed on
// draft id + updated_at so we don't pay the Tectonic round-trip on every
// drag attempt.
import type { FetchPdfResult, Reply } from "./messages";

type CacheEntry = {
  draftId: string;
  draftUpdatedAt: string;
  blob: Blob;
  objectUrl: string;
  etag: string;
};

let entry: CacheEntry | null = null;

function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function send<T>(msg: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (reply: Reply<T>) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!reply?.ok) {
        reject(new Error(reply?.error ?? "send failed"));
        return;
      }
      resolve(reply.data);
    });
  });
}

export function suggestPdfFilename(args: {
  id: string;
  company?: string;
  role?: string;
}): string {
  const c = args.company ? slugify(args.company) : "";
  const r = args.role ? slugify(args.role) : "";
  const parts = ["apted", c, r].filter(Boolean);
  if (parts.length < 2) return `apted-${args.id.slice(0, 8)}.pdf`;
  return `${parts.join("-")}.pdf`;
}

function invalidate(): void {
  if (entry) URL.revokeObjectURL(entry.objectUrl);
  entry = null;
}

export async function getDraftPdfBlob(args: {
  draftId: string;
  draftUpdatedAt: string;
}): Promise<{ blob: Blob; etag: string }> {
  // Same draft + same updated_at → reuse the cached blob.
  if (
    entry &&
    entry.draftId === args.draftId &&
    entry.draftUpdatedAt === args.draftUpdatedAt
  ) {
    return { blob: entry.blob, etag: entry.etag };
  }

  // If the draft has advanced (or we're switching drafts), the cached entry
  // is no longer trustworthy. Drop it eagerly and force an unconditional
  // fetch — sending If-None-Match here risks a 304 that returns the stale
  // bytes we just decided not to trust.
  invalidate();

  const result = await send<FetchPdfResult>({
    type: "fetch-pdf",
    draftId: args.draftId,
  });

  if (result.kind === "not-modified") {
    // Shouldn't happen — we didn't send a conditional header. Treat as error
    // so the caller can surface it rather than serving phantom bytes.
    throw new Error("server returned 304 with no cached body");
  }

  const blob = base64ToBlob(result.base64, result.mime);
  entry = {
    draftId: args.draftId,
    draftUpdatedAt: args.draftUpdatedAt,
    blob,
    objectUrl: URL.createObjectURL(blob),
    etag: result.etag,
  };
  return { blob, etag: result.etag };
}

export async function getDraftPdfObjectUrl(args: {
  draftId: string;
  draftUpdatedAt: string;
}): Promise<string> {
  await getDraftPdfBlob(args);
  // entry is set by getDraftPdfBlob.
  return entry!.objectUrl;
}

export function clearPdfCache(): void {
  invalidate();
}

// Best-effort cleanup. Pages that never unload (service worker) won't fire
// this; the cache is small enough that it's fine.
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", invalidate);
}
