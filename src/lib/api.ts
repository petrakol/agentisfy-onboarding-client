import { buildDemoDiscrepancies, buildDemoEvents, buildDemoExecution, buildDemoManifest, buildDemoProof, buildDemoSimulation } from "./demo";
import type { AgentPaymentManifest, PolicyGrant, SimulationResponse, ExecuteResponse, SettlementProof, DiscrepancyResponse, EventEnvelope } from "./types";

const baseUrl = (import.meta.env.VITE_AGENTISFY_GATEWAY_BASE_URL as string | undefined) ?? "http://localhost:4010";
const autoDemoFallback = ((import.meta.env.VITE_AGENTISFY_AUTO_DEMO_FALLBACK as string | undefined) ?? "true") !== "false";
let transportMode: "gateway" | "demo-fallback" = "gateway";

function isNetworkError(error: unknown) {
  const message = String(error);
  return message.includes("Failed to fetch") || message.includes("NetworkError") || message.includes("ERR_CONNECTION_REFUSED");
}

function toFriendlyGatewayError(error: unknown) {
  if (!isNetworkError(error)) return error;
  return new Error(`Gateway unreachable at ${baseUrl}. Start the private gateway or set VITE_AGENTISFY_GATEWAY_BASE_URL to a reachable URL. Demo fallback is ${autoDemoFallback ? "enabled" : "disabled"}.`);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
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
    throw toFriendlyGatewayError(error);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }

  transportMode = "gateway";
  return response.json() as Promise<T>;
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

export function getBaseUrl() {
  return baseUrl;
}

export function getTransportMode() {
  return transportMode;
}

export function isAutoDemoFallbackEnabled() {
  return autoDemoFallback;
}

export async function fetchManifest(invoiceId: string): Promise<AgentPaymentManifest> {
  return withDemoFallback(
    () => request<AgentPaymentManifest>(`/v1/agent/manifest/${encodeURIComponent(invoiceId)}`),
    () => buildDemoManifest(invoiceId)
  );
}

export async function simulate(manifest: AgentPaymentManifest, grant: PolicyGrant): Promise<SimulationResponse> {
  const invoiceId = String(manifest.invoiceId ?? "inv_demo");
  return withDemoFallback(
    () => request<SimulationResponse>(`/v1/agent/simulate`, {
      method: "POST",
      body: JSON.stringify({ manifest, grant })
    }),
    () => buildDemoSimulation(invoiceId)
  );
}

export async function execute(manifest: AgentPaymentManifest, grant: PolicyGrant, preflightToken: string, idempotencyKey: string): Promise<ExecuteResponse> {
  const invoiceId = String(manifest.invoiceId ?? "inv_demo");
  return withDemoFallback(
    () => request<ExecuteResponse>(`/v1/agent/execute`, {
      method: "POST",
      headers: { "idempotency-key": idempotencyKey },
      body: JSON.stringify({ manifest, grant, preflightToken, idempotencyKey })
    }),
    () => buildDemoExecution(invoiceId)
  );
}

export async function replayAttempt(attemptId: string, idempotencyKey: string): Promise<ExecuteResponse> {
  return withDemoFallback(
    () => request<ExecuteResponse>(`/v1/agent/attempts/${encodeURIComponent(attemptId)}/replay`, {
      method: "POST",
      headers: { "idempotency-key": idempotencyKey }
    }),
    () => ({ attemptId, status: "replayed", capability: { mode: "demo-fallback" } })
  );
}

export async function fetchProof(invoiceId: string, attemptId?: string): Promise<SettlementProof> {
  const suffix = attemptId ? `?attemptId=${encodeURIComponent(attemptId)}` : "";
  return withDemoFallback(
    () => request<SettlementProof>(`/v1/agent/proof/${encodeURIComponent(invoiceId)}${suffix}`),
    () => buildDemoProof(invoiceId, attemptId)
  );
}

export async function fetchDiscrepancies(): Promise<DiscrepancyResponse> {
  return withDemoFallback(
    () => request<DiscrepancyResponse>(`/v1/agent/discrepancies`),
    () => buildDemoDiscrepancies()
  );
}

export function openEventStream(attemptId: string | null, onEvent: (event: EventEnvelope) => void) {
  if (transportMode === "demo-fallback") {
    const id = attemptId ?? `demo_attempt_${Date.now()}`;
    const timer = setInterval(() => {
      for (const event of buildDemoEvents(id)) onEvent(event);
      clearInterval(timer);
    }, 200);
    return { close: () => clearInterval(timer) } as Pick<EventSource, "close">;
  }

  const query = attemptId ? `?attemptId=${encodeURIComponent(attemptId)}` : "";
  const stream = new EventSource(`${baseUrl.replace(/\/+$/, "")}/v1/agent/events${query}`);
  stream.onmessage = (message) => {
    try {
      onEvent(JSON.parse(message.data) as EventEnvelope);
    } catch {
      // ignore malformed event frames in demo mode
    }
  };
  return stream;
}
