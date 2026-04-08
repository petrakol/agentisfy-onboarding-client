import fs from "node:fs";

const forbidden = [
  "policy authoring engine",
  "risk scoring model",
  "reconciliation truth source",
  "private routing heuristic",
  "merchant private adapter"
];

const srcFiles = fs.readdirSync(new URL("../src/", import.meta.url), { withFileTypes: true });
const files = [];
for (const entry of srcFiles) {
  if (entry.isFile() && entry.name.endsWith(".ts")) files.push(`src/${entry.name}`);
  if (entry.isDirectory()) {
    for (const nested of fs.readdirSync(new URL(`../src/${entry.name}/`, import.meta.url))) {
      if (nested.endsWith(".ts") || nested.endsWith(".tsx")) files.push(`src/${entry.name}/${nested}`);
    }
  }
}

const problems = [];
for (const file of files) {
  const content = fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8").toLowerCase();
  for (const token of forbidden) {
    if (content.includes(token)) problems.push(`${file} includes forbidden boundary phrase: "${token}"`);
  }
}

if (problems.length) {
  for (const p of problems) console.error(p);
  process.exit(1);
}

console.log("Boundary lint check passed.");
