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

const DB_NAME = "apted-pdf-cache";
const DB_STORE = "pdfs";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE);
      }
    };
  });
}

function cacheKey(draftId: string, updatedAt: string): string {
  return `${draftId}:${updatedAt}`;
}

async function readPersistedCache(
  draftId: string,
  updatedAt: string,
): Promise<Omit<CacheEntry, "objectUrl"> | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readonly");
      const store = tx.objectStore(DB_STORE);
      const req = store.get(cacheKey(draftId, updatedAt));
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const value = req.result as { draftId: string; draftUpdatedAt: string; blob: Blob; etag: string } | undefined;
        resolve(value ?? null);
      };
    });
  } catch {
    return null;
  }
}

async function writePersistedCache(item: Omit<CacheEntry, "objectUrl">): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      const store = tx.objectStore(DB_STORE);
      const req = store.put(item, cacheKey(item.draftId, item.draftUpdatedAt));
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve();
    });
  } catch {
    // Ignore persistence failures; the fetch still succeeded.
  }
}

async function clearPersistedCache(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      const store = tx.objectStore(DB_STORE);
      const req = store.clear();
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve();
    });
  } catch {
    // Ignore.
  }
}

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

async function trySetMemoryFromPersisted(
  args: { draftId: string; draftUpdatedAt: string },
): Promise<boolean> {
  const persisted = await readPersistedCache(args.draftId, args.draftUpdatedAt);
  if (!persisted) return false;
  entry = {
    draftId: persisted.draftId,
    draftUpdatedAt: persisted.draftUpdatedAt,
    blob: persisted.blob,
    objectUrl: URL.createObjectURL(persisted.blob),
    etag: persisted.etag,
  };
  return true;
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

  if (await trySetMemoryFromPersisted(args)) {
    return { blob: entry!.blob, etag: entry!.etag };
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
  void writePersistedCache({ ...entry });
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

// Conditional fetch for the PDF viewer: sends If-None-Match so the server can
// return 304 when nothing changed. Returns the blob URL (reused on 304) and
// a flag indicating whether the bytes actually changed. Used by the sidepanel
// preview so we don't recompile + retransfer the PDF on every edit that didn't
// change the rendered output (e.g. minor wording tweaks).
export async function fetchPdfForPreview(args: {
  draftId: string;
  draftUpdatedAt: string;
}): Promise<{ objectUrl: string; changed: boolean }> {
  // Same draft + same updated_at → reuse cached object URL, no fetch needed.
  if (
    entry &&
    entry.draftId === args.draftId &&
    entry.draftUpdatedAt === args.draftUpdatedAt
  ) {
    return { objectUrl: entry.objectUrl, changed: false };
  }

  if (await trySetMemoryFromPersisted(args)) {
    return { objectUrl: entry!.objectUrl, changed: false };
  }

  // Different draft or newer updated_at, but maybe same underlying PDF bytes.
  // Send If-None-Match so the server can short-circuit with 304.
  const prevEtag = entry && entry.draftId === args.draftId ? entry.etag : undefined;

  const result = await send<FetchPdfResult>({
    type: "fetch-pdf",
    draftId: args.draftId,
    ifNoneMatch: prevEtag,
  });

  if (result.kind === "not-modified") {
    // Server says bytes unchanged. Bump the cached entry's updatedAt so
    // future calls with this updatedAt also short-circuit locally.
    entry!.draftUpdatedAt = args.draftUpdatedAt;
    void writePersistedCache({ ...entry!, objectUrl: entry!.objectUrl });
    return { objectUrl: entry!.objectUrl, changed: false };
  }

  // New bytes. Drop the old cached entry and build a fresh one.
  invalidate();

  const blob = base64ToBlob(result.base64, result.mime);
  entry = {
    draftId: args.draftId,
    draftUpdatedAt: args.draftUpdatedAt,
    blob,
    objectUrl: URL.createObjectURL(blob),
    etag: result.etag,
  };
  void writePersistedCache({ ...entry });
  return { objectUrl: entry.objectUrl, changed: true };
}

export function clearPdfCache(): void {
  invalidate();
  void clearPersistedCache();
}

// Best-effort cleanup. Pages that never unload (service worker) won't fire
// this; the cache is small enough that it's fine.
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", invalidate);
}
