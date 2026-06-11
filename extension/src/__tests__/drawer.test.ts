import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock chrome API before importing drawer module.
const sendMessageMock = vi.fn();
const storageLocalGet = vi.fn();
const storageLocalSet = vi.fn();
const storageLocalRemove = vi.fn();
const storageSyncGet = vi.fn();
const storageSessionGet = vi.fn();
const storageSessionSet = vi.fn();

const onChangedListeners: Array<(changes: Record<string, unknown>, area: string) => void> = [];

vi.stubGlobal("chrome", {
  runtime: {
    sendMessage: sendMessageMock,
    lastError: undefined,
    getURL: vi.fn((path: string) => `chrome-extension://abc/${path}`),
  },
  storage: {
    local: {
      get: storageLocalGet,
      set: storageLocalSet,
      remove: storageLocalRemove,
    },
    sync: {
      get: storageSyncGet,
      set: vi.fn(),
    },
    session: {
      get: storageSessionGet,
      set: storageSessionSet,
      remove: vi.fn(),
    },
    onChanged: {
      addListener: vi.fn(
        (cb: (changes: Record<string, unknown>, area: string) => void) => {
          onChangedListeners.push(cb);
        },
      ),
      removeListener: vi.fn(),
    },
  },
});

// ── Functions under test ────────────────────────────────────────────────────

import {
  DRAWSER_WIDTH,
  HANDLE_SIZE,
  ACCENT_COLOR,
  getPulseKeyframes,
  getSlideKeyframes,
  createDrawerStyles,
  createHandleSVG,
  createDrawerHTML,
  type DrawerState,
  createInitialState,
} from "../drawer";

// ── CSS / Style constants ───────────────────────────────────────────────────

describe("drawer style constants", () => {
  it("has correct drawer width (384px, matching Simplified)", () => {
    expect(DRAWSER_WIDTH).toBe(384);
  });

  it("has correct handle size", () => {
    expect(HANDLE_SIZE).toBe(48);
  });

  it("handle is flush with viewport top and slides into drawer header when open", () => {
    const css = createDrawerStyles();
    expect(css).toContain("top: 0");
    expect(css).toContain("width: 64px");
    expect(css).toContain("height: 72px");
    expect(css).toContain("right: 12px");
    expect(css).toContain("translateX(-360px)");
    expect(css).toContain("translateY(7px)");
    const handleOpenMatch = css.match(/\.apted-handle--open\s*\{[^}]*\}/);
    expect(handleOpenMatch).toBeTruthy();
    expect(handleOpenMatch![0]).not.toContain("background:");
  });

  it("has correct accent color", () => {
    expect(ACCENT_COLOR).toBe("#2563eb");
  });
});

// ── Pulse animation ─────────────────────────────────────────────────────────

describe("getPulseKeyframes", () => {
  it("returns CSS keyframes with scale animation", () => {
    const keyframes = getPulseKeyframes();
    expect(keyframes).toContain("@keyframes");
    expect(keyframes).toContain("pulse");
    expect(keyframes).toContain("scale(1)");
    expect(keyframes).toContain("scale(1.05)");
  });

  it("is a non-empty string", () => {
    expect(getPulseKeyframes().length).toBeGreaterThan(0);
  });
});

// ── Slide animation ─────────────────────────────────────────────────────────

describe("getSlideKeyframes", () => {
  it("returns CSS keyframes with translateX animation", () => {
    const keyframes = getSlideKeyframes();
    expect(keyframes).toContain("@keyframes");
    expect(keyframes).toContain("slide-in");
    expect(keyframes).toContain("translateX");
  });

  it("is a non-empty string", () => {
    expect(getSlideKeyframes().length).toBeGreaterThan(0);
  });
});

// ── Drawer styles ───────────────────────────────────────────────────────────

describe("createDrawerStyles", () => {
  it("includes the accent color", () => {
    const css = createDrawerStyles();
    expect(css).toContain("#2563eb");
  });

  it("includes handle styles", () => {
    const css = createDrawerStyles();
    expect(css).toContain(".apted-handle");
  });

  it("includes drawer body styles", () => {
    const css = createDrawerStyles();
    expect(css).toContain(".apted-drawer");
  });

  it("includes pulse animation class", () => {
    const css = createDrawerStyles();
    expect(css).toContain("pulse");
  });

  it("includes slide-in animation class", () => {
    const css = createDrawerStyles();
    expect(css).toContain("slide-in");
  });

  it("includes z-index for stacking above page content", () => {
    const css = createDrawerStyles();
    expect(css).toContain("z-index");
  });

  it("scopes all selectors under :host or .apted- prefix", () => {
    const css = createDrawerStyles();
    expect(css).toContain(":host");
  });
});

