import {
  buildDemoDiscrepancies,
  buildDemoEvents,
  buildDemoExecution,
  buildDemoManifest,
  buildDemoProof,
  buildDemoSimulation
} from "./demo";
import {
  validateDiscrepancies,
  validateEventEnvelope,
  validateExecution,
  validateGrant,
  validateIdempotencyKey,
  validateManifest,
  validateSettlementProof,
  validateSimulation
} from "./contracts";
import type {
  AgentPaymentManifest,
  DiscrepancyResponse,
  EventEnvelope,
  ExecuteResponse,
  PolicyGrant,
  SettlementProof,
  SimulationResponse
} from "./types";
import { ApiError } from "./types";

const runtimeEnv = ((globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}) as Record<string, string | undefined>;
const env = { ...runtimeEnv, ...((import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? {}) };
const baseUrl = env.VITE_AGENTISFY_GATEWAY_BASE_URL ?? "http://localhost:4010";
const autoDemoFallback = (env.VITE_AGENTISFY_AUTO_DEMO_FALLBACK ?? "true") !== "false" || env.AGENTISFY_FORCE_DEMO_FALLBACK === "true";
let transportMode: "gateway" | "demo-fallback" = "gateway";

function isNetworkError(error: unknown) {
  if (error instanceof ApiError && error.code === "NETWORK_UNREACHABLE") return true;
  const message = String(error);
  return message.includes("Failed to fetch") || message.includes("fetch failed") || message.includes("NetworkError") || message.includes("ERR_CONNECTION_REFUSED") || message.includes("ECONNREFUSED");
}

function toFriendlyGatewayError(error: unknown, method: string, path: string) {
  if (!isNetworkError(error)) return error;
  return new ApiError({
    code: "NETWORK_UNREACHABLE",
    message: `Gateway unreachable at ${baseUrl}. Start the private gateway or set VITE_AGENTISFY_GATEWAY_BASE_URL to a reachable URL. Demo fallback is ${autoDemoFallback ? "enabled" : "disabled"}.`,
    method,
    path
  });
}

function assertValidation<T>(
  result: { ok: true; value: T } | { ok: false; errors: string[] },
  subject: string,
  method: string,
  path: string
): T {
  if (result.ok) return result.value;
  throw new ApiError({
    code: "SCHEMA_VALIDATION_FAILED",
    message: `${subject} validation failed: ${result.errors.join("; ")}`,
    method,
    path
  });
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = init?.method ?? "GET";
  let response: Response;
  try {
    response = await fetch(`${baseUrl.replace(/\/+$/, "")}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(init?.headers ?? {})
      }
    });
  } catch (error) {
    throw toFriendlyGatewayError(error, method, path);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new ApiError({
      code: "HTTP_ERROR",
      message: text || `Request failed: ${response.status}`,
      status: response.status,
      method,
      path,
      responseBody: text
    });
  }

  const text = await response.text();
  try {
    transportMode = "gateway";
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError({
      code: "INVALID_JSON",
      message: `Gateway returned non-JSON payload for ${method} ${path}.`,
      method,
      path,
      responseBody: text
    });
  }
}

async function withDemoFallback<T>(operation: () => Promise<T>, fallback: () => T | Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!autoDemoFallback || !isNetworkError(error)) throw error;
    transportMode = "demo-fallback";
    return await fallback();
  }
}

export function createIdempotencyKey(prefix: "execute" | "replay", invoiceOrAttemptRef: string) {
  const seed = invoiceOrAttemptRef.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48);
  return `public_client_${prefix}_${seed}_${Date.now()}`;
}

export function getBaseUrl() {
  return baseUrl;
}

export function getTransportMode() {
  return transportMode;
}

export function isAutoDemoFallbackEnabled() {
  return autoDemoFallback;
}

export function formatApiError(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "NETWORK_UNREACHABLE":
        return "Gateway unreachable. Check gateway URL or use demo fallback.";
      case "PRECONDITION_FAILED":
        return `Precondition failed: ${error.message}`;
      case "SCHEMA_VALIDATION_FAILED":
        return `Contract validation failed: ${error.message}`;
      case "HTTP_ERROR":
        return `Gateway HTTP error${error.status ? ` (${error.status})` : ""}: ${error.message}`;
      default:
        return error.message;
    }
  }
  return String(error);
}

export async function fetchManifest(invoiceId: string): Promise<AgentPaymentManifest> {
  return withDemoFallback(
    async () => assertValidation(validateManifest(await request<unknown>(`/v1/agent/manifest/${encodeURIComponent(invoiceId)}`)), "manifest", "GET", "/v1/agent/manifest/:invoiceId"),
    () => assertValidation(validateManifest(buildDemoManifest(invoiceId)), "manifest", "GET", "demo")
  );
}

export async function simulate(manifest: AgentPaymentManifest, grant: PolicyGrant): Promise<SimulationResponse> {
  assertValidation(validateManifest(manifest), "manifest", "POST", "/v1/agent/simulate");
  assertValidation(validateGrant(grant), "grant", "POST", "/v1/agent/simulate");

  const invoiceId = String(manifest.invoiceRef ?? "inv_demo");
  return withDemoFallback(
    async () => assertValidation(validateSimulation(await request<unknown>(`/v1/agent/simulate`, {
      method: "POST",
      body: JSON.stringify({ manifest, grant })
    })), "simulation response", "POST", "/v1/agent/simulate"),
    () => assertValidation(validateSimulation(buildDemoSimulation(invoiceId)), "simulation response", "POST", "demo")
  );
}

export async function execute(manifest: AgentPaymentManifest, grant: PolicyGrant, preflightToken: string, idempotencyKey: string): Promise<ExecuteResponse> {
  assertValidation(validateManifest(manifest), "manifest", "POST", "/v1/agent/execute");
  assertValidation(validateGrant(grant), "grant", "POST", "/v1/agent/execute");
  const trimmedToken = preflightToken.trim();
  if (!trimmedToken) throw new ApiError({ code: "PRECONDITION_FAILED", message: "preflight token is required", method: "POST", path: "/v1/agent/execute" });
  if (trimmedToken.includes("replace-with-preflight-token") || trimmedToken.includes("demo")) {
    throw new ApiError({ code: "PRECONDITION_FAILED", message: "preflight token must be issued by private gateway; public client cannot mint tokens.", method: "POST", path: "/v1/agent/execute" });
  }

  const idempotencyResult = validateIdempotencyKey(idempotencyKey);
  if (!idempotencyResult.ok) {
    throw new ApiError({ code: "PRECONDITION_FAILED", message: `invalid idempotency key: ${idempotencyResult.errors.join("; ")}`, method: "POST", path: "/v1/agent/execute" });
  }

  const invoiceId = String(manifest.invoiceRef ?? "inv_demo");
  return withDemoFallback(
    async () => assertValidation(validateExecution(await request<unknown>(`/v1/agent/execute`, {
      method: "POST",
      headers: { "idempotency-key": idempotencyKey },
      body: JSON.stringify({ manifest, grant, preflightToken: trimmedToken, idempotencyKey })
    })), "execute response", "POST", "/v1/agent/execute"),
    () => assertValidation(validateExecution(buildDemoExecution(invoiceId)), "execute response", "POST", "demo")
  );
}

export async function replayAttempt(attemptId: string, idempotencyKey: string, priorStatus?: string): Promise<ExecuteResponse> {
  if (!attemptId.trim()) throw new ApiError({ code: "PRECONDITION_FAILED", message: "attemptId is required", method: "POST", path: "/v1/agent/attempts/:attemptId/replay" });
  const idempotencyResult = validateIdempotencyKey(idempotencyKey);
  if (!idempotencyResult.ok) throw new ApiError({ code: "PRECONDITION_FAILED", message: `invalid idempotency key: ${idempotencyResult.errors.join("; ")}`, method: "POST", path: "/v1/agent/attempts/:attemptId/replay" });
  if (priorStatus && !["failed", "ambiguous"].includes(priorStatus)) {
    throw new ApiError({ code: "PRECONDITION_FAILED", message: `replay is only allowed for failed/ambiguous attempts (current: ${priorStatus})`, method: "POST", path: "/v1/agent/attempts/:attemptId/replay" });
  }
  return withDemoFallback(
    async () => assertValidation(validateExecution(await request<unknown>(`/v1/agent/attempts/${encodeURIComponent(attemptId)}/replay`, {
      method: "POST",
      headers: { "idempotency-key": idempotencyKey }
    })), "replay response", "POST", "/v1/agent/attempts/:attemptId/replay"),
    () => ({ attemptId, status: "replayed", capability: { mode: "demo-fallback" } })
  );
}

export async function fetchProof(invoiceId: string, attemptId?: string): Promise<SettlementProof> {
  const suffix = attemptId ? `?attemptId=${encodeURIComponent(attemptId)}` : "";
  return withDemoFallback(
    async () => assertValidation(validateSettlementProof(await request<unknown>(`/v1/agent/proof/${encodeURIComponent(invoiceId)}${suffix}`)), "proof", "GET", "/v1/agent/proof/:invoiceId"),
    async () => assertValidation(validateSettlementProof(await buildDemoProof(invoiceId, attemptId)), "proof", "GET", "demo")
  );
}

export async function fetchDiscrepancies(filters?: { invoiceId?: string; attemptId?: string; severity?: string }): Promise<DiscrepancyResponse> {
  const params = new URLSearchParams();
  if (filters?.invoiceId) params.set("invoiceId", filters.invoiceId);
  if (filters?.attemptId) params.set("attemptId", filters.attemptId);
  if (filters?.severity) params.set("severity", filters.severity);
  const query = params.toString() ? `?${params.toString()}` : "";

  return withDemoFallback(
    async () => assertValidation(validateDiscrepancies(await request<unknown>(`/v1/agent/discrepancies${query}`)), "discrepancies", "GET", "/v1/agent/discrepancies"),
    () => assertValidation(validateDiscrepancies(buildDemoDiscrepancies()), "discrepancies", "GET", "demo")
  );
}

export function openEventStream(attemptId: string | null, onEvent: (event: EventEnvelope) => void, onError?: (error: ApiError) => void, cursor?: number) {
  if (transportMode === "demo-fallback") {
    const id = attemptId ?? `demo_attempt_${Date.now()}`;
    const timer = setInterval(() => {
      for (const event of buildDemoEvents(id)) {
        if (typeof cursor === "number" && event.sequenceNo <= cursor) continue;
        const result = validateEventEnvelope(event);
        if (result.ok) onEvent(result.value);
      }
      clearInterval(timer);
    }, 200);
    return { close: () => clearInterval(timer) } as Pick<EventSource, "close">;
  }

  let closed = false;
  let reconnectTimer: number | null = null;
  let lastSequence = typeof cursor === "number" ? cursor : 0;
  const pending = new Map<number, EventEnvelope>();
  let backoffMs = 500;
  let source: EventSource | null = null;

  const connect = () => {
    if (closed) return;
    const params = new URLSearchParams();
    if (attemptId) params.set("attemptId", attemptId);
    if (lastSequence > 0) params.set("cursor", String(lastSequence));
    const query = params.toString() ? `?${params.toString()}` : "";
    source = new EventSource(`${baseUrl.replace(/\/+$/, "")}/v1/agent/events${query}`);
    source.onmessage = (message) => {
      try {
        const parsed = JSON.parse(message.data) as unknown;
        const result = validateEventEnvelope(parsed);
        if (!result.ok) {
          onError?.(new ApiError({ code: "SCHEMA_VALIDATION_FAILED", message: result.errors.join("; "), method: "GET", path: "/v1/agent/events" }));
          return;
        }
        const event = result.value;
        if (event.sequenceNo <= lastSequence) return;
        pending.set(event.sequenceNo, event);

        while (pending.has(lastSequence + 1)) {
          const next = pending.get(lastSequence + 1);
          if (!next) break;
          pending.delete(lastSequence + 1);
          lastSequence = next.sequenceNo;
          onEvent(next);
        }

        if (pending.size > 0 && !pending.has(lastSequence + 1)) {
          onError?.(new ApiError({ code: "SCHEMA_VALIDATION_FAILED", message: `Event sequence gap detected after ${lastSequence}.`, method: "GET", path: "/v1/agent/events" }));
        }
      } catch {
        onError?.(new ApiError({ code: "INVALID_JSON", message: "Malformed SSE frame", method: "GET", path: "/v1/agent/events" }));
      }
    };

    source.onerror = () => {
      source?.close();
      if (closed) return;
      reconnectTimer = window.setTimeout(() => {
        backoffMs = Math.min(backoffMs * 2, 5_000);
        connect();
      }, backoffMs);
    };
  };

  connect();

  return {
    close: () => {
      closed = true;
      source?.close();
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
    }
  } as Pick<EventSource, "close">;
}
