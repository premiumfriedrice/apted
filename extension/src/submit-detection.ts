// Heuristic for recognising a job-application confirmation / thank-you page
// after a submit. Exported from its own module so the regex can be unit-tested
// without standing up the drawer content script.

const CONFIRMATION_RE =
  /\/(thank[-_]?you|confirmation|success|submitted|application[-_]?complete)\b/i;

export function isConfirmationUrl(url: string): boolean {
  return CONFIRMATION_RE.test(url);
}

// Button-label heuristic for JS-driven submissions that don't fire a real
// `submit` event. Generic "Apply" and "Submit" buttons are common on earlier
// steps of multi-page application flows, so only match labels that identify the
// final application action.
const SUBMIT_PATTERNS = [
  /submit\s+(your\s+)?application/i,
  /apply\s+now/i,
  /send\s+application/i,
];

export function isSubmitButtonLabel(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return SUBMIT_PATTERNS.some((re) => re.test(t));
}

/**
 * Whether an element will cause a native form submit event when clicked.
 * Clicks on these controls are handled by the document submit listener instead
 * of the JS-driven click fallback, preventing one action from being saved twice.
 */
export function isNativeFormSubmitControl(element: HTMLElement): boolean {
  if (!element.closest("form")) return false;

  const tagName = element.tagName.toLowerCase();
  if (tagName === "button") {
    const type = element.getAttribute("type");
    return type === null || type.toLowerCase() === "submit";
  }
  if (tagName === "input") {
    const type = (element.getAttribute("type") ?? "text").toLowerCase();
    return type === "submit" || type === "image";
  }
  return false;
}

/** Prefer the JD currently displayed for the page being submitted. */
export function selectApplicationJobDescription(currentPageJd: string, draftJd: string): string {
  return currentPageJd || draftJd || "";
}
