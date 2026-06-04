import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const projectRoot = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin the file-tracing root to this project. Without this, Next sees a stray
  // ~/package-lock.json and treats the entire home folder as the workspace,
  // which hangs the dev server while it scans Downloads, Library, etc.
  outputFileTracingRoot: projectRoot,
  // The runtime system prompt reads src/lib/resume-rules.md off disk at server
  // start. Tell Next to include it in the standalone build for prod.
  outputFileTracingIncludes: {
    "/**/*": ["./src/lib/resume-rules.md"],
  },
};

export default nextConfig;
