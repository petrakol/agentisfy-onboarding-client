import type {
  AgentPaymentManifest,
  ProofValidationError,
  ProofVerificationResult,
  SettlementProof
} from "./types";
import { normalizeHash } from "./contracts";

const REQUIRED_STRING_FIELDS: Array<keyof SettlementProof> = [
  "proofId",
  "runId",
  "manifestHash",
  "grantRef",
  "attemptRef",
  "txHash",
  "verifiedFinalAt",
  "issuedAt"
];

const REQUIRED_NUMBER_FIELDS: Array<keyof SettlementProof> = ["chainId", "blockNumber"];
const ALLOWED_ROUTE_VALUES: SettlementProof["route"][] = ["waiver", "fallback", "manual"];
const ALLOWED_RECEIPT_VALUES: SettlementProof["receiptStatus"][] = ["success", "reverted", "unknown"];
const ALLOWED_ENVIRONMENTS: SettlementProof["environment"][] = ["sandbox", "testnet", "mainnet"];

function pushError(errors: ProofValidationError[], code: ProofValidationError["code"], path: string, message: string) {
  errors.push({ code, path, message });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const serialized = JSON.stringify(value);
    return serialized ?? "null";
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item ?? null)).join(",")}]`;
  }

  const objectValue = value as Record<string, unknown>;
  const keys = Object.keys(objectValue)
    .filter((key) => objectValue[key] !== undefined)
    .sort();
  const pairs = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(objectValue[key])}`);
  return `{${pairs.join(",")}}`;
}

export async function computeManifestHash(manifest: AgentPaymentManifest): Promise<string> {
  const canonical = stableStringify(manifest);
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `sha256:${hex}`;
}


function isIsoDateTime(value: string): boolean {
  const epoch = Date.parse(value);
  return Number.isFinite(epoch);
}

export async function verifySettlementProof(proof: unknown, manifest: AgentPaymentManifest): Promise<ProofVerificationResult> {
  const errors: ProofValidationError[] = [];

  if (!isRecord(proof)) {
    return {
      ok: false,
      errors: [{ code: "PROOF_NOT_OBJECT", path: "$", message: "Settlement proof must be an object." }]
    };
  }

  for (const field of REQUIRED_STRING_FIELDS) {
    const value = proof[field];
    if (typeof value !== "string" || !value.trim()) {
      pushError(errors, "MISSING_REQUIRED_FIELD", `$.${String(field)}`, `Field \"${String(field)}\" is required and must be a non-empty string.`);
    }
  }

  for (const field of REQUIRED_NUMBER_FIELDS) {
    const value = proof[field];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      pushError(errors, "INVALID_FIELD_TYPE", `$.${String(field)}`, `Field \"${String(field)}\" is required and must be a non-negative number.`);
    }
  }

  if (proof.schemaVersion !== "1.0") {
    pushError(errors, "INVALID_FIELD_VALUE", "$.schemaVersion", "Field \"schemaVersion\" must equal \"1.0\".");
  }

  if (proof.runVersion !== "1.0") {
    pushError(errors, "INVALID_FIELD_VALUE", "$.runVersion", "Field \"runVersion\" must equal \"1.0\".");
  }

  if (!ALLOWED_ROUTE_VALUES.includes(proof.route as SettlementProof["route"])) {
    pushError(errors, "INVALID_FIELD_VALUE", "$.route", `Field \"route\" must be one of: ${ALLOWED_ROUTE_VALUES.join(", ")}.`);
  }

  if (!ALLOWED_RECEIPT_VALUES.includes(proof.receiptStatus as SettlementProof["receiptStatus"])) {
    pushError(errors, "INVALID_FIELD_VALUE", "$.receiptStatus", `Field \"receiptStatus\" must be one of: ${ALLOWED_RECEIPT_VALUES.join(", ")}.`);
  }

  if (!ALLOWED_ENVIRONMENTS.includes(proof.environment as SettlementProof["environment"])) {
    pushError(errors, "INVALID_FIELD_VALUE", "$.environment", `Field \"environment\" must be one of: ${ALLOWED_ENVIRONMENTS.join(", ")}.`);
  }

  if (typeof proof.verifiedFinalAt === "string" && !isIsoDateTime(proof.verifiedFinalAt)) {
    pushError(errors, "INVALID_FIELD_VALUE", "$.verifiedFinalAt", "Field \"verifiedFinalAt\" must be a valid ISO-8601 date-time.");
  }

  if (typeof proof.issuedAt === "string" && !isIsoDateTime(proof.issuedAt)) {
    pushError(errors, "INVALID_FIELD_VALUE", "$.issuedAt", "Field \"issuedAt\" must be a valid ISO-8601 date-time.");
  }

  if (typeof proof.logRefs !== "object" || !Array.isArray(proof.logRefs) || proof.logRefs.length === 0 || proof.logRefs.some((item) => typeof item !== "string" || !item.trim())) {
    pushError(errors, "INVALID_EVIDENCE_STRUCTURE", "$.logRefs", "Field \"logRefs\" must be a non-empty string array to describe verifiable settlement evidence.");
  }

  const expectedHash = await computeManifestHash(manifest);
  const receivedHash = typeof proof.manifestHash === "string" ? normalizeHash(proof.manifestHash) : "";
  if (!receivedHash || receivedHash !== normalizeHash(expectedHash)) {
    pushError(
      errors,
      "MANIFEST_HASH_MISMATCH",
      "$.manifestHash",
      `Proof manifestHash does not match the provided manifest. expected=${expectedHash}, actual=${String(proof.manifestHash ?? "")}`
    );
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true };
}
