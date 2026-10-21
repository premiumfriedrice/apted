import type { Settings } from "./types";

// TEMPORARY (dev run, PRE-88): pointed at the local dev server + local
// Postgres mock store so the tracker works without the connect/login flow.
// Revert to "https://apted.vercel.app" (and drop the localhost host
// permission in manifest.json) before the Chrome Web Store submission.
const DEV_API_BASE = "http://localhost:3000";
const PROD_API_BASE = "https://apted.vercel.app";
const DEFAULTS: Settings = { apiBase: DEV_API_BASE, authToken: "", openMode: "popup", passiveTracking: true };

export async function getSettings(): Promise<Settings> {
  const raw = await chrome.storage.sync.get(DEFAULTS);
  return {
    apiBase: raw.apiBase || DEV_API_BASE,
    authToken: raw.authToken ?? "",
    openMode: raw.openMode === "window" ? "window" : "popup",
    // Older installs predate the key; treat "explicitly false" as off.
    passiveTracking: (raw.passiveTracking as boolean | undefined) !== false,
  };
}

export { DEV_API_BASE, PROD_API_BASE };

export async function setSettings(s: Settings): Promise<void> {
  await chrome.storage.sync.set(s);
}
