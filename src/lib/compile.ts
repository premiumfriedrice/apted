// Server-side client for the Tectonic compile service.
// The service runs in its own container (see compile-service/) — NOT a Vercel
// serverless function — because tectonic + texlive fonts blow past the
// 250 MB unzipped lambda limit.
const base = process.env.COMPILE_SERVICE_URL;

// Shared token for compile-service auth (PRE-23). When set, both the
// compile service and this client must have the same value.
const token = process.env.COMPILE_SERVICE_TOKEN;

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  if (token) h.authorization = `Bearer ${token}`;
  return h;
}

export async function compileTexToPdf(tex: string): Promise<Buffer> {
  if (!base) throw new Error("COMPILE_SERVICE_URL not set");
  const res = await fetch(`${base.replace(/\/$/, "")}/compile`, {
    method: "POST",
    headers: { "content-type": "application/x-tex", ...authHeaders() },
    body: tex,
    // Tectonic cold-starts can take a while if it needs to fetch fonts.
    // 60s is comfortable; tune per your deployment.
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`compile service ${res.status}: ${msg}`);
  }
  const buf = await res.arrayBuffer();
  return Buffer.from(buf);
}

// Quick reachability check — used by /api/health so the builder UI can
// warn before the user hits compile (PRE-21). Fast timeout (3s) so it
// doesn't block the health check.
export async function checkCompileService(): Promise<boolean> {
  if (!base) return false;
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/health`, {
      method: "GET",
      headers: authHeaders(),
      signal: AbortSignal.timeout(3_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