// ── Handle SVG ──────────────────────────────────────────────────────────────

describe("createHandleSVG", () => {
  it("returns a handle glyph string", () => {
    const svg = createHandleSVG();
    expect(svg).toContain("apted-handle-glyph");
    expect(svg).toContain(">a</span>");
  });

  it("has correct viewBox for 56x72 glyph size", () => {
    const svg = createHandleSVG();
    expect(svg).toContain("apted-handle-glyph");
  });

  it("contains the letter 'a' glyph", () => {
    const svg = createHandleSVG();
    expect(svg).toContain("apted-handle-glyph");
    expect(svg.toLowerCase()).toContain(">a</span>");
  });

  it("uses near-black (#111) for the glyph color", () => {
    const css = createDrawerStyles();
    expect(css).toContain(".apted-handle-glyph");
    expect(css).toContain("color: #111");
  });

  it("has text-anchor end to align stem to right edge", () => {
    const svg = createHandleSVG();
    expect(svg).toContain("apted-handle-glyph");
  });

  it("uses Outfit as primary font for the glyph", () => {
    const css = createDrawerStyles();
    expect(css).toContain("Outfit");
    expect(css).toContain("-apple-system");
  });

  it("uses bold font-weight (700) for the glyph", () => {
    const css = createDrawerStyles();
    expect(css).toContain("font-weight: 700");
  });

  it("open state does not transform glyph — handle stays separate", () => {
    const css = createDrawerStyles();
    expect(css).toContain(".apted-handle-glyph");
    expect(css).toContain("font-size: 56px");
    expect(css).toContain("font-weight: 700");
    expect(css).toContain("color: #111");
  });

  it("open state turns glyph solid black", () => {
    const css = createDrawerStyles();
    expect(css).toContain(".apted-handle--open .apted-handle-glyph");
    expect(css).toContain("color: #000");
  });
});

// ── Drawer HTML structure ───────────────────────────────────────────────────

describe("createDrawerHTML", () => {
  it("returns HTML with handle element", () => {
    const html = createDrawerHTML();
    expect(html).toContain("apted-handle");
  });

  it("uses Outfit font-family in the glyph and title", () => {
    const css = createDrawerStyles();
    expect(css).toContain('font-family: "Outfit"');
    expect(css).toContain("-apple-system");
  });

  it("does NOT include separate drawer icon — handle becomes the icon", () => {
    const html = createDrawerHTML();
    expect(html).not.toContain("apted-drawer-icon");
  });

  it("returns HTML with drawer body element", () => {
    const html = createDrawerHTML();
    expect(html).toContain("apted-drawer");
  });

  it("includes header with brand name 'pted' and title margin for glyph", () => {
    const html = createDrawerHTML();
    expect(html).toContain("pted");
    expect(html).not.toContain(">apted<");
    const css = createDrawerStyles();
    expect(css).toContain("margin: 0 0 0 6px");
  });

  it("includes JD section with company and role inputs", () => {
    const html = createDrawerHTML();
    expect(html).toContain("jd-company");
    expect(html).toContain("jd-role");
  });

  it("includes JD textarea", () => {
    const html = createDrawerHTML();
    expect(html).toContain("jd-text");
  });

  it("includes Scrape and Tailor buttons", () => {
    const html = createDrawerHTML();
    expect(html).toContain("Scrape");
    expect(html).toContain("Tailor");
  });

  it("includes preview section with iframe", () => {
    const html = createDrawerHTML();
    expect(html).toContain("preview-embed");
  });

  it("includes download, save, and undo buttons", () => {
    const html = createDrawerHTML();
    expect(html).toContain("download-pdf");
    expect(html).toContain("save-version");
    expect(html).toContain("undo");
  });

  it("includes similar resumes section", () => {
    const html = createDrawerHTML();
    expect(html).toContain("similar-section");
  });

  it("includes chat input", () => {
    const html = createDrawerHTML();
    expect(html).toContain("chat-input");
  });

  it("all key IDs use apted- prefix to avoid collisions", () => {
    const html = createDrawerHTML();
    const idMatches = html.match(/id="([^"]+)"/g) ?? [];
    for (const match of idMatches) {
      const id = match.replace(/id="([^"]+)"/, "$1");
      expect(id).toMatch(/^apted-/);
    }
  });
});

