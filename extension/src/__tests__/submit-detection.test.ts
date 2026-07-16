import { describe, it, expect } from "vitest";
import { isConfirmationUrl, isSubmitButtonLabel } from "../submit-detection";

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
  it("matches labels containing submit", () => {
    expect(isSubmitButtonLabel("Submit Application")).toBe(true);
    expect(isSubmitButtonLabel("Submit")).toBe(true);
    expect(isSubmitButtonLabel("  submit application  ")).toBe(true);
  });

  it("matches bare apply/apply now (Easy Apply tradeoff accepted)", () => {
    expect(isSubmitButtonLabel("Apply")).toBe(true);
    expect(isSubmitButtonLabel("Apply Now")).toBe(true);
    expect(isSubmitButtonLabel("Easy Apply")).toBe(true);
  });

  it("matches send-application labels", () => {
    expect(isSubmitButtonLabel("Send Application")).toBe(true);
    expect(isSubmitButtonLabel("Send application")).toBe(true);
    expect(isSubmitButtonLabel("Send")).toBe(true);
  });

  it("does not match confirm-style mid-funnel buttons", () => {
    expect(isSubmitButtonLabel("Confirm review")).toBe(false);
    expect(isSubmitButtonLabel("Confirm")).toBe(false);
    expect(isSubmitButtonLabel("Continue")).toBe(false);
    expect(isSubmitButtonLabel("Next")).toBe(false);
    expect(isSubmitButtonLabel("Review")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isSubmitButtonLabel("SUBMIT")).toBe(true);
    expect(isSubmitButtonLabel("Apply")).toBe(true);
    expect(isSubmitButtonLabel("SEND APPLICATION")).toBe(true);
    expect(isSubmitButtonLabel("Submit application")).toBe(true);
  });

  it("ignores empty/whitespace labels", () => {
    expect(isSubmitButtonLabel("")).toBe(false);
    expect(isSubmitButtonLabel("   ")).toBe(false);
  });
});