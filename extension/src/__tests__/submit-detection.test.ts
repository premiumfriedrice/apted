import { describe, it, expect } from "vitest";
import {
  isConfirmationUrl,
  isNativeFormSubmitControl,
  isSubmitButtonLabel,
  selectApplicationJobDescription,
} from "../submit-detection";

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
