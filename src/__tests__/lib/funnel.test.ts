import { describe, it, expect } from "vitest";
import { applicationsToSankey } from "@/lib/funnel";
import type { Application, Outcome } from "@/lib/applications";

function app(outcome: Outcome, opts: Partial<Application> = {}): Application {
  return {
    id: opts.id ?? "x",
    versionId: "v",
    company: "C",
    role: "R",
    jobDescription: "",
    outcome,
    interviewRound: opts.interviewRound ?? null,
    rejectedAfterRound: opts.rejectedAfterRound ?? null,
    createdAt: opts.createdAt ?? "2024-01-01T00:00:00Z",
  };
}

describe("applicationsToSankey", () => {
  it("returns zeroed flows for empty input", () => {
    const f = applicationsToSankey([]);
    expect(f.total).toBe(0);
    expect(f.screening).toBe(0);
    expect(f.totalToScreen).toBe(0);
  });

  it("offer right after screening skips technical and final", () => {
    // Two applied apps -> set one to offer with interviewRound=null (no interviews).
    const f = applicationsToSankey([
      app("offer", { interviewRound: null }), // offer skipped interviews
    ]);
    expect(f.total).toBe(1);
    expect(f.screening).toBe(1);
    expect(f.technical).toBe(0); // never reached tech
    expect(f.final).toBe(0);
    expect(f.offers).toBe(1);
    // The offer flows directly from screening to offers.
    expect(f.totalToDrafts).toBe(0);
    expect(f.screenToTech).toBe(0);
    expect(f.screenToOffers).toBe(1);
    expect(f.techToOffers).toBe(0);
    expect(f.finalToOffers).toBe(0);
  });

  it("offer after technical (no final) routes tech -> offers", () => {
    const f = applicationsToSankey([app("offer", { interviewRound: 1 })]);
    expect(f.technical).toBe(1);
    expect(f.final).toBe(0);
    expect(f.techToOffers).toBe(1);
    expect(f.screenToOffers).toBe(0);
    expect(f.finalToOffers).toBe(0);
  });

  it("offer after final routes final -> offers", () => {
    const f = applicationsToSankey([app("offer", { interviewRound: 2 })]);
    expect(f.final).toBe(1);
    expect(f.finalToOffers).toBe(1);
    expect(f.techToOffers).toBe(0);
    expect(f.screenToOffers).toBe(0);
  });

  it("rejected after screening routes screen -> rejScreen", () => {
    const f = applicationsToSankey([app("rejected", { rejectedAfterRound: 0 })]);
    expect(f.screening).toBe(1);
    expect(f.technical).toBe(0);
    expect(f.screenToRejScreen).toBe(1);
    expect(f.rejScreen).toBe(1);
    expect(f.screenToTech).toBe(0);
  });

  it("rejected after technical routes tech -> rejTech", () => {
    const f = applicationsToSankey([app("rejected", { rejectedAfterRound: 1 })]);
    expect(f.technical).toBe(1);
    expect(f.final).toBe(0);
    expect(f.techToRejTech).toBe(1);
    expect(f.rejTech).toBe(1);
  });

  it("rejected after final routes final -> rejFinal", () => {
    const f = applicationsToSankey([app("rejected", { rejectedAfterRound: 2 })]);
    expect(f.final).toBe(1);
    expect(f.finalToRejFinal).toBe(1);
    expect(f.rejFinal).toBe(1);
  });

  it("draft never reaches screening", () => {
    const f = applicationsToSankey([app("draft")]);
    expect(f.totalToDrafts).toBe(1);
    expect(f.drafts).toBe(1);
    expect(f.totalToScreen).toBe(0);
    expect(f.screening).toBe(0);
  });

  it("applied is in progress at screening -> pending node", () => {
    const f = applicationsToSankey([app("applied")]);
    expect(f.screening).toBe(1);
    expect(f.totalToScreen).toBe(1);
    // Applied routes to the pending terminal, not a rejection/offer.
    expect(f.screenToPending).toBe(1);
    expect(f.pending).toBe(1);
    expect(f.screenToGhosted + f.screenToRejScreen + f.screenToOffers + f.screenToDeclined).toBe(0);
  });

  it("interviewing round 1 is in progress at technical -> pending", () => {
    const f = applicationsToSankey([app("interviewing", { interviewRound: 1 })]);
    expect(f.technical).toBe(1);
    expect(f.techToPending).toBe(1);
    expect(f.pending).toBe(1);
    // Hasn't progressed to final yet.
    expect(f.final).toBe(0);
    expect(f.techToFinal + f.techToRejTech + f.techToOffers + f.techToDeclined).toBe(0);
  });

  it("interviewing round 2 is in progress at final -> pending", () => {
    const f = applicationsToSankey([app("interviewing", { interviewRound: 2 })]);
    expect(f.final).toBe(1);
    expect(f.finalToPending).toBe(1);
    expect(f.pending).toBe(1);
  });

  it("ghosted routes screen -> ghosted", () => {
    const f = applicationsToSankey([app("ghosted")]);
    expect(f.screenToGhosted).toBe(1);
    expect(f.ghosted).toBe(1);
    expect(f.technical).toBe(0);
  });

  it("declined after final routes final -> declined", () => {
    const f = applicationsToSankey([app("declined", { interviewRound: 2 })]);
    expect(f.final).toBe(1);
    expect(f.finalToDeclined).toBe(1);
    expect(f.declined).toBe(1);
  });

  it("aggregates multiple paths correctly", () => {
    const f = applicationsToSankey([
      app("draft"),                                                               // -> drafts
      app("offer", { interviewRound: null }),                                     // screen -> offers
      app("offer", { interviewRound: 2 }),                                        // final -> offers
      app("rejected", { rejectedAfterRound: 0 }),                                 // screen -> rej
      app("interviewing", { interviewRound: 1, id: "i1" }),                       // tech -> pending
    ]);
    expect(f.total).toBe(5);
    expect(f.drafts).toBe(1);
    expect(f.screening).toBe(4); // everyone except draft
    expect(f.technical).toBe(2);  // offer(after final) + interviewing
    expect(f.final).toBe(1);      // offer after final
    expect(f.offers).toBe(2);
    expect(f.rejScreen).toBe(1);
    expect(f.pending).toBe(1);    // the interviewing app
    expect(f.screenToOffers).toBe(1);
    expect(f.finalToOffers).toBe(1);
    expect(f.techToPending).toBe(1);
  });
});