export type Environment = "sandbox" | "testnet" | "mainnet";

export type AgentPaymentManifest = {
  manifestId: string;
  schemaVersion: "1.0";
  manifestHash: string;
  origin: "checkout" | "api" | "agent" | "replay";
  invoiceRef: string;
  merchantRef: string;
  payer: { accountRef: string; chainId?: number };
  payee: { accountRef: string; chainId?: number };
  asset: { symbol: string; tokenAddress: string; chainId: number };
  amount: { atomic: string; decimals: number };
  target: string;
  selector: string;
  calldataHash: string;
  idempotencyKey: string;
  expiresAt: string;
  fallbackPolicy: { mode: "waiver" | "fallback" | "manual"; maxAttempts: number };
  proofRequirement: { requireProof: boolean; maxFinalityBlocks?: number };
  metadata: Record<string, unknown>;
};

export type PolicyGrant = {
  grantId: string;
  grantVersion: "1.0";
  principalType: "merchant" | "organization" | "user" | "system";
  principalId: string;
  delegateType: "agent" | "operator" | "service";
  delegateId: string;
  environment: Environment;
  merchantScope: string[];
  payeeScope: string[];
  targetScope: string[];
  selectorScope: string[];
  asset: { symbol: string; tokenAddress: string; chainId: number };
  maxAmount: { atomic: string };
  notBefore: string;
  notAfter: string;
  approvalState: "draft" | "published" | "archived";
  revocationState: "active" | "revoked";
  riskTier: "low" | "medium" | "high";
};

export type SimulationResponse = {
  policy: { decision: "allow" | "deny" | "review"; reasonCodes: string[] };
  capability: { maxAtomic: string; expiry: string; idempotencyScope: string };
  predictedPath: "waiver" | "fallback" | "blocked" | "ambiguous";
  budget: { requestedAtomic: string; remainingAtomic: string };
};

export type ExecuteResponse = {
  attemptId: string;
  status: "accepted" | "replayed" | "failed" | "ambiguous" | "settled";
  capability: { mode: "gateway" | "demo-fallback" };
  policy?: { decision: "allow" | "deny" | "review"; reasonCodes?: string[] };
  budget?: { requestedAtomic?: string; remainingAtomic?: string };
  reservation?: { status: string; holdAtomic: string };
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
  environment: Environment;
};

export type DiscrepancyRecord = {
  discrepancyId: string;
  schemaVersion: "1.0";
  runId: string;
  kind: "timeout" | "unknown_outcome" | "mismatch" | "duplicate_risk" | "missing_proof";
  severity: "low" | "medium" | "high" | "critical";
  openedAt: string;
  ownerQueue: "ops" | "risk" | "engineering";
  suspectedImpact: string;
  closureRequirements: string[];
  resolvedAt?: string;
};

export type DiscrepancyResponse = {
  items: DiscrepancyRecord[];
  summary: { open: number; closed: number };
  mode?: "gateway" | "demo-fallback";
};

export type EventEnvelope = {
  eventId: string;
  eventType: string;
  eventVersion: "2.0";
  occurredAt: string;
  environment: Environment;
  runId: string;
  actorKind: "agent" | "policy_engine" | "executor" | "webhook" | "operator";
  sourceKind: "control_plane" | "stable_rail" | "merchant_system" | "risk_service";
  correlationIds: { invoiceId: string; attemptId?: string; traceId?: string };
  sequenceNo: number;
  payload: Record<string, unknown>;
};

export type ApiErrorCode =
  | "NETWORK_UNREACHABLE"
  | "HTTP_ERROR"
  | "INVALID_JSON"
  | "SCHEMA_VALIDATION_FAILED"
  | "PRECONDITION_FAILED";

export class ApiError extends Error {
  code: ApiErrorCode;
  status?: number;
  method?: string;
  path?: string;
  responseBody?: string;

  constructor(params: { code: ApiErrorCode; message: string; status?: number; method?: string; path?: string; responseBody?: string }) {
    super(params.message);
    this.name = "ApiError";
    this.code = params.code;
    this.status = params.status;
    this.method = params.method;
    this.path = params.path;
    this.responseBody = params.responseBody;
  }
}

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
