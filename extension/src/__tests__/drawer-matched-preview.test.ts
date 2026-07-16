import { describe, it, expect, vi, beforeEach } from "vitest";

// Integration-style test: drive the real drawer IIFE in jsdom to reproduce
// what happens when a user clicks a matched resume card — does the preview
// block actually become visible and sit under the matched card?
//
// We stub chrome fully (getURL so the IIFE proceeds past its guard, storage,
// and a sendMessage that dispatches per message type) then poll the live
// shadow DOM that the IIFE builds on import.

const sendMessageMock = vi.fn();
const storageLocalGet = vi.fn(async () => ({}));
const storageLocalSet = vi.fn(async () => undefined);
const storageLocalRemove = vi.fn(async () => undefined);
const storageSyncGet = vi.fn(async () => ({ apiBase: "https://api.test", authToken: "t" }));
const storageSyncSet = vi.fn(async () => undefined);
const storageSessionGet = vi.fn(async () => ({}));
const storageSessionSet = vi.fn(async () => undefined);
const storageSessionRemove = vi.fn(async () => undefined);

// jsdom doesn't ship CSS.escape; stub it (the real browser has it).
vi.stubGlobal("CSS", {
  escape: (s: string) => String(s).replace(/[^a-zA-Z0-9_-]/g, (c) => `\${c}`),
});

