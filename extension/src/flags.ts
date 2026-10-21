// Product surface flags. v1 ships the tracker; the tailor UI (drawer + old
// side panel page) is feature-flagged OFF — nothing is deleted, it just
// doesn't render. Flip TAILORING_ENABLED to restore the tailor-first
// surfaces during development.

export const TAILORING_ENABLED = false;
