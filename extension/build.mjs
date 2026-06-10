import { build, context } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";

const watch = process.argv.includes("--watch");
const outdir = "dist";

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

const common = {
  bundle: true,
  format: "iife",
  target: "chrome120",
  logLevel: "info",
  sourcemap: watch ? "inline" : false,
  minify: !watch,
};

const entries = [
  { in: "src/background.ts", out: "background" },
  { in: "src/sidepanel.ts", out: "sidepanel" },
  { in: "src/options.ts", out: "options" },
  { in: "src/inject.ts", out: "inject" },
  { in: "src/autofill.ts", out: "autofill" },
];

async function copyStatic() {
  await Promise.all([
    cp("manifest.json", `${outdir}/manifest.json`),
    cp("src/sidepanel.html", `${outdir}/sidepanel.html`),
    cp("src/sidepanel.css", `${outdir}/sidepanel.css`),
    cp("src/options.html", `${outdir}/options.html`),
  ]);
}

if (watch) {
  const ctxs = await Promise.all(
    entries.map((e) =>
      context({ ...common, entryPoints: [e.in], outfile: `${outdir}/${e.out}.js` }),
    ),
  );
  await copyStatic();
  await Promise.all(ctxs.map((c) => c.watch()));
  console.log("watching…");
} else {
  await Promise.all(
    entries.map((e) =>
      build({ ...common, entryPoints: [e.in], outfile: `${outdir}/${e.out}.js` }),
    ),
  );
  await copyStatic();
  console.log("built ->", outdir);
}
