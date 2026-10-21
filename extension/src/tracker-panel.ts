// Tracker side panel — the v1 side-panel surface (PRE-88).
//
// Mounts the shared pipeline board (pipeline.ts) into the panel page. All
// network stays in the service worker; this page only messages.

import { pipelineStyles, renderPipeline, type PipelineActions, type PipelineState } from "./pipeline";
import type { Msg, Reply } from "./messages";

const root = document.getElementById("pipeline-root") as HTMLElement;

function send<T>(msg: Msg): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (reply: Reply<T> | undefined) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (reply && reply.ok) {
        resolve(reply.data);
      } else {
        reject(new Error(reply && !reply.ok ? reply.error : "no reply from background"));
      }
    });
  });
}

const actions: PipelineActions = {
  onConnect() {
    void send({ type: "open-connect" }).catch(() => {});
  },
  onRetry() {
    void send({ type: "tracker-flush" })
      .catch(() => {})
      .finally(() => void refresh());
  },
  async onOutcomeChange(app, outcome) {
    try {
      const r = await send<{ ok: boolean }>({
        type: "tracker-set-outcome",
        id: app.id,
        outcome,
      });
      return r.ok;
    } catch {
      return false;
    }
  },
  async onApplySuggestion(s) {
    try {
      const r = await send<{ ok: boolean }>({ type: "tracker-apply-suggestion", suggestionId: s.id });
      return r.ok;
    } catch {
      return false;
    }
  },
  onDismissSuggestion(s) {
    void send({ type: "tracker-dismiss-suggestion", suggestionId: s.id }).catch(() => {});
  },
};

async function refresh(): Promise<void> {
  try {
    const state = await send<PipelineState>({ type: "tracker-state" });
    renderPipeline(root, state, actions);
  } catch {
    renderPipeline(
      root,
      { status: "offline", applications: [], suggestions: [], queued: 0, updatedAt: null },
      actions,
    );
  }
}

// Inject the pipeline styles into the panel document.
const styleEl = document.createElement("style");
styleEl.textContent = pipelineStyles();
document.head.appendChild(styleEl);

document.getElementById("open-options")?.addEventListener("click", () => {
  void send({ type: "open-options" }).catch(() => {});
});

// Re-render when tracker state changes elsewhere (captures, Gmail
// suggestions) or the auth token flips.
chrome.storage.onChanged.addListener((changes, area) => {
  const relevant =
    (area === "local" && (changes["aptedTrackerCache"] || changes["aptedSuggestions"])) ||
    (area === "sync" && changes["authToken"]);
  if (relevant) void refresh();
});

void refresh();
