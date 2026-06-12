import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  suggestPdfFilename,
  getDraftPdfBlob,
  getDraftPdfObjectUrl,
  fetchPdfForPreview,
  clearPdfCache,
} from "../pdf";
import type { FetchPdfResult } from "../messages";

// ── helpers ────────────────────────────────────────────────────────────────

/** Build a minimal base64-encoded PDF-like payload for testing. */
function fakeBase64(content = "FAKE_PDF"): string {
  return btoa(content);
}

function okPdfResult(base64: string, etag = '"123"', mime: "application/pdf" | undefined = "application/pdf"): FetchPdfResult {
  return { kind: "ok", base64, etag, mime: mime ?? "application/pdf" } as const;
}

function notModifiedResult(etag = '"123"'): FetchPdfResult {
  return { kind: "not-modified", etag };
}

/** Configure the sendMessage mock to respond with a specific result. */
function mockSendMessage(result: FetchPdfResult | Error): void {
  const send = chrome.runtime.sendMessage as ReturnType<typeof vi.fn>;
  send.mockImplementation((_msg: unknown, cb: (reply: unknown) => void) => {
    if (result instanceof Error) {
      chrome.runtime.lastError = { message: result.message };
      cb({ ok: false, error: result.message });
    } else {
      chrome.runtime.lastError = undefined;
      cb({ ok: true, data: result });
    }
  });
}

