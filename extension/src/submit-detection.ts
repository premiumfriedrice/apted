// Heuristic for recognising a job-application confirmation / thank-you page
// after a submit. Exported from its own module so the regex can be unit-tested
// without standing up the drawer content script.

const CONFIRMATION_RE =
  /\/(thank[-_]?you|confirmation|success|submitted|application[-_]?complete)\b/i;

export function isConfirmationUrl(url: string): boolean {
  return CONFIRMATION_RE.test(url);
}

// Button label heuristic for JS-driven submit buttons that may not live inside
// a real <form>. Intentionally narrow: "submit" is the dominant verb on job
// sites' final-step buttons, and we deliberately do NOT match bare "apply"
// (e.g. LinkedIn's "Easy Apply" only opens the form) to avoid false positives.
export function isSubmitButtonLabel(text: string): boolean {
  return /\bsubmit\b/i.test(text.trim());
}