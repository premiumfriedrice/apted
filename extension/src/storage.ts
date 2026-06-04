import type { Settings } from "./types";

const DEFAULTS: Settings = { apiBase: "", authToken: "", openMode: "popup" };

export async function getSettings(): Promise<Settings> {
  const raw = await chrome.storage.sync.get(DEFAULTS);
  return {
    apiBase: raw.apiBase ?? "",
    authToken: raw.authToken ?? "",
    openMode: raw.openMode === "window" ? "window" : "popup",
  };
}

export async function setSettings(s: Settings): Promise<void> {
  await chrome.storage.sync.set(s);
}
