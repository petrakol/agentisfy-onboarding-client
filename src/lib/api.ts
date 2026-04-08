import type { AgentPaymentManifest, PolicyGrant, SimulationResponse, ExecuteResponse, SettlementProof, DiscrepancyResponse, EventEnvelope } from "./types";

const baseUrl = (import.meta.env.VITE_AGENTISFY_GATEWAY_BASE_URL as string | undefined) ?? "http://localhost:4010";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function getBaseUrl() {
  return baseUrl;
}

export async function fetchManifest(invoiceId: string): Promise<AgentPaymentManifest> {
  return request<AgentPaymentManifest>(`/v1/agent/manifest/${encodeURIComponent(invoiceId)}`);
}

export async function simulate(manifest: AgentPaymentManifest, grant: PolicyGrant): Promise<SimulationResponse> {
  return request<SimulationResponse>(`/v1/agent/simulate`, {
    method: "POST",
    body: JSON.stringify({ manifest, grant })
  });
}

export async function execute(manifest: AgentPaymentManifest, grant: PolicyGrant, preflightToken: string, idempotencyKey: string): Promise<ExecuteResponse> {
  return request<ExecuteResponse>(`/v1/agent/execute`, {
    method: "POST",
    headers: { "idempotency-key": idempotencyKey },
    body: JSON.stringify({ manifest, grant, preflightToken, idempotencyKey })
  });
}

export async function replayAttempt(attemptId: string, idempotencyKey: string): Promise<ExecuteResponse> {
  return request<ExecuteResponse>(`/v1/agent/attempts/${encodeURIComponent(attemptId)}/replay`, {
    method: "POST",
    headers: { "idempotency-key": idempotencyKey }
  });
}

export async function fetchProof(invoiceId: string, attemptId?: string): Promise<SettlementProof> {
  const suffix = attemptId ? `?attemptId=${encodeURIComponent(attemptId)}` : "";
  return request<SettlementProof>(`/v1/agent/proof/${encodeURIComponent(invoiceId)}${suffix}`);
}

export async function fetchDiscrepancies(): Promise<DiscrepancyResponse> {
  return request<DiscrepancyResponse>(`/v1/agent/discrepancies`);
}

export function openEventStream(attemptId: string | null, onEvent: (event: EventEnvelope) => void) {
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
