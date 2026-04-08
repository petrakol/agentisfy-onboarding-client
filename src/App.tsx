import { useEffect, useMemo, useRef, useState } from "react";
import { demoGrant } from "./lib/demo";
import { execute, fetchDiscrepancies, fetchManifest, fetchProof, getBaseUrl, getTransportMode, isAutoDemoFallbackEnabled, openEventStream, replayAttempt, simulate } from "./lib/api";
import { verifySettlementProof } from "./lib/proofVerifier";
import type { ProofVerificationResult } from "./lib/types";

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
  const [manifest, setManifest] = useState<unknown>(null);
  const [grantJson, setGrantJson] = useState(JSON.stringify(demoGrant, null, 2));
  const [simulation, setSimulation] = useState<unknown>(null);
  const [execution, setExecution] = useState<unknown>(null);
  const [proof, setProof] = useState<unknown>(null);
  const [proofVerification, setProofVerification] = useState<ProofVerificationResult | null>(null);
  const [discrepancies, setDiscrepancies] = useState<unknown>(null);
  const [events, setEvents] = useState<unknown[]>([]);
  const [preflightToken, setPreflightToken] = useState("replace-with-preflight-token-from-private-gateway");
  const [error, setError] = useState<string | null>(null);
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
      setError(String(err));
      setTransport(getTransportMode());
    }
  }

  async function runSimulation() {
    setError(null);
    try {
      const currentManifest = manifest ?? await fetchManifest(invoiceId);
      if (!manifest) setManifest(currentManifest);
      const next = await simulate(currentManifest as Record<string, unknown>, grant as Record<string, unknown>);
      setSimulation(next);
      setTransport(getTransportMode());
    } catch (err) {
      setError(String(err));
      setTransport(getTransportMode());
    }
  }

  async function runExecution() {
    setError(null);
    try {
      const currentManifest = manifest ?? await fetchManifest(invoiceId);
      if (!manifest) setManifest(currentManifest);
      const idempotencyKey = `public_client_${Date.now()}`;
      const next = await execute(currentManifest as Record<string, unknown>, grant as Record<string, unknown>, preflightToken, idempotencyKey);
      setExecution(next);
      setTransport(getTransportMode());
      const attemptId = typeof next === "object" && next && "attemptId" in next ? String((next as { attemptId?: string }).attemptId ?? "") : "";
      if (attemptId) {
        streamRef.current?.close();
        setEvents([]);
        streamRef.current = openEventStream(attemptId, (event) => setEvents((current) => [...current, event]));
      }
    } catch (err) {
      setError(String(err));
      setTransport(getTransportMode());
    }
  }

  async function loadProof() {
    setError(null);
    try {
      const currentManifest = manifest ?? await fetchManifest(invoiceId);
      if (!manifest) setManifest(currentManifest);

      const attemptId = typeof execution === "object" && execution && "attemptId" in execution ? String((execution as { attemptId?: string }).attemptId ?? "") : undefined;
      const next = await fetchProof(invoiceId, attemptId || undefined);
      setProof(next);
      const verification = await verifySettlementProof(next, currentManifest as Record<string, unknown>);
      setProofVerification(verification);
      setTransport(getTransportMode());
    } catch (err) {
      setError(String(err));
      setTransport(getTransportMode());
    }
  }

  async function loadDiscrepancies() {
    setError(null);
    try {
      const next = await fetchDiscrepancies();
      setDiscrepancies(next);
      setTransport(getTransportMode());
    } catch (err) {
      setError(String(err));
      setTransport(getTransportMode());
    }
  }

  async function replay() {
    setError(null);
    try {
      const attemptId = typeof execution === "object" && execution && "attemptId" in execution ? String((execution as { attemptId?: string }).attemptId ?? "") : "";
      if (!attemptId) throw new Error("No attemptId available to replay.");
      const next = await replayAttempt(attemptId, `public_client_replay_${Date.now()}`);
      setExecution(next);
      setTransport(getTransportMode());
    } catch (err) {
      setError(String(err));
      setTransport(getTransportMode());
    }
  }

  return (
    <main>
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
            <input value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} />
            <button onClick={loadManifest}>Fetch manifest</button>
          </section>

          <section className="panel stack">
            <div className="label">2. Published / demo grant</div>
            <textarea rows={14} value={grantJson} onChange={(e) => setGrantJson(e.target.value)} />
          </section>

          <section className="panel stack">
            <div className="label">3. Preflight token</div>
            <input value={preflightToken} onChange={(e) => setPreflightToken(e.target.value)} />
            <div className="notice">Keep grant authoring private. The public client consumes a published grant and a preflight token from the private gateway.</div>
          </section>

          <section className="panel stack">
            <div className="label">4. Actions</div>
            <div className="row">
              <button onClick={runSimulation}>Simulate</button>
              <button onClick={runExecution}>Execute</button>
              <button className="secondary" onClick={loadProof}>Load proof</button>
              <button className="secondary" onClick={loadDiscrepancies}>Discrepancies</button>
              <button className="secondary" onClick={replay}>Replay</button>
            </div>
            {error ? <div className="notice">Error: {error}</div> : null}
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
          <JsonPanel title={`SettlementProof ${proofVerification?.ok ? "(trusted)" : proofVerification ? "(untrusted)" : ""}`} value={proof} />
          <JsonPanel title="Proof verification" value={proofVerification} />
          <JsonPanel title="Discrepancies" value={discrepancies} />
          <JsonPanel title="Event stream" value={events} />
        </section>
      </div>
    </main>
  );
}
