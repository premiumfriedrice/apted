import { describe, it, expect } from "vitest";
import {
  ATS_SENDER_DOMAINS,
  classifyEmail,
  emailMessageId,
  isJobRelatedSubject,
} from "../gmail";

const sender = "notifications@greenhouse.io";

describe("classifyEmail", () => {
  it("maps 'thank you for applying' to applied", () => {
    const c = classifyEmail(sender, "Thank you for applying", "We have received your application.");
    expect(c.outcome).toBe("applied");
    expect(c.atsSender).toBe(true);
  });

  it("maps rejection language to rejected", () => {
    const c = classifyEmail(
      "careers@acme.com",
      "Your application to Acme",
      "We regret to inform you that we are moving forward with other candidates.",
    );
    expect(c.outcome).toBe("rejected");
    expect(c.atsSender).toBe(false);
  });

  it("maps interview invitations to interviewing", () => {
    const c = classifyEmail(
      "recruiting@acme.com",
      "Next steps",
      "We would like to invite you for an interview with the team.",
    );
    expect(c.outcome).toBe("interviewing");
  });

  it("maps offer language to offer", () => {
    const c = classifyEmail(
      "hr@acme.com",
      "Congratulations!",
      "We are pleased to offer you the Software Engineer position.",
    );
    expect(c.outcome).toBe("offer");
  });

  it("is ambiguous when multiple outcomes match", () => {
    const c = classifyEmail(
      sender,
      "Update",
      "Thank you for applying. We regret to inform you we're moving forward with other candidates.",
    );
    expect(c.outcome).toBeNull();
  });

  it("is ambiguous when nothing matches", () => {
    const c = classifyEmail("friend@example.com", "Lunch?", "See you at noon.");
    expect(c.outcome).toBeNull();
    expect(c.atsSender).toBe(false);
  });

  it("recognizes known ATS sender domains", () => {
    for (const d of ["ashbyhq.com", "greenhouse.io", "lever.co", "myworkdayjobs.com", "linkedin.com"]) {
      expect(ATS_SENDER_DOMAINS.has(d)).toBe(true);
    }
  });
});

describe("isJobRelatedSubject", () => {
  it("accepts job-ish subjects", () => {
    expect(isJobRelatedSubject("Your application to Stripe")).toBe(true);
    expect(isJobRelatedSubject("Interview scheduling")).toBe(true);
    expect(isJobRelatedSubject("Offer from Acme")).toBe(true);
  });

  it("rejects non-job subjects", () => {
    expect(isJobRelatedSubject("Lunch tomorrow?")).toBe(false);
    expect(isJobRelatedSubject("Your order has shipped")).toBe(false);
  });
});

describe("emailMessageId", () => {
  it("is stable for identical content and differs across emails", () => {
    const a = emailMessageId(sender, "Subject", "Body one");
    expect(emailMessageId(sender, "Subject", "Body one")).toBe(a);
    expect(emailMessageId(sender, "Subject", "Body two")).not.toBe(a);
    expect(emailMessageId("other@x.com", "Subject", "Body one")).not.toBe(a);
  });

  it("normalizes whitespace and case", () => {
    expect(emailMessageId(sender, "  subject ", "body")).toBe(
      emailMessageId(sender, "SUBJECT", " body "),
    );
  });
});
