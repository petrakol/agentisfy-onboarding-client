import fs from "node:fs";

const openapi = fs.readFileSync(new URL("../docs/public-openapi.yaml", import.meta.url), "utf8");
const lines = openapi.split(/\r?\n/);

const expected = {
  "/v1/agent/manifest/{invoiceId}": ["get"],
  "/v1/agent/simulate": ["post"],
  "/v1/agent/execute": ["post"],
  "/v1/agent/events": ["get"],
  "/v1/agent/proof/{invoiceId}": ["get"],
  "/v1/agent/discrepancies": ["get"],
  "/v1/agent/attempts/{attemptId}/replay": ["post"]
};

const discovered = {};
let currentPath = null;
for (const line of lines) {
  const pathMatch = line.match(/^\s{2}(\/v1\/agent\/[^:]+):\s*$/);
  if (pathMatch) {
    currentPath = pathMatch[1];
    discovered[currentPath] = discovered[currentPath] ?? [];
    continue;
  }

  if (currentPath) {
    const methodMatch = line.match(/^\s{4}(get|post|put|patch|delete):\s*$/);
    if (methodMatch) discovered[currentPath].push(methodMatch[1]);
  }
}

const problems = [];
for (const [path, methods] of Object.entries(expected)) {
  if (!(path in discovered)) {
    problems.push(`Missing path: ${path}`);
    continue;
  }
  for (const method of methods) {
    if (!discovered[path].includes(method)) {
      problems.push(`Missing method ${method.toUpperCase()} for ${path}`);
    }
  }
}

if (!openapi.includes("name: Idempotency-Key")) {
  problems.push("Missing Idempotency-Key header declaration.");
}

const schemaFiles = fs.readdirSync(new URL("../schemas/", import.meta.url)).filter((name) => name.endsWith(".schema.json"));
const allowedSchemaVersions = new Set(["1.0", "2.0"]);
for (const file of schemaFiles) {
  const match = file.match(/-(\d+\.\d+)\.schema\.json$/);
  if (!match) problems.push(`Schema file is not version-pinned: ${file}`);
  else if (!allowedSchemaVersions.has(match[1])) problems.push(`Unexpected schema version in ${file}`);
}

if (!/version:\s*0\.1\.0/.test(openapi)) {
  problems.push("OpenAPI info.version must remain pinned to 0.1.0 for this public contract set.");
}

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  process.exit(1);
}

console.log("OpenAPI endpoint/version checks passed.");
