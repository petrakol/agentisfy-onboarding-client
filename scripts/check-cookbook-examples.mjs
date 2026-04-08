import fs from "node:fs";
import { validateGrant, validateManifest } from "../src/lib/contracts.ts";

const cookbook = fs.readFileSync(new URL("../docs/API_COOKBOOK.md", import.meta.url), "utf8");
const dataPayloads = [...cookbook.matchAll(/-d '(\{[^']+\})'/g)].map((m) => JSON.parse(m[1]));

const problems = [];
for (const payload of dataPayloads) {
  if (payload.manifest) {
    const result = validateManifest(payload.manifest);
    if (!result.ok) problems.push(`Cookbook manifest example invalid: ${result.errors.join("; ")}`);
  }

  if (payload.grant) {
    const result = validateGrant(payload.grant);
    if (!result.ok) problems.push(`Cookbook grant example invalid: ${result.errors.join("; ")}`);
  }
}

if (problems.length) {
  for (const p of problems) console.error(p);
  process.exit(1);
}

console.log("Cookbook examples validation passed.");
