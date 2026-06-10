# APTED-004 — PDF compile service

**Ticket:** APTED-004
**Type of work:** Infrastructure — LaTeX → PDF microservice
**Status:** shipped

## Summary

A standalone Dockerised HTTP service that compiles LaTeX `.tex` to PDF using
Tectonic. The Next.js app POSTs `.tex` to it and streams back a PDF; the service
is deployable anywhere that runs a container (Cloud Run, Fargate/ECS, a Lambda
container image, or plain EC2).

## Context / problem

The renderer (APTED-002) emits `.tex`, but turning that into a PDF needs a full
TeX toolchain. Bundling that toolchain into the Next.js deployment is a
non-starter on serverless platforms — Tectonic plus its TeXLive bundle blows
past the ~250 MB serverless function limit and would wreck cold starts.

## Options considered

### Where compilation runs

- ✅ **Separate microservice over HTTP** — keeps the web app lean, lets the
  compiler scale and cache independently, and sidesteps the serverless size
  limit entirely. `src/lib/compile.ts` POSTs `.tex` (`content-type:
  application/x-tex`) and gets back `application/pdf`.
- ❌ **Inline in the Next.js function** — exceeds the serverless bundle limit;
  TeXLive fetches would murder cold-start latency.
- ❌ **Spawn Tectonic as a child process from Next.js** — couples the Node
  runtime to a Rust/LaTeX toolchain in the same image and can't scale separately.

### LaTeX engine

- ✅ **Tectonic (XeTeX-based, on-demand TeXLive)** — single self-contained
  binary that lazily fetches only the TeXLive pieces it needs from its CDN and
  caches them (`XDG_CACHE_HOME=/var/cache/tectonic`). Drove the renderer's
  decision to omit pdfTeX-only preamble lines (see APTED-002).
- ❌ **Full pre-baked TeX Live** — multi-GB image, slow deploys, slow pulls, for
  a feature set this resume never uses.
- ❌ **Hosted third-party PDF/LaTeX API** — least infra to own, but external
  dependency, per-document cost, and resume content leaving the boundary.

### Hosting

- ✅ **Self-hosted container** — full control, no per-document fee, runs offline;
  Debian bookworm-slim + Node 20 + minimal font/SSL libs.
- ❌ **Managed SaaS** — see above; rejected for control and data-residency.

## Decision

A self-hosted Tectonic container behind a small HTTP `/compile` endpoint. The
deciding factor was the serverless size limit: the web app can't carry a TeX
toolchain, so compilation *has* to live elsewhere, and Tectonic's lazy-bundle
model keeps the image small with fast warm compiles after the first.

## Hardening as built

- **Body cap:** `MAX_BODY` ≈ 1.5 MB of `.tex` rejected above the limit.
- **Timeout:** client allows ~60s to absorb cold-start TeXLive fetches.
- **Isolation:** each compile uses a throwaway `/tmp/apted-{random}` work dir,
  cleaned up after; Tectonic runs `--keep-logs --chatter minimal`.
- **Errors:** on failure the Tectonic stderr log is returned as `text/plain` so
  the caller sees *why* compilation failed.

## Files touched

- `compile-service/Dockerfile` — Tectonic v0.16.9 on Debian bookworm-slim + Node 20
- `compile-service/server.js` — `/compile` endpoint, body cap, temp-dir lifecycle, error passthrough
- `compile-service/package.json` / `README.md` — deps + deploy notes
- `src/lib/compile.ts` — HTTP client (`compileTexToPdf`), timeout, `COMPILE_SERVICE_URL`
- `src/app/api/drafts/[id]/pdf/route.ts` — draft PDF endpoint
- `src/app/api/master/pdf/route.ts` — master PDF endpoint

## Follow-ups

- [ ] No sandboxing beyond OS process isolation + body cap; revisit if untrusted `.tex` is ever accepted from third parties.
- [ ] First compile after a cold start pays the TeXLive bundle download; a warmed/persistent cache volume would smooth this.
