import { computeManifestHash } from "./proofVerifier";
import type {
  AgentPaymentManifest,
  DiscrepancyResponse,
  EventEnvelope,
  ExecuteResponse,
  PolicyGrant,
  SettlementProof,
  SimulationResponse
} from "./types";

const DEMO_NOW = "2026-01-15T00:00:00.000Z";

export const demoGrant: PolicyGrant = {
  grantId: "grant_demo_public_1",
  grantVersion: "1.0",
  principalType: "merchant",
  principalId: "merchant_demo_public",
  delegateType: "agent",
  delegateId: "agent_demo_public",
  environment: "sandbox",
  merchantScope: ["merchant_demo_public"],
  payeeScope: ["payee_demo_public"],
  targetScope: ["0x000000000000000000000000000000000000f333"],
  selectorScope: ["0x095ea7b3", "0xa9059cbb"],
  asset: {
    symbol: "USDT0",
    tokenAddress: "0x0000000000000000000000000000000000000000",
    chainId: 988
  },
  maxAmount: { atomic: "100000000" },
  notBefore: "2026-01-01T00:00:00.000Z",
  notAfter: "2027-01-01T00:00:00.000Z",
  approvalState: "published",
  revocationState: "active",
  riskTier: "low"
};

export function buildDemoManifest(invoiceId: string): AgentPaymentManifest {
  return {
    manifestId: `manifest_${invoiceId}`,
    schemaVersion: "1.0",
    manifestHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    origin: "agent",
    invoiceRef: invoiceId,
    merchantRef: "merchant_demo_public",
    payer: { accountRef: "acct_payer_demo", chainId: 988 },
    payee: { accountRef: "acct_payee_demo", chainId: 988 },
    asset: { symbol: "USDT0", tokenAddress: "0x0000000000000000000000000000000000000000", chainId: 988 },
    amount: { atomic: "2500000", decimals: 6 },
    target: "0x000000000000000000000000000000000000f333",
    selector: "0xa9059cbb",
    calldataHash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    idempotencyKey: `public_client_execute_${invoiceId}_1700000000000`,
    expiresAt: "2027-01-01T00:00:00.000Z",
    fallbackPolicy: { mode: "fallback", maxAttempts: 2 },
    proofRequirement: { requireProof: true, maxFinalityBlocks: 10 },
    metadata: { mode: "demo-fallback" }
  };
}

export function buildDemoSimulation(invoiceId: string): SimulationResponse {
  return {
    predictedPath: "waiver",
    policy: { decision: "allow", reasonCodes: ["demo.fallback", "policy.pass"] },
    capability: { maxAtomic: "100000000", expiry: "2027-01-01T00:00:00.000Z", idempotencyScope: invoiceId },
    budget: { requestedAtomic: "2500000", remainingAtomic: "97500000" }
  };
}

export function buildDemoExecution(invoiceId: string): ExecuteResponse {
  return {
    attemptId: `demo_attempt_${invoiceId}_1700000000000`,
    status: "accepted",
    policy: { decision: "allow", reasonCodes: ["demo.fallback"] },
    capability: { mode: "demo-fallback" },
    reservation: { status: "reserved", holdAtomic: "2500000" },
    budget: { requestedAtomic: "2500000", remainingAtomic: "97500000" }
  };
}

export async function buildDemoProof(invoiceId: string, attemptId?: string): Promise<SettlementProof> {
  const manifest = buildDemoManifest(invoiceId);
  return {
    proofId: `proof_${invoiceId}`,
    schemaVersion: "1.0",
    runId: `run_${invoiceId}`,
    runVersion: "1.0",
    manifestHash: await computeManifestHash(manifest),
    grantRef: demoGrant.grantId,
    route: "waiver",
    attemptRef: attemptId ?? `demo_attempt_${invoiceId}`,
    txHash: "0xd3m0f411b4ck0000000000000000000000000000000000000000000000000001",
    chainId: 988,
    blockNumber: 123456,
    receiptStatus: "success",
    logRefs: ["txReceipt:0", "transferLog:0"],
    verifiedFinalAt: DEMO_NOW,
    issuedAt: DEMO_NOW,
    environment: "sandbox"
  };
}

export function buildBrokenProofFixtures(invoiceId: string) {
  return {
    malformed: { schemaVersion: "1.0" },
    hashMismatch: {
      ...buildDemoManifest(invoiceId),
      manifestHash: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    },
    expiredPreflightToken: {
      code: "PRECONDITION_FAILED",
      message: "Preflight token expired"
    }
  };
}

export function buildDemoDiscrepancies(): DiscrepancyResponse {
  return {
    items: [
      {
        discrepancyId: "disc_demo_1",
        schemaVersion: "1.0",
        runId: "run_inv_10231",
        kind: "missing_proof",
        severity: "low",
        openedAt: DEMO_NOW,
        ownerQueue: "ops",
        suspectedImpact: "No settlement proof yet",
        closureRequirements: ["wait_finality", "refresh_proof"]
      }
    ],
    summary: { open: 1, closed: 0 },
    mode: "demo-fallback"
  };
}

export function buildDemoEvents(attemptId: string): EventEnvelope[] {
  return [
    {
      eventId: `${attemptId}:1`,
      eventType: "run.started",
      eventVersion: "2.0",
      occurredAt: DEMO_NOW,
      environment: "sandbox",
      runId: `run_${attemptId}`,
      actorKind: "agent",
      sourceKind: "control_plane",
      correlationIds: { invoiceId: "inv_10231", attemptId },
      sequenceNo: 1,
      payload: { status: "accepted" }
    },
    {
      eventId: `${attemptId}:2`,
      eventType: "waiver.accepted",
      eventVersion: "2.0",
      occurredAt: DEMO_NOW,
      environment: "sandbox",
      runId: `run_${attemptId}`,
      actorKind: "executor",
      sourceKind: "stable_rail",
      correlationIds: { invoiceId: "inv_10231", attemptId },
      sequenceNo: 2,
      payload: { reservation: "confirmed" }
    }
  ];
}
