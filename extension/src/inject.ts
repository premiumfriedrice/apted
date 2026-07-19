// Floating affordance on supported job sites: an "apted" button that opens
// the side panel, plus a draggable resume-PDF chip when a draft is ready.
// Both live in a shadow DOM so the host page CSS can't reach them.
import { getDraftPdfBlob, suggestPdfFilename } from "./pdf";

type CurrentDraft = {
  id: string;
  updatedAt: string;
  company?: string;
  role?: string;
};

type SiteProfile = {
  match: (host: string) => boolean;
  label: string;
  hint: string;
};

const SITE_PROFILES: SiteProfile[] = [
  {
    match: (h) => h.endsWith("greenhouse.io"),
    label: "Drag onto the resume upload box",
    hint: "Greenhouse accepts drag-and-drop on the file field.",
  },
  {
    match: (h) => h.endsWith("lever.co"),
    label: "Drag onto the resume upload box",
    hint: "Lever accepts drag-and-drop on the file field.",
  },
  {
    match: (h) => h.includes("linkedin.com"),
    label: "Drop on the file input",
    hint: "LinkedIn requires dropping directly onto the file input element.",
  },
  {
    match: (h) => h.endsWith("myworkdayjobs.com"),
    label: "Drag onto Workday's upload zone",
    hint: "Workday is inconsistent; if drop fails, use the clipboard fallback.",
  },
];

function pickProfile(host: string): SiteProfile {
  return SITE_PROFILES.find((p) => p.match(host)) ?? {
    match: () => true,
    label: "Drag onto the upload field",
    hint: "",
  };
}

