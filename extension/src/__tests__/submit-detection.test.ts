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

  it("does not match bare apply labels to avoid false positives", () => {
    expect(isSubmitButtonLabel("Easy Apply")).toBe(false);
    expect(isSubmitButtonLabel("Apply Now")).toBe(false);
    expect(isSubmitButtonLabel("Apply")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isSubmitButtonLabel("SUBMIT")).toBe(true);
    expect(isSubmitButtonLabel("Submit application")).toBe(true);
  });
});