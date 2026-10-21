import { describe, it, expect, vi } from "vitest";
import {
  renderPipeline,
  groupApplications,
  relativeDate,
  type PipelineActions,
  type PipelineApplication,
  type PipelineState,
} from "../pipeline";

function mkApp(partial: Partial<PipelineApplication> & Pick<PipelineApplication, "id" | "company" | "role">): PipelineApplication {
  return {
    outcome: "applied",
    interviewRound: null,
    portalUrl: null,
    createdAt: new Date("2026-10-01T00:00:00Z").toISOString(),
    ...partial,
  };
}

const actions: PipelineActions = {
  onConnect: vi.fn(),
  onRetry: vi.fn(),
  onOutcomeChange: vi.fn().mockResolvedValue(true),
  onApplySuggestion: vi.fn().mockResolvedValue(true),
  onDismissSuggestion: vi.fn().mockResolvedValue(undefined),
};

const ready: PipelineState = {
  status: "ready",
  applications: [],
  suggestions: [],
  queued: 0,
  updatedAt: new Date().toISOString(),
};

function mount(state: PipelineState): HTMLElement {
  const el = document.createElement("div");
  document.body.append(el);
  renderPipeline(el, state, actions);
  return el;
}

describe("relativeDate", () => {
  it("formats recent timestamps", () => {
    const now = Date.parse("2026-10-21T12:00:00Z");
    expect(relativeDate(new Date(now - 30_000).toISOString(), now)).toBe("just now");
    expect(relativeDate(new Date(now - 5 * 60_000).toISOString(), now)).toBe("5m ago");
    expect(relativeDate(new Date(now - 3 * 3600_000).toISOString(), now)).toBe("3h ago");
    expect(relativeDate(new Date(now - 2 * 86400_000).toISOString(), now)).toBe("2d ago");
    expect(relativeDate("not-a-date", now)).toBe("");
  });
});

describe("groupApplications", () => {
  it("groups by open stages, collapses closed outcomes, newest first", () => {
    const apps = [
      mkApp({ id: "1", company: "A", role: "R1", outcome: "applied", createdAt: "2026-10-03T00:00:00Z" }),
      mkApp({ id: "2", company: "B", role: "R2", outcome: "interviewing", interviewRound: 2 }),
      mkApp({ id: "3", company: "C", role: "R3", outcome: "rejected" }),
      mkApp({ id: "4", company: "D", role: "R4", outcome: "ghosted" }),
      mkApp({ id: "5", company: "E", role: "R5", outcome: "offer" }),
      mkApp({ id: "6", company: "F", role: "R6", outcome: "applied", createdAt: "2026-10-05T00:00:00Z" }),
    ];
    const groups = groupApplications(apps);
    expect(groups.map((g) => g.key)).toEqual([
      "applied",
      "interviewing",
      "offer",
      "closed",
    ]);
    const applied = groups[0];
    expect(applied?.apps.map((a) => a.id)).toEqual(["6", "1"]); // newest first
    const closed = groups.find((g) => g.key === "closed");
    expect(closed?.apps.map((a) => a.id)).toEqual(["3", "4"]);
    expect(closed?.collapsible).toBe(true);
  });

  it("only shows a drafts group when drafts exist", () => {
    expect(groupApplications([]).map((g) => g.key)).toEqual(["applied", "interviewing", "offer", "closed"]);
    const withDraft = groupApplications([mkApp({ id: "d", company: "X", role: "Y", outcome: "draft" })]);
    expect(withDraft.map((g) => g.key)).toContain("drafts");
  });
});

describe("renderPipeline", () => {
  it("renders the connect CTA when signed out", () => {
    const el = mount({ ...ready, status: "signed-out" });
    expect(el.querySelector(".apted-pl-connect")).toBeTruthy();
    el.querySelector<HTMLButtonElement>(".apted-pl-connect .apted-pl-btn--primary")?.click();
    expect(actions.onConnect).toHaveBeenCalled();
    // Teaser card is present on every surface.
    expect(el.querySelector(".apted-pl-teaser")?.textContent).toContain("coming soon");
    el.remove();
  });

  it("renders the offline banner with queued count and retry", () => {
    const el = mount({ ...ready, status: "offline", queued: 3 });
    expect(el.querySelector(".apted-pl-banner")?.textContent).toContain("Offline");
    expect(el.querySelector(".apted-pl-queued")?.textContent).toContain("3");
    el.querySelector<HTMLButtonElement>(".apted-pl-banner .apted-pl-btn")?.click();
    expect(actions.onRetry).toHaveBeenCalled();
    el.remove();
  });

  it("renders application cards with round badges, portal links and outcome menus", () => {
    const el = mount({
      ...ready,
      applications: [
        mkApp({
          id: "a1",
          company: "Stripe",
          role: "Engineer",
          outcome: "interviewing",
          interviewRound: 2,
          portalUrl: "https://boards.greenhouse.io/stripe/jobs/1",
        }),
      ],
    });
    expect(el.querySelector(".apted-pl-app-title")?.textContent).toBe("Stripe · Engineer");
    expect(el.querySelector(".apted-pl-round")?.textContent).toBe("R2");
    expect(el.querySelector<HTMLAnchorElement>(".apted-pl-portal")?.href).toContain("greenhouse");
    const select = el.querySelector<HTMLSelectElement>(".apted-pl-select");
    expect(select?.value).toBe("interviewing");
    el.remove();
  });

  it("collapses the closed group by default", () => {
    const el = mount({
      ...ready,
      applications: [mkApp({ id: "c1", company: "X", role: "Y", outcome: "rejected" })],
    });
    const groups = el.querySelectorAll(".apted-pl-group");
    const closed = groups[groups.length - 1]!;
    const closedList = closed.querySelector(".apted-pl-list") as HTMLElement;
    expect(closed.querySelector("h3")?.textContent).toBe("Closed");
    expect(closedList.hidden).toBe(true);
    el.remove();
  });

  it("pins suggestion cards above the board with apply/dismiss", () => {
    const el = mount({
      ...ready,
      suggestions: [
        {
          id: "s1",
          source: "gmail",
          company: "Acme",
          role: "Engineer",
          subject: "Thank you for applying",
          suggestedOutcome: "applied",
          createdAt: new Date().toISOString(),
        },
      ],
    });
    const first = el.querySelector(".apted-pl > .apted-pl-suggestion");
    expect(first).toBeTruthy();
    expect(first?.querySelector(".apted-pl-suggestion-title")?.textContent).toBe("Acme · Engineer");
    first?.querySelector<HTMLButtonElement>(".apted-pl-btn--primary")?.click();
    expect(actions.onApplySuggestion).toHaveBeenCalled();
    el.remove();
  });

  it("shows an onboarding hint when empty", () => {
    const el = mount(ready);
    expect(el.querySelector(".apted-pl-empty")?.textContent).toContain("No applications yet");
    el.remove();
  });

  it("rolls the outcome select back when the optimistic update fails", async () => {
    const fail: PipelineActions = { ...actions, onOutcomeChange: vi.fn().mockResolvedValue(false) };
    const app = mkApp({ id: "a2", company: "A", role: "B", outcome: "applied" });
    const el = document.createElement("div");
    document.body.append(el);
    renderPipeline(el, { ...ready, applications: [app] }, fail);
    const select = el.querySelector<HTMLSelectElement>(".apted-pl-select")!;
    expect(select.value).toBe("applied");
    select.value = "offer";
    select.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(select.disabled).toBe(false));
    expect(select.value).toBe("applied"); // rolled back
    el.remove();
  });
});
