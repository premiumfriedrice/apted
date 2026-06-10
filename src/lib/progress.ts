// In-memory progress store for the tailor job lifecycle.
// POST /api/tailor updates phases as it runs; GET /api/tailor/progress polls.
//
// This is a single-process Map — fine for dev, but needs Redis or similar in
// a multi-instance deployment.
//
// PRE-45: Split tailor into visible phases with progress updates.
// PRE-46: Implement tailor progress endpoint (polling-based status).

export type TailorPhase =
  | "starting"    // initial connection, loading master
  | "analyzing"   // ranking prior versions
  | "selecting"   // structure selection (DeepSeek)
  | "tailoring"   // Claude generation
  | "compiling"   // saving to DB
  | "done"        // complete
  | "error";      // failed

export interface ProgressState {
  jobId: string;
  phase: TailorPhase;
  percent: number; // 0–100 within current phase
  message: string;
  status: "running" | "done" | "error";
  error?: string;
  createdAt: number;
}

const store = new Map<string, ProgressState>();

// TTL: clean up entries older than 10 minutes to prevent memory leak.
const TTL_MS = 10 * 60 * 1000;

function cleanup(): void {
  const now = Date.now();
  for (const [id, state] of store) {
    if (now - state.createdAt > TTL_MS) store.delete(id);
  }
}

// Schedule cleanup every 2 minutes.
if (typeof setInterval !== "undefined") {
  setInterval(cleanup, 2 * 60 * 1000);
}

export function createProgress(jobId: string): ProgressState {
  const state: ProgressState = {
    jobId,
    phase: "starting",
    percent: 0,
    message: "Starting tailor…",
    status: "running",
    createdAt: Date.now(),
  };
  store.set(jobId, state);
  return state;
}

export function updateProgress(
  jobId: string,
  update: Partial<Pick<ProgressState, "phase" | "percent" | "message" | "status" | "error">>,
): void {
  const state = store.get(jobId);
  if (!state) return;
  Object.assign(state, update);
}

export function finishProgress(jobId: string): void {
  const state = store.get(jobId);
  if (!state) return;
  state.phase = "done";
  state.percent = 100;
  state.message = "Tailor complete.";
  state.status = "done";
}

export function failProgress(jobId: string, error: string): void {
  const state = store.get(jobId);
  if (!state) return;
  state.phase = "error";
  state.status = "error";
  state.error = error;
  state.message = "Tailor failed.";
}

export function getProgress(jobId: string): ProgressState | undefined {
  return store.get(jobId);
}

export function deleteProgress(jobId: string): void {
  store.delete(jobId);
}
