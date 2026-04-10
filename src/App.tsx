import { useEffect, useMemo, useRef, useState } from "react";
import { demoGrant } from "./lib/demo";
import { createIdempotencyKey, execute, fetchDiscrepancies, fetchManifest, fetchProof, formatApiError, getTransportMode, openEventStream, replayAttempt, simulate } from "./lib/api";
import { verifySettlementProof } from "./lib/proofVerifier";
import type { AgentPaymentManifest, ExecuteResponse, PolicyGrant, ProofVerificationResult } from "./lib/types";

type ActionName = "manifest" | "simulate" | "execute" | "proof" | "discrepancies" | "replay";

function JsonPanel({ title, value, defaultOpen = true }: { title: string; value: unknown; defaultOpen?: boolean }) {
  const hasValue = value !== null && value !== undefined && !(Array.isArray(value) && value.length === 0);
  return (
    <section className="panel data-panel">
      <details open={defaultOpen} className="panel-details">
        <summary className="panel-summary">
          <span className="panel-title">{title}</span>
          <span className={`panel-meta ${hasValue ? "ready" : "empty"}`}>{hasValue ? "available" : "empty"}</span>
        </summary>
        {hasValue ? (
          <pre><code>{JSON.stringify(value, null, 2)}</code></pre>
        ) : (
          <div className="panel-empty">No data yet.</div>
        )}
      </details>
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
  const [discrepancies, setDiscrepancies] = useState<unknown>(null);
  const [discrepancySeverity, setDiscrepancySeverity] = useState("");
  const [events, setEvents] = useState<unknown[]>([]);
  const [preflightToken, setPreflightToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<"idle" | ActionName>("idle");
  const [activeAttemptId, setActiveAttemptId] = useState("");
  const streamRef = useRef<{ close: () => void } | null>(null);

  const grant = useMemo(() => {
    try {
      return JSON.parse(grantJson);
    } catch {
      return null;
    }
  }, [grantJson]);

  const isGrantValid = grant !== null;
  const hasManifest = manifest !== null;
  const currentAttemptId = activeAttemptId || execution?.attemptId || "";
  const hasExecution = Boolean(currentAttemptId);
  const replayStatus = execution?.status ?? "unknown";
  const replayEligible = replayStatus === "failed" || replayStatus === "ambiguous";
  const canSimulate = hasManifest && isGrantValid;
  const hasPreflightToken = Boolean(preflightToken.trim());
  const canExecute = hasManifest && isGrantValid && hasPreflightToken;
  const canLoadProof = hasExecution;
  const canReplay = hasExecution && replayEligible;
  const isBusy = activeAction !== "idle";
  const transport = getTransportMode();

  function setBusy(action: ActionName) {
    setActiveAction(action);
  }

  function clearBusy() {
    setActiveAction("idle");
  }

  async function runAction(action: ActionName, work: () => Promise<void>) {
    if (isBusy) return;
    setBusy(action);
    setError(null);
    try {
      await work();
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      clearBusy();
    }
  }

  function resetOutputs() {
    setSimulation(null);
    setExecution(null);
    setProof(null);
    setProofVerification(null);
    setDiscrepancies(null);
    setEvents([]);
    setError(null);
    setActiveAttemptId("");
    streamRef.current?.close();
    streamRef.current = null;
  }

  useEffect(() => {
    return () => {
      streamRef.current?.close();
    };
  }, []);

  async function loadManifest() {
    await runAction("manifest", async () => {
      const next = await fetchManifest(invoiceId);
      setManifest(next);
      resetOutputs();
    });
  }

  async function runSimulation() {
    await runAction("simulate", async () => {
      const currentManifest = manifest ?? await fetchManifest(invoiceId);
      if (!manifest) setManifest(currentManifest);
      const next = await simulate(currentManifest, grant as PolicyGrant);
      setSimulation(next);
    });
  }

  async function runExecution() {
    await runAction("execute", async () => {
      const currentManifest = manifest ?? await fetchManifest(invoiceId);
      if (!manifest) setManifest(currentManifest);
      const idempotencyKey = createIdempotencyKey("execute", currentManifest.invoiceRef);
      const next = await execute(currentManifest, grant as PolicyGrant, preflightToken, idempotencyKey);
      setExecution(next);
      setProof(null);
      setProofVerification(null);
      setDiscrepancies(null);
      const attemptId = next.attemptId ?? "";
      if (attemptId) {
        setActiveAttemptId(attemptId);
        streamRef.current?.close();
        setEvents([]);
        streamRef.current = openEventStream(
          attemptId,
          (event) => setEvents((current) => [...current, event]),
          (streamError) => setError(formatApiError(streamError))
        );
      }
    });
  }

  async function loadProof() {
    await runAction("proof", async () => {
      const currentManifest = manifest ?? await fetchManifest(invoiceId);
      if (!manifest) setManifest(currentManifest);

      const attemptId = currentAttemptId || execution?.attemptId || undefined;
      if (attemptId) setActiveAttemptId(attemptId);
      const next = await fetchProof(invoiceId, attemptId || undefined);
      setProof(next);
      const verification = await verifySettlementProof(next, currentManifest);
      setProofVerification(verification);
    });
  }

  async function loadDiscrepancies() {
    await runAction("discrepancies", async () => {
      const next = await fetchDiscrepancies({
        invoiceId,
        attemptId: currentAttemptId || undefined,
        severity: discrepancySeverity || undefined
      });
      setDiscrepancies(next);
    });
  }

  async function replay() {
    await runAction("replay", async () => {
      const attemptId = currentAttemptId || execution?.attemptId || "";
      if (!attemptId) throw new Error("No attempt ID is available for replay.");
      const idempotencyKey = createIdempotencyKey("replay", attemptId);
      const next = await replayAttempt(attemptId, idempotencyKey, execution?.status);
      setExecution(next);
      setActiveAttemptId(attemptId);
    });
  }

  return (
    <main aria-label="Agentisfy app" aria-busy={isBusy}>
      <header className="hero">
        <div className="eyebrow">Agentisfy</div>
        <h1>Pay invoice</h1>
        <p>Use an invoice ID to fetch details, simulate payment, execute, and verify proof.</p>
      </header>

      <div className="grid">
        <aside className="stack workflow">
          <section className="panel stack">
            <div className="section-title"><span className="step-dot">1</span>Invoice</div>
            <label htmlFor="invoice-id-input" className="field-label">Invoice ID</label>
            <input id="invoice-id-input" value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} onKeyDown={(e) => e.key === "Enter" ? loadManifest() : undefined} />
            <button onClick={loadManifest} disabled={isBusy}>
              {activeAction === "manifest" ? <span className="loading-dot" aria-hidden="true" /> : null}
              Load invoice
            </button>
          </section>

          <section className="panel stack">
            <div className="section-title"><span className="step-dot">2</span>Authorization</div>
            <label htmlFor="preflight-token-input" className="field-label">Preflight token</label>
            <input id="preflight-token-input" value={preflightToken} onChange={(e) => setPreflightToken(e.target.value)} onKeyDown={(e) => e.key === "Enter" ? runExecution() : undefined} />
          </section>

          <section className="panel stack action-panel">
            <div className="section-title"><span className="step-dot">3</span>Actions</div>
            <div className="row action-row action-row-primary">
              <button onClick={runSimulation} disabled={!canSimulate || isBusy}>Run simulation</button>
              <button onClick={runExecution} disabled={!canExecute || isBusy}>Run execution</button>
            </div>
            <div className="row action-row action-row-secondary">
              <button className="secondary" onClick={loadProof} disabled={!canLoadProof || isBusy}>Load proof</button>
              <button className="secondary" onClick={replay} disabled={!canReplay || isBusy}>Replay attempt</button>
            </div>
            <div className="discrepancy-controls">
              <input aria-label="Discrepancy severity filter" placeholder="severity: high | medium | low" value={discrepancySeverity} onChange={(e) => setDiscrepancySeverity(e.target.value)} />
              <button className="secondary" onClick={loadDiscrepancies} disabled={isBusy}>Load discrepancies</button>
            </div>
            <button className="secondary ghost" onClick={resetOutputs} disabled={isBusy}>Reset outputs</button>
            {isBusy ? <div className="notice notice-status" role="status" aria-live="polite"><span className="notice-icon helper" aria-hidden="true">…</span>Running {activeAction}…</div> : null}
          </section>
        </aside>

        <section className="stack results-column">
          <div className="results-title">Results</div>
          {error ? <div className="notice notice-error global-error" role="alert" aria-live="assertive"><span className="notice-icon error" aria-hidden="true">!</span>Error: {error}</div> : null}
          <div className="kpis">
            <div className="kpi"><div className="kpi-label">Transport</div><div className="kpi-value">{transport}</div></div>
            <div className="kpi"><div className="kpi-label">Attempt ID</div><div className="kpi-value mono">{currentAttemptId || "—"}</div></div>
          </div>
          <JsonPanel title="Manifest" value={manifest} />
          <JsonPanel title="Simulation" value={simulation} />
          <JsonPanel title="Execution" value={execution} />
          <JsonPanel title="Settlement proof" value={proof} defaultOpen={false} />
          <JsonPanel title="Proof verification" value={proofVerification} defaultOpen={false} />
          <JsonPanel title="Discrepancies" value={discrepancies} defaultOpen={false} />
          <JsonPanel title="Event stream" value={events} defaultOpen={false} />
        </section>
      </div>
    </main>
  );
}
