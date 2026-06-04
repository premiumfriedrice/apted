// Minimal Tectonic compile service.
//
// POST /compile  body: raw .tex (content-type: application/x-tex)
//                resp: application/pdf, or text/plain with the log on failure
// GET  /health   200 ok
//
// Designed to run as either a long-lived container or a Lambda container
// image (via Lambda Web Adapter or aws-lambda-ric). Tectonic is invoked as
// a subprocess; the binary is installed in the Dockerfile.

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = Number(process.env.PORT || 8080);
const TECTONIC = process.env.TECTONIC_BIN || "tectonic";
const MAX_BODY = 1_500_000; // 1.5 MB of .tex is plenty for a one-page resume

function readBody(req) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const chunks = [];
    req.on("data", (c) => {
      n += c.length;
      if (n > MAX_BODY) {
        reject(new Error("payload too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function compile(tex) {
  const dir = await mkdtemp(join(tmpdir(), "apted-"));
  const texPath = join(dir, "resume.tex");
  const pdfPath = join(dir, "resume.pdf");
  await writeFile(texPath, tex);
  try {
    const log = await runTectonic(texPath, dir);
    const pdf = await readFile(pdfPath);
    return { pdf, log };
  } finally {
    rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

function runTectonic(texPath, dir) {
  return new Promise((resolve, reject) => {
    // --keep-logs prints helpful diagnostics to stderr; --chatter minimal keeps it tame.
    const proc = spawn(TECTONIC, [
      "--outdir", dir,
      "--keep-logs",
      "--chatter", "minimal",
      texPath,
    ]);
    let stderr = "";
    proc.stderr.on("data", (b) => { stderr += b.toString(); });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) reject(new Error(`tectonic exit ${code}: ${stderr}`));
      else resolve(stderr);
    });
  });
}

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }
  if (req.method === "POST" && req.url === "/compile") {
    try {
      const body = await readBody(req);
      const { pdf } = await compile(body.toString("utf8"));
      res.writeHead(200, {
        "content-type": "application/pdf",
        "content-length": pdf.length,
      });
      res.end(pdf);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.writeHead(500, { "content-type": "text/plain" });
      res.end(msg);
    }
    return;
  }
  res.writeHead(404, { "content-type": "text/plain" });
  res.end("not found");
});

server.listen(PORT, () => {
  console.log(`apted compile-service listening on :${PORT}`);
});
