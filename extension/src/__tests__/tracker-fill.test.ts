// Fill-phase (draft) + submit (applied) capture flow in tracker.logApplication:
// draft on first fill → duplicate on re-fill → upgrade PATCH on submit →
// duplicate on re-submit.
import { describe, it, expect, vi, beforeEach } from "vitest";

const { storageLocal, storageSync, storageSession, fetchMock } = vi.hoisted(() => ({
  storageLocal: {
    store: new Map<string, unknown>(),
    get: vi.fn(async (keys: string | string[]) => {
      const out: Record<string, unknown> = {};
      for (const k of Array.isArray(keys) ? keys : [keys]) {
        if (storageLocal.store.has(k)) out[k] = storageLocal.store.get(k);
      }
      return out;
    }),
    set: vi.fn(async (o: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(o)) storageLocal.store.set(k, v);
    }),
    remove: vi.fn(async (keys: string[]) => {
      for (const k of keys) storageLocal.store.delete(k);
    }),
  },
  storageSync: {
    get: vi.fn(async (defaults: Record<string, unknown>) => ({ ...defaults })),
    set: vi.fn(async () => {}),
  },
  storageSession: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) },
  fetchMock: vi.fn(),
}));

vi.stubGlobal("chrome", {
  storage: { local: storageLocal, sync: storageSync, session: storageSession },
});

vi.stubGlobal("fetch", fetchMock);

import { logApplication } from "../tracker";
import type { Capture } from "../messages";

const TRACKED_OBJ = "greenhouse:acme/42";

function apiOk(body: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
    headers: new Map(),
  } as unknown as Response);
}

function fillCapture(): Capture {
  return {
    company: "Acme",
    role: "Engineer",
    jobDescription: "",
    portalUrl: "https://job-boards.greenhouse.io/acme/42",
    trackedObj: TRACKED_OBJ,
    capturedAt: new Date().toISOString(),
    source: "greenhouse",
    active: true,
    inProgress: true,
  };
}

function submitCapture(): Capture {
  return { ...fillCapture(), inProgress: undefined };
}

beforeEach(() => {
  vi.clearAllMocks();
  storageLocal.store.clear();
});

describe("logApplication fill/submit flow", () => {
  it("logs a draft on the first fill-phase capture", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      expect(url).toContain("/api/applications");
      expect(JSON.parse(String(init?.body)).outcome).toBe("draft");
      return apiOk({ id: "app1" });
    });

    const r = await logApplication(fillCapture());
    expect(r).toEqual({ kind: "logged", id: "app1" });
  });

  it("dedupes a second fill-phase capture for the same job", async () => {
    fetchMock.mockImplementation(() => apiOk({ id: "app1" }));
    await logApplication(fillCapture());

    const r = await logApplication(fillCapture());
    expect(r).toEqual({ kind: "duplicate", id: "app1" });
    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(posts).toHaveLength(1); // no second application POST (extra calls are cache GETs)
  });

  it("upgrades the draft to applied on the submit capture (PATCH, no new row)", async () => {
    fetchMock.mockImplementation(() => apiOk({ id: "app1" }));
    await logApplication(fillCapture());

    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      expect(url).toContain("/api/applications/app1");
      expect(init?.method).toBe("PATCH");
      expect(JSON.parse(String(init?.body)).outcome).toBe("applied");
      return apiOk({ id: "app1" });
    });
    const r = await logApplication(submitCapture());
    expect(r).toEqual({ kind: "logged", id: "app1" });
  });

  it("treats a re-submit as a duplicate", async () => {
    fetchMock.mockImplementation(() => apiOk({ id: "app1" }));
    await logApplication(fillCapture());
    await logApplication(submitCapture());

    const r = await logApplication(submitCapture());
    expect(r).toEqual({ kind: "duplicate", id: "app1" });
  });

  it("skips a fill-phase capture with no company", async () => {
    const r = await logApplication({ ...fillCapture(), company: undefined, trackedObj: null });
    expect(r).toEqual({ kind: "skipped" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
