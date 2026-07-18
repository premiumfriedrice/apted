import { getSettings, setSettings } from "./storage";

const $ = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

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
  authToken.value = s.authToken;
  openModeWindow.checked = s.openMode === "window";
})();

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const token = authToken.value.trim();

  await setSettings({
    apiBase: "https://apted.vercel.app",
    authToken: token,
    openMode: openModeWindow.checked ? "window" : "popup",
  });
  setStatus("Saved.", "ok");
});
