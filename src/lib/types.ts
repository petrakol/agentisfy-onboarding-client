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

export type SettlementProof = {
  proofId: string;
  schemaVersion: "1.0";
  runId: string;
  runVersion: "1.0";
  manifestHash: string;
  grantRef: string;
  route: "waiver" | "fallback" | "manual";
  attemptRef: string;
  txHash: string;
  chainId: number;
  blockNumber: number;
  receiptStatus: "success" | "reverted" | "unknown";
  logRefs: string[];
  verifiedFinalAt: string;
  issuedAt: string;
  environment: "sandbox" | "testnet" | "mainnet";
  [key: string]: unknown;
};

export type DiscrepancyResponse = Record<string, unknown>;
export type EventEnvelope = Record<string, unknown>;

export type ProofValidationErrorCode =
  | "PROOF_NOT_OBJECT"
  | "MISSING_REQUIRED_FIELD"
  | "INVALID_FIELD_TYPE"
  | "INVALID_FIELD_VALUE"
  | "INVALID_EVIDENCE_STRUCTURE"
  | "MANIFEST_HASH_MISMATCH";

export type ProofValidationError = {
  code: ProofValidationErrorCode;
  path: string;
  message: string;
};

export type ProofVerificationResult =
  | { ok: true }
  | { ok: false; errors: ProofValidationError[] };