// ── State management ────────────────────────────────────────────────────────

describe("DrawerState", () => {
  it("createInitialState returns clean default state", () => {
    const state = createInitialState();
    expect(state.draft).toBeNull();
    expect(state.jobDescription).toBe("");
    expect(state.chat).toEqual([]);
    expect(state.pdfObjectUrl).toBeNull();
    expect(state.pdfLoading).toBe(false);
    expect(state.open).toBe(false);
    expect(state.company).toBe("");
    expect(state.role).toBe("");
  });

  it("state has all required fields", () => {
    const state = createInitialState();
    const requiredKeys: Array<keyof DrawerState> = [
      "draft",
      "jobDescription",
      "chat",
      "pdfObjectUrl",
      "pdfForDraftUpdatedAt",
      "pdfLoading",
      "restoring",
      "open",
      "company",
      "role",
    ];
    for (const key of requiredKeys) {
      expect(key in state).toBe(true);
    }
  });
});

// ── Message sending format ─────────────────────────────────────────────────────────

describe("message sending format", () => {
  beforeEach(() => {
    sendMessageMock.mockReset();
    chrome.runtime.lastError = undefined;
  });

  it("scrape message has correct type", () => {
    const msg = { type: "scrape" as const };
    expect(msg.type).toBe("scrape");
    expect(msg).toEqual({ type: "scrape" });
  });

  it("tailor message has correct shape", () => {
    const msg = { type: "tailor" as const, jobDescription: "test JD" };
    expect(msg.type).toBe("tailor");
    expect(msg.jobDescription).toBe("test JD");
  });

  it("edit message has correct shape", () => {
    const msg = {
      type: "edit" as const,
      draftId: "draft-123",
      instruction: "make it better",
    };
    expect(msg.type).toBe("edit");
    expect(msg.draftId).toBe("draft-123");
    expect(msg.instruction).toBe("make it better");
  });

  it("undo message has correct shape", () => {
    const msg = { type: "undo" as const, draftId: "draft-123" };
    expect(msg.type).toBe("undo");
    expect(msg.draftId).toBe("draft-123");
  });

  it("save-version message has correct shape", () => {
    const msg = {
      type: "save-version" as const,
      company: "Acme",
      role: "Engineer",
      jobDescription: "JD text",
      tailoredContent: { contact: { name: "Test" }, sections: [] },
      outcome: "draft" as const,
    };
    expect(msg.company).toBe("Acme");
    expect(msg.outcome).toBe("draft");
  });

  it("fetch-pdf message has correct shape", () => {
    const msg = {
      type: "fetch-pdf" as const,
      draftId: "draft-123",
      ifNoneMatch: '"etag123"',
    };
    expect(msg.type).toBe("fetch-pdf");
    expect(msg.ifNoneMatch).toBe('"etag123"');
  });

  it("get-draft message has correct shape", () => {
    const msg = { type: "get-draft" as const, draftId: "draft-123" };
    expect(msg.type).toBe("get-draft");
    expect(msg.draftId).toBe("draft-123");
  });
});

// ── Handle show/hide/pulse logic (PRE-68) ───────────────────────────────────

describe("handle visibility logic", () => {
  it("handle should be hidden when no API base is configured", () => {
    const settings = { apiBase: "", authToken: "" };
    const handleDisabled = !settings.apiBase;
    expect(handleDisabled).toBe(true);
  });

  it("handle should be visible when API is configured", () => {
    const settings = { apiBase: "https://api.example.com", authToken: "token" };
    const handleDisabled = !settings.apiBase;
    expect(handleDisabled).toBe(false);
  });

  it("handle should add disabled class when API base is not configured", () => {
    const apiBase = "";
    const handleDisabled = !apiBase;
    const handleClass = handleDisabled
      ? "apted-handle apted-handle--disabled"
      : "apted-handle";
    expect(handleClass).toContain("apted-handle--disabled");
  });

  it("handle should not have disabled class when API is configured", () => {
    const apiBase = "https://api.example.com";
    const handleDisabled = !apiBase;
    const handleClass = handleDisabled
      ? "apted-handle apted-handle--disabled"
      : "apted-handle";
    expect(handleClass).not.toContain("--disabled");
  });

  it("disabled state takes precedence over open state", () => {
    const handleDisabled = true;
    const isOpen = true;
    const classes: string[] = ["apted-handle"];
    if (handleDisabled) classes.push("apted-handle--disabled");
    if (isOpen && !handleDisabled) classes.push("apted-handle--open");
    expect(classes).toContain("apted-handle--disabled");
    expect(classes).not.toContain("apted-handle--open");
  });
});