(function () {
  if (document.getElementById("apted-fab-host")) return;

  const host = document.createElement("div");
  host.id = "apted-fab-host";
  Object.assign(host.style, {
    position: "fixed",
    bottom: "20px",
    right: "20px",
    zIndex: "2147483647",
    all: "initial",
  } as Partial<CSSStyleDeclaration>);

  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      :host, * { all: initial; }
      .cluster {
        display: inline-flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 8px;
        font: 600 12px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      }
      .btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        background: #0e0f12;
        color: #f5f5f5;
        border: 1px solid #2a2e38;
        border-radius: 999px;
        padding: 10px 16px;
        font-size: 13px;
        cursor: pointer;
        box-shadow: 0 6px 18px rgba(0, 0, 0, 0.28);
      }
      .btn:hover { background: #1a1c22; }
      .chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: #f5f5f5;
        color: #0e0f12;
        border: 1px solid #d0d2d8;
        border-radius: 999px;
        padding: 6px 10px 6px 8px;
        font-size: 12px;
        cursor: grab;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
        user-select: none;
      }
      .chip:active { cursor: grabbing; }
      .chip[hidden] { display: none; }
      .chip .glyph {
        display: inline-block;
        width: 14px; height: 14px;
        background: #0e0f12;
        color: #f5f5f5;
        border-radius: 3px;
        font-size: 9px;
        text-align: center;
        line-height: 14px;
      }
      .chip .stale {
        font-size: 10px;
        color: #b45309;
        margin-left: 4px;
      }
      .pop {
        background: #fff;
        border: 1px solid #d0d2d8;
        border-radius: 8px;
        padding: 10px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
        min-width: 220px;
      }
      .pop[hidden] { display: none; }
      .pop h4 {
        margin: 0 0 6px 0;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: #6b7280;
        font-weight: 700;
      }
      .pop button, .pop a {
        display: block;
        width: 100%;
        text-align: left;
        background: #f5f5f5;
        color: #0e0f12;
        border: 1px solid #d0d2d8;
        border-radius: 6px;
        padding: 6px 8px;
        margin-top: 4px;
        font-size: 12px;
        cursor: pointer;
        text-decoration: none;
      }
      .pop button:hover, .pop a:hover { background: #ececec; }
      .dot {
        display: inline-block;
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #7aa2f7;
      }
    </style>
    <div class="cluster">
      <div id="apted-pop" class="pop" hidden></div>
      <span id="apted-chip" class="chip" draggable="true" hidden title="">
        <span class="glyph">PDF</span>
        <span id="apted-chip-label">resume.pdf</span>
        <span id="apted-chip-stale" class="stale" hidden>stale</span>
      </span>
      <button class="btn" id="apted-fab" title="Open apted">
        <span class="dot"></span>
        <span>apted</span>
      </button>
    </div>
  `;

  const fab = shadow.getElementById("apted-fab") as HTMLButtonElement;
  const chip = shadow.getElementById("apted-chip") as HTMLSpanElement;
  const chipLabel = shadow.getElementById("apted-chip-label") as HTMLSpanElement;
  const chipStale = shadow.getElementById("apted-chip-stale") as HTMLSpanElement;
  const pop = shadow.getElementById("apted-pop") as HTMLDivElement;

  const profile = pickProfile(location.hostname);
  let currentDraft: CurrentDraft | null = null;
  let lastDragResult: "ok" | "none" | null = null;

  fab.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "open-window" });
  });

  function updateChip(d: CurrentDraft | null): void {
    currentDraft = d;
    if (!d) {
      chip.hidden = true;
      pop.hidden = true;
      return;
    }
    const filename = suggestPdfFilename({ id: d.id, company: d.company, role: d.role });
    chipLabel.textContent = filename;
    chip.title = profile.label + (profile.hint ? ": " + profile.hint : "");
    chip.hidden = false;
  }

  function showPopover(filename: string, objectUrl: string, blob: Blob): void {
    pop.innerHTML = `
      <h4>Drag didn't land</h4>
      <button id="apted-copy">Copy resume as file</button>
      <a id="apted-dl" download="${filename}" href="${objectUrl}">Download PDF</a>
      <button id="apted-open">Open in apted</button>
    `;
    pop.hidden = false;
    const copy = pop.querySelector("#apted-copy") as HTMLButtonElement;
    const open = pop.querySelector("#apted-open") as HTMLButtonElement;
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({ "application/pdf": blob }),
        ]);
        copy.textContent = "Copied. Paste with Cmd/Ctrl+V";
      } catch (e) {
        copy.textContent = "Copy failed: " + (e instanceof Error ? e.message : "?");
      }
    });
    open.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "open-window" });
      pop.hidden = true;
    });
  }

  // Prefetch the blob eagerly when the draft appears so the drag DataTransfer
  // always has bytes ready. Runs in page context, so items.add() works.
  let cachedBlob: Blob | null = null;
  let cachedObjectUrl: string | null = null;
  let cachedFilename = "resume.pdf";
  let prefetchRunning = false;

  async function prefetch(): Promise<void> {
    if (!currentDraft || prefetchRunning) return;
    prefetchRunning = true;
    try {
      const { blob } = await getDraftPdfBlob({
        draftId: currentDraft.id,
        draftUpdatedAt: currentDraft.updatedAt,
      });
      cachedBlob = blob;
      if (cachedObjectUrl) URL.revokeObjectURL(cachedObjectUrl);
      cachedObjectUrl = URL.createObjectURL(blob);
      cachedFilename = suggestPdfFilename({
        id: currentDraft.id,
        company: currentDraft.company,
        role: currentDraft.role,
      });
      chipStale.hidden = true;
    } catch {
      // swallowed
    } finally {
      prefetchRunning = false;
    }
  }

  function fireDrag(e: DragEvent): void {
    if (!cachedBlob || !cachedObjectUrl || !currentDraft) {
      e.preventDefault();
      chipStale.hidden = false;
      void prefetch().then(() => { chipStale.hidden = true; });
      return;
    }
    const dt = e.dataTransfer;
    if (!dt) return;

    dt.effectAllowed = "copy";

    // Create a proper File — content scripts run in the page's JS context,
    // so the File constructor and dt.items.add() both work reliably.
    const file = new File([cachedBlob], cachedFilename, {
      type: "application/pdf",
      lastModified: Date.now(),
    });

    // setData first (required before items manipulation in Chromium).
    dt.setData("DownloadURL", `application/pdf:${cachedFilename}:${cachedObjectUrl}`);
    dt.setData("text/plain", cachedFilename);

    // items.add() makes the file droppable onto <input type=file>.
    dt.items.add(file);

    dt.setDragImage(chip, 8, 8);
    lastDragResult = null;
    pop.hidden = true;
  }

  chip.addEventListener("mouseenter", () => void prefetch());
  chip.addEventListener("dragstart", (e: DragEvent) => fireDrag(e));

  chip.addEventListener("dragend", (e: DragEvent) => {
    const ok = !!e.dataTransfer && e.dataTransfer.dropEffect !== "none";
    lastDragResult = ok ? "ok" : "none";
    if (!ok && cachedBlob && cachedObjectUrl) {
      showPopover(cachedFilename, cachedObjectUrl, cachedBlob);
    }
  });

  // Read initial draft state and subscribe to updates from the sidepanel.
  void chrome.storage.local
    .get("aptedCurrentDraft")
    .then((s) => updateChip((s.aptedCurrentDraft as CurrentDraft | undefined) ?? null));

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.aptedCurrentDraft) return;
    const next = (changes.aptedCurrentDraft.newValue as CurrentDraft | undefined) ?? null;
    updateChip(next);
    // Prefetch eagerly and mark stale if updatedAt advanced.
    if (next) void prefetch();
    if (next && currentDraft && next.id === currentDraft.id && next.updatedAt !== currentDraft.updatedAt) {
      chipStale.hidden = false;
      cachedBlob = null;
      if (cachedObjectUrl) {
        URL.revokeObjectURL(cachedObjectUrl);
        cachedObjectUrl = null;
      }
    }
  });

  // ── Cross-window drop: intercept drags from the sidepanel onto file inputs ──
  // The sidepanel sets aptedDragPdfB64 in session storage before dragstart.
  document.addEventListener("drop", (e: DragEvent) => {
    // Only intercept if the sidepanel pre-staged a PDF for cross-window drag.
    void chrome.storage.session.get("aptedDragPdfB64").then(async (stored) => {
      const b64 = stored.aptedDragPdfB64 as string | undefined;
      if (!b64) return; // Not our drag — let the page handle it normally.

      // Clean up so the next regular page drag isn't intercepted.
      await chrome.storage.session.remove("aptedDragPdfB64");

      // Find the file input under the drop point or nearest.
      const target = document.elementFromPoint(e.clientX, e.clientY);
      const fileInput = target?.closest("input[type=file]");
      if (!fileInput) return; // Dropped outside a file input.

      e.preventDefault();
      e.stopPropagation();

      // Convert base64 to File and inject into the file input.
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const file = new File([bytes], (stored.aptedDragPdfFilename as string) ?? "resume.pdf", {
        type: "application/pdf",
        lastModified: Date.now(),
      });

      // Programmatically set the file input's files.
      const dt = new DataTransfer();
      dt.items.add(file);
      (fileInput as HTMLInputElement).files = dt.files;
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }, { capture: true });

  // ── Handle fill-nearest-input from sidepanel ──────────────────────────────
  // The sidepanel can't fill file inputs directly. It stashes the PDF as
  // base64 in session storage and sends this message via the background
  // script. We find the nearest file input and fill it.
  chrome.runtime.onMessage.addListener((msg: { type: string }) => {
    if (msg.type !== "fill-nearest-input") return;
    chrome.storage.session.get(["aptedDragPdfB64", "aptedDragPdfFilename"]).then(async (stored) => {
      const b64 = stored.aptedDragPdfB64 as string | undefined;
      if (!b64) return;
      await chrome.storage.session.remove(["aptedDragPdfB64", "aptedDragPdfFilename"]);

      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const file = new File([bytes], (stored.aptedDragPdfFilename as string) ?? "resume.pdf", {
        type: "application/pdf",
        lastModified: Date.now(),
      });

      // Find the best file input on the page.
      const inputs = Array.from(document.querySelectorAll<HTMLInputElement>("input[type='file']"));
      if (!inputs.length) return;
      // Prefer inputs that accept PDFs, then any visible input, then the first.
      const pdfInput = inputs.find((i) => /pdf/i.test(i.accept))
        ?? inputs.find((i) => i.offsetParent !== null)
        ?? inputs[0]!;
      if (!pdfInput) return;

      const dt = new DataTransfer();
      dt.items.add(file);
      pdfInput.files = dt.files;
      pdfInput.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });

  const attach = () => document.body && document.body.appendChild(host);
  if (document.body) attach();
  else document.addEventListener("DOMContentLoaded", attach, { once: true });
})();