vi.stubGlobal("chrome", {
  runtime: {
    sendMessage: sendMessageMock,
    lastError: undefined,
    getURL: vi.fn((p: string) => `chrome-extension://abc/${p}`),
    onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  storage: {
    local: { get: storageLocalGet, set: storageLocalSet, remove: storageLocalRemove },
    sync: { get: storageSyncGet, set: storageSyncSet, onChanged: { addListener: vi.fn() } },
    session: { get: storageSessionGet, set: storageSessionSet, remove: storageSessionRemove },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  action: { setPopup: vi.fn() },
  windows: { get: vi.fn(), create: vi.fn(), update: vi.fn(), onRemoved: { addListener: vi.fn() } },
  tabs: { query: vi.fn(), get: vi.fn() },
  scripting: { executeScript: vi.fn() },
  commands: { onCommand: { addListener: vi.fn() } },
  omnibox: {
    onInputChanged: { addListener: vi.fn() },
    onInputEntered: { addListener: vi.fn() },
    setDefaultSuggestion: vi.fn(),
  },
  contextMenus: {
    removeAll: vi.fn((cb) => cb?.()),
    create: vi.fn(),
    onClicked: { addListener: vi.fn() },
  },
} as unknown as typeof chrome);
// (chrome.runtime set above; the duplicated key is fine for the stub.)

beforeEach(() => {
  vi.clearAllMocks();
});

function replyFor(msg: { type: string }): unknown {
  switch (msg.type) {
    case "scrape":
      return {
        url: "https://boards.greenhouse.io/acme/jobs/1",
        title: "Engineer",
        company: "Acme",
        jobDescription: "Build things",
        source: "greenhouse",
      };
    case "extract":
      return { title: "Engineer", company: "Acme", location: "", terms: [] };
    case "find-similar":
      return {
        similar: [
          { id: "v1", company: "OldCo", role: "Eng", score: 80, createdAt: "2026-07-01T00:00:00Z" },
          { id: "v2", company: "Other", role: "Eng", score: 70, createdAt: "2026-07-02T00:00:00Z" },
        ],
      };
    case "get-version":
      return {
        id: "draft-9",
        jobDescription: "Build things",
        content: { contact: { name: "Alice" }, sections: [] },
        history: [],
        createdAt: "2026-07-15T00:00:00Z",
        updatedAt: "2026-07-15T00:00:00Z",
      };
    case "fetch-pdf":
      return { kind: "ok", base64: "JVBERi0=", etag: "e", mime: "application/pdf" };
    case "list-versions":
      return [
        { id: "v1", name: "OldCo Eng", company: "OldCo", role: "Eng", outcome: "applied", createdAt: "2026-07-01T00:00:00Z" },
        { id: "v3", name: "Third Co Eng", company: "Third", role: "Eng", outcome: "draft", createdAt: "2026-07-03T00:00:00Z" },
      ];
    case "fetch-version-pdf":
      return { base64: "JVBERi0=", mime: "application/pdf" };
    case "get-draft":
      return { notFound: true };
    default:
      return null;
  }
}

// Wire sendMessage to dispatch by message type and invoke the callback. The
// drawer IIFE auto-scrape runs on import (before any beforeEach), so the
// dispatch implementation must be in place BEFORE the dynamic import below.
function dispatchMessage(msg: { type: string }, cb: (r: unknown) => void): void {
  const data = replyFor(msg);
  Promise.resolve(data).then((d) => cb({ ok: true, data: d }));
}
sendMessageMock.mockImplementation(dispatchMessage);

// Poll helper that resolves when a predicate over the DOM is true (with timeout).
async function waitFor(pred: () => boolean, ms = 500): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (pred()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("waitFor timed out");
}

// Import after chrome is stubbed and the dispatch mock is in place; the IIFE
// runs on import and builds the shadow DOM + kicks off the auto-scrape flow.
await import("../drawer");

function shadowRoot(): ShadowRoot {
  const host = document.getElementById("apted-drawer-host");
  if (!host?.shadowRoot) throw new Error("drawer host/shadow not attached");
  return host.shadowRoot;
}

describe("matched resume preview (integration)", () => {
  it("shows the preview block under the clicked matched card", async () => {
    const sr = shadowRoot();
    const similarList = sr.getElementById("apted-similar-list")!;

    // Wait for the auto-scrape to populate matched cards.
    await waitFor(
      () => !!similarList.querySelector('.apted-similar-item[data-version-id="v1"]'),
      1500,
    );

    const matchedCard = similarList.querySelector(
      '.apted-similar-item[data-version-id="v1"]',
    ) as HTMLElement;
    expect(matchedCard).toBeTruthy();

    // Click the matched resume card.
    matchedCard.dispatchEvent(new Event("click", { bubbles: true }));

    // The preview block should become visible and sit directly after the card
    // (inside the similar list), and the card should be flagged preview-open.
    await waitFor(
      () => matchedCard.classList.contains("apted-similar-item--preview-open"),
      1500,
    );

    const previewBlock = sr.getElementById("apted-preview-block")!;
    expect(previewBlock.hidden).toBe(false);
    expect(matchedCard.classList.contains("apted-similar-item--preview-open")).toBe(true);
    // The preview block should be the immediate next sibling of the matched card.
    expect(matchedCard.nextElementSibling).toBe(previewBlock);
  }, 10000);

  it("swaps to the All Resumes view via the header toggle and previews an all-resumes card", async () => {
    const sr = shadowRoot();
    const similarList = sr.getElementById("apted-similar-list")!;
    await waitFor(
      () => !!similarList.querySelector('.apted-similar-item[data-version-id="v1"]'),
      1500,
    );

    // The header toggle becomes visible once the library has loaded and has
    // past resumes. Click it to swap to the All Resumes view.
    const toggle = sr.getElementById("apted-section-view-toggle") as HTMLButtonElement;
    await waitFor(() => !toggle.hidden, 1500);
    toggle.dispatchEvent(new Event("click", { bubbles: true }));

    // View swapped: matching view hidden, all-resumes view shown, title + icon flipped.
    const matchingView = sr.getElementById("apted-matching-view") as HTMLElement;
    const allResumesView = sr.getElementById("apted-all-resumes-view") as HTMLElement;
    await waitFor(() => !allResumesView.hidden, 1500);
    expect(matchingView.hidden).toBe(true);
    expect(sr.getElementById("apted-section-title-text")!.textContent).toBe("All Resumes");

    // Past-resumes list populates (v3 only; v1 is excluded as a match).
    const allList = sr.getElementById("apted-all-resumes-list")!;
    await waitFor(
      () => !!allList.querySelector('.apted-similar-item[data-version-id="v3"]'),
      1500,
    );

    const allCard = allList.querySelector(
      '.apted-similar-item[data-version-id="v3"]',
    ) as HTMLElement;
    allCard.dispatchEvent(new Event("click", { bubbles: true }));

    await waitFor(
      () => allCard.classList.contains("apted-similar-item--preview-open"),
      1500,
    );
    const previewBlock = sr.getElementById("apted-preview-block")!;
    expect(previewBlock.hidden).toBe(false);
    expect(allCard.nextElementSibling).toBe(previewBlock);
  }, 10000);

  it("toggle swaps views both ways and back", async () => {
    const sr = shadowRoot();
    const similarList = sr.getElementById("apted-similar-list")!;
    await waitFor(
      () => !!similarList.querySelector('.apted-similar-item[data-version-id="v1"]'),
      1500,
    );

    const toggle = sr.getElementById("apted-section-view-toggle") as HTMLButtonElement;
    await waitFor(() => !toggle.hidden, 1500);
    const title = () => sr.getElementById("apted-section-title-text")!.textContent;

    // Record the starting view (tests share module state, so it may be either).
    const startTitle = title();
    const otherTitle = startTitle === "All Resumes" ? "Matching Resumes" : "All Resumes";

    // Click 1: swap to the other view.
    toggle.dispatchEvent(new Event("click", { bubbles: true }));
    await waitFor(() => title() === otherTitle, 1500);
    if (otherTitle === "All Resumes") {
      expect(sr.getElementById("apted-matching-view")!.hidden).toBe(true);
      expect(sr.getElementById("apted-all-resumes-view")!.hidden).toBe(false);
    } else {
      expect(sr.getElementById("apted-matching-view")!.hidden).toBe(false);
      expect(sr.getElementById("apted-all-resumes-view")!.hidden).toBe(true);
    }

    // Click 2: back to the starting view.
    toggle.dispatchEvent(new Event("click", { bubbles: true }));
    await waitFor(() => title() === startTitle, 1500);
  }, 10000);
});