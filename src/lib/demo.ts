import type { AgentPaymentManifest, DiscrepancyResponse, EventEnvelope, ExecuteResponse, SettlementProof, SimulationResponse } from "./types";

export const demoGrant = {
  grantId: "grant_demo_public_1",
  grantVersion: "1.0",
  principalType: "merchant",
  principalId: "merchant_demo_public",
  delegateType: "agent",
  delegateId: "agent_demo_public",
  environment: "sandbox",
  merchantScope: ["merchant_demo_public"],
  payeeScope: ["*"],
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
} as const;

export function buildDemoManifest(invoiceId: string): AgentPaymentManifest {
  return {
    invoiceId,
    amount: { atomic: "2500000", symbol: "USDT0", decimals: 6 },
    payee: "merchant_demo_public",
    chainId: 988,
    target: "0x000000000000000000000000000000000000f333",
    selector: "0xa9059cbb",
    createdAt: new Date().toISOString(),
    mode: "demo-fallback"
  };
}

export function buildDemoSimulation(invoiceId: string): SimulationResponse {
  return {
    predictedPath: "waiver",
    policy: { decision: "allow", reason: "Demo fallback mode" },
    capability: { maxAtomic: "100000000", invoiceId },
    budget: { remainingAtomic: "97500000" }
  };
}

export function buildDemoExecution(invoiceId: string): ExecuteResponse {
  return {
    attemptId: `demo_attempt_${invoiceId}_${Date.now()}`,
    status: "accepted",
    policy: { decision: "allow" },
    capability: { mode: "demo-fallback" },
    reservation: { status: "reserved", holdAtomic: "2500000" }
  };
}

export function buildDemoProof(invoiceId: string, attemptId?: string): SettlementProof {
  return {
    invoiceId,
    attemptId: attemptId ?? `demo_attempt_${invoiceId}`,
    settlementState: "settled",
    txHash: "0xd3m0f411b4ck0000000000000000000000000000000000000000000000000001",
    settledAt: new Date().toISOString(),
    mode: "demo-fallback"
  };
}

export function buildDemoDiscrepancies(): DiscrepancyResponse {
  return {
    items: [],
    summary: { open: 0, closed: 0 },
    mode: "demo-fallback"
  };
}

export function buildDemoEvents(attemptId: string): EventEnvelope[] {
  return [
    { type: "execution.accepted", attemptId, at: new Date().toISOString(), mode: "demo-fallback" },
    { type: "reservation.confirmed", attemptId, at: new Date().toISOString(), mode: "demo-fallback" },
    { type: "settlement.completed", attemptId, at: new Date().toISOString(), mode: "demo-fallback" }
  ];
}
