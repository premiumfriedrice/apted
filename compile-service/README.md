# apted compile-service

Tiny HTTP service that wraps [Tectonic](https://tectonic-typesetting.github.io/).
The Next.js app POSTs a `.tex` body here and gets back a PDF.

## Why a separate service?

Tectonic plus the TeXLive bundle is well beyond Vercel's 250 MB unzipped
serverless function limit, and the cold-start cost of fetching fonts is
unfriendly in a request-per-edit UI. Running this in its own container (or
Lambda container image) keeps the bundle warm and isolates the toolchain.

## Endpoints

- `GET /health` -> `200 ok`
- `POST /compile` -> body is the raw `.tex` source. Response is
  `application/pdf` on success or `text/plain` (the tectonic log) on failure.

## Run locally

```
docker build -t apted-compile .
docker run --rm -p 8080:8080 apted-compile
```

Then set `COMPILE_SERVICE_URL=http://localhost:8080` in the Next.js app.

## Deploy as a long-lived container

Anywhere that runs a container with an inbound port works: Fargate, ECS,
Cloud Run, Fly.io, Railway, Render, plain EC2. Expose port 8080 to the
Next.js app over a private network.

## Deploy as a Lambda container image

This image is compatible with Lambda's container runtime when wrapped with
[`aws-lambda-web-adapter`](https://github.com/awslabs/aws-lambda-web-adapter):
add the adapter layer/extension to the image and Lambda will route `POST /compile`
through to the Node HTTP server unchanged. Configure the function with at
least 1024 MB memory and a 30 s timeout; mount `XDG_CACHE_HOME` to `/tmp`
so the TeXLive bundle persists across warm invocations.
