import { buildBrokenProofFixtures, buildDemoManifest, buildDemoSimulation, buildDemoExecution, buildDemoProof, buildDemoDiscrepancies, buildDemoEvents, demoGrant } from "../src/lib/demo.ts";
import {
  validateManifest,
  validateGrant,
  validateSimulation,
  validateExecution,
  validateSettlementProof,
  validateDiscrepancies,
  validateEventEnvelope
} from "../src/lib/contracts.ts";
import { verifySettlementProof } from "../src/lib/proofVerifier.ts";

const invoiceId = "inv_fixture";
const manifest = buildDemoManifest(invoiceId);
const simulation = buildDemoSimulation(invoiceId);
const execution = buildDemoExecution(invoiceId);
const proof = await buildDemoProof(invoiceId, execution.attemptId);
const discrepancies = buildDemoDiscrepancies();
const events = buildDemoEvents(execution.attemptId);

const checks = [
  ["manifest", validateManifest(manifest)],
  ["grant", validateGrant(demoGrant)],
  ["simulation", validateSimulation(simulation)],
  ["execution", validateExecution(execution)],
  ["proof", validateSettlementProof(proof)],
  ["discrepancies", validateDiscrepancies(discrepancies)],
  ...events.map((event, index) => [`event[${index}]`, validateEventEnvelope(event)])
];

const failed = checks.filter(([, result]) => !result.ok);
if (failed.length > 0) {
  for (const [name, result] of failed) {
    console.error(`Fixture check failed for ${name}:`, result.errors.join("; "));
  }
  process.exit(1);
}

const broken = buildBrokenProofFixtures(invoiceId);
if (validateSettlementProof(broken.malformed).ok) {
  console.error("Expected malformed fixture validation to fail.");
  process.exit(1);
}

const mismatchResult = await verifySettlementProof(proof, broken.hashMismatch);
if (mismatchResult.ok) {
  console.error("Expected hash mismatch verification to fail.");
  process.exit(1);
}

console.log(`Fixture checks passed (${checks.length} positive validations + negative fixtures).`);