/** Spy on URL.createObjectURL / revokeObjectURL to track object URL lifecycle. */
function spyObjectUrls() {
  const created: string[] = [];
  const revoked: string[] = [];
  const origCreate = URL.createObjectURL.bind(URL);
  const origRevoke = URL.revokeObjectURL.bind(URL);
  vi.spyOn(URL, "createObjectURL").mockImplementation((obj: Blob | MediaSource) => {
    const url = origCreate(obj as Blob);
    created.push(url);
    return url;
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation((url: string) => {
    revoked.push(url);
    origRevoke(url);
  });
  return { created, revoked };
}

// ── suggestPdfFilename ─────────────────────────────────────────────────────

describe("suggestPdfFilename", () => {
  it("includes company and role when both are provided", () => {
    const name = suggestPdfFilename({
      id: "abc-123",
      company: "Acme Corp",
      role: "Senior Engineer",
    });
    expect(name).toBe("apted-acme-corp-senior-engineer.pdf");
  });

  it("works with company only", () => {
    const name = suggestPdfFilename({
      id: "abc-123",
      company: "Google",
    });
    expect(name).toBe("apted-google.pdf");
  });

  it("works with role only", () => {
    const name = suggestPdfFilename({
      id: "abc-123",
      role: "Staff SWE",
    });
    expect(name).toBe("apted-staff-swe.pdf");
  });

  it("falls back to id prefix when neither company nor role provided", () => {
    const name = suggestPdfFilename({ id: "draft-abc123xyz" });
    expect(name).toBe("apted-draft-ab.pdf");
  });

  it("slugifies special characters", () => {
    const name = suggestPdfFilename({
      id: "x",
      company: "AT&T",
      role: "C++ Developer",
    });
    expect(name).toBe("apted-at-t-c-developer.pdf");
  });

  it("truncates long segments to 40 chars each", () => {
    const long = "a".repeat(100);
    const name = suggestPdfFilename({ id: "x", company: long, role: "dev" });
    expect(name).toBe("apted-" + "a".repeat(40) + "-dev.pdf");
  });

  it("strips leading/trailing hyphens from slugified parts", () => {
    const name = suggestPdfFilename({
      id: "x",
      company: "  !!!  ",
      role: "$$$",
    });
    // slugify("  !!!  ") → "" (all chars removed)
    // slugify("$$$") → "" (all chars removed)
    // parts = ["apted"] → fallback to id prefix
    expect(name).toBe("apted-x.pdf");
  });
});

// ── getDraftPdfBlob ────────────────────────────────────────────────────────

describe("getDraftPdfBlob", () => {
  beforeEach(() => {
    clearPdfCache();
    vi.restoreAllMocks();
    chrome.runtime.lastError = undefined;
  });

  it("fetches PDF and returns a Blob with correct MIME type", async () => {
    const b64 = fakeBase64("hello world");
    mockSendMessage(okPdfResult(b64, '"abc"', "application/pdf"));

    const { blob, etag } = await getDraftPdfBlob({
      draftId: "d1",
      draftUpdatedAt: "2024-01-01T00:00:00Z",
    });

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("application/pdf");
    expect(blob.size).toBe(11); // "hello world" = 11 bytes
    expect(etag).toBe('"abc"');

    // Verify the blob content round-trips correctly.
    const text = await blob.text();
    expect(text).toBe("hello world");
  });

  it("creates an object URL for the returned blob", async () => {
    mockSendMessage(okPdfResult(fakeBase64("pdf content")));
    const { created } = spyObjectUrls();

    await getDraftPdfBlob({
      draftId: "d1",
      draftUpdatedAt: "2024-01-01T00:00:00Z",
    });

    expect(created).toHaveLength(1);
    expect(created[0]).toMatch(/^blob:/);
  });

  it("caches and reuses blob for same draft id + updatedAt", async () => {
    mockSendMessage(okPdfResult(fakeBase64("first")));

    const a = await getDraftPdfBlob({
      draftId: "d1",
      draftUpdatedAt: "t1",
    });

    // Second call with same args — should hit cache, no sendMessage call.
    const sendCallsBefore = (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mock
      .calls.length;

    const b = await getDraftPdfBlob({
      draftId: "d1",
      draftUpdatedAt: "t1",
    });

    const sendCallsAfter = (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mock
      .calls.length;

    expect(sendCallsAfter).toBe(sendCallsBefore); // no extra fetch
    expect(b.blob).toBe(a.blob); // same object
    expect(await b.blob.text()).toBe("first");
  });

  it("invalidates cache and re-fetches when updatedAt changes", async () => {
    mockSendMessage(okPdfResult(fakeBase64("old")));
    const { created, revoked } = spyObjectUrls();

    await getDraftPdfBlob({ draftId: "d1", draftUpdatedAt: "t1" });
    expect(created).toHaveLength(1);

    // Change the mock to return new content.
    mockSendMessage(okPdfResult(fakeBase64("new"), '"v2"'));

    const { blob, etag } = await getDraftPdfBlob({
      draftId: "d1",
      draftUpdatedAt: "t2",
    });

    expect(await blob.text()).toBe("new");
    expect(etag).toBe('"v2"');
    // Old object URL should have been revoked.
    expect(revoked).toHaveLength(1);
    // New object URL created.
    expect(created).toHaveLength(2);
  });

  it("invalidates cache and re-fetches when draft id changes", async () => {
    mockSendMessage(okPdfResult(fakeBase64("draft1")));
    await getDraftPdfBlob({ draftId: "d1", draftUpdatedAt: "t1" });

    mockSendMessage(okPdfResult(fakeBase64("draft2")));
    const { blob } = await getDraftPdfBlob({
      draftId: "d2",
      draftUpdatedAt: "t1",
    });

    expect(await blob.text()).toBe("draft2");
  });

  it("throws when the background returns ok:false", async () => {
    mockSendMessage(new Error("compile service unreachable"));

    await expect(
      getDraftPdfBlob({ draftId: "d1", draftUpdatedAt: "t1" }),
    ).rejects.toThrow("compile service unreachable");
  });

  it("throws when the background returns ok:false without a message", async () => {
    const send = chrome.runtime.sendMessage as ReturnType<typeof vi.fn>;
    send.mockImplementation((_msg: unknown, cb: (reply: unknown) => void) => {
      chrome.runtime.lastError = undefined;
      cb({ ok: false, error: undefined });
    });

    await expect(
      getDraftPdfBlob({ draftId: "d1", draftUpdatedAt: "t1" }),
    ).rejects.toThrow("send failed");
  });

  it("throws on 304 when no conditional header was sent (should never happen)", async () => {
    mockSendMessage(notModifiedResult());

    await expect(
      getDraftPdfBlob({ draftId: "d1", draftUpdatedAt: "t1" }),
    ).rejects.toThrow("server returned 304 with no cached body");
  });

  it("throws when chrome.runtime.lastError is set", async () => {
    const send = chrome.runtime.sendMessage as ReturnType<typeof vi.fn>;
    send.mockImplementation((_msg: unknown, cb: (reply: unknown) => void) => {
      chrome.runtime.lastError = { message: "Extension context invalidated." };
      cb(undefined);
    });

    await expect(
      getDraftPdfBlob({ draftId: "d1", draftUpdatedAt: "t1" }),
    ).rejects.toThrow("Extension context invalidated.");
  });

  it("correctly handles binary content with null bytes in base64 round-trip", async () => {
    // Simulate a small chunk of real PDF binary (including null bytes).
    const raw = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x00, 0x01, 0xff]);
    let bin = "";
    for (let i = 0; i < raw.length; i++) bin += String.fromCharCode(raw[i]!);
    const b64 = btoa(bin);

    mockSendMessage(okPdfResult(b64, '"bin"', "application/pdf"));
    const { blob } = await getDraftPdfBlob({
      draftId: "d1",
      draftUpdatedAt: "t1",
    });

    const buf = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    expect(bytes).toEqual(raw);
  });
});

// ── getDraftPdfObjectUrl ───────────────────────────────────────────────────

describe("getDraftPdfObjectUrl", () => {
  beforeEach(() => {
    clearPdfCache();
    vi.restoreAllMocks();
    chrome.runtime.lastError = undefined;
  });

  it("returns the cached object URL after fetching", async () => {
    mockSendMessage(okPdfResult(fakeBase64("hello")));
    const url = await getDraftPdfObjectUrl({
      draftId: "d1",
      draftUpdatedAt: "t1",
    });

    expect(url).toMatch(/^blob:/);

    // Second call reuses cache, returns same URL.
    const url2 = await getDraftPdfObjectUrl({
      draftId: "d1",
      draftUpdatedAt: "t1",
    });
    expect(url2).toBe(url);
  });
});

// ── fetchPdfForPreview (conditional / etag revalidation) ────────────────────

describe("fetchPdfForPreview", () => {
  beforeEach(() => {
    clearPdfCache();
    vi.restoreAllMocks();
    chrome.runtime.lastError = undefined;
  });

  it("fetches unconditionally on first call and returns changed=true", async () => {
    mockSendMessage(okPdfResult(fakeBase64("v1"), '"e1"'));
    const result = await fetchPdfForPreview({
      draftId: "d1",
      draftUpdatedAt: "t1",
    });

    expect(result.objectUrl).toMatch(/^blob:/);
    expect(result.changed).toBe(true);
  });

  it("returns cached result when same draft + updatedAt without calling sendMessage", async () => {
    const send = chrome.runtime.sendMessage as ReturnType<typeof vi.fn>;
    mockSendMessage(okPdfResult(fakeBase64("v1"), '"e1"'));

    await fetchPdfForPreview({ draftId: "d1", draftUpdatedAt: "t1" });
    const callsAfterFirst = send.mock.calls.length;

    const result = await fetchPdfForPreview({
      draftId: "d1",
      draftUpdatedAt: "t1",
    });

    expect(send.mock.calls.length).toBe(callsAfterFirst); // no extra fetch
    expect(result.changed).toBe(false);
  });

  it("sends If-None-Match when draft id is same but updatedAt advanced", async () => {
    const send = chrome.runtime.sendMessage as ReturnType<typeof vi.fn>;

    // First fetch to populate cache with etag.
    mockSendMessage(okPdfResult(fakeBase64("v1"), '"e1"'));
    await fetchPdfForPreview({ draftId: "d1", draftUpdatedAt: "t1" });
    send.mockClear();

    // Server returns 304 — bytes unchanged.
    mockSendMessage(notModifiedResult('"e1"'));
    const result = await fetchPdfForPreview({
      draftId: "d1",
      draftUpdatedAt: "t2",
    });

    // Verify If-None-Match was sent.
    expect(send).toHaveBeenCalledTimes(1);
    const msg = send.mock.calls[0]?.[0] as { ifNoneMatch?: string };
    expect(msg.ifNoneMatch).toBe('"e1"');

    expect(result.changed).toBe(false);
    expect(result.objectUrl).toMatch(/^blob:/);
  });

  it("returns changed=true and invalidates cache when server returns new bytes", async () => {
    const { created, revoked } = spyObjectUrls();

    // First fetch.
    mockSendMessage(okPdfResult(fakeBase64("v1"), '"e1"'));
    await fetchPdfForPreview({ draftId: "d1", draftUpdatedAt: "t1" });
    expect(created).toHaveLength(1);

    // Server returns new bytes for updated draft.
    mockSendMessage(okPdfResult(fakeBase64("v2"), '"e2"'));
    const result = await fetchPdfForPreview({
      draftId: "d1",
      draftUpdatedAt: "t2",
    });

    expect(result.changed).toBe(true);
    expect(revoked).toHaveLength(1); // old blob URL revoked
    expect(created).toHaveLength(2); // new blob URL created
  });

  it("invalidates cache and fetches unconditionally when draft id changes", async () => {
    const send = chrome.runtime.sendMessage as ReturnType<typeof vi.fn>;

    mockSendMessage(okPdfResult(fakeBase64("d1"), '"e1"'));
    await fetchPdfForPreview({ draftId: "d1", draftUpdatedAt: "t1" });
    send.mockClear();

    // Different draft — should NOT send If-None-Match (prev etag is for d1).
    mockSendMessage(okPdfResult(fakeBase64("d2"), '"e2"'));
    const result = await fetchPdfForPreview({
      draftId: "d2",
      draftUpdatedAt: "t1",
    });

    expect(result.changed).toBe(true);
    const msg = send.mock.calls[0]?.[0] as { ifNoneMatch?: string };
    expect(msg.ifNoneMatch).toBeUndefined(); // no conditional header for new draft
  });

  it("throws when fetch-pdf returns an error", async () => {
    mockSendMessage(okPdfResult(fakeBase64("v1")));
    await fetchPdfForPreview({ draftId: "d1", draftUpdatedAt: "t1" });

    mockSendMessage(new Error("compile service unreachable"));
    await expect(
      fetchPdfForPreview({ draftId: "d1", draftUpdatedAt: "t2" }),
    ).rejects.toThrow("compile service unreachable");
  });
});

// ── clearPdfCache ──────────────────────────────────────────────────────────

describe("clearPdfCache", () => {
  beforeEach(() => {
    clearPdfCache();
    vi.restoreAllMocks();
    chrome.runtime.lastError = undefined;
  });

  it("revokes the cached object URL and forces a re-fetch", async () => {
    const { created, revoked } = spyObjectUrls();

    mockSendMessage(okPdfResult(fakeBase64("v1")));
    await getDraftPdfBlob({ draftId: "d1", draftUpdatedAt: "t1" });
    expect(created).toHaveLength(1);
    expect(revoked).toHaveLength(0);

    clearPdfCache();
    expect(revoked).toHaveLength(1);

    // Next fetch should re-fetch, not hit cache.
    mockSendMessage(okPdfResult(fakeBase64("v2")));
    const { blob } = await getDraftPdfBlob({
      draftId: "d1",
      draftUpdatedAt: "t1",
    });
    expect(await blob.text()).toBe("v2");
  });

  it("is idempotent — calling clear multiple times is safe", () => {
    const { revoked } = spyObjectUrls();
    clearPdfCache();
    expect(revoked).toHaveLength(0); // nothing to revoke

    clearPdfCache();
    expect(revoked).toHaveLength(0); // still no-op
  });
});

// ── Drag data transfer content (MIME + filename) ───────────────────────────

describe("PDF data for drag transfer", () => {
  beforeEach(() => {
    clearPdfCache();
    vi.restoreAllMocks();
    chrome.runtime.lastError = undefined;
  });

  it("the returned blob has correct MIME type for drag DataTransfer", async () => {
    mockSendMessage(okPdfResult(fakeBase64("pdf-bytes"), '"e"', "application/pdf"));
    const { blob } = await getDraftPdfBlob({
      draftId: "d1",
      draftUpdatedAt: "t1",
    });

    // The blob's type is what goes into DataTransfer.items.add() as the MIME.
    expect(blob.type).toBe("application/pdf");
  });

  it("suggestPdfFilename returns a valid filename for File constructor", () => {
    const name = suggestPdfFilename({
      id: "draft-123",
      company: "Acme",
      role: "Engineer",
    });
    // Filename must not contain path separators or special chars that browsers reject.
    expect(name).not.toMatch(/[/\\:*?"<>|]/);
    expect(name).toMatch(/\.pdf$/);
  });
});
