import { NextResponse } from "next/server";
import { pool, setRlsUserOnPool } from "@/lib/db";
import { isOutcome } from "@/lib/applications";
import { requireUserId } from "@/lib/auth";

export const runtime = "nodejs";

// POST /api/applications/event — event-first writes for extension captures.
//
// Accepts just `{ trackedObj?, url?, capturedAt?, partial? { company?, role?,
// jobDescription?, portalUrl?, outcome?, source? } }` and ALWAYS succeeds:
// captures with missing fields land with fallback names ("Unknown Company") and
// can be upgraded later through the main application routes. The main
// POST /api/applications stays strict (company + role required).
//
// Idempotent per (user, trackedObj): when the capture carries a stable ATS
// identity, an existing row for the same trackedObj is returned untouched
// instead of inserting a duplicate (server-side half of the tracker dedupe;
// the extension also dedupes client-side).

function rowToJson(row: Record<string, unknown>) {
  return {
    id: row.id,
    versionId: row.version_id,
    company: row.company,
    role: row.role,
    jobDescription: row.job_description,
    outcome: row.outcome,
    interviewRound: row.interview_round,
    rejectedAfterRound: row.rejected_after_round,
    portalUrl: row.portal_url,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

const COLS =
  "id, version_id, company, role, job_description, outcome, interview_round, rejected_after_round, portal_url, notes, created_at";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export async function POST(req: Request) {
  const userId = await requireUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await setRlsUserOnPool(userId);

  const body = await req.json().catch(() => ({}));
  const { trackedObj, url, capturedAt, partial = {} } = body as {
    trackedObj?: unknown;
    url?: unknown;
    capturedAt?: unknown;
    partial?: {
      company?: unknown;
      role?: unknown;
      jobDescription?: unknown;
      portalUrl?: unknown;
      outcome?: unknown;
      source?: unknown;
    };
  };

  const cleanTrackedObj = str(trackedObj) || null;
  const company = str(partial.company) || "Unknown Company";
  const role = str(partial.role) || "Unknown Role";
  const jobDescription = str(partial.jobDescription);
  const outcome =
    partial.outcome && isOutcome(partial.outcome) ? partial.outcome : "applied";
  const portalUrl = str(partial.portalUrl) || str(url) || null;

  // Idempotency: return the existing row for this trackedObj untouched.
  if (cleanTrackedObj) {
    const existing = await pool.query(
      `SELECT ${COLS} FROM applications WHERE user_id = $1 AND tracked_obj = $2 LIMIT 1`,
      [userId, cleanTrackedObj],
    );
    if (existing.rows[0]) return NextResponse.json(rowToJson(existing.rows[0]));
  }

  let inserted;
  try {
    inserted = await pool.query(
      `INSERT INTO applications (user_id, company, role, job_description, outcome, interview_round, portal_url, tracked_obj, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING ${COLS}`,
      [
        userId,
        company,
        role,
        jobDescription,
        outcome,
        // interviewing rows require a round >= 1 (DB check constraint).
        outcome === "interviewing" ? 1 : null,
        portalUrl,
        cleanTrackedObj,
        capturedAt ? "Logged automatically by the apted Tracker extension." : null,
      ],
    );
  } catch {
    // Unique-violation race on (user_id, tracked_obj): another write landed
    // first — return it instead of failing the event.
    if (cleanTrackedObj) {
      const existing = await pool.query(
        `SELECT ${COLS} FROM applications WHERE user_id = $1 AND tracked_obj = $2 LIMIT 1`,
        [userId, cleanTrackedObj],
      );
      if (existing.rows[0]) return NextResponse.json(rowToJson(existing.rows[0]));
    }
    throw new Error("event insert failed");
  }

  return NextResponse.json(rowToJson(inserted.rows[0]));
}
