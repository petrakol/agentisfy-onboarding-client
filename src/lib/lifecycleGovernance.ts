export type Task1To10Key =
  | "task1_lifecycle_completeness_primary_signal"
  | "task2_attempt_scoped_followups"
  | "task3_replay_recovery_only"
  | "task4_precondition_clarity"
  | "task5_closeout_decision_layer"
  | "task6_transport_as_evidence_context"
  | "task7_contract_validation_baseline"
  | "task8_event_integrity_risk_signal"
  | "task9_activity_timeline_diagnostics"
  | "task10_reset_semantics_visibility";

export type Task1To10Status = Record<
  Task1To10Key,
  { satisfied: boolean; reason: string; severity: "info" | "warning" | "critical"; dependsOn?: string[] }
>;

export function buildTasks1To10Status(input: {
  lifecycleCompleteness: { state: "complete" | "incomplete"; completed: number; total: number };
  hasAttemptContext: boolean;
  replayEligible: boolean;
  hasReplayScope: boolean;
  preconditionReadable: boolean;
  closeoutRecommendationPresent: boolean;
  transportGuidancePresent: boolean;
  contractValidationVisible: boolean;
  eventIntegrityState: string;
  activityLogCount: number;
  resetPolicyVisible: boolean;
}): Task1To10Status {
  const attemptScopeMissing = !input.hasAttemptContext;
  const replayPolicyMissing = input.hasReplayScope && !input.replayEligible;
  return {
    task1_lifecycle_completeness_primary_signal: {
      severity: input.lifecycleCompleteness.state === "complete" ? "info" : "warning",
      satisfied: input.lifecycleCompleteness.completed > 0,
      reason: `Lifecycle completeness signal is ${input.lifecycleCompleteness.completed}/${input.lifecycleCompleteness.total} (${input.lifecycleCompleteness.state}).`
    },
    task2_attempt_scoped_followups: {
      severity: attemptScopeMissing ? "critical" : "info",
      satisfied: !attemptScopeMissing,
      reason: attemptScopeMissing ? "No active attempt context available." : "Follow-up actions have attempt context.",
      dependsOn: ["task1_lifecycle_completeness_primary_signal"]
    },
    task3_replay_recovery_only: {
      severity: replayPolicyMissing ? "critical" : "info",
      satisfied: !replayPolicyMissing,
      reason: !input.hasReplayScope ? "Replay not currently in scope." : input.replayEligible ? "Replay scope is constrained to eligible statuses." : "Replay scope exists but eligibility constraints are unmet.",
      dependsOn: ["task2_attempt_scoped_followups"]
    },
    task4_precondition_clarity: {
      severity: input.preconditionReadable ? "info" : "warning",
      satisfied: input.preconditionReadable,
      reason: input.preconditionReadable ? "Precondition readiness is explicitly visible." : "Precondition readiness is not clearly visible."
    },
    task5_closeout_decision_layer: {
      severity: input.closeoutRecommendationPresent ? "info" : "warning",
      satisfied: input.closeoutRecommendationPresent,
      reason: input.closeoutRecommendationPresent ? "Closeout decision guidance is present." : "Closeout guidance is missing."
    },
    task6_transport_as_evidence_context: {
      severity: input.transportGuidancePresent ? "info" : "warning",
      satisfied: input.transportGuidancePresent,
      reason: input.transportGuidancePresent ? "Transport trust context is surfaced." : "Transport trust context is not surfaced."
    },
    task7_contract_validation_baseline: {
      severity: input.contractValidationVisible ? "info" : "critical",
      satisfied: input.contractValidationVisible,
      reason: input.contractValidationVisible ? "Contract validation baseline is visible." : "Contract validation baseline is not visible.",
      dependsOn: ["task4_precondition_clarity"]
    },
    task8_event_integrity_risk_signal: {
      severity: input.eventIntegrityState === "gap_detected" ? "critical" : input.eventIntegrityState === "empty" ? "warning" : "info",
      satisfied: input.eventIntegrityState !== "empty",
      reason: input.eventIntegrityState === "empty" ? "No event integrity signal yet." : `Event integrity signal is ${input.eventIntegrityState}.`
    },
    task9_activity_timeline_diagnostics: {
      severity: input.activityLogCount > 0 ? "info" : "warning",
      satisfied: input.activityLogCount > 0,
      reason: input.activityLogCount > 0 ? "Activity timeline has diagnostic entries." : "Activity timeline has no entries yet."
    },
    task10_reset_semantics_visibility: {
      severity: input.resetPolicyVisible ? "info" : "warning",
      satisfied: input.resetPolicyVisible,
      reason: input.resetPolicyVisible ? "Reset semantics are explicitly visible." : "Reset semantics visibility is missing."
    }
  };
}

export function summarizeTasks1To10(status: Task1To10Status) {
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

export function buildTasks1To10ResolutionPlan(status: Task1To10Status) {
  return Object.entries(status)
    .filter(([, value]) => !value.satisfied)
    .sort((a, b) => {
      const rank = (severity: "info" | "warning" | "critical") => (severity === "critical" ? 0 : severity === "warning" ? 1 : 2);
      return rank(a[1].severity) - rank(b[1].severity);
    })
    .map(([task, value]) => ({
      task,
      priority: value.severity,
      reason: value.reason,
      dependsOn: value.dependsOn ?? []
    }));
}
