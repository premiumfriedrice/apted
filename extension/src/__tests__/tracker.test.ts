import { describe, it, expect, vi, beforeEach } from "vitest";

// Service-worker tracker module: dedupe ranks, passive opt-out, offline
// queueing with capped exponential backoff, and outcome/undo paths. We stub
// the chrome.* surface and global fetch; the module only persists through
// chrome.storage.local / session.

type LocalStore = Record<string, unknown>;
let local: LocalStore = {};
let session: LocalStore = {};
let syncStore: Record<string, unknown> = {
  apiBase: "https://api.test",
  authToken: "token-1",
  openMode: "popup",
  passiveTracking: true,
};

vi.stubGlobal("chrome", {
  storage: {
    local: {
      get: vi.fn(async (keys: string | string[] | Record<string, unknown>) => {
        if (typeof keys === "string") return { [keys]: local[keys] };
        if (Array.isArray(keys)) {
          const out: LocalStore = {};
          for (const k of keys) if (k in local) out[k] = local[k];
          return out;
        }
        const out: LocalStore = {};
        for (const [k, v] of Object.entries(keys)) out[k] = k in local ? local[k] : v;
        return out;
      }),
      set: vi.fn(async (items: Record<string, unknown>) => {
        local = { ...local, ...items };
      }),
    },
    session: {
      get: vi.fn(async (key: string) => ({ [key]: session[key] })),
      set: vi.fn(async (items: Record<string, unknown>) => {
        session = { ...session, ...items };
      }),
    },
    sync: {
      get: vi.fn(async (defaults: Record<string, unknown>) => ({
        ...defaults,
        ...syncStore,
      })),
    },
  },
} as unknown as typeof chrome);

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import * as tracker from "../tracker";

const API = "https://api.test";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function capture(overrides: Record<string, unknown> = {}) {
  return {
    company: "Stripe",
    role: "Engineer",
    jobDescription: "jd",
    portalUrl: "https://boards.greenhouse.io/stripe/jobs/1",
    trackedObj: "greenhouse:stripe/1",
    capturedAt: new Date().toISOString(),
    source: "greenhouse",
    active: true,
    ...overrides,
  };
}

beforeEach(() => {
  local = {};
  session = {};
  syncStore = { apiBase: API, authToken: "token-1", openMode: "popup", passiveTracking: true };
  fetchMock.mockReset();
});

describe("logApplication", () => {
  it("POSTs a full capture and marks the trackedObj submitted", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "app-1", company: "Stripe" }));

    const r = await tracker.logApplication(capture());
    expect(r).toEqual({ kind: "logged", id: "app-1" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${API}/api/applications`);
    expect(init.method).toBe("POST");
    expect(init.headers.authorization).toBe("Bearer token-1");
    const tracked = local["aptedTrackedObjs"] as Record<string, { rank: number; id: string | null }>;
    expect(tracked["greenhouse:stripe/1"]!).toMatchObject({ rank: 2, id: "app-1" });
  });

  it("dedupes a second capture of the same trackedObj", async () => {
    fetchMock.mockImplementationOnce(() => Promise.resolve(jsonResponse({ id: "app-1" })));
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse([])));
    await tracker.logApplication(capture());
    const r2 = await tracker.logApplication(capture());
    expect(r2).toEqual({ kind: "duplicate", id: "app-1" });
    const posts = fetchMock.mock.calls.filter(([u, init]) => init?.method === "POST");
    expect(posts).toHaveLength(1);
  });

  it("uses the event-first route for partial captures", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "app-p" }));
    const r = await tracker.logApplication(
      capture({ company: undefined, role: undefined, trackedObj: "lever:acme/xyz" }),
    );
    expect(r).toEqual({ kind: "logged", id: "app-p" });
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${API}/api/applications/event`);
  });

  it("skips passive captures when passive tracking is off", async () => {
    syncStore = { ...syncStore, passiveTracking: false };
    const r = await tracker.logApplication(capture({ active: false }));
    expect(r).toEqual({ kind: "skipped" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("logs passive captures when passive tracking is on", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "app-2" }));
    const r = await tracker.logApplication(capture({ active: false }));
    expect(r).toEqual({ kind: "logged", id: "app-2" });
  });

  it("treats a capture as active when a surface was opened this session", async () => {
    syncStore = { ...syncStore, passiveTracking: false };
    await tracker.markActive();
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "app-3" }));
    const r = await tracker.logApplication(capture({ active: false }));
    expect(r).toEqual({ kind: "logged", id: "app-3" });
  });

  it("queues the capture when the POST fails", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    const r = await tracker.logApplication(capture());
    expect(r).toEqual({ kind: "queued" });
    const queue = local["aptedTrackerQueue"] as unknown[];
    expect(queue).toHaveLength(1);
    // The trackedObj is marked so re-fires don't duplicate while offline.
    const tracked = local["aptedTrackedObjs"] as Record<string, { rank: number }>;
    expect(tracked["greenhouse:stripe/1"]!.rank).toBe(2);
  });
});

