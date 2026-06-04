// Server-side client for the Tectonic compile service.
// The service runs in its own container (see compile-service/) — NOT a Vercel
// serverless function — because tectonic + texlive fonts blow past the
// 250 MB unzipped lambda limit.
const base = process.env.COMPILE_SERVICE_URL;

export async function compileTexToPdf(tex: string): Promise<Buffer> {
  if (!base) throw new Error("COMPILE_SERVICE_URL not set");
  const res = await fetch(`${base.replace(/\/$/, "")}/compile`, {
    method: "POST",
    headers: { "content-type": "application/x-tex" },
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
