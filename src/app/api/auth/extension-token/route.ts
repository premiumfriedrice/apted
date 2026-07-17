// POST /api/auth/extension-token
//
// Requires an authenticated cookie session (the user is logged in to the web
// app). Creates a separate, long-lived Better Auth session for the user and
// returns its raw token, which the user pastes into the Chrome extension's
// options page. The extension sends it as `Authorization: Bearer <token>` on
// every API call; the bearer plugin reconstructs the signed session cookie
// from the raw token + server secret and validates it.
//
// The long-lived session is independent of the browser session — revoking it
// (when we add a sessions UI) won't sign the user out of the web app.
//
// Returns 404 when auth isn't configured (local mode has no users / sessions).
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { pool } from "@/lib/db";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";

const EXTENSION_SESSION_TTL_DAYS = Number(process.env.EXTENSION_SESSION_TTL_DAYS) || 365;

export async function POST(req: Request) {
  if (!auth) {
    return NextResponse.json({ error: "auth not configured" }, { status: 404 });
  }
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const token = randomBytes(32).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + EXTENSION_SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await pool.query(
    `INSERT INTO "session" (id, token, "userId", "expiresAt", "ipAddress", "userAgent", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      randomBytes(16).toString("hex"),
      token,
      userId,
      expiresAt,
      "",
      "apted-extension",
      now,
      now,
    ],
  );

  return NextResponse.json({ token, expiresAt });
}