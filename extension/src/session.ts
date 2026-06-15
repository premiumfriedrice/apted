// Persists the working session in chrome.storage.local with a 6-hour TTL so
// an accidental close doesn't lose the user's scrape, draft, and chat log.
// The TTL is enforced lazily on read — no background job needed.

export const SESSION_TTL_MS = 6 * 60 * 60 * 1000;
const KEY = "aptedSession";

export type StoredChatTurn = { who: "you" | "apted"; text: string };

export type Snapshot = {
  ts: number;             // write time; used for TTL check
  url: string;            // page URL so we don't restore stale data from a different job
  jd: string;
  company: string;
  role: string;
  draftId: string | null; // the server-side draft is canonical; we just hold its id
  chat: StoredChatTurn[];
};

export async function readSession(): Promise<Snapshot | null> {
  const data = await chrome.storage.local.get(KEY);
  const snap = data[KEY] as Snapshot | undefined;
  if (!snap || typeof snap.ts !== "number") return null;
  if (Date.now() - snap.ts > SESSION_TTL_MS) {
    await chrome.storage.local.remove(KEY);
    return null;
  }
  // Only restore if the session was saved on this exact page.
  if (snap.url !== location.href) {
    return null;
  }
  return snap;
}

export async function writeSession(
  snap: Omit<Snapshot, "ts">,
): Promise<void> {
  await chrome.storage.local.set({ [KEY]: { ...snap, ts: Date.now() } });
}

export async function clearSession(): Promise<void> {
  await chrome.storage.local.remove(KEY);
}
