import { useEffect, useMemo, useRef, useState } from "react";
import { demoGrant } from "./lib/demo";
import { createIdempotencyKey, execute, fetchDiscrepancies, fetchManifest, fetchProof, formatApiError, getBaseUrl, getTransportMode, isAutoDemoFallbackEnabled, openEventStream, replayAttempt, simulate } from "./lib/api";
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
  const [proofState, setProofState] = useState<"idle" | "pending_finality" | "verified" | "invalid" | "unavailable">("idle");
  const [discrepancies, setDiscrepancies] = useState<unknown>(null);
  const [discrepancySeverity, setDiscrepancySeverity] = useState("");
  const [events, setEvents] = useState<unknown[]>([]);
  const [preflightToken, setPreflightToken] = useState("replace-with-preflight-token-from-private-gateway");
  const [error, setError] = useState<string | null>(null);
  const [lastIdempotencyKey, setLastIdempotencyKey] = useState<string | null>(null);
  const [transport, setTransport] = useState<"gateway" | "demo-fallback">(getTransportMode());
  const [activeAction, setActiveAction] = useState<"idle" | ActionName>("idle");
  const [activityLog, setActivityLog] = useState<Array<{ action: ActionName; outcome: "started" | "success" | "error" | "blocked"; at: string; detail?: string }>>([]);
  const [showGuidance, setShowGuidance] = useState(true);
  const [showStartedEvents, setShowStartedEvents] = useState(false);
  const streamRef = useRef<{ close: () => void } | null>(null);
  const proofStateMeta: Record<
    "idle" | "pending_finality" | "verified" | "invalid" | "unavailable",
    { icon: string; label: string; tone: "info" | "warning" | "success" | "error" }
  > = {
    idle: { icon: "○", label: "Idle", tone: "info" },
    pending_finality: { icon: "◔", label: "Pending finality", tone: "warning" },
    verified: { icon: "●", label: "Verified", tone: "success" },
    invalid: { icon: "✕", label: "Invalid", tone: "error" },
    unavailable: { icon: "!", label: "Unavailable", tone: "error" }
  };

  const grant = useMemo(() => {
    try {
      return JSON.parse(grantJson);
    } catch {
      return null;
    }
  }, [grantJson]);
  const isGrantValid = grant !== null;
  const hasManifest = manifest !== null;
  const hasExecution = Boolean(execution?.attemptId);
  const canSimulate = hasManifest && isGrantValid;
  const canExecute = hasManifest && isGrantValid && Boolean(preflightToken.trim());
  const canLoadProof = hasExecution;
  const canReplay = hasExecution;
  const isBusy = activeAction !== "idle";

  function pushActivity(action: ActionName, outcome: "started" | "success" | "error" | "blocked", detail?: string) {
    const entry = { action, outcome, detail, at: new Date().toISOString() };
    setActivityLog((current) => [entry, ...current].slice(0, 20));
  }

  function setBusy(action: ActionName) {
    setActiveAction(action);
    pushActivity(action, "started");
  }

  function clearBusy() {
    setActiveAction("idle");
  }

  function formatRelativeTime(isoTimestamp: string) {
    const deltaMs = Date.now() - new Date(isoTimestamp).getTime();
    const seconds = Math.max(0, Math.floor(deltaMs / 1000));
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  async function runAction(action: ActionName, work: () => Promise<void>, onError?: (message: string) => void) {
    if (isBusy) {
      pushActivity(action, "blocked", `Blocked because ${activeAction} is currently running.`);
      return;
    }
    setBusy(action);
    setError(null);
    try {
      await work();
      pushActivity(action, "success");
      setTransport(getTransportMode());
    } catch (err) {
      const message = formatApiError(err);
      setError(message);
      onError?.(message);
      pushActivity(action, "error", message);
      setTransport(getTransportMode());
    } finally {
      clearBusy();
    }
  }

  function resetOutputs() {
    setSimulation(null);
    setExecution(null);
    setProof(null);
    setProofVerification(null);
    setProofState("idle");
    setDiscrepancies(null);
    setEvents([]);
    setLastIdempotencyKey(null);
    setError(null);
    streamRef.current?.close();
    streamRef.current = null;
  }

  function clearActivity() {
    setActivityLog([]);
  }

  const visibleActivityLog = showStartedEvents ? activityLog : activityLog.filter((entry) => entry.outcome !== "started");

  useEffect(() => {
    return () => {
      streamRef.current?.close();
    };
  }, []);

  async function loadManifest() {
    await runAction("manifest", async () => {
      const next = await fetchManifest(invoiceId);
      setManifest(next);
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
    });
  }

  async function loadProof() {
    setProofState("pending_finality");
    await runAction("proof", async () => {
      const currentManifest = manifest ?? await fetchManifest(invoiceId);
      if (!manifest) setManifest(currentManifest);

      const attemptId = execution?.attemptId || undefined;
      const next = await fetchProof(invoiceId, attemptId || undefined);
      setProof(next);
      const verification = await verifySettlementProof(next, currentManifest);
      setProofVerification(verification);
      if (verification.ok) setProofState("verified");
      else setProofState("invalid");
    }, () => {
      setProofState("unavailable");
    });
  }

  async function loadDiscrepancies() {
    await runAction("discrepancies", async () => {
      const next = await fetchDiscrepancies({ invoiceId, severity: discrepancySeverity || undefined });
      setDiscrepancies(next);
    });
  }

  async function replay() {
    await runAction("replay", async () => {
      const attemptId = execution?.attemptId ?? "";
      if (!attemptId) throw new Error("No attemptId available to replay.");
      const idempotencyKey = createIdempotencyKey("replay", attemptId);
      setLastIdempotencyKey(idempotencyKey);
      const next = await replayAttempt(attemptId, idempotencyKey, execution?.status);
      setExecution(next);
    });
  }

  return (
    <main aria-label="Agentisfy public onboarding app" aria-busy={isBusy}>
      <header className="hero">
        <div className="eyebrow">Agentisfy public onboarding client</div>
        <h1>Manifest → simulate → execute → proof</h1>
        <p>
          This repo is the public teaching surface. It shows engineers how to consume Agentisfy as an end user without exposing private grant issuance,
          risk logic, routing heuristics, reservation/capture rules, or reconciliation truth.
        </p>
        <div className="meta-grid">
          <div className="meta-item">
            <div className="meta-label">Gateway base URL</div>
            <div className="meta-value mono">{getBaseUrl()}</div>
          </div>
          <div className={`meta-item ${transport === "demo-fallback" ? "warning" : "ok"}`}>
            <div className="meta-label">Transport</div>
            <div className="meta-value">
              <span className={`status-pill ${transport === "demo-fallback" ? "warning" : "ok"}`}>
                <span className={`status-dot ${transport === "demo-fallback" ? "warning" : "ok"}`} aria-hidden="true" />
                {transport}
              </span>
              {transport === "demo-fallback" ? " (automatic fallback active)" : ""}
            </div>
          </div>
        </div>
        {showGuidance && isAutoDemoFallbackEnabled() ? <div className="notice notice-helper subtle"><span className="notice-icon helper" aria-hidden="true">i</span>If the gateway is offline, this app auto-switches to demo fallback so onboarding can continue.</div> : null}
      </header>

      <div className="grid">
        <aside className="stack workflow">
          <section className="panel stack">
            <div className="section-title"><span className="step-dot">1</span>Identify the invoice</div>
            <label htmlFor="invoice-id-input" className="field-label">Invoice ID</label>
            <input id="invoice-id-input" aria-describedby={showGuidance ? "invoice-help" : undefined} value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} onKeyDown={(e) => e.key === "Enter" ? loadManifest() : undefined} />
            {showGuidance ? <div id="invoice-help" className="notice notice-helper"><span className="notice-icon helper" aria-hidden="true">i</span>Use a canonical invoice reference.</div> : null}
            <button onClick={loadManifest} disabled={isBusy}>
              {activeAction === "manifest" ? <span className="loading-dot" aria-hidden="true" /> : null}
              Run manifest fetch
            </button>
          </section>

          <section className="panel stack">
            <div className="section-title"><span className="step-dot">2</span>Published / demo grant</div>
            <label htmlFor="grant-json-input" className="field-label">Grant JSON</label>
            <textarea
              id="grant-json-input"
              aria-label="Published grant JSON"
              aria-invalid={!isGrantValid}
              aria-describedby={!isGrantValid ? "grant-json-error" : undefined}
              rows={10}
              value={grantJson}
              onChange={(e) => setGrantJson(e.target.value)}
            />
            {!isGrantValid ? (
              <div id="grant-json-error" className="notice notice-error" role="alert">
                <span className="notice-icon error" aria-hidden="true">!</span>
                Grant JSON is invalid. Fix JSON syntax before simulating or executing.
              </div>
            ) : null}
          </section>

          <section className="panel stack">
            <div className="section-title"><span className="step-dot">3</span>Preflight token</div>
            <label htmlFor="preflight-token-input" className="field-label">Preflight token</label>
            <input id="preflight-token-input" aria-describedby={showGuidance ? "preflight-help" : undefined} value={preflightToken} onChange={(e) => setPreflightToken(e.target.value)} onKeyDown={(e) => e.key === "Enter" ? runExecution() : undefined} />
            {showGuidance ? <div id="preflight-help" className="notice notice-helper"><span className="notice-icon helper" aria-hidden="true">i</span>Keep grant authoring private. The public client consumes a published grant and a preflight token from the private gateway.</div> : null}
          </section>

          <section className="panel stack action-panel">
            <div className="section-title"><span className="step-dot">4</span>Actions</div>
            <div className="action-group-label">Primary actions</div>
            <div className="row action-row action-row-primary">
              <button onClick={runSimulation} disabled={!canSimulate || isBusy}>
                {activeAction === "simulate" ? <span className="loading-dot" aria-hidden="true" /> : <span className="action-icon" aria-hidden="true">◌</span>}
                Run simulation
              </button>
              <button onClick={runExecution} disabled={!canExecute || isBusy}>
                {activeAction === "execute" ? <span className="loading-dot" aria-hidden="true" /> : <span className="action-icon" aria-hidden="true">▶</span>}
                Run execution
              </button>
            </div>
            <div className="action-group-label">Follow-up actions</div>
            <div className="row action-row action-row-secondary">
              <button className="secondary" onClick={loadProof} disabled={!canLoadProof || isBusy}>
                {activeAction === "proof" ? <span className="loading-dot" aria-hidden="true" /> : <span className="action-icon" aria-hidden="true">✓</span>}
                Run proof load
              </button>
              <button className="secondary" onClick={replay} disabled={!canReplay || isBusy}>
                {activeAction === "replay" ? <span className="loading-dot" aria-hidden="true" /> : <span className="action-icon" aria-hidden="true">↻</span>}
                Run replay
              </button>
            </div>
            <div className="action-group-label">Discrepancy controls</div>
            <div className="field-group">
              <label htmlFor="severity-filter-input" className="field-label">Discrepancy severity filter</label>
              <div className="discrepancy-controls">
                <input id="severity-filter-input" aria-label="Discrepancy severity filter" placeholder="severity: high | medium | low" value={discrepancySeverity} onChange={(e) => setDiscrepancySeverity(e.target.value)} />
                <button className="secondary" onClick={loadDiscrepancies} disabled={isBusy}>
                  {activeAction === "discrepancies" ? <span className="loading-dot" aria-hidden="true" /> : <span className="action-icon" aria-hidden="true">⚠</span>}
                  Run discrepancy check
                </button>
              </div>
              <div className="hint-text">Filter discrepancies by severity before loading results.</div>
            </div>
            <button className="secondary ghost" onClick={resetOutputs} disabled={isBusy}>Reset outputs</button>
            <button className="secondary ghost compact" onClick={() => setShowGuidance((current) => !current)} disabled={isBusy}>{showGuidance ? "Hide guidance" : "Show guidance"}</button>
            {showGuidance ? <div className="hint-text">
              {!hasManifest ? "Fetch manifest first. " : ""}
              {!isGrantValid ? "Provide valid grant JSON. " : ""}
              {!preflightToken.trim() ? "Provide a preflight token for execute. " : ""}
              {!hasExecution ? "Execute once to enable replay/proof." : ""}
            </div> : null}
            {isBusy ? <div className="notice notice-status" role="status" aria-live="polite"><span className="notice-icon helper" aria-hidden="true">…</span>Running {activeAction}…</div> : null}
            {lastIdempotencyKey ? <div className="notice notice-status notice-success" role="status" aria-live="polite"><span className="notice-icon success" aria-hidden="true">✓</span>Last idempotency key: {lastIdempotencyKey}</div> : null}
          </section>
        </aside>

        <section className="stack results-column">
          <div className="results-title">Outputs</div>
          {error ? <div className="notice notice-error global-error" role="alert" aria-live="assertive"><span className="notice-icon error" aria-hidden="true">!</span>Error: {error}</div> : null}
          <div className="kpis">
            <div className="kpi"><div className="kpi-label">Public repo owns</div><div className="kpi-value">schemas, SDK, onboarding app</div></div>
            <div className="kpi"><div className="kpi-label">Private repo owns</div><div className="kpi-value">policy, routing, reconciliation</div></div>
            <div className="kpi"><div className="kpi-label">Execution rail</div><div className="kpi-value">Stable / USDT0</div></div>
            <div className="kpi"><div className="kpi-label">Teaching loop</div><div className="kpi-value">fetch → simulate → execute → verify</div></div>
          </div>
          <JsonPanel title="Manifest" value={manifest} />
          <JsonPanel title="Simulation" value={simulation} />
          <JsonPanel title="Execution" value={execution} />
          <div className={`notice proof-chip ${proofState} tone-${proofStateMeta[proofState].tone}`} role="status" aria-live="polite">
            <span className="proof-icon" aria-hidden="true">{proofStateMeta[proofState].icon}</span>
            Proof state: {proofStateMeta[proofState].label}
          </div>
          <JsonPanel title={`SettlementProof ${proofVerification?.ok ? "(trusted)" : proofVerification ? "(untrusted)" : ""}`} value={proof} defaultOpen={false} />
          <JsonPanel title="Proof verification" value={proofVerification} defaultOpen={false} />
          <JsonPanel title="Discrepancies" value={discrepancies} defaultOpen={false} />
          <JsonPanel title="Event stream" value={events} defaultOpen={false} />
          <section className="panel activity-panel">
            <div className="row">
              <div className="panel-title">Action activity log</div>
              <button className="secondary ghost compact" onClick={clearActivity} disabled={activityLog.length === 0 || isBusy}>Clear log</button>
              <button className="secondary ghost compact" onClick={() => setShowStartedEvents((current) => !current)} disabled={isBusy}>{showStartedEvents ? "Hide starts" : "Show starts"}</button>
            </div>
            <ul className="activity-list">
              {visibleActivityLog.length === 0 ? <li className="activity-item muted">No actions yet.</li> : null}
              {visibleActivityLog.map((entry, idx) => (
                <li key={`${entry.at}-${entry.action}-${idx}`} className={`activity-item ${entry.outcome}`}>
                  <span className="activity-main">{entry.action} · {entry.outcome}</span>
                  <span className="activity-time">{new Date(entry.at).toLocaleTimeString()} · {formatRelativeTime(entry.at)}</span>
                  {entry.detail ? <span className="activity-detail">{entry.detail}</span> : null}
                </li>
              ))}
            </ul>
          </section>
        </section>
      </div>
    </main>
  );
}
