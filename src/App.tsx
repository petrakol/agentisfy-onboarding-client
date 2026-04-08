import { useEffect, useMemo, useRef, useState } from "react";
import { demoGrant } from "./lib/demo";
import { createIdempotencyKey, execute, fetchDiscrepancies, fetchManifest, fetchProof, formatApiError, getBaseUrl, getTransportMode, isAutoDemoFallbackEnabled, openEventStream, replayAttempt, simulate } from "./lib/api";
import { verifySettlementProof } from "./lib/proofVerifier";
import type { AgentPaymentManifest, ExecuteResponse, PolicyGrant, ProofVerificationResult } from "./lib/types";

function JsonPanel({ title, value }: { title: string; value: unknown }) {
  return (
    <section className="panel">
      <div className="label">{title}</div>
      <pre>{JSON.stringify(value, null, 2)}</pre>
    </section>
  );
}

export function App() {
  const [invoiceId, setInvoiceId] = useState((import.meta.env.VITE_AGENTISFY_DEMO_INVOICE_ID as string | undefined) ?? "inv_10231");
  const [manifest, setManifest] = useState<AgentPaymentManifest | null>(null);
  const [grantJson, setGrantJson] = useState(JSON.stringify(demoGrant, null, 2));
  const [simulation, setSimulation] = useState<unknown>(null);
  const [execution, setExecution] = useState<ExecuteResponse | null>(null);
  const [proof, setProof] = useState<unknown>(null);
  const [proofVerification, setProofVerification] = useState<ProofVerificationResult | null>(null);
  const [proofState, setProofState] = useState<"idle" | "pending_finality" | "verified" | "invalid" | "unavailable">("idle");
  const [discrepancies, setDiscrepancies] = useState<unknown>(null);
  const [discrepancySeverity, setDiscrepancySeverity] = useState("");
  const [events, setEvents] = useState<unknown[]>([]);
  const [preflightToken, setPreflightToken] = useState("replace-with-preflight-token-from-private-gateway");
  const [error, setError] = useState<string | null>(null);
  const [lastIdempotencyKey, setLastIdempotencyKey] = useState<string | null>(null);
  const [transport, setTransport] = useState<"gateway" | "demo-fallback">(getTransportMode());
  const streamRef = useRef<{ close: () => void } | null>(null);

  const grant = useMemo(() => {
    try {
      return JSON.parse(grantJson);
    } catch {
      return null;
    }
  }, [grantJson]);

  useEffect(() => {
    return () => {
      streamRef.current?.close();
    };
  }, []);

  async function loadManifest() {
    setError(null);
    try {
      const next = await fetchManifest(invoiceId);
      setManifest(next);
      setTransport(getTransportMode());
    } catch (err) {
      setError(formatApiError(err));
      setTransport(getTransportMode());
    }
  }

  async function runSimulation() {
    setError(null);
    try {
      const currentManifest = manifest ?? await fetchManifest(invoiceId);
      if (!manifest) setManifest(currentManifest);
      const next = await simulate(currentManifest, grant as PolicyGrant);
      setSimulation(next);
      setTransport(getTransportMode());
    } catch (err) {
      setError(formatApiError(err));
      setTransport(getTransportMode());
    }
  }

  async function runExecution() {
    setError(null);
    try {
      const currentManifest = manifest ?? await fetchManifest(invoiceId);
      if (!manifest) setManifest(currentManifest);
      const idempotencyKey = createIdempotencyKey("execute", currentManifest.invoiceRef);
      setLastIdempotencyKey(idempotencyKey);
      const next = await execute(currentManifest, grant as PolicyGrant, preflightToken, idempotencyKey);
      setExecution(next);
      setTransport(getTransportMode());
      const attemptId = next.attemptId ?? "";
      if (attemptId) {
        streamRef.current?.close();
        setEvents([]);
        streamRef.current = openEventStream(
          attemptId,
          (event) => setEvents((current) => [...current, event]),
          (streamError) => setError(formatApiError(streamError))
        );
      }
    } catch (err) {
      setError(formatApiError(err));
      setTransport(getTransportMode());
    }
  }

  async function loadProof() {
    setError(null);
    setProofState("pending_finality");
    try {
      const currentManifest = manifest ?? await fetchManifest(invoiceId);
      if (!manifest) setManifest(currentManifest);

      const attemptId = execution?.attemptId || undefined;
      const next = await fetchProof(invoiceId, attemptId || undefined);
      setProof(next);
      const verification = await verifySettlementProof(next, currentManifest);
      setProofVerification(verification);
      if (verification.ok) setProofState("verified");
      else setProofState("invalid");
      setTransport(getTransportMode());
    } catch (err) {
      setProofState("unavailable");
      setError(formatApiError(err));
      setTransport(getTransportMode());
    }
  }

  async function loadDiscrepancies() {
    setError(null);
    try {
      const next = await fetchDiscrepancies({ invoiceId, severity: discrepancySeverity || undefined });
      setDiscrepancies(next);
      setTransport(getTransportMode());
    } catch (err) {
      setError(formatApiError(err));
      setTransport(getTransportMode());
    }
  }

  async function replay() {
    setError(null);
    try {
      const attemptId = execution?.attemptId ?? "";
      if (!attemptId) throw new Error("No attemptId available to replay.");
      const idempotencyKey = createIdempotencyKey("replay", attemptId);
      setLastIdempotencyKey(idempotencyKey);
      const next = await replayAttempt(attemptId, idempotencyKey, execution?.status);
      setExecution(next);
      setTransport(getTransportMode());
    } catch (err) {
      setError(formatApiError(err));
      setTransport(getTransportMode());
    }
  }

  return (
    <main aria-label="Agentisfy public onboarding app">
      <header className="hero">
        <div className="label">Agentisfy public onboarding client</div>
        <h1>Manifest → simulate → execute → proof</h1>
        <p>
          This repo is the public teaching surface. It shows engineers how to consume Agentisfy as an end user without exposing private grant issuance,
          risk logic, routing heuristics, reservation/capture rules, or reconciliation truth.
        </p>
        <div className="notice">Gateway base URL: <strong>{getBaseUrl()}</strong></div>
        <div className="notice">Transport: <strong>{transport}</strong>{transport === "demo-fallback" ? " (automatic fallback active)" : ""}</div>
        {isAutoDemoFallbackEnabled() ? <div className="notice">If the gateway is offline, this app auto-switches to demo fallback so onboarding can continue.</div> : null}
      </header>

      <div className="grid">
        <aside className="stack">
          <section className="panel stack">
            <div className="label">1. Identify the invoice</div>
            <label htmlFor="invoice-id-input" className="label">Invoice ID</label>
            <input id="invoice-id-input" aria-describedby="invoice-help" value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} onKeyDown={(e) => e.key === "Enter" ? loadManifest() : undefined} />
            <div id="invoice-help" className="notice">Use a canonical invoice reference.</div>
            <button onClick={loadManifest}>Fetch manifest</button>
          </section>

          <section className="panel stack">
            <div className="label">2. Published / demo grant</div>
            <label htmlFor="grant-json-input" className="label">Grant JSON</label>
            <textarea id="grant-json-input" aria-label="Published grant JSON" rows={14} value={grantJson} onChange={(e) => setGrantJson(e.target.value)} />
          </section>

          <section className="panel stack">
            <div className="label">3. Preflight token</div>
            <label htmlFor="preflight-token-input" className="label">Preflight token</label>
            <input id="preflight-token-input" aria-describedby="preflight-help" value={preflightToken} onChange={(e) => setPreflightToken(e.target.value)} onKeyDown={(e) => e.key === "Enter" ? runExecution() : undefined} />
            <div id="preflight-help" className="notice">Keep grant authoring private. The public client consumes a published grant and a preflight token from the private gateway.</div>
          </section>

          <section className="panel stack">
            <div className="label">4. Actions</div>
            <div className="row">
              <button onClick={runSimulation}>Simulate</button>
              <button onClick={runExecution}>Execute</button>
              <button className="secondary" onClick={loadProof}>Load proof</button>
              <button className="secondary" onClick={loadDiscrepancies}>Discrepancies</button>
              <input aria-label="Discrepancy severity filter" placeholder="severity" value={discrepancySeverity} onChange={(e) => setDiscrepancySeverity(e.target.value)} />
              <button className="secondary" onClick={replay}>Replay</button>
            </div>
            {lastIdempotencyKey ? <div className="notice" role="status" aria-live="polite">Last idempotency key: {lastIdempotencyKey}</div> : null}
            {error ? <div className="notice" role="alert" aria-live="assertive">Error: {error}</div> : null}
          </section>
        </aside>

        <section className="stack">
          <div className="kpis">
            <div className="kpi"><div className="label">Public repo owns</div><div>schemas, SDK, onboarding app</div></div>
            <div className="kpi"><div className="label">Private repo owns</div><div>policy, routing, reconciliation</div></div>
            <div className="kpi"><div className="label">Execution rail</div><div>Stable / USDT0</div></div>
            <div className="kpi"><div className="label">Teaching loop</div><div>fetch → simulate → execute → verify</div></div>
          </div>
          <JsonPanel title="Manifest" value={manifest} />
          <JsonPanel title="Simulation" value={simulation} />
          <JsonPanel title="Execution" value={execution} />
          <div className="notice" role="status" aria-live="polite">Proof state: {proofState}</div>
          <JsonPanel title={`SettlementProof ${proofVerification?.ok ? "(trusted)" : proofVerification ? "(untrusted)" : ""}`} value={proof} />
          <JsonPanel title="Proof verification" value={proofVerification} />
          <JsonPanel title="Discrepancies" value={discrepancies} />
          <JsonPanel title="Event stream" value={events} />
        </section>
      </div>
    </main>
  );
}
