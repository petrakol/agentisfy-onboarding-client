import type {
  AgentPaymentManifest,
  DiscrepancyRecord,
  DiscrepancyResponse,
  EventEnvelope,
  ExecuteResponse,
  PolicyGrant,
  SettlementProof,
  SimulationResponse
} from "./types";

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const HEX_64 = /^[a-f0-9]{64}$/i;
const ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const SELECTOR = /^0x[a-fA-F0-9]{8}$/;
const IDEMPOTENCY_KEY = /^public_client_(execute|replay)_[A-Za-z0-9_-]{4,80}_\d{10,}$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoDate(value: unknown): value is boolean {
  return isNonEmptyString(value) && Number.isFinite(Date.parse(value));
}

function isNumber(value: unknown): value is boolean {
  return typeof value === "number" && Number.isFinite(value);
}

function pushWhen(errors: string[], condition: boolean, message: string) {
  if (condition) errors.push(message);
}

function asStringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((v) => typeof v === "string") ? value : null;
}

export function validateIdempotencyKey(value: unknown): ValidationResult<string> {
  if (!isNonEmptyString(value)) return { ok: false, errors: ["idempotency key must be a non-empty string"] };
  if (value.length < 16 || value.length > 128) return { ok: false, errors: ["idempotency key length must be between 16 and 128"] };
  if (!IDEMPOTENCY_KEY.test(value)) return { ok: false, errors: ["idempotency key format is invalid"] };
  return { ok: true, value };
}

export function normalizeHash(value: string): string {
  const lower = value.trim().toLowerCase();
  if (lower.startsWith("sha256:")) return lower;
  if (lower.startsWith("0x")) return `sha256:${lower.slice(2)}`;
  return `sha256:${lower}`;
}

export function validateManifest(input: unknown): ValidationResult<AgentPaymentManifest> {
  const errors: string[] = [];
  if (!isObject(input)) return { ok: false, errors: ["manifest must be an object"] };

  pushWhen(errors, input.schemaVersion !== "1.0", "manifest.schemaVersion must be 1.0");
  pushWhen(errors, !isNonEmptyString(input.manifestId), "manifest.manifestId is required");
  pushWhen(errors, !isNonEmptyString(input.invoiceRef), "manifest.invoiceRef is required");
  pushWhen(errors, !isNonEmptyString(input.merchantRef), "manifest.merchantRef is required");
  pushWhen(errors, !isNonEmptyString(input.idempotencyKey), "manifest.idempotencyKey is required");

  const idemResult = validateIdempotencyKey(input.idempotencyKey);
  if (!idemResult.ok) errors.push(...idemResult.errors.map((e) => `manifest.${e}`));

  pushWhen(errors, !isNonEmptyString(input.target) || !ADDRESS.test(String(input.target)), "manifest.target must be a valid 0x address");
  pushWhen(errors, !isNonEmptyString(input.selector) || !SELECTOR.test(String(input.selector)), "manifest.selector must be a 4-byte selector (0x########)");
  pushWhen(errors, !isNonEmptyString(input.calldataHash) || !HEX_64.test(String(input.calldataHash)), "manifest.calldataHash must be 64 hex chars");
  pushWhen(errors, !isNonEmptyString(input.manifestHash) || !HEX_64.test(String(input.manifestHash)), "manifest.manifestHash must be 64 hex chars");
  pushWhen(errors, !isIsoDate(input.expiresAt), "manifest.expiresAt must be ISO-8601");

  if (!isObject(input.payer) || !isNonEmptyString(input.payer.accountRef)) {
    errors.push("manifest.payer.accountRef is required");
  }

  if (!isObject(input.payee) || !isNonEmptyString(input.payee.accountRef)) {
    errors.push("manifest.payee.accountRef is required");
  }

  if (!isObject(input.amount)) {
    errors.push("manifest.amount must be an object");
  } else {
    pushWhen(errors, !isNonEmptyString(input.amount.atomic), "manifest.amount.atomic is required");
    pushWhen(errors, !isNumber(input.amount.decimals), "manifest.amount.decimals must be a number");
  }

  if (!isObject(input.asset)) {
    errors.push("manifest.asset must be an object");
  } else {
    pushWhen(errors, !isNonEmptyString(input.asset.symbol), "manifest.asset.symbol is required");
    pushWhen(errors, !isNonEmptyString(input.asset.tokenAddress) || !ADDRESS.test(String(input.asset.tokenAddress)), "manifest.asset.tokenAddress must be a valid 0x address");
    pushWhen(errors, !isNumber(input.asset.chainId) || Number(input.asset.chainId) < 1, "manifest.asset.chainId must be a positive number");
  }

  if (!isObject(input.fallbackPolicy)) {
    errors.push("manifest.fallbackPolicy must be an object");
  }

  if (!isObject(input.proofRequirement)) {
    errors.push("manifest.proofRequirement must be an object");
  }

  pushWhen(errors, !isObject(input.metadata), "manifest.metadata must be an object");

  return errors.length ? { ok: false, errors } : { ok: true, value: input as AgentPaymentManifest };
}