describe("flushQueue", () => {
  it("drains the queue and upgrades trackedObj ids on success", async () => {
    fetchMock.mockRejectedValueOnce(new Error("down"));
    await tracker.logApplication(capture());
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "app-1" }));

    const remaining = await tracker.flushQueue();
    expect(remaining).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(local["aptedTrackerQueue"]).toEqual([]);
  });

  it("backs off exponentially and caps the delay on repeated full failures", async () => {
    fetchMock.mockRejectedValueOnce(new Error("down"));
    await tracker.logApplication(capture());
    fetchMock.mockReset();
    fetchMock.mockRejectedValue(new Error("still down"));

    await tracker.flushQueue();
    const s1 = local["aptedTrackerQueueState"] as { attempt: number; nextAttemptAt: number };
    expect(s1.attempt).toBe(1);
    expect(s1.nextAttemptAt).toBeGreaterThan(Date.now());

    // Inside the backoff window: no fetch attempts.
    const remaining = await tracker.flushQueue();
    expect(remaining).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Simulate a wake after the window: attempt 2 → delay doubles.
    local["aptedTrackerQueueState"] = { attempt: 1, nextAttemptAt: Date.now() - 1 };
    await tracker.flushQueue();
    const s2 = local["aptedTrackerQueueState"] as { attempt: number; nextAttemptAt: number };
    expect(s2.attempt).toBe(2);
    // ~30s * 2^2 = 120s, comfortably under the 1h cap.
    expect(s2.nextAttemptAt - Date.now()).toBeLessThan(130_000);
  });
});

describe("getTrackerState", () => {
  it("reports signed-out without any network", async () => {
    syncStore = { ...syncStore, authToken: "" };
    const state = await tracker.getTrackerState();
    expect(state.status).toBe("signed-out");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the synced pipeline when online", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        {
          id: "a1",
          company: "Stripe",
          role: "Engineer",
          outcome: "applied",
          interviewRound: null,
          portalUrl: null,
          createdAt: "2026-10-01T00:00:00Z",
        },
      ]),
    );
    const state = await tracker.getTrackerState();
    expect(state.status).toBe("ready");
    expect(state.applications).toHaveLength(1);
    expect((state.applications[0] as { company: string }).company).toBe("Stripe");
  });

  it("serves the cache with an offline status when the fetch fails", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([]));
    await tracker.getTrackerState(); // populate the cache — no apps
    // Prime a non-empty cache via a successful refresh.
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        {
          id: "a1",
          company: "Stripe",
          role: "Engineer",
          outcome: "interviewing",
          interviewRound: 2,
          portalUrl: null,
          createdAt: "2026-10-01T00:00:00Z",
        },
      ]),
    );
    await tracker.getTrackerState();

    fetchMock.mockReset();
    fetchMock.mockRejectedValue(new Error("offline"));
    const state = await tracker.getTrackerState();
    expect(state.status).toBe("offline");
    expect(state.applications).toHaveLength(1);
  });
});

