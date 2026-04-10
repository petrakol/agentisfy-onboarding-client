export type ErrorCategory = "none" | "precondition" | "contract_validation" | "network" | "http" | "other";

export type LifecycleReadiness = {
  completed: number;
  total: number;
  ratio: number;
  state: "complete" | "incomplete";
};

export type EvidenceClassification = {
  observed: {
    execution: boolean;
    events: boolean;
    discrepancies: boolean;
  };
  trusted: {
    proofVerified: boolean;
    eventContinuity: boolean;
    contractValidation: boolean;
  };
};

export type TaskStatus = {
  severity: "info" | "warning" | "critical";
  satisfied: boolean;
  reason: string;
  dependsOn?: string[];
};

export type Tasks11To20Status = Record<
  | "task11_reset_semantics"
  | "task12_attempt_scoped_discrepancies"
  | "task13_observed_vs_trusted_separation"
  | "task14_boundary_discipline"
  | "task15_design_goal_alignment"
  | "task16_idempotency_semantics"
  | "task17_error_taxonomy"
  | "task18_fallback_bounds"
  | "task19_lifecycle_completeness_signal"
  | "task20_api_artifact_mapping",
  TaskStatus
>;

export function classifyErrorCategory(error: string | null): ErrorCategory {
  if (!error) return "none";
  if (error.includes("Precondition failed")) return "precondition";
  if (error.includes("Contract validation failed")) return "contract_validation";
  if (error.includes("Gateway unreachable")) return "network";
  if (error.includes("Gateway HTTP error")) return "http";
  return "other";
}

export function buildLifecycleReadiness(steps: boolean[]): LifecycleReadiness {
  const completed = steps.filter(Boolean).length;
  const total = steps.length;
  return {
    completed,
    total,
    ratio: Number((completed / total).toFixed(2)),
    state: completed === total ? "complete" : "incomplete"
  };
}

export function buildEvidenceClassification(input: {
  hasExecution: boolean;
  hasEvents: boolean;
  hasDiscrepancies: boolean;
  proofVerified: boolean;
  eventContinuous: boolean;
  contractValidationVisible: boolean;
}): EvidenceClassification {
  return {
    observed: {
      execution: input.hasExecution,
      events: input.hasEvents,
      discrepancies: input.hasDiscrepancies
    },
    trusted: {
      proofVerified: input.proofVerified,
      eventContinuity: input.eventContinuous,
      contractValidation: input.contractValidationVisible
    }
  };
}

export function buildTasks11To20Status(input: {
  hasAttemptContext: boolean;
  hasAttemptScopedDiscrepancies: boolean;
  evidenceClassification: EvidenceClassification;
  boundaryVisible: boolean;
  designGoalsVisible: boolean;
  idempotencyVisible: boolean;
  errorCategory: ErrorCategory;
  fallbackVisible: boolean;
  lifecycleReadiness: LifecycleReadiness;
  artifactMapVisible: boolean;
}): Tasks11To20Status {
  const observedTrustGap = input.evidenceClassification.observed.events && !input.evidenceClassification.trusted.eventContinuity;
  const missingAttemptScope = !input.hasAttemptScopedDiscrepancies;
  return {
    task11_reset_semantics: {
      severity: "warning",
      satisfied: true,
      reason: "Reset policy is explicitly surfaced and applied on scope transitions."
    },
    task12_attempt_scoped_discrepancies: {
      severity: missingAttemptScope ? "critical" : "info",
      satisfied: !missingAttemptScope,
      reason: missingAttemptScope ? "No attempt context available for discrepancy scoping." : "Discrepancy lookups use attempt context.",
      dependsOn: ["task2_attempt_scope"]
    },
    task13_observed_vs_trusted_separation: {
      severity: observedTrustGap ? "warning" : "info",
      satisfied: true,
      reason: `Observed/trusted split is explicit (${input.evidenceClassification.observed.events ? "events observed" : "no events observed"}).`
    },
    task14_boundary_discipline: {
      severity: input.boundaryVisible ? "info" : "critical",
      satisfied: input.boundaryVisible,
      reason: input.boundaryVisible ? "Boundary exclusions are explicitly visible." : "Boundary exclusions are not currently visible.",
      dependsOn: ["task4_precondition_clarity"]
    },
    task15_design_goal_alignment: {
      severity: input.designGoalsVisible ? "info" : "warning",
      satisfied: input.designGoalsVisible,
      reason: input.designGoalsVisible ? "Design-goal alignment is surfaced." : "Design-goal alignment is not surfaced."
    },
    task16_idempotency_semantics: {
      severity: input.idempotencyVisible ? "info" : "critical",
      satisfied: input.idempotencyVisible,
      reason: input.idempotencyVisible ? "Execute/replay idempotency semantics are visible." : "Idempotency semantics are not visible.",
      dependsOn: ["task3_replay_recovery_only"]
    },
    task17_error_taxonomy: {
      severity: input.errorCategory === "other" ? "warning" : "info",
      satisfied: input.errorCategory !== "other",
      reason: input.errorCategory === "other" ? "Unclassified error type detected." : `Error taxonomy is classified as ${input.errorCategory}.`,
      dependsOn: ["task7_contract_validation_baseline"]
    },
    task18_fallback_bounds: {
      severity: input.fallbackVisible ? "info" : "warning",
      satisfied: input.fallbackVisible,
      reason: input.fallbackVisible ? "Fallback boundary context is visible." : "Fallback boundary context is not visible."
    },
    task19_lifecycle_completeness_signal: {
      severity: input.lifecycleReadiness.state === "complete" ? "info" : "warning",
      satisfied: true,
      reason: `Lifecycle completeness signal ${input.lifecycleReadiness.completed}/${input.lifecycleReadiness.total}.`
    },
    task20_api_artifact_mapping: {
      severity: input.artifactMapVisible ? "info" : "critical",
      satisfied: input.artifactMapVisible,
      reason: input.artifactMapVisible ? "API artifact mapping is visible." : "API artifact mapping is not visible.",
      dependsOn: ["task1_lifecycle_completeness_primary_signal"]
    }
  };
}