export function validateGrant(input: unknown): ValidationResult<PolicyGrant> {
  const errors: string[] = [];
  if (!isObject(input)) return { ok: false, errors: ["grant must be an object"] };

  pushWhen(errors, input.grantVersion !== "1.0", "grant.grantVersion must be 1.0");
  pushWhen(errors, !isNonEmptyString(input.grantId), "grant.grantId is required");
  pushWhen(errors, !isNonEmptyString(input.principalId), "grant.principalId is required");
  pushWhen(errors, !isNonEmptyString(input.delegateId), "grant.delegateId is required");
  pushWhen(errors, !["sandbox", "testnet", "mainnet"].includes(String(input.environment)), "grant.environment must be sandbox/testnet/mainnet");

  const targetScope = asStringArray(input.targetScope);
  const selectorScope = asStringArray(input.selectorScope);
  const payeeScope = asStringArray(input.payeeScope);
  const merchantScope = asStringArray(input.merchantScope);

  pushWhen(errors, !targetScope || targetScope.length === 0, "grant.targetScope must be a non-empty array");
  pushWhen(errors, !selectorScope || selectorScope.length === 0, "grant.selectorScope must be a non-empty array");
  pushWhen(errors, !payeeScope || payeeScope.length === 0, "grant.payeeScope must be a non-empty array");
  pushWhen(errors, !merchantScope || merchantScope.length === 0, "grant.merchantScope must be a non-empty array");

  if (targetScope) {
    targetScope.forEach((target, i) => pushWhen(errors, !ADDRESS.test(target), `grant.targetScope[${i}] must be a valid 0x address`));
  }
  if (selectorScope) {
    selectorScope.forEach((selector, i) => pushWhen(errors, !SELECTOR.test(selector), `grant.selectorScope[${i}] must be a valid selector`));
  }

  pushWhen(errors, !isIsoDate(input.notBefore), "grant.notBefore must be ISO-8601");
  pushWhen(errors, !isIsoDate(input.notAfter), "grant.notAfter must be ISO-8601");

  if (isIsoDate(input.notBefore) && isIsoDate(input.notAfter)) {
    pushWhen(errors, Date.parse(String(input.notAfter)) <= Date.parse(String(input.notBefore)), "grant.notAfter must be after grant.notBefore");
  }

  if (!isObject(input.asset)) {
    errors.push("grant.asset must be an object");
  } else {
    pushWhen(errors, !isNonEmptyString(input.asset.tokenAddress) || !ADDRESS.test(String(input.asset.tokenAddress)), "grant.asset.tokenAddress must be a valid 0x address");
    pushWhen(errors, !isNumber(input.asset.chainId) || Number(input.asset.chainId) < 1, "grant.asset.chainId must be positive");
  }

  return errors.length ? { ok: false, errors } : { ok: true, value: input as PolicyGrant };
}

export function validateSimulation(input: unknown): ValidationResult<SimulationResponse> {
  const errors: string[] = [];
  if (!isObject(input)) return { ok: false, errors: ["simulation response must be an object"] };
  pushWhen(errors, !isObject(input.policy), "simulation.policy must be an object");
  pushWhen(errors, !isObject(input.capability), "simulation.capability must be an object");
  pushWhen(errors, !isObject(input.budget), "simulation.budget must be an object");
  pushWhen(errors, !["waiver", "fallback", "blocked", "ambiguous"].includes(String(input.predictedPath)), "simulation.predictedPath is invalid");

  return errors.length ? { ok: false, errors } : { ok: true, value: input as SimulationResponse };
}

export function validateExecution(input: unknown): ValidationResult<ExecuteResponse> {
  const errors: string[] = [];
  if (!isObject(input)) return { ok: false, errors: ["execute response must be an object"] };
  pushWhen(errors, !isNonEmptyString(input.attemptId), "execution.attemptId is required");
  pushWhen(errors, !["accepted", "replayed", "failed", "ambiguous", "settled"].includes(String(input.status)), "execution.status is invalid");
  pushWhen(errors, !isObject(input.capability), "execution.capability must be an object");
  return errors.length ? { ok: false, errors } : { ok: true, value: input as ExecuteResponse };
}

