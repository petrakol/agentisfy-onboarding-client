import { validateEventEnvelope, validateExecution, validateGrant, validateManifest, validateSettlementProof } from "../src/lib/contracts.ts";
import { execute, replayAttempt } from "../src/lib/api.ts";
import { demoGrant, buildDemoManifest } from "../src/lib/demo.ts";
import { ApiError } from "../src/lib/types.ts";

const negativeCases = [
  ["manifest_missing_id", () => validateManifest({ schemaVersion: "1.0" })],
  ["grant_bad_scope", () => validateGrant({ grantVersion: "1.0", grantId: "g", principalId: "p", delegateId: "d", environment: "sandbox", merchantScope: [], payeeScope: [], targetScope: ["bad"], selectorScope: ["0x123"], notBefore: "2027", notAfter: "2026", asset: {} })],
  ["execution_bad_status", () => validateExecution({ attemptId: "x", status: "nope", capability: {} })],
  ["proof_bad_hash", () => validateSettlementProof({ schemaVersion: "1.0", runVersion: "1.0", proofId: "p", manifestHash: "nope", attemptRef: "a", txHash: "t", chainId: 1, blockNumber: 1, route: "waiver", receiptStatus: "success", environment: "sandbox", logRefs: ["x"], verifiedFinalAt: "2026-01-01T00:00:00.000Z", issuedAt: "2026-01-01T00:00:00.000Z" })],
  ["event_bad_sequence", () => validateEventEnvelope({ eventId: "e", eventType: "run.started", eventVersion: "2.0", occurredAt: "2026-01-01T00:00:00.000Z", environment: "sandbox", runId: "r", correlationIds: { invoiceId: "inv" }, sequenceNo: 0, payload: {} })]
];

for (const [name, fn] of negativeCases) {
  const result = fn();
  if (result.ok) {
    console.error(`Expected negative case to fail: ${name}`);
    process.exit(1);
  }
}

try {
  await execute(buildDemoManifest("inv_negative"), demoGrant, "pf_private_gateway_issued_12345", "bad-key");
  console.error("Expected execute with bad idempotency key to fail.");
  process.exit(1);
} catch (error) {
  if (!(error instanceof ApiError) || error.code !== "PRECONDITION_FAILED") {
    console.error("Expected PRECONDITION_FAILED for bad idempotency key.");
    process.exit(1);
  }
}

try {
  await replayAttempt("att_1", "public_client_replay_att_1_1700000000000", "accepted");
  console.error("Expected replay precondition failure for accepted status.");
  process.exit(1);
} catch (error) {
  if (!(error instanceof ApiError) || error.code !== "PRECONDITION_FAILED") {
    console.error("Expected PRECONDITION_FAILED for replay status gating.");
    process.exit(1);
  }
}

console.log("Negative matrix checks passed.");
