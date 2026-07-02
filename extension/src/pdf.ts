// Public PDF cache + helpers consumed by both the sidepanel and the
// drag-and-drop content script. Holds the rendered PDF as a Blob keyed on
// draft id + updated_at so we don't pay the Tectonic round-trip on every
// drag attempt.
import type { FetchPdfResult, Reply } from "./messages";

type CacheEntry = {
  blob: Blob;
  objectUrl: string;
  etag: string;
};

const MAX_MEMORY_ENTRIES = 4;
const entries = new Map<string, CacheEntry>();

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

function draftKey(draftId: string, updatedAt: string): string {
  return `draft:${draftId}:${updatedAt}`;
}

function versionKey(versionId: string): string {
  return `version:${versionId}`;
}

async function readPersistedCache(key: string): Promise<CacheEntry | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readonly");
      const store = tx.objectStore(DB_STORE);
      const req = store.get(key);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const value = req.result as CacheEntry | undefined;
        resolve(value ?? null);
      };
    });
  } catch {
    return null;
  }
}

async function writePersistedCache(key: string, item: CacheEntry): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      const store = tx.objectStore(DB_STORE);
      const req = store.put(item, key);
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

function getEntry(key: string): CacheEntry | undefined {
  const item = entries.get(key);
  if (item) {
    // Touch for LRU ordering.
    entries.delete(key);
    entries.set(key, item);
  }
  return item;
}

function setEntry(key: string, item: CacheEntry): void {
  entries.set(key, item);
  // Evict oldest if over limit.
  while (entries.size > MAX_MEMORY_ENTRIES) {
    const first = entries.keys().next().value as string;
    const oldest = entries.get(first);
    if (oldest) URL.revokeObjectURL(oldest.objectUrl);
    entries.delete(first);
  }
}

function invalidate(): void {
  for (const item of entries.values()) {
    URL.revokeObjectURL(item.objectUrl);
  }
  entries.clear();
}

async function trySetMemoryFromPersisted(key: string): Promise<CacheEntry | null> {
  const persisted = await readPersistedCache(key);
  if (!persisted) return null;
  const item: CacheEntry = {
    blob: persisted.blob,
    objectUrl: URL.createObjectURL(persisted.blob),
    etag: persisted.etag,
  };
  setEntry(key, item);
  return item;
}

function createEntryFromResult(result: FetchPdfResult): CacheEntry {
  const blob = base64ToBlob(result.base64, result.mime);
  return {
    blob,
    objectUrl: URL.createObjectURL(blob),
    etag: result.etag,
  };
}

export async function getDraftPdfBlob(args: {
  draftId: string;
  draftUpdatedAt: string;
}): Promise<{ blob: Blob; etag: string }> {
  const key = draftKey(args.draftId, args.draftUpdatedAt);
  const cached = getEntry(key);
  if (cached) {
    return { blob: cached.blob, etag: cached.etag };
  }

  const persisted = await trySetMemoryFromPersisted(key);
  if (persisted) {
    return { blob: persisted.blob, etag: persisted.etag };
  }

  const result = await send<FetchPdfResult>({
    type: "fetch-pdf",
    draftId: args.draftId,
  });

  if (result.kind === "not-modified") {
    throw new Error("server returned 304 with no cached body");
  }

  const item = createEntryFromResult(result);
  setEntry(key, item);
  void writePersistedCache(key, item);
  return { blob: item.blob, etag: item.etag };
}

export async function getDraftPdfObjectUrl(args: {
  draftId: string;
  draftUpdatedAt: string;
}): Promise<string> {
  const { blob, etag } = await getDraftPdfBlob(args);
  const key = draftKey(args.draftId, args.draftUpdatedAt);
  return getEntry(key)!.objectUrl;
}

// Conditional fetch for the PDF viewer. Accepts an optional versionId so
// clicking the same matching resume multiple times can reuse the cached PDF
// even though the server creates a fresh draft each time.
export async function fetchPdfForPreview(args: {
  draftId: string;
  draftUpdatedAt: string;
  versionId?: string;
}): Promise<{ objectUrl: string; changed: boolean }> {
  const draftCacheKey = draftKey(args.draftId, args.draftUpdatedAt);
  const versionCacheKey = args.versionId ? versionKey(args.versionId) : null;

  // 1) Exact draft hit.
  const draftCached = getEntry(draftCacheKey);
  if (draftCached) {
    return { objectUrl: draftCached.objectUrl, changed: false };
  }

  // 2) Version hit: same version rendered earlier under a different draft.
  if (versionCacheKey) {
    const versionCached = getEntry(versionCacheKey);
    if (versionCached) {
      // Mirror into the draft cache for future refreshes.
      setEntry(draftCacheKey, versionCached);
      return { objectUrl: versionCached.objectUrl, changed: false };
    }
  }

  // 3) Try persisted cache for either key.
  const persistedDraft = await trySetMemoryFromPersisted(draftCacheKey);
  if (persistedDraft) {
    return { objectUrl: persistedDraft.objectUrl, changed: false };
  }
  if (versionCacheKey) {
    const persistedVersion = await trySetMemoryFromPersisted(versionCacheKey);
    if (persistedVersion) {
      setEntry(draftCacheKey, persistedVersion);
      return { objectUrl: persistedVersion.objectUrl, changed: false };
    }
  }

  // 4) Fetch from server. Reuse etag if we have a stale entry for the same draft id.
  const staleDraftEntry = [...entries.entries()].find(([k]) => k.startsWith(`draft:${args.draftId}:`))?.[1];
  const prevEtag = staleDraftEntry?.etag;

  const result = await send<FetchPdfResult>({
    type: "fetch-pdf",
    draftId: args.draftId,
    ifNoneMatch: prevEtag,
  });

  if (result.kind === "not-modified") {
    staleDraftEntry!.objectUrl; // already in map; just update updatedAt key
    // Rename key to new updatedAt by re-inserting.
    setEntry(draftCacheKey, staleDraftEntry!);
    void writePersistedCache(draftCacheKey, staleDraftEntry!);
    return { objectUrl: staleDraftEntry!.objectUrl, changed: false };
  }

  const item = createEntryFromResult(result);
  setEntry(draftCacheKey, item);
  void writePersistedCache(draftCacheKey, item);
  if (versionCacheKey) {
    setEntry(versionCacheKey, item);
    void writePersistedCache(versionCacheKey, item);
  }
  return { objectUrl: item.objectUrl, changed: true };
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