export function validateSettlementProof(input: unknown): ValidationResult<SettlementProof> {
  const errors: string[] = [];
  if (!isObject(input)) return { ok: false, errors: ["proof must be an object"] };

  pushWhen(errors, input.schemaVersion !== "1.0", "proof.schemaVersion must be 1.0");
  pushWhen(errors, input.runVersion !== "1.0", "proof.runVersion must be 1.0");
  pushWhen(errors, !isNonEmptyString(input.proofId), "proof.proofId is required");
  pushWhen(errors, !isNonEmptyString(input.manifestHash) || !/^((sha256:)?[a-f0-9]{64}|0x[a-f0-9]{64})$/i.test(String(input.manifestHash)), "proof.manifestHash must be 64 hex (or sha256: / 0x prefixed)");
  pushWhen(errors, !isNonEmptyString(input.attemptRef), "proof.attemptRef is required");
  pushWhen(errors, !isNonEmptyString(input.txHash), "proof.txHash is required");
  pushWhen(errors, !isNumber(input.chainId), "proof.chainId must be a number");
  pushWhen(errors, !isNumber(input.blockNumber), "proof.blockNumber must be a number");
  pushWhen(errors, !["waiver", "fallback", "manual"].includes(String(input.route)), "proof.route is invalid");
  pushWhen(errors, !["success", "reverted", "unknown"].includes(String(input.receiptStatus)), "proof.receiptStatus is invalid");
  pushWhen(errors, !["sandbox", "testnet", "mainnet"].includes(String(input.environment)), "proof.environment is invalid");

  const logRefs = asStringArray(input.logRefs);
  pushWhen(errors, !logRefs || logRefs.length === 0, "proof.logRefs must be a non-empty string array");
  pushWhen(errors, !isIsoDate(input.verifiedFinalAt), "proof.verifiedFinalAt must be ISO-8601");
  pushWhen(errors, !isIsoDate(input.issuedAt), "proof.issuedAt must be ISO-8601");

  return errors.length ? { ok: false, errors } : { ok: true, value: input as SettlementProof };
}

function validateDiscrepancyRecord(input: unknown): ValidationResult<DiscrepancyRecord> {
  const errors: string[] = [];
  if (!isObject(input)) return { ok: false, errors: ["discrepancy record must be an object"] };
  pushWhen(errors, input.schemaVersion !== "1.0", "discrepancy.schemaVersion must be 1.0");
  pushWhen(errors, !isNonEmptyString(input.discrepancyId), "discrepancy.discrepancyId is required");
  pushWhen(errors, !["timeout", "unknown_outcome", "mismatch", "duplicate_risk", "missing_proof"].includes(String(input.kind)), "discrepancy.kind is invalid");
  pushWhen(errors, !["low", "medium", "high", "critical"].includes(String(input.severity)), "discrepancy.severity is invalid");
  pushWhen(errors, !isIsoDate(input.openedAt), "discrepancy.openedAt must be ISO-8601");
  return errors.length ? { ok: false, errors } : { ok: true, value: input as DiscrepancyRecord };
}

export function validateDiscrepancies(input: unknown): ValidationResult<DiscrepancyResponse> {
  const errors: string[] = [];
  if (!isObject(input)) return { ok: false, errors: ["discrepancy response must be an object"] };
  if (!Array.isArray(input.items)) {
    errors.push("discrepancies.items must be an array");
  } else {
    input.items.forEach((item, index) => {
      const result = validateDiscrepancyRecord(item);
      if (!result.ok) errors.push(...result.errors.map((error) => `items[${index}]: ${error}`));
    });
  }

  if (!isObject(input.summary) || !isNumber(input.summary.open) || !isNumber(input.summary.closed)) {
    errors.push("discrepancies.summary must include numeric open/closed");
  }

  return errors.length ? { ok: false, errors } : { ok: true, value: input as DiscrepancyResponse };
}

export function validateEventEnvelope(input: unknown): ValidationResult<EventEnvelope> {
  const errors: string[] = [];
  if (!isObject(input)) return { ok: false, errors: ["event must be an object"] };
  pushWhen(errors, input.eventVersion !== "2.0", "event.eventVersion must be 2.0");
  pushWhen(errors, !isNonEmptyString(input.eventId), "event.eventId is required");
  pushWhen(errors, !isNonEmptyString(input.eventType), "event.eventType is required");
  pushWhen(errors, !isIsoDate(input.occurredAt), "event.occurredAt must be ISO-8601");
  pushWhen(errors, !isNumber(input.sequenceNo) || Number(input.sequenceNo) < 1, "event.sequenceNo must be a positive number");
  pushWhen(errors, !["sandbox", "testnet", "mainnet"].includes(String(input.environment)), "event.environment is invalid");
  pushWhen(errors, !isNonEmptyString(input.runId), "event.runId is required");
  pushWhen(errors, !isObject(input.correlationIds) || !isNonEmptyString(input.correlationIds.invoiceId), "event.correlationIds.invoiceId is required");
  pushWhen(errors, !isObject(input.payload), "event.payload must be an object");

  return errors.length ? { ok: false, errors } : { ok: true, value: input as EventEnvelope };
}