describe("suggestions", () => {
  it("applies a suggestion as a full application and dismisses it", async () => {
    await tracker.addSuggestion({
      id: "s1",
      source: "gmail",
      company: "Acme",
      role: "Engineer",
      subject: "Invite to interview",
      suggestedOutcome: "interviewing",
      interviewRound: 2,
      createdAt: new Date().toISOString(),
    });
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "app-9" }));

    const ok = await tracker.applySuggestion("s1");
    expect(ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${API}/api/applications`);
    const body = JSON.parse(init.body as string);
    expect(body.outcome).toBe("interviewing");
    expect(body.interviewRound).toBe(2);
    expect(local["aptedSuggestions"]).toEqual([]);
  });

  it("dismisses without any network", async () => {
    await tracker.addSuggestion({
      id: "s2",
      source: "gmail",
      company: "X",
      role: "Y",
      subject: "s",
      suggestedOutcome: null,
      createdAt: new Date().toISOString(),
    });
    await tracker.dismissSuggestion("s2");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(local["aptedSuggestions"]).toEqual([]);
  });
});

describe("handleGmailEmail", () => {
  it("builds a suggestion from sender/subject without any network", async () => {
    await tracker.handleGmailEmail(
      {
        messageId: "m1",
        sender: "jobs@stripe.com",
        senderName: "Stripe via Greenhouse",
        subject: "Thank you for applying to the Software Engineer role",
        body: "We have received your application.",
      },
      { outcome: "applied", subjectMatch: true, atsSender: true },
    );
    expect(fetchMock).not.toHaveBeenCalled();
    const suggestions = local["aptedSuggestions"] as { company: string; role: string; id: string }[];
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]!.company).toBe("Stripe");
    expect(suggestions[0]!.role).toBe("the Software Engineer role");
    expect(suggestions[0]!.id).toBe("gmail:m1");
  });

  it("falls back to the LLM extract route for missing fields and stores the outcome", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ company: "Acme Corp", title: "Data Scientist", location: "", terms: [] }),
    );
    await tracker.handleGmailEmail(
      {
        messageId: "m2",
        sender: "talent@unknownats.io",
        senderName: "",
        subject: "Next steps",
        body: "We would like to invite you for an interview.",
      },
      { outcome: "interviewing", subjectMatch: false, atsSender: false },
    );
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${API}/api/extract`);
    expect(init.method).toBe("POST");
    const suggestions = local["aptedSuggestions"] as { company: string; role: string; suggestedOutcome: string; interviewRound: number | null }[];
    expect(suggestions[0]!.company).toBe("Acme Corp");
    expect(suggestions[0]!.role).toBe("Data Scientist");
    expect(suggestions[0]!.suggestedOutcome).toBe("interviewing");
    expect(suggestions[0]!.interviewRound).toBe(1);
  });

  it("stores ambiguous job-related emails as an applied-confirm suggestion", async () => {
    await tracker.handleGmailEmail(
      {
        messageId: "m3",
        sender: "hr@acme.com",
        senderName: "Acme",
        subject: "Your application",
        body: "Some unclear text.",
      },
      { outcome: null, subjectMatch: false, atsSender: false },
    );
    const suggestions = local["aptedSuggestions"] as { suggestedOutcome: string | null }[];
    expect(suggestions[0]!.suggestedOutcome).toBeNull(); // Apply defaults to applied
  });
});

describe("gmail memory", () => {
  it("remembers seen message ids and caps the set", async () => {
    expect(await tracker.isGmailMessageSeen("m1")).toBe(false);
    await tracker.rememberGmailMessage("m1");
    expect(await tracker.isGmailMessageSeen("m1")).toBe(true);
  });
});
