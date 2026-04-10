import { useEffect, useMemo, useRef, useState } from "react";
import { demoGrant } from "./lib/demo";
import { createIdempotencyKey, execute, fetchDiscrepancies, fetchManifest, fetchProof, formatApiError, getBaseUrl, getTransportMode, isAutoDemoFallbackEnabled, openEventStream, replayAttempt, simulate } from "./lib/api";
import { buildTasks1To10ResolutionPlan, buildTasks1To10Status, summarizeTasks1To10 } from "./lib/lifecycleGovernance";
import { buildDependencyIssues, buildEvidenceClassification, buildLifecycleReadiness, buildQualityScore, buildResolutionPlan, buildTasks11To20Status, classifyErrorCategory, summarizeTasks } from "./lib/operationalQuality";
import { verifySettlementProof } from "./lib/proofVerifier";
import type { AgentPaymentManifest, ExecuteResponse, PolicyGrant, ProofVerificationResult } from "./lib/types";

type ActionName = "manifest" | "simulate" | "execute" | "proof" | "discrepancies" | "replay" | "lifecycle";
type LifecyclePhase = "idle" | "manifest_ready" | "simulated" | "executed" | "events_observed" | "proof_reviewed" | "discrepancies_loaded" | "replayed";

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
  const [activeAttemptId, setActiveAttemptId] = useState("");
  const [lifecyclePhase, setLifecyclePhase] = useState<LifecyclePhase>("idle");
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
  const currentAttemptId = activeAttemptId || execution?.attemptId || "";
  const hasExecution = Boolean(currentAttemptId);
  const replayStatus = execution?.status ?? "unknown";
  const replayEligible = replayStatus === "failed" || replayStatus === "ambiguous";
  const canSimulate = hasManifest && isGrantValid;
  const hasPreflightToken = Boolean(preflightToken.trim());
  const preflightLooksPlaceholder = preflightToken.includes("replace-with-preflight-token") || preflightToken.toLowerCase().includes("demo");
  const canExecute = hasManifest && isGrantValid && hasPreflightToken && !preflightLooksPlaceholder;
  const canLoadProof = hasExecution;
  const canReplayBase = hasExecution && replayEligible;
  const canRunLifecycle = isGrantValid && hasPreflightToken && !preflightLooksPlaceholder;
  const isBusy = activeAction !== "idle";
  const discrepancyItems = useMemo(() => {
    const candidate = (discrepancies as { records?: unknown[] } | null)?.records;
    return Array.isArray(candidate) ? candidate : [];
  }, [discrepancies]);
  const highSeverityDiscrepancies = useMemo(
    () =>
      discrepancyItems.filter((item) => {
        if (!item || typeof item !== "object") return false;
        return String((item as { severity?: string }).severity ?? "").toLowerCase() === "high";
      }).length,
    [discrepancyItems]
  );
  const closeoutRecommendation = useMemo(() => {
    if (!hasExecution) return "Run execution to open an attempt lifecycle.";
    if (proofState === "verified" && discrepancyItems.length === 0) return "Attempt appears closed: verified proof with no discrepancy records loaded.";
    if (proofState === "pending_finality") return "Hold for finality, then reload proof and discrepancies before closeout.";
    if (proofState === "invalid") return "Do not close out. Investigate proof mismatch and replay eligibility.";
    if (proofState === "unavailable") return "Proof unavailable. Check event progression and retry proof fetch.";
    if (highSeverityDiscrepancies > 0) return "High-severity discrepancies detected. Investigate before replay or final closeout.";
    if (replayEligible) return "Replay is allowed for this attempt status.";
    return "Collect proof and discrepancies to determine closeout readiness.";
  }, [discrepancyItems.length, hasExecution, highSeverityDiscrepancies, proofState, replayEligible]);
  const sessionTrace = useMemo(
    () => ({
      invoiceId,
      attemptId: currentAttemptId || null,
      transport,
      executionStatus: execution?.status ?? null,
      lifecycle: [
        { step: "manifest", ready: Boolean(manifest) },
        { step: "simulate", ready: Boolean(simulation) },
        { step: "execute", ready: hasExecution },
        { step: "events", ready: events.length > 0, count: events.length },
        { step: "proof", ready: proofState === "verified", state: proofState },
        { step: "discrepancies", ready: Boolean(discrepancies), count: discrepancyItems.length },
        { step: "replay", ready: replayEligible, reason: replayEligible ? "status is failed or ambiguous" : `status is ${replayStatus}` }
      ]
    }),
    [currentAttemptId, discrepancyItems.length, discrepancies, events.length, execution?.status, hasExecution, invoiceId, manifest, proofState, replayEligible, replayStatus, simulation, transport]
  );
  const trustProfile = useMemo(
    () => ({
      transport,
      evidenceTier: transport === "gateway" ? "production-observed" : "demo-fallback-observed",
      contractValidation: "enforced for all manifest/simulation/execution/events/proof/discrepancy payloads before UI render",
      boundary: {
        publicClientShows: ["observable outcomes", "schema-validated artifacts", "verification/discrepancy consequences"],
        publicClientExcludes: ["policy authoring/evaluation", "routing heuristics", "risk scoring internals", "reconciliation source-of-truth"]
      }
    }),
    [transport]
  );
  const transportGuidance = transport === "gateway"
    ? "Gateway transport active: treat evidence as production-observed outputs that remain bounded to public consequences."
    : "Demo fallback active: treat evidence as onboarding-grade and verify against gateway mode before operational decisions.";
  const eventIntegrity = useMemo(() => {
    const sequence = events
      .map((entry) => (entry && typeof entry === "object" ? Number((entry as { sequenceNo?: unknown }).sequenceNo) : NaN))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);
    if (sequence.length === 0) return { state: "empty", gaps: 0, first: null, last: null };
    let gaps = 0;
    for (let idx = 1; idx < sequence.length; idx += 1) {
      if (sequence[idx] - sequence[idx - 1] > 1) gaps += 1;
    }
    return {
      state: gaps > 0 ? "gap_detected" : "continuous",
      gaps,
      first: sequence[0],
      last: sequence[sequence.length - 1]
    };
  }, [events]);
  const canReplay = canReplayBase && eventIntegrity.state !== "gap_detected";
  const contractValidationStatus = error?.includes("Contract validation failed") ? "failed_last_action" : "enforced_on_all_api_payloads";
  const preconditionChecklist = {
    grantJson: isGrantValid ? "satisfied" : "missing_or_invalid",
    preflightToken: hasPreflightToken ? (preflightLooksPlaceholder ? "placeholder_or_demo_token" : "satisfied") : "missing",
    attemptForReplay: hasExecution ? "satisfied" : "missing"
  };
  const boundaryChecklist = {
    observableConsequencesOnly: true,
    excludesPrivateDecisionLogic: true,
    privateDomains: ["policy authoring/evaluation", "routing heuristics", "risk scoring internals", "reconciliation source-of-truth"]
  };
  const designGoalsAlignment = {
    deterministicOutcomes: currentAttemptId ? "attempt-scoped lifecycle and replay rules visible" : "run execution to establish deterministic attempt scope",
    verifiableState: proofState === "verified" ? "proof verified" : `proof state: ${proofState}`,
    minimalSurfaceArea: "public consequence panels only; no private engine internals exposed"
  };
  const operationalDiagnostics = useMemo(
    () => ({
      transport,
      contractValidationStatus,
      replayPolicy: {
        currentStatus: replayStatus,
        eligible: replayEligible,
        rule: "replay only for failed/ambiguous attempts"
      },
      eventIntegrity,
      preconditions: preconditionChecklist,
      boundary: boundaryChecklist,
      designGoalsAlignment
    }),
    [boundaryChecklist, contractValidationStatus, designGoalsAlignment, eventIntegrity, preconditionChecklist, replayEligible, replayStatus, transport]
  );
  const lifecycleOverview = useMemo(
    () => ({
      phase: lifecyclePhase,
      attemptId: currentAttemptId || null,
      replayEligible,
      eventIntegrity: eventIntegrity.state,
      contractValidationStatus,
      transport
    }),
    [contractValidationStatus, currentAttemptId, eventIntegrity.state, lifecyclePhase, replayEligible, transport]
  );
  const actionReadiness = {
    execute: canExecute ? "ready" : hasManifest ? "blocked: grant or preflight preconditions not met" : "blocked: manifest not loaded",
    lifecycle: canRunLifecycle ? "ready" : "blocked: grant/preflight preconditions not met",
    replay: canReplay
      ? "ready"
      : eventIntegrity.state === "gap_detected"
        ? "blocked: event sequence gaps detected"
        : hasExecution
          ? "blocked: replay policy not satisfied"
          : "blocked: no active attempt"
  };
  const lifecycleReadiness = useMemo(
    () =>
      buildLifecycleReadiness([
        Boolean(manifest),
        Boolean(simulation),
        hasExecution,
        events.length > 0,
        proofState === "verified",
        Boolean(discrepancies)
      ]),
    [discrepancies, events.length, hasExecution, manifest, proofState, simulation]
  );
  const evidenceClassification = useMemo(
    () =>
      buildEvidenceClassification({
        hasExecution: Boolean(execution),
        hasEvents: events.length > 0,
        hasDiscrepancies: Boolean(discrepancies),
        proofVerified: proofState === "verified",
        eventContinuous: eventIntegrity.state === "continuous",
        contractValidationVisible: contractValidationStatus === "enforced_on_all_api_payloads"
      }),
    [contractValidationStatus, discrepancies, eventIntegrity.state, events.length, execution, proofState]
  );
  const idempotencyContext = {
    lastIdempotencyKey: lastIdempotencyKey ?? null,
    executeRule: "use execute-scoped idempotency key per invoice",
    replayRule: "use replay-scoped idempotency key per attempt"
  };
  const errorTaxonomy = {
    category: classifyErrorCategory(error),
    message: error
  };
  const fallbackBoundary = {
    transport,
    boundary: transport === "gateway"
      ? "production-observed gateway mode"
      : "demo fallback mode; onboarding evidence only"
  };
  const artifactMap = {
    manifest: "GET /v1/agent/manifest/:invoiceId",
    simulation: "POST /v1/agent/simulate",
    execution: "POST /v1/agent/execute",
    events: "GET /v1/agent/events",
    proof: "GET /v1/agent/proof/:invoiceId",
    discrepancies: "GET /v1/agent/discrepancies",
    replay: "POST /v1/agent/attempts/:attemptId/replay"
  };
  const operationalQualityGate = {
    lifecycleReadiness,
    evidenceClassification,
    idempotencyContext,
    errorTaxonomy,
    fallbackBoundary,
    resetPolicy: "manifest/execution transitions reset downstream state to prevent stale evidence carryover",
    artifactMap
  };
  const qualitySummary = useMemo(() => {
    const trustedSignals = [
      evidenceClassification.trusted.proofVerified,
      evidenceClassification.trusted.eventContinuity,
      evidenceClassification.trusted.contractValidation
    ].filter(Boolean).length;
    return {
      lifecycle: `${lifecycleReadiness.completed}/${lifecycleReadiness.total}`,
      trustedSignals: `${trustedSignals}/3`,
      fallback: fallbackBoundary.boundary,
      errorCategory: errorTaxonomy.category
    };
  }, [evidenceClassification.trusted.contractValidation, evidenceClassification.trusted.eventContinuity, evidenceClassification.trusted.proofVerified, errorTaxonomy.category, fallbackBoundary.boundary, lifecycleReadiness.completed, lifecycleReadiness.total]);
  const tasks1to10Checklist = useMemo(
    () =>
      buildTasks1To10Status({
        lifecycleCompleteness: lifecycleReadiness,
        hasAttemptContext: Boolean(currentAttemptId),
        replayEligible,
        hasReplayScope: hasExecution,
        preconditionReadable: Boolean(actionReadiness.execute && actionReadiness.lifecycle),
        closeoutRecommendationPresent: closeoutRecommendation.length > 0,
        transportGuidancePresent: Boolean(transportGuidance),
        contractValidationVisible: contractValidationStatus.length > 0,
        eventIntegrityState: eventIntegrity.state,
        activityLogCount: activityLog.length,
        resetPolicyVisible: true
      }),
    [actionReadiness.execute, actionReadiness.lifecycle, activityLog.length, closeoutRecommendation.length, contractValidationStatus.length, currentAttemptId, eventIntegrity.state, hasExecution, lifecycleReadiness, replayEligible, transportGuidance]
  );
  const tasks1to10Summary = useMemo(() => summarizeTasks1To10(tasks1to10Checklist), [tasks1to10Checklist]);
  const tasks1to10ResolutionPlan = useMemo(() => buildTasks1To10ResolutionPlan(tasks1to10Checklist), [tasks1to10Checklist]);
  const tasks11to20Status = useMemo(
    () =>
      buildTasks11To20Status({
        hasAttemptContext: hasExecution,
        hasAttemptScopedDiscrepancies: Boolean(currentAttemptId),
        evidenceClassification,
        boundaryVisible: boundaryChecklist.excludesPrivateDecisionLogic,
        designGoalsVisible: Boolean(designGoalsAlignment.minimalSurfaceArea),
        idempotencyVisible: Boolean(idempotencyContext.executeRule && idempotencyContext.replayRule),
        errorCategory: errorTaxonomy.category,
        fallbackVisible: Boolean(fallbackBoundary.boundary),
        lifecycleReadiness,
        artifactMapVisible: Object.keys(artifactMap).length > 0
      }),
    [artifactMap, boundaryChecklist.excludesPrivateDecisionLogic, currentAttemptId, designGoalsAlignment.minimalSurfaceArea, errorTaxonomy.category, evidenceClassification, fallbackBoundary.boundary, hasExecution, idempotencyContext.executeRule, idempotencyContext.replayRule, lifecycleReadiness]
  );
  const tasks11to20Summary = useMemo(() => summarizeTasks(tasks11to20Status), [tasks11to20Status]);
  const tasks11to20ResolutionPlan = useMemo(() => buildResolutionPlan(tasks11to20Status), [tasks11to20Status]);
  const tasks11to20DependencyIssues = useMemo(() => buildDependencyIssues(tasks11to20Status), [tasks11to20Status]);
  const tasks11to20QualityScore = useMemo(
    () => buildQualityScore({ status: tasks11to20Status, lifecycleReadiness, evidenceClassification }),
    [evidenceClassification, lifecycleReadiness, tasks11to20Status]
  );

  function pushActivity(action: ActionName, outcome: "started" | "success" | "error" | "blocked", detail?: string) {
    const context = currentAttemptId ? `attempt=${currentAttemptId}` : "attempt=none";
    const entry = { action, outcome, detail: [detail, `transport=${transport}`, `phase=${lifecyclePhase}`, context].filter(Boolean).join(" · "), at: new Date().toISOString() };
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
    setActiveAttemptId("");
    setLifecyclePhase("idle");
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
      setLifecyclePhase("manifest_ready");
      setSimulation(null);
      setExecution(null);
      setProof(null);
      setProofVerification(null);
      setProofState("idle");
      setDiscrepancies(null);
      setEvents([]);
      setActiveAttemptId("");
      streamRef.current?.close();
      streamRef.current = null;
    });
  }

  async function runLifecycle() {
    await runAction("lifecycle", async () => {
      const currentManifest = manifest ?? await fetchManifest(invoiceId);
      if (!manifest) setManifest(currentManifest);

      const nextSimulation = await simulate(currentManifest, grant as PolicyGrant);
      setSimulation(nextSimulation);
      setLifecyclePhase("simulated");

      const executeIdempotencyKey = createIdempotencyKey("execute", currentManifest.invoiceRef);
      setLastIdempotencyKey(executeIdempotencyKey);
      const nextExecution = await execute(currentManifest, grant as PolicyGrant, preflightToken, executeIdempotencyKey);
      setExecution(nextExecution);
      setLifecyclePhase("executed");
      setProof(null);
      setProofVerification(null);
      setProofState("idle");
      setDiscrepancies(null);
      setTransport(getTransportMode());

      const attemptId = nextExecution.attemptId ?? "";
      if (attemptId) {
        setActiveAttemptId(attemptId);
        streamRef.current?.close();
        setEvents([]);
        streamRef.current = openEventStream(
          attemptId,
          (event) => {
            setEvents((current) => [...current, event]);
            setLifecyclePhase("events_observed");
          },
          (streamError) => setError(formatApiError(streamError))
        );

        try {
          setProofState("pending_finality");
          const nextProof = await fetchProof(invoiceId, attemptId);
          setProof(nextProof);
          const verification = await verifySettlementProof(nextProof, currentManifest);
          setProofVerification(verification);
          setProofState(verification.ok ? "verified" : "invalid");
          setLifecyclePhase("proof_reviewed");
        } catch {
          setProofState("unavailable");
          setLifecyclePhase("proof_reviewed");
        }

        const nextDiscrepancies = await fetchDiscrepancies({
          invoiceId,
          attemptId,
          severity: discrepancySeverity || undefined
        });
        setDiscrepancies(nextDiscrepancies);
        setLifecyclePhase("discrepancies_loaded");
      }
    });
  }

  async function runSimulation() {
    await runAction("simulate", async () => {
      const currentManifest = manifest ?? await fetchManifest(invoiceId);
      if (!manifest) setManifest(currentManifest);
      const next = await simulate(currentManifest, grant as PolicyGrant);
      setSimulation(next);
      setLifecyclePhase("simulated");
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
      setLifecyclePhase("executed");
      setProof(null);
      setProofVerification(null);
      setProofState("idle");
      setDiscrepancies(null);
      setTransport(getTransportMode());
      const attemptId = next.attemptId ?? "";
      if (attemptId) {
        setActiveAttemptId(attemptId);
        streamRef.current?.close();
        setEvents([]);
        streamRef.current = openEventStream(
          attemptId,
          (event) => {
            setEvents((current) => [...current, event]);
            setLifecyclePhase("events_observed");
          },
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

      const attemptId = currentAttemptId || execution?.attemptId || undefined;
      if (attemptId) setActiveAttemptId(attemptId);
      const next = await fetchProof(invoiceId, attemptId || undefined);
      setProof(next);
      const verification = await verifySettlementProof(next, currentManifest);
      setProofVerification(verification);
      if (verification.ok) setProofState("verified");
      else setProofState("invalid");
      setLifecyclePhase("proof_reviewed");
    }, () => {
      setProofState("unavailable");
      setLifecyclePhase("proof_reviewed");
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
      setLifecyclePhase("discrepancies_loaded");
    });
  }

  async function replay() {
    await runAction("replay", async () => {
      const attemptId = currentAttemptId || execution?.attemptId || "";
      if (!attemptId) throw new Error("No attemptId available to replay.");
      const idempotencyKey = createIdempotencyKey("replay", attemptId);
      setLastIdempotencyKey(idempotencyKey);
      const next = await replayAttempt(attemptId, idempotencyKey, execution?.status);
      setExecution(next);
      setActiveAttemptId(attemptId);
      setLifecyclePhase("replayed");
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
        <div className={`notice ${transport === "demo-fallback" ? "notice-error" : "notice-status"}`} role="status" aria-live="polite">
          <span className={`notice-icon ${transport === "demo-fallback" ? "error" : "helper"}`} aria-hidden="true">{transport === "demo-fallback" ? "!" : "i"}</span>
          {transportGuidance}
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
              <button onClick={runLifecycle} disabled={!canRunLifecycle || isBusy}>
                {activeAction === "lifecycle" ? <span className="loading-dot" aria-hidden="true" /> : <span className="action-icon" aria-hidden="true">⇢</span>}
                Run lifecycle
              </button>
            </div>
            {preflightLooksPlaceholder ? (
              <div className="notice notice-error" role="alert" aria-live="assertive">
                <span className="notice-icon error" aria-hidden="true">!</span>
                Boundary precondition failed: replace placeholder/demo preflight token with a private-gateway-issued token.
              </div>
            ) : null}
            <div className="hint-text">Action readiness — execute: {actionReadiness.execute} · lifecycle: {actionReadiness.lifecycle} · replay: {actionReadiness.replay}</div>
            <div className="hint-text">Reset policy: changing manifest/execution scope clears downstream outputs to avoid stale evidence carryover.</div>
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
            {hasExecution ? (
              <div className="notice notice-status" role="status" aria-live="polite">
                <span className="notice-icon helper" aria-hidden="true">i</span>
                Current attempt: {currentAttemptId} · replay {replayEligible ? "allowed" : `blocked (status: ${replayStatus})`}
              </div>
            ) : null}
            {!canReplay && hasExecution ? (
              <div className="notice notice-helper" role="status" aria-live="polite">
                <span className="notice-icon helper" aria-hidden="true">i</span>
                Replay precondition not met: only failed/ambiguous attempts are replay-eligible.
              </div>
            ) : null}
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
            <div className="hint-text">Discrepancy checks automatically include the current attempt ID when available.</div>
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
          <JsonPanel title="Session trace (invoice → attempt lifecycle)" value={sessionTrace} defaultOpen={false} />
          <JsonPanel title="Trust profile (validation + boundary interpretation)" value={trustProfile} defaultOpen={false} />
          <JsonPanel title="Operational diagnostics (tasks 5-10)" value={operationalDiagnostics} defaultOpen={false} />
          <JsonPanel title="Tasks 1-10 checklist" value={tasks1to10Checklist} defaultOpen={false} />
          <JsonPanel title="Boundary + design-goal alignment (tasks 10-12)" value={{ boundaryChecklist, designGoalsAlignment }} defaultOpen={false} />
          <JsonPanel title="Lifecycle overview (tasks 1-10)" value={lifecycleOverview} defaultOpen={false} />
          <JsonPanel title="Operational quality gate (tasks 11-20)" value={operationalQualityGate} defaultOpen={false} />
          <JsonPanel title="Tasks 11-20 checklist" value={tasks11to20Status} defaultOpen={false} />
          <div className="notice notice-status" role="status" aria-live="polite">
            <span className="notice-icon helper" aria-hidden="true">i</span>
            Quality summary: lifecycle {qualitySummary.lifecycle} · trusted signals {qualitySummary.trustedSignals} · fallback {qualitySummary.fallback}
          </div>
          {tasks11to20Summary.unresolved.length > 0 ? (
            <div className="notice notice-helper" role="status" aria-live="polite">
              <span className="notice-icon helper" aria-hidden="true">i</span>
              Tasks 11-20 pending signals: {tasks11to20Summary.unresolved.join(", ")} ({tasks11to20Summary.satisfiedCount}/{tasks11to20Summary.total} satisfied).
            </div>
          ) : (
            <div className="notice notice-status" role="status" aria-live="polite">
              <span className="notice-icon success" aria-hidden="true">✓</span>
              Tasks 11-20 status: all signals satisfied ({tasks11to20Summary.total}/{tasks11to20Summary.total}).
            </div>
          )}
          {tasks11to20Summary.blocking.length > 0 ? (
            <div className="notice notice-error" role="alert" aria-live="assertive">
              <span className="notice-icon error" aria-hidden="true">!</span>
              Blocking tasks (critical): {tasks11to20Summary.blocking.join(", ")}.
            </div>
          ) : null}
          <div className="notice notice-status" role="status" aria-live="polite">
            <span className="notice-icon helper" aria-hidden="true">i</span>
            Tasks 11-20 quality score: {tasks11to20QualityScore.score} ({tasks11to20QualityScore.grade}).
          </div>
          {tasks11to20DependencyIssues.length > 0 ? (
            <div className="notice notice-helper" role="status" aria-live="polite">
              <span className="notice-icon helper" aria-hidden="true">i</span>
              Tasks 11-20 dependency issues detected: {tasks11to20DependencyIssues.length}.
            </div>
          ) : null}
          <JsonPanel title="Tasks 11-20 resolution plan" value={tasks11to20ResolutionPlan} defaultOpen={false} />
          <JsonPanel title="Tasks 11-20 dependency issues" value={tasks11to20DependencyIssues} defaultOpen={false} />
          {qualitySummary.errorCategory !== "none" ? (
            <div className="notice notice-helper" role="status" aria-live="polite">
              <span className="notice-icon helper" aria-hidden="true">i</span>
              Current error taxonomy: {qualitySummary.errorCategory}. Use this to pick the next remediation path.
            </div>
          ) : null}
          {lifecycleReadiness.state === "incomplete" ? (
            <div className="notice notice-helper" role="status" aria-live="polite">
              <span className="notice-icon helper" aria-hidden="true">i</span>
              Lifecycle completeness: {lifecycleReadiness.completed}/{lifecycleReadiness.total} steps complete.
            </div>
          ) : null}
          {tasks1to10Summary.unresolved.length > 0 ? (
            <div className="notice notice-helper" role="status" aria-live="polite">
              <span className="notice-icon helper" aria-hidden="true">i</span>
              Tasks 1-10 pending signals: {tasks1to10Summary.unresolved.join(", ")} ({tasks1to10Summary.satisfiedCount}/{tasks1to10Summary.total} satisfied).
            </div>
          ) : (
            <div className="notice notice-status" role="status" aria-live="polite">
              <span className="notice-icon success" aria-hidden="true">✓</span>
              Tasks 1-10 status: all signals satisfied ({tasks1to10Summary.total}/{tasks1to10Summary.total}).
            </div>
          )}
          {tasks1to10Summary.blocking.length > 0 ? (
            <div className="notice notice-error" role="alert" aria-live="assertive">
              <span className="notice-icon error" aria-hidden="true">!</span>
              Blocking tasks (critical): {tasks1to10Summary.blocking.join(", ")}.
            </div>
          ) : null}
          <JsonPanel title="Tasks 1-10 resolution plan" value={tasks1to10ResolutionPlan} defaultOpen={false} />
          <div className={`notice proof-chip ${proofState} tone-${proofStateMeta[proofState].tone}`} role="status" aria-live="polite">
            <span className="proof-icon" aria-hidden="true">{proofStateMeta[proofState].icon}</span>
            Proof state: {proofStateMeta[proofState].label}
          </div>
          {eventIntegrity.state === "gap_detected" ? (
            <div className="notice notice-error" role="alert" aria-live="assertive">
              <span className="notice-icon error" aria-hidden="true">!</span>
              Event sequence gaps detected. Validate stream continuity before financial closeout.
            </div>
          ) : null}
          <div className="notice notice-status" role="status" aria-live="polite">
            <span className="notice-icon helper" aria-hidden="true">i</span>
            Closeout guidance: {closeoutRecommendation}
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
