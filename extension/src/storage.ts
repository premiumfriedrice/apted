import type { Settings } from "./types";

const DEFAULTS: Settings = { apiBase: "https://apted.vercel.app", authToken: "", openMode: "popup", passiveTracking: true };

export async function getSettings(): Promise<Settings> {
  const raw = await chrome.storage.sync.get(DEFAULTS);
  return {
    apiBase: raw.apiBase || "https://apted.vercel.app",
    authToken: raw.authToken ?? "",
    openMode: raw.openMode === "window" ? "window" : "popup",
    // Older installs predate the key; treat "explicitly false" as off.
    passiveTracking: (raw.passiveTracking as boolean | undefined) !== false,
  };
}

export async function setSettings(s: Settings): Promise<void> {
  await chrome.storage.sync.set(s);
}
