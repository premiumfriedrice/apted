import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { Resume } from "@/lib/resume";
import { renderResume } from "@/lib/render";
import { getUserSettings } from "@/lib/settings";
import { compileTexToPdf } from "@/lib/compile";
import { injectResume } from "@/lib/redact";
import { isOutcome, parseInterviewRound, parseRejectedAfterRound } from "@/lib/applications";
import { generateVersionName } from "@/lib/version-names";
import type { RedactionMap } from "@/lib/redact";
import { requireUserId } from "@/lib/auth";

export const runtime = "nodejs";

const SELECT = `
  SELECT
    v.id,
    v.name,
    v.tailored_content,
    v.created_at,
    v.pdf,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'versionId', a.version_id,
          'company', a.company,
          'role', a.role,
          'jobDescription', a.job_description,
          'outcome', a.outcome,
          'interviewRound', a.interview_round,
          'rejectedAfterRound', a.rejected_after_round,
          'portalUrl', a.portal_url,
          'notes', a.notes,
          'createdAt', a.created_at
        ) ORDER BY a.created_at DESC
      ) FILTER (WHERE a.id IS NOT NULL),
      '[]'::jsonb
    ) AS applications
  FROM resume_versions v
  LEFT JOIN applications a ON a.version_id = v.id
`;

function rowToJson(row: Record<string, unknown>) {
  const pdfBuf = row.pdf as Buffer | null;
  return {
    id: row.id,
    name: row.name,
    tailoredContent: row.tailored_content,
    createdAt: row.created_at,
    pdfBase64: pdfBuf ? pdfBuf.toString("base64") : null,
    applications: row.applications as Array<{
      id: string;
      versionId: string;
      company: string;
      role: string;
      jobDescription: string;
      outcome: string;
      interviewRound: number | null;
      rejectedAfterRound: number | null;
      portalUrl: string | null;
      notes: string | null;
      createdAt: string;
    }>,
  };
}

export async function GET(req: Request) {
  const userId = await requireUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const outcome = url.searchParams.get("outcome");
  if (outcome && !isOutcome(outcome)) {
    return NextResponse.json({ error: "invalid outcome" }, { status: 400 });
  }

  const r = outcome
    ? await pool.query(
        `${SELECT}
         WHERE v.user_id = $1
         GROUP BY v.id
         HAVING bool_or(a.outcome = $2)
         ORDER BY v.created_at DESC`,
        [userId, outcome],
      )
    : await pool.query(
        `${SELECT} WHERE v.user_id = $1 GROUP BY v.id ORDER BY v.created_at DESC`,
        [userId],
      );
  return NextResponse.json(r.rows.map(rowToJson));
}

export async function POST(req: Request) {
  const userId = await requireUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const {
    tailoredContent,
    application,
  } = body as {
    tailoredContent?: unknown;
    application?: {
      company?: string;
      role?: string;
      jobDescription?: string;
      outcome?: string;
      interviewRound?: unknown;
      rejectedAfterRound?: unknown;
    };
  };

  if (!tailoredContent) {
    return NextResponse.json(
      { error: "tailoredContent required" },
      { status: 400 },
    );
  }

  const content = Resume.parse(tailoredContent);
  const oc = application?.outcome && isOutcome(application.outcome)
    ? application.outcome
    : "draft";
  const interviewRound = parseInterviewRound(application?.interviewRound);
  const rejectedAfterRound = parseRejectedAfterRound(application?.rejectedAfterRound);

  // Generate a human-readable name for this version. Best-effort.
  const jobDescription = application?.jobDescription?.trim();
  const role = application?.role?.trim();
  let name: string | null = null;
  try {
    name = await generateVersionName(content, jobDescription, role, userId);
  } catch {
    console.warn("Version name generation failed");
  }

  // Compile the resume to PDF before storing. Best-effort: if the
  // compile service is unavailable we still save the version, but pdf
  // will be null. The library UI handles the missing-PDF case.
  let pdf: Buffer | null = null;
  try {
    const settings = await getUserSettings(userId);
    // Inject PII back before rendering (PRE-53).
    const pm = await pool.query("SELECT map FROM master_pii_map WHERE user_id = $1", [userId]);
    const piiMap = pm.rows[0]?.map as RedactionMap | null;
    let renderContent = content;
    if (piiMap) renderContent = injectResume(content, piiMap);
    const tex = renderResume(renderContent, settings.template);
    pdf = await compileTexToPdf(tex);
  } catch {
    console.warn("PDF compile failed for new version");
  }

  const version = await pool.query(
    `INSERT INTO resume_versions (user_id, name, tailored_content, pdf)
     VALUES ($1, $2, $3::jsonb, $4)
     RETURNING id, name, tailored_content, created_at, pdf`,
    [userId, name, JSON.stringify(content), pdf],
  );
  const versionRow = version.rows[0];

  if (application?.company && application?.role) {
    await pool.query(
      `INSERT INTO applications (user_id, version_id, company, role, job_description, outcome, interview_round, rejected_after_round)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        userId,
        versionRow.id,
        application.company,
        application.role,
        application.jobDescription ?? "",
        oc,
        oc === "interviewing" ? interviewRound : null,
        oc === "rejected" ? rejectedAfterRound : null,
      ],
    );
  }

  // Re-fetch with applications aggregated to return the same shape as GET.
  const r = await pool.query(
    `${SELECT} WHERE v.id = $1 GROUP BY v.id`,
    [versionRow.id],
  );
  return NextResponse.json(rowToJson(r.rows[0]));
}