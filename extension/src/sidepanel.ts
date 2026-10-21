// apted Tracker side panel — thin host for the shared panel view.
//
// Owns only the topbar (brand, connection, settings); everything inside
// (#panel-root) is the shared tracker panel (funnel + current job +
// tracking dialogue) mounted from panel-view.ts, which also powers the
// job-site drawer.

import { getSettings } from "./storage";
import { mountPanelView, panelStyles } from "./panel-view";
import type { Msg, MsgResultMap, Reply } from "./messages";

async function send<K extends keyof MsgResultMap>(
  msg: Extract<Msg, { type: K }>,
): Promise<MsgResultMap[K]> {
  const reply = (await chrome.runtime.sendMessage(msg)) as Reply<MsgResultMap[K]>;
  if (!reply || !reply.ok) throw new Error(reply?.error ?? "no reply from background");
  return reply.data;
}

// Shared view styles (self-contained .pv- rules — safe in the light DOM too).
const style = document.createElement("style");
style.textContent = panelStyles();
document.head.append(style);

const root = document.getElementById("panel-root");
if (!root) throw new Error("#panel-root missing");

const panel = mountPanelView(root, {
  send,
  scrape: async () => {
    try {
      const job = await send({ type: "scrape" });
      return { company: job.company, role: job.title };
    } catch {
      return null; // not a job page
    }
  },
});

void panel.refresh();

// Topbar wiring.
document.getElementById("open-options")?.addEventListener("click", () => {
  void send({ type: "open-options" }).catch(() => {});
});
void (async () => {
  const { apiBase } = await getSettings();
  const conn = document.getElementById("connection");
  if (conn) conn.textContent = apiBase?.replace(/^https?:\/\//, "") ?? "";
})();
