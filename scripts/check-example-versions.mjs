import fs from "node:fs";

const examples = JSON.parse(fs.readFileSync(new URL("../examples/contract-examples.json", import.meta.url), "utf8"));
const expected = examples.contractVersion;

const checks = [
  ["manifest.schemaVersion", examples.manifest?.schemaVersion],
  ["grant.grantVersion", examples.grant?.grantVersion],
  ["proof.schemaVersion", examples.proof?.schemaVersion],
  ["proof.runVersion", examples.proof?.runVersion],
  ["run.runVersion", examples.run?.runVersion],
  ["discrepancy.schemaVersion", examples.discrepancy?.schemaVersion]
];

const problems = checks.filter(([, value]) => value !== expected);
if (problems.length) {
  for (const [key, value] of problems) console.error(`Version drift: ${key}=${value} expected=${expected}`);
  process.exit(1);
}

console.log("Example contract version pin check passed.");