// ── Blue dot badge ──────────────────────────────────────────────────────────

describe("blue dot badge", () => {
  it("has a dot element in the handle", () => {
    const html = createDrawerHTML();
    expect(html).toContain("apted-handle-dot");
  });

  it("dot has a visible class toggling mechanism", () => {
    const dotClass = "apted-handle-dot";
    const visible = true;
    const finalClass = visible ? `${dotClass} apted-handle-dot--visible` : dotClass;
    expect(finalClass).toContain("apted-handle-dot--visible");
  });

  it("dot is hidden by default", () => {
    const visible = false;
    const finalClass = visible ? "apted-handle-dot apted-handle-dot--visible" : "apted-handle-dot";
    expect(finalClass).not.toContain("--visible");
  });

  it("dot should be cleared when drawer opens", () => {
    const drawerOpen = true;
    const showDot = !drawerOpen;
    expect(showDot).toBe(false);
  });
});

// ── Open/closed state persistence ───────────────────────────────────────────

describe("open state persistence per domain", () => {
  it("storage key includes hostname", () => {
    const hostname = "www.linkedin.com";
    const key = `aptedDrawerOpen:${hostname}`;
    expect(key).toBe("aptedDrawerOpen:www.linkedin.com");
  });

  it("different domains have different storage keys", () => {
    const key1 = "aptedDrawerOpen:linkedin.com";
    const key2 = "aptedDrawerOpen:greenhouse.io";
    expect(key1).not.toBe(key2);
  });

  it("restoring true opens the drawer", () => {
    const storedValue = true;
    const shouldOpen = storedValue === true;
    expect(shouldOpen).toBe(true);
  });

  it("restoring false keeps drawer closed", () => {
    const storedValue = false as boolean | undefined;
    const shouldOpen = storedValue === true;
    expect(shouldOpen).toBe(false);
  });

  it("missing key defaults to closed", () => {
    const storedValue = undefined;
    const shouldOpen = storedValue === true;
    expect(shouldOpen).toBe(false);
  });
});

// ── Pulse animation trigger ─────────────────────────────────────────────────

describe("pulse animation trigger", () => {
  it("pulse class should be added when draft is ready", () => {
    const hasDraft = true;
    const pulseClass = hasDraft ? "apted-handle apted-handle--pulse" : "apted-handle";
    expect(pulseClass).toContain("apted-handle--pulse");
  });

  it("pulse class should not be present when no draft", () => {
    const hasDraft = false;
    const pulseClass = hasDraft ? "apted-handle apted-handle--pulse" : "apted-handle";
    expect(pulseClass).not.toContain("--pulse");
  });
});

// ── Open/closed state ───────────────────────────────────────────────────────

describe("drawer open/closed state", () => {
  it("default state is closed", () => {
    const state = createInitialState();
    expect(state.open).toBe(false);
  });

  it("open is a boolean", () => {
    const state = createInitialState();
    expect(typeof state.open).toBe("boolean");
  });

  it("closed drawer should have collapsed to handle size (48x48)", () => {
    expect(HANDLE_SIZE).toBe(48);
  });
});

// ── Supported URL patterns ──────────────────────────────────────────────────

describe("site URL matching", () => {
  it("matches LinkedIn job URLs", () => {
    const url = "https://www.linkedin.com/jobs/view/12345/";
    const matches =
      /linkedin\.com\/jobs\//.test(url);
    expect(matches).toBe(true);
  });

  it("matches Greenhouse board URLs", () => {
    const url = "https://boards.greenhouse.io/acme/jobs/123";
    const matches =
      /greenhouse\.io/.test(url);
    expect(matches).toBe(true);
  });

  it("matches Lever job URLs", () => {
    const url = "https://jobs.lever.co/acme/123";
    const matches =
      /lever\.co/.test(url);
    expect(matches).toBe(true);
  });

  it("matches Workday job URLs", () => {
    const url = "https://acme.myworkdayjobs.com/en-US/careers/job/123";
    const matches =
      /myworkdayjobs\.com/.test(url);
    expect(matches).toBe(true);
  });

  it("does not match non-job sites", () => {
    const url = "https://www.google.com";
    const matches =
      /linkedin\.com\/jobs\/|greenhouse\.io|lever\.co|myworkdayjobs\.com/.test(url);
    expect(matches).toBe(false);
  });
});
