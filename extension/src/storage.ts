import type { Settings } from "./types";

// Default API base: the apted web app. The extension connects to the user's
// apted account via the /connect page handoff (or a token pasted in Options).
// Local dev: set API_BASE to http://localhost:3000 in Options (local-mode
// servers accept unauthenticated calls and count as signed in).
const DEFAULT_API_BASE = "https://apted.vercel.app";
const DEFAULTS: Settings = { apiBase: DEFAULT_API_BASE, authToken: "", openMode: "popup", passiveTracking: true };

export async function getSettings(): Promise<Settings> {
  const raw = await chrome.storage.sync.get(DEFAULTS);
  return {
    apiBase: raw.apiBase || DEFAULT_API_BASE,
    authToken: raw.authToken ?? "",
    openMode: raw.openMode === "window" ? "window" : "popup",
    // Older installs predate the key; treat "explicitly false" as off.
    passiveTracking: (raw.passiveTracking as boolean | undefined) !== false,
  };
}

export async function setSettings(s: Settings): Promise<void> {
  await chrome.storage.sync.set(s);
}
