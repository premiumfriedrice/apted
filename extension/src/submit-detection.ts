// Heuristics for recognising a job-application submission. Exported from
// its own module so the regexes/logic can be unit-tested without standing up
// a drawer content script.
//
// Two layers:
//   1. Registry-driven (ats-registry.json): per-ATS confirmation DOM
//      selectors and final submit-button labels.
//   2. Generic fallbacks: confirmation URL slugs and common final-step
//      button labels, used when no ATS entry matches the page.

import type { AtsEntry } from "./ats-registry";

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
 * Registry-driven final-submit label check. An ATS entry's submitLabels are
 * lowercase substring patterns (e.g. "submit application"); its
 * continueLabels are explicit non-final labels ("next", "continue"). Falls
 * back to the generic label heuristic when no entry matches the page.
 */
export function isFinalSubmitLabel(text: string, entry: AtsEntry | null): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  if (entry) {
    if (entry.continueLabels.some((l) => l === t)) return false;
    if (entry.submitLabels.some((l) => t.includes(l))) return true;
  }
  return isSubmitButtonLabel(text);
}

/**
 * Whether any of the ATS entry's confirmation DOM selectors matches a
 * visible element under `root`. Always false when the entry has none —
 * LinkedIn, for example, is detected via submit clicks and URLs instead.
 */
export function isSuccessElementVisible(root: ParentNode, entry: AtsEntry | null): boolean {
  if (!entry) return false;
  return entry.successSelectors.some((sel) => {
    try {
      return !!root.querySelector(sel);
    } catch {
      return false; // invalid selector — skip
    }
  });
}

// A submission counts when a success element is visible AND either a final
// submit control was clicked, OR the element was absent for ≥1.5 s before
// reappearing while the user interacted (guards against confirmation DOM
// that was present on the page all along).
export const SUBMITTED_ABSENCE_MS = 1500;

export type SubmitSignals = {
  successVisible: boolean;
  submitClicked: boolean;
  userInteracted: boolean;
  /** How long the success element was absent before its latest reappearance. */
  absenceBeforeReappearMs: number | null;
};

export function isSubmitted(s: SubmitSignals): boolean {
  if (!s.successVisible) return false;
  return (
    s.submitClicked ||
    (s.userInteracted && (s.absenceBeforeReappearMs ?? 0) >= SUBMITTED_ABSENCE_MS)
  );
}

/**
 * Tracks a success element's presence over time so callers can apply the
 * absence-then-reappearance heuristic. Poll `tick()` on an interval; read
 * `absenceMs` for the duration of the absence that preceded the most recent
 * reappearance (null when the element has never been seen or never went
 * away). Pure DOM reads — inject a `clock` for deterministic tests.
 */
export class SuccessMonitor {
  private lastVisibleState = false;
  private absentSince: number | null = null;
  private absenceBeforeReappearMs: number | null = null;

  constructor(
    private opts: { selectors: () => string[]; clock?: () => number },
  ) {}

  /** Returns whether a success element is currently visible. */
  tick(root: ParentNode): boolean {
    const now = (this.opts.clock?.() ?? Date.now());
    const visible = this.opts.selectors().some((sel) => {
      try {
        return !!root.querySelector(sel);
      } catch {
        return false;
      }
    });
    if (visible) {
      if (!this.lastVisibleState && this.absentSince !== null) {
        this.absenceBeforeReappearMs = now - this.absentSince;
        this.absentSince = null;
      }
    } else if (this.lastVisibleState) {
      if (this.absentSince === null) this.absentSince = now;
    }
    this.lastVisibleState = visible;
    return visible;
  }

  get absenceMs(): number | null {
    return this.absenceBeforeReappearMs;
  }

  /** Whether the last tick saw a success element. */
  get lastVisible(): boolean {
    return this.lastVisibleState;
  }
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
