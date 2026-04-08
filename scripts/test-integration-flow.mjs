process.env.AGENTISFY_FORCE_DEMO_FALLBACK = "true";

const { demoGrant } = await import("../src/lib/demo.ts");
const { execute, fetchManifest, fetchProof, simulate } = await import("../src/lib/api.ts");
const { validateExecution, validateManifest, validateSimulation } = await import("../src/lib/contracts.ts");
const { verifySettlementProof } = await import("../src/lib/proofVerifier.ts");

const manifest = await fetchManifest("inv_integration_001");
const manifestValidation = validateManifest(manifest);
if (!manifestValidation.ok) {
  console.error("Manifest validation failed in integration flow.");
  process.exit(1);
}

const simulation = await simulate(manifest, demoGrant);
const simulationValidation = validateSimulation(simulation);
if (!simulationValidation.ok) {
  console.error("Simulation validation failed in integration flow.");
  process.exit(1);
}

const execution = await execute(manifest, demoGrant, "pf_private_gateway_issued_12345", "public_client_execute_integration_1700000000000");
const executionValidation = validateExecution(execution);
if (!executionValidation.ok) {
  console.error("Execution validation failed in integration flow.");
  process.exit(1);
}

const proof = await fetchProof(manifest.invoiceRef, execution.attemptId);
const verification = await verifySettlementProof(proof, manifest);
if (!verification.ok) {
  console.error("Proof verification failed in integration flow.");
  process.exit(1);
}

console.log("Integration flow check passed (fetch -> simulate -> execute -> verify).\n");