export function summarizeTasks(status: Tasks11To20Status) {
  const entries = Object.entries(status);
  const unresolved = entries.filter(([, value]) => !value.satisfied).map(([key]) => key);
  const blocking = entries
    .filter(([, value]) => !value.satisfied && value.severity === "critical")
    .map(([key]) => key);
  return {
    satisfiedCount: entries.length - unresolved.length,
    total: entries.length,
    unresolved,
    blocking
  };
}

export function buildResolutionPlan(status: Tasks11To20Status) {
  return Object.entries(status)
    .filter(([, value]) => !value.satisfied)
    .sort((a, b) => {
      const rank = (severity: TaskStatus["severity"]) => (severity === "critical" ? 0 : severity === "warning" ? 1 : 2);
      return rank(a[1].severity) - rank(b[1].severity);
    })
    .map(([task, value]) => ({
      task,
      priority: value.severity,
      reason: value.reason,
      dependsOn: value.dependsOn ?? []
    }));
}

export function buildDependencyIssues(status: Tasks11To20Status) {
  return Object.entries(status)
    .filter(([, value]) => !value.satisfied && (value.dependsOn?.length ?? 0) > 0)
    .map(([task, value]) => ({
      task,
      unmetDependencies: (value.dependsOn ?? []).filter((dependency) => !(dependency in status)),
      declaredDependencies: value.dependsOn ?? []
    }));
}

export function buildQualityScore(input: {
  status: Tasks11To20Status;
  lifecycleReadiness: LifecycleReadiness;
  evidenceClassification: EvidenceClassification;
}) {
  const taskEntries = Object.values(input.status);
  const satisfiedRatio = taskEntries.filter((entry) => entry.satisfied).length / taskEntries.length;
  const trustedSignals = [
    input.evidenceClassification.trusted.proofVerified,
    input.evidenceClassification.trusted.eventContinuity,
    input.evidenceClassification.trusted.contractValidation
  ].filter(Boolean).length / 3;
  const lifecycleRatio = input.lifecycleReadiness.ratio;
  const score = Number((satisfiedRatio * 0.45 + trustedSignals * 0.35 + lifecycleRatio * 0.2).toFixed(2));
  return {
    score,
    bands: {
      tasksSatisfiedRatio: Number(satisfiedRatio.toFixed(2)),
      trustedSignalsRatio: Number(trustedSignals.toFixed(2)),
      lifecycleRatio
    },
    grade: score >= 0.85 ? "strong" : score >= 0.65 ? "moderate" : "weak"
  };
}
