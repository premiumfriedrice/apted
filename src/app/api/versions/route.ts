import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { Resume } from "@/lib/resume";
import { renderResume } from "@/lib/render";
import { getUserSettings } from "@/lib/settings";
import { compileTexToPdf } from "@/lib/compile";

export const runtime = "nodejs";

const OUTCOMES = ["draft", "applied", "interview", "offer", "rejected"] as const;
type Outcome = (typeof OUTCOMES)[number];

function rowToJson(row: Record<string, unknown>) {
  return {
    id: row.id,
    company: row.company,
    role: row.role,
    jobDescription: row.job_description,
    tailoredContent: row.tailored_content,
    outcome: row.outcome,
    createdAt: row.created_at,
    pdf: (row.pdf as Buffer | null)?.toString("base64") ?? null,
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const outcome = url.searchParams.get("outcome");
  if (outcome && !OUTCOMES.includes(outcome as Outcome)) {
    return NextResponse.json({ error: "invalid outcome" }, { status: 400 });
  }
  const r = outcome
    ? await pool.query(
        "SELECT id, company, role, job_description, tailored_content, outcome, created_at, pdf FROM resume_versions WHERE outcome = $1 ORDER BY created_at DESC",
        [outcome],
      )
    : await pool.query(
        "SELECT id, company, role, job_description, tailored_content, outcome, created_at, pdf FROM resume_versions ORDER BY created_at DESC",
      );
  return NextResponse.json(r.rows.map(rowToJson));
}

export async function POST(req: Request) {
  const body = await req.json();
  const { company, role, jobDescription, tailoredContent, outcome } = body as {
    company?: string;
    role?: string;
    jobDescription?: string;
    tailoredContent?: unknown;
    outcome?: Outcome;
  };
  if (!company || !role || !jobDescription || !tailoredContent) {
    return NextResponse.json({ error: "company, role, jobDescription, tailoredContent required" }, { status: 400 });
  }
  const content = Resume.parse(tailoredContent);
  const oc: Outcome = outcome && OUTCOMES.includes(outcome) ? outcome : "draft";

  // Compile PDF before insert so we can include it in the INSERT.
  let pdfBuf: Buffer | null = null;
  try {
    const settings = await getUserSettings();
    const tex = renderResume(content, settings.template);
    pdfBuf = await compileTexToPdf(tex);
  } catch {
    // Compile failure is non-fatal — version is saved without PDF.
    console.warn("PDF compile failed for new version");
  }

  const r = await pool.query(
    `INSERT INTO resume_versions (company, role, job_description, tailored_content, outcome, pdf)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6)
     RETURNING id, company, role, job_description, tailored_content, outcome, created_at, pdf`,
    [company, role, jobDescription, JSON.stringify(content), oc, pdfBuf],
  );
  return NextResponse.json(rowToJson(r.rows[0]));
}
