import { describe, it, expect } from "vitest";
import {
  isConfirmationUrl,
  isNativeFormSubmitControl,
  isSubmitButtonLabel,
  isFinalSubmitLabel,
  isSuccessElementVisible,
  isSubmitted,
  SuccessMonitor,
  SUBMITTED_ABSENCE_MS,
  selectApplicationJobDescription,
} from "../submit-detection";
import { ATS_REGISTRY } from "../ats-registry";

describe("isConfirmationUrl", () => {
  it("matches common confirmation page slugs", () => {
    expect(isConfirmationUrl("https://careers.acme.com/thank-you")).toBe(true);
    expect(isConfirmationUrl("https://boards.greenhouse.io/acme/confirmation")).toBe(true);
    expect(isConfirmationUrl("https://jobs.lever.co/acme/success")).toBe(true);
    expect(isConfirmationUrl("https://careers.acme.com/submitted")).toBe(true);
    expect(isConfirmationUrl("https://careers.acme.com/application-complete")).toBe(true);
  });

  it("matches case-insensitively and with separators", () => {
    expect(isConfirmationUrl("https://careers.acme.com/ThankYou")).toBe(true);
    expect(isConfirmationUrl("https://careers.acme.com/application_complete")).toBe(true);
  });

  it("does not match ordinary job posting URLs", () => {
    expect(isConfirmationUrl("https://boards.greenhouse.io/acme/jobs/12345")).toBe(false);
    expect(isConfirmationUrl("https://www.linkedin.com/jobs/view/12345/")).toBe(false);
    expect(isConfirmationUrl("https://careers.acme.com/jobs/apply")).toBe(false);
  });
});

describe("isSubmitButtonLabel", () => {
  it("matches final-step application labels", () => {
    expect(isSubmitButtonLabel("Submit Application")).toBe(true);
    expect(isSubmitButtonLabel("Submit your application")).toBe(true);
    expect(isSubmitButtonLabel("  submit application  ")).toBe(true);
    expect(isSubmitButtonLabel("Apply Now")).toBe(true);
    expect(isSubmitButtonLabel("Send Application")).toBe(true);
  });

  it("does not match generic labels that can appear before the final step", () => {
    expect(isSubmitButtonLabel("Apply")).toBe(false);
    expect(isSubmitButtonLabel("Easy Apply")).toBe(false);
    expect(isSubmitButtonLabel("Submit")).toBe(false);
    expect(isSubmitButtonLabel("Send")).toBe(false);
  });

  it("does not match confirm-style mid-funnel buttons", () => {
    expect(isSubmitButtonLabel("Confirm review")).toBe(false);
    expect(isSubmitButtonLabel("Confirm")).toBe(false);
    expect(isSubmitButtonLabel("Continue")).toBe(false);
    expect(isSubmitButtonLabel("Next")).toBe(false);
    expect(isSubmitButtonLabel("Review")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isSubmitButtonLabel("SEND APPLICATION")).toBe(true);
    expect(isSubmitButtonLabel("Submit application")).toBe(true);
  });

  it("ignores empty/whitespace labels", () => {
    expect(isSubmitButtonLabel("")).toBe(false);
    expect(isSubmitButtonLabel("   ")).toBe(false);
  });
});

describe("isNativeFormSubmitControl", () => {
  it("recognizes submit buttons inside forms", () => {
    const form = document.createElement("form");
    const button = document.createElement("button");
    button.type = "submit";
    form.append(button);

    expect(isNativeFormSubmitControl(button)).toBe(true);
  });

  it("recognizes submit inputs inside forms", () => {
    const form = document.createElement("form");
    const input = document.createElement("input");
    input.type = "submit";
    form.append(input);

    expect(isNativeFormSubmitControl(input)).toBe(true);
  });

  it("does not treat non-submit controls as native form submissions", () => {
    const form = document.createElement("form");
    const button = document.createElement("button");
    button.type = "button";
    form.append(button);

    expect(isNativeFormSubmitControl(button)).toBe(false);
  });

  it("does not classify submit-looking controls outside a form as native", () => {
    const button = document.createElement("button");
    button.type = "submit";

    expect(isNativeFormSubmitControl(button)).toBe(false);
  });
});

