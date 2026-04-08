export type AgentPaymentManifest = Record<string, unknown>;
export type PolicyGrant = Record<string, unknown>;
export type SimulationResponse = {
  policy?: unknown;
  capability?: unknown;
  predictedPath?: "waiver" | "fallback" | "blocked" | "ambiguous";
  budget?: unknown;
};
export type ExecuteResponse = {
  attemptId?: string;
  status?: string;
  capability?: unknown;
  policy?: unknown;
  budget?: unknown;
  reservation?: unknown;
  error?: { code?: string; message?: string };
};
export type SettlementProof = Record<string, unknown>;
export type DiscrepancyResponse = Record<string, unknown>;
export type EventEnvelope = Record<string, unknown>;
