import fs from "node:fs";
import crypto from "node:crypto";

const manifestPath = new URL("../docs/public-release-artifacts.json", import.meta.url);
const release = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

const problems = [];
for (const [file, expectedHash] of Object.entries(release.artifactHashes)) {
  const fullPath = new URL(`../${file}`, import.meta.url);
  if (!fs.existsSync(fullPath)) {
    problems.push(`Missing artifact file: ${file}`);
    continue;
  }
  const hash = crypto.createHash("sha256").update(fs.readFileSync(fullPath)).digest("hex");
  if (hash !== expectedHash) {
    problems.push(`Hash mismatch for ${file}: expected=${expectedHash} actual=${hash}`);
  }
}

if (problems.length) {
  for (const problem of problems) console.error(problem);
  process.exit(1);
}

console.log("Release artifact sync check passed.");