describe("isFinalSubmitLabel (registry-driven)", () => {
  const gh = ATS_REGISTRY.greenhouse;

  it("matches an entry submit label case-insensitively", () => {
    expect(isFinalSubmitLabel("Submit Application", gh)).toBe(true);
    expect(isFinalSubmitLabel("submit application ", gh)).toBe(true);
  });

  it("never matches an explicit continue label even on the same entry", () => {
    expect(isFinalSubmitLabel("Next", gh)).toBe(false);
    expect(isFinalSubmitLabel("Continue", gh)).toBe(false);
  });

  it("falls back to the generic heuristic when no entry matches", () => {
    expect(isFinalSubmitLabel("Apply Now", null)).toBe(true);
    expect(isFinalSubmitLabel("Apply", null)).toBe(false);
  });
});

describe("isSuccessElementVisible", () => {
  it("detects a registry success selector in the DOM", () => {
    document.body.innerHTML = `<div class="post-submission">Thanks!</div>`;
    expect(isSuccessElementVisible(document, ATS_REGISTRY.greenhouse)).toBe(true);
  });

  it("is false when no selector matches or the entry has none", () => {
    document.body.innerHTML = `<div>nothing here</div>`;
    expect(isSuccessElementVisible(document, ATS_REGISTRY.greenhouse)).toBe(false);
    expect(isSuccessElementVisible(document, ATS_REGISTRY.linkedin)).toBe(false);
    expect(isSuccessElementVisible(document, null)).toBe(false);
  });
});

describe("isSubmitted (absence-then-reappearance heuristic)", () => {
  it("counts a submit click with a visible success element", () => {
    expect(
      isSubmitted({
        successVisible: true,
        submitClicked: true,
        userInteracted: true,
        absenceBeforeReappearMs: null,
      }),
    ).toBe(true);
  });

  it("counts a reappeared success element after a long absence with interaction", () => {
    expect(
      isSubmitted({
        successVisible: true,
        submitClicked: false,
        userInteracted: true,
        absenceBeforeReappearMs: SUBMITTED_ABSENCE_MS,
      }),
    ).toBe(true);
  });

  it("rejects a success element that was absent only briefly", () => {
    expect(
      isSubmitted({
        successVisible: true,
        submitClicked: false,
        userInteracted: true,
        absenceBeforeReappearMs: 200,
      }),
    ).toBe(false);
  });

  it("rejects a passive reappearance without user interaction", () => {
    expect(
      isSubmitted({
        successVisible: true,
        submitClicked: false,
        userInteracted: false,
        absenceBeforeReappearMs: 5000,
      }),
    ).toBe(false);
  });

  it("rejects when no success element is visible", () => {
    expect(
      isSubmitted({
        successVisible: false,
        submitClicked: true,
        userInteracted: true,
        absenceBeforeReappearMs: null,
      }),
    ).toBe(false);
  });
});

describe("SuccessMonitor", () => {
  const mk = (html: string) => {
    document.body.innerHTML = html;
    return document;
  };

  it("measures the absence duration before a reappearance", () => {
    let t = 0;
    const mon = new SuccessMonitor({
      selectors: () => [".confirmation"],
      clock: () => t,
    });
    const doc = mk(`<div class="confirmation">applied</div>`);
    expect(mon.tick(doc)).toBe(true); // present initially
    expect(mon.absenceMs).toBeNull();

    doc.body.innerHTML = ""; // disappears
    expect(mon.tick(doc)).toBe(false);
    t += 2000; // absent for 2 s
    expect(mon.tick(doc)).toBe(false);

    doc.body.innerHTML = `<div class="confirmation">done</div>`; // reappears
    expect(mon.tick(doc)).toBe(true);
    expect(mon.absenceMs).toBe(2000);
  });

  it("stays null when the element was never visible or never went away", () => {
    let t = 0;
    const mon = new SuccessMonitor({ selectors: () => [".x"], clock: () => t });
    expect(mon.tick(mk("<div>nothing</div>"))).toBe(false);
    expect(mon.absenceMs).toBeNull();

    const mon2 = new SuccessMonitor({ selectors: () => [".x"], clock: () => t });
    const doc = mk(`<div class="x">always here</div>`);
    mon2.tick(doc);
    t += 5000;
    mon2.tick(doc);
    expect(mon2.absenceMs).toBeNull();
  });
});

describe("selectApplicationJobDescription", () => {
  it("uses the current page JD instead of the draft's original JD", () => {
    expect(selectApplicationJobDescription("Roblox JD", "Ditto JD")).toBe("Roblox JD");
  });

  it("falls back to the draft JD when the current page JD is empty", () => {
    expect(selectApplicationJobDescription("", "Ditto JD")).toBe("Ditto JD");
  });

  it("returns an empty string when neither JD is available", () => {
    expect(selectApplicationJobDescription("", "")).toBe("");
  });
});
