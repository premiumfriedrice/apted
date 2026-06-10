import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { Resume } from "@/lib/resume";
import { renderResume } from "@/lib/render";
import { getUserSettings } from "@/lib/settings";
import { compileTexToPdf } from "@/lib/compile";

export const runtime = "nodejs";

const OUTCOMES = ["draft", "applied", "interview", "offer", "rejected"] as const;
type Outcome = (typeof OUTCOMES)[number];

const SELECT =
  "SELECT id, company, role, job_description, tailored_content, outcome, created_at, pdf FROM resume_versions";

function rowToJson(row: Record<string, unknown>) {
  const pdfBuf = row.pdf as Buffer | null;
  return {
    id: row.id,
    company: row.company,
    role: row.role,
    jobDescription: row.job_description,
    tailoredContent: row.tailored_content,
    outcome: row.outcome,
    createdAt: row.created_at,
    pdfBase64: pdfBuf ? pdfBuf.toString("base64") : null,
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
        `${SELECT} WHERE outcome = $1 ORDER BY created_at DESC`,
        [outcome],
      )
    : await pool.query(`${SELECT} ORDER BY created_at DESC`);
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

  // Compile the resume to PDF before storing. This is best-effort: if the
  // compile service is unavailable we still save the version — the library
  // will show a "PDF unavailable" state and a recompile button.
  let pdf: Buffer | null = null;
  try {
    const settings = await getUserSettings();
    const tex = renderResume(content, settings.template);
    pdf = await compileTexToPdf(tex);
  } catch {
    // Compile failed — store null. The library UI handles this.
  }

  const r = await pool.query(
    `INSERT INTO resume_versions (company, role, job_description, tailored_content, outcome, pdf)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6)
     RETURNING id, company, role, job_description, tailored_content, outcome, created_at, pdf`,
    [company, role, jobDescription, JSON.stringify(content), oc, pdf],
  );
  return NextResponse.json(rowToJson(r.rows[0]));
}
