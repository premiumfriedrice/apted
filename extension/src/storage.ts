import type { Settings } from "./types";

const DEFAULTS: Settings = { apiBase: "https://apted.vercel.app", authToken: "", openMode: "popup" };

export async function getSettings(): Promise<Settings> {
  const raw = await chrome.storage.sync.get(DEFAULTS);
  return {
    apiBase: raw.apiBase || "https://apted.vercel.app",
    authToken: raw.authToken ?? "",
    openMode: raw.openMode === "window" ? "window" : "popup",
  };
}

export async function setSettings(s: Settings): Promise<void> {
  await chrome.storage.sync.set(s);
}
