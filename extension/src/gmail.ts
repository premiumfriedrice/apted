// Gmail monitor — content script on https://mail.google.com/* (PRE-88).
//
// Watches the reading pane; when an email opens, extracts sender, subject,
// and (truncated) body, classifies it locally, and reports it to the service
// worker. All network stays in the SW: ambiguous emails are sent to the
// user's own apted account via /api/extract (LLM) for company/role.
//
// Privacy: only job-related emails produce suggestion cards; per-message-id
// memory prevents repeat prompts. No silent mutation in v1 — every outcome
// suggestion is a one-tap Apply/Dismiss card in the pipeline.

import type { Msg, Reply } from "./messages";

// ── Local classification (pure, unit-tested) ────────────────────────────────

export type EmailOutcome = "applied" | "rejected" | "interviewing" | "offer" | null;

export type EmailClassification = {
  /** Mapped outcome, or null when ambiguous. */
  outcome: Exclude<EmailOutcome, null> | null;
  /** Whether the outcome regex matched in the subject (vs body only). */
  subjectMatch: boolean;
  /** Whether the sender is a known ATS domain. */
  atsSender: boolean;
};

export const ATS_SENDER_DOMAINS = new Set([
  "ashbyhq.com",
  "greenhouse.io",
  "lever.co",
  "myworkdayjobs.com",
  "linkedin.com",
  "smartrecruiters.com",
  "workable.com",
  "icims.com",
  "taleo.net",
  "successfactors.com",
  "bamboohr.com",
  "rippling-ats.com",
]);

const OUTCOME_PATTERNS: { outcome: Exclude<EmailOutcome, null>; res: RegExp[] }[] = [
  {
    outcome: "rejected",
    res: [
      /regret to inform/i,
      /moving forward with (other|different|another) candidate/i,
      /not moving forward/i,
      /decided not to (proceed|move forward)/i,
      /position has been filled/i,
      /unfortunately,? (we|your application)/i,
      /after careful (consideration|review).{0,80}(other candidates|not able)/i,
      /pursuing (other|different) candidates/i,
    ],
  },
  {
    outcome: "interviewing",
    res: [
      /invite(s|d)? you (for|to) (an? )?interview/i,
      /interview (invitation|invite)/i,
      /schedule (a|an|your) (call|interview|phone screen|chat)/i,
      /phone screen/i,
      /(first|second|third|final|technical|onsite) round/i,
      /would like to (speak|chat|talk|interview)/i,
      /next steps? in (the|your) (hiring|application|interview) process/i,
    ],
  },
  {
    outcome: "offer",
    res: [
      /(pleased|delighted|happy|excited) to (extend|make|offer)/i,
      /(extend|make) you an? offer/i,
      /offer (of|for) (employment|the position)/i,
      /congratulations.{0,80}offer/i,
      /job offer/i,
    ],
  },
  {
    outcome: "applied",
    res: [
      /thank(s| you) for (your )?(applying|application)/i,
      /we (have )?received your application/i,
      /your application (has been|was) (received|submitted|received successfully)/i,
      /application (received|confirmed)/i,
      /confirm(ation|ed) (of )?(receipt|your application)/i,
    ],
  },
];

function senderDomain(sender: string): string {
  const m = sender.match(/@([\w.-]+)/);
  return (m?.[1] ?? "").toLowerCase();
}

/**
 * Two-layer local classification. A single matching outcome maps directly;
 * multiple (or zero) matching outcomes are ambiguous — the caller decides
 * whether the email is job-related enough for the server fallback.
 */
export function classifyEmail(sender: string, subject: string, body: string): EmailClassification {
  const atsSender = ATS_SENDER_DOMAINS.has(senderDomain(sender));
  const text = `${subject}\n${body}`;
  const hits = new Map<Exclude<EmailOutcome, null>, boolean>();
  let subjectMatch = false;
  for (const { outcome, res } of OUTCOME_PATTERNS) {
    for (const re of res) {
      if (re.test(text)) {
        hits.set(outcome, true);
        if (re.test(subject)) subjectMatch = true;
        break;
      }
    }
  }
  if (hits.size === 1) {
    return { outcome: hits.keys().next().value ?? null, subjectMatch, atsSender };
  }
  return { outcome: null, subjectMatch: false, atsSender };
}

/**
 * Whether an ambiguous email looks job-related enough to bother the server
 * fallback (subject keywords). Non-job emails are ignored entirely.
 */
export function isJobRelatedSubject(subject: string): boolean {
  return /(application|interview|position|role|opportunity|offer|hiring|candidate)/i.test(subject);
}

/** Stable per-message id: sender + subject + first 200 body chars. */
export function emailMessageId(sender: string, subject: string, body: string): string {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const raw = `${norm(sender)}|${norm(subject)}|${norm(body).slice(0, 200)}`;
  // FNV-1a 32-bit — short, stable, no dependencies.
  let hash = 0x811c9dc5;
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `gm${hash.toString(16)}`;
}

// ── Content script ──────────────────────────────────────────────────────────

function send<T>(msg: Msg): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (reply: Reply<T> | undefined) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (reply && reply.ok) {
        resolve(reply.data);
      } else {
        reject(new Error(reply && !reply.ok ? reply.error : "no reply from background"));
      }
    });
  });
}

const BODY_MAX = 2000;

function extractOpenEmail(): { sender: string; senderName: string; subject: string; body: string } | null {
  const main = document.querySelector("div[role='main']");
  if (!main) return null;

  // Sender: Gmail renders the From header as a span with an email attribute.
  let sender = "";
  let senderName = "";
  for (const el of Array.from(main.querySelectorAll("span[email]"))) {
    const email = el.getAttribute("email") ?? "";
    if (email && !/noreply@(google|mailer|notifications)\.gmail/i.test(email)) {
      sender = email;
      senderName = (el.getAttribute("name") ?? el.textContent ?? "").trim();
      break;
    }
  }

  // Subject: the reading pane's h2 (subject lines are h2 in Gmail).
  const subject =
    (main.querySelector("h2[data-legacy-id]")?.textContent ??
      main.querySelector("h2")?.textContent ??
      "").replace(/\s+/g, " ").trim();

  if (!sender && !subject) return null;

  const body = (main as HTMLElement).innerText.slice(0, BODY_MAX);
  return { sender, senderName, subject, body };
}

function processEmail(email: { sender: string; senderName: string; subject: string; body: string }): void {
  const classification = classifyEmail(email.sender, email.subject, email.body);
  if (!classification.outcome && !isJobRelatedSubject(email.subject)) {
    return; // not job-related — ignore entirely
  }
  const messageId = emailMessageId(email.sender, email.subject, email.body);
  void send({
    type: "gmail-suggest",
    email: {
      messageId,
      sender: email.sender,
      senderName: email.senderName,
      subject: email.subject,
      body: email.body,
    },
    classification,
  }).catch(() => {
    /* SW unreachable — the per-message-id memory handles repeat prompts */
  });
}

(function () {
  if (!chrome?.runtime?.id) return; // not an extension context

  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastProcessed = "";
  const schedule = () => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const email = extractOpenEmail();
      if (!email) return;
      const key = `${email.sender}|${email.subject}`;
      if (key === lastProcessed) return;
      lastProcessed = key;
      processEmail(email);
    }, 1200);
  };

  const observer = new MutationObserver(schedule);
  const start = () => {
    observer.observe(document.body, { childList: true, subtree: true });
    schedule();
  };
  if (document.body) {
    start();
  } else {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  }
})();
