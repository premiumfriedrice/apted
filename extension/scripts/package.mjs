// Packages the extension for the Chrome Web Store: zips dist/ (which must
// already be built) into apted-tracker-v<version>.zip at the extension root,
// excluding .DS_Store and other junk. Uses the system `zip` CLI.
//
// Usage: npm run package   (runs build first via the npm script)

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync("manifest.json", "utf8"));
const out = `apted-tracker-v${version}.zip`;

const res = spawnSync(
  "zip",
  ["-r", "-q", `../${out}`, ".", "-x", "*.DS_Store", "-x", "*__MACOSX*"],
  { cwd: "dist", stdio: "inherit" },
);

if (res.status !== 0) {
  console.error("zip failed with status", res.status);
  process.exit(1);
}
console.log(`packaged -> ${out}`);
