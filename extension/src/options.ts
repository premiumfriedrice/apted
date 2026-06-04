import { getSettings, setSettings } from "./storage";

const $ = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const apiBase = $<HTMLInputElement>("apiBase");
const authToken = $<HTMLInputElement>("authToken");
const openModeWindow = $<HTMLInputElement>("openModeWindow");
const status = $("status");
const form = $<HTMLFormElement>("form");

function setStatus(msg: string, kind: "" | "ok" | "error" = ""): void {
  status.textContent = msg;
  status.className = "hint" + (kind ? " " + kind : "");
}

void (async () => {
  const s = await getSettings();
  apiBase.value = s.apiBase;
  authToken.value = s.authToken;
  openModeWindow.checked = s.openMode === "window";
})();

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const base = apiBase.value.trim().replace(/\/+$/, "");
  const token = authToken.value.trim();

  if (!base) {
    setStatus("API_BASE is required.", "error");
    return;
  }

  let origin: string;
  try {
    origin = new URL(base).origin + "/*";
  } catch {
    setStatus("API_BASE must be a valid URL.", "error");
    return;
  }

  try {
    const granted = await chrome.permissions.request({ origins: [origin] });
    if (!granted) {
      setStatus(`Permission to access ${origin} denied.`, "error");
      return;
    }
  } catch (err) {
    setStatus(
      "Could not request host permission: " +
        (err instanceof Error ? err.message : String(err)),
      "error",
    );
    return;
  }

  await setSettings({
    apiBase: base,
    authToken: token,
    openMode: openModeWindow.checked ? "window" : "popup",
  });
  setStatus("Saved.", "ok");
});
