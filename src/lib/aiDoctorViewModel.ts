/**
 * aiDoctorViewModel — pure presenter over the compiled AI Doctor context.
 *
 * Surfaces Environment Check evidence (local EcoWitt validation) honestly
 * and cautiously, and falls back to a "more data needed" state when no
 * Environment Check events exist — without altering existing AI Doctor
 * behavior for the live sensor path.
 */

import {
  compileAiDoctorContext,
  type CompileAiDoctorContextInput,
  type CompiledAiDoctorContext,
} from "./aiDoctorContextCompiler";
import {
  buildEnvironmentCheckChecklist,
  type AiDoctorEnvironmentCheckResult,
} from "./aiDoctorEnvironmentCheckRules";
import {
  buildDiagnosisEvidenceAlignmentVM,
  type DiagnosisEvidenceAlignmentInput,
  type DiagnosisEvidenceAlignmentVM,
} from "./aiDoctorDiagnosisEvidenceAlignmentRules";

export type {
  DiagnosisEvidenceAlignmentVM,
  RecommendationPosture,
} from "./aiDoctorDiagnosisEvidenceAlignmentRules";

export interface BuildDiagnosisAlignmentInput extends CompileAiDoctorContextInput {
  hasRecentDiary?: boolean;
  hasRecentPhotos?: boolean;
}

export function buildAiDoctorDiagnosisEvidenceAlignmentVM(
  input: BuildDiagnosisAlignmentInput,
): DiagnosisEvidenceAlignmentVM {
  const compiled = compileAiDoctorContext({
    sensorContext: input.sensorContext ?? null,
    environmentCheckEvents: input.environmentCheckEvents ?? null,
  });
  const liveSensorUsable =
    !!compiled.sensor &&
    compiled.sensor.sourceState === "live" &&
    compiled.sensor.usableMetrics.length > 0 &&
    !compiled.sensor.isStale &&
    !compiled.sensor.isInvalid;
  const ec = compiled.environmentCheck;
  const envCheckPresent = ec.kind === "present";
  const acceptedCount = envCheckPresent ? ec.acceptedCount : 0;
  const rejectedCount = envCheckPresent ? ec.rejectedCount : 0;
  const notCheckedCount = envCheckPresent ? ec.notCheckedCount : 0;
  const derivedVpd =
    envCheckPresent && ec.metrics.some((m) => m.derived && m.key === "vpd_kpa");
  const checklist = buildEnvironmentCheckChecklist({
    event: compiled.environmentCheckSelection.selected,
    hasLiveSensorContext: liveSensorUsable,
  });
  const moreDataNeededCount = checklist.items.filter(
    (i) => i.state === "needed",
  ).length;
  const alignmentInput: DiagnosisEvidenceAlignmentInput = {
    hasLiveSensor: !!compiled.sensor,
    liveSensorUsable,
    envCheckPresent,
    envCheckAcceptedCount: acceptedCount,
    envCheckRejectedCount: rejectedCount,
    envCheckNotCheckedCount: notCheckedCount,
    envCheckHasDerivedVpd: derivedVpd,
    hasRecentDiary: input.hasRecentDiary === true,
    hasRecentPhotos: input.hasRecentPhotos === true,
    moreDataNeededCount,
  };
  return buildDiagnosisEvidenceAlignmentVM(alignmentInput);
}

export interface AiDoctorEnvironmentCheckBlockVM {
  show: boolean;
  /** "local EcoWitt validation / test-local evidence" — never "Live". */
  sourceLabel: string;
  isLive: false;
  capturedAt: string | null;
  statusLabel: string;
  acceptedCount: number;
  rejectedCount: number;
  notCheckedCount: number;
  /** Per-metric rows for presenter use. */
  metricRows: Array<{
    key: string;
    label: string;
    statusLabel: string;
    value: number | null;
    reason: string;
    derived: boolean;
  }>;
  derivedNotes: string[];
  warnings: string[];
  contextSummary: string;
  cautionCopy: string;
  /**
   * Distinct test/local badge label so UI cannot accidentally render
   * Environment Check evidence with a Live badge.
   */
  evidenceBadge: "Test/Local validation";
}

export interface AiDoctorViewModel {
  hasAnyEvidence: boolean;
  environmentCheck: AiDoctorEnvironmentCheckBlockVM;
  combinedSafetyNotes: string[];
  /**
   * Honest one-line caution when context is missing or weak. Empty string
   * when context is strong enough for AI Doctor to proceed.
   */
  missingContextCaution: string;
}

function statusLabel(status: string): string {
  if (status === "accepted") return "Accepted";
  if (status === "rejected") return "Rejected";
  if (status === "not_checked") return "Not checked";
  return "Unknown";
}

function envCheckBlock(
  ec: AiDoctorEnvironmentCheckResult,
): AiDoctorEnvironmentCheckBlockVM {
  if (ec.kind === "absent") {
    return {
      show: false,
      sourceLabel: "local EcoWitt validation / test-local evidence",
      isLive: false,
      capturedAt: null,
      statusLabel: "Unknown",
      acceptedCount: 0,
      rejectedCount: 0,
      notCheckedCount: 0,
      metricRows: [],
      derivedNotes: [],
      warnings: [],
      contextSummary: "",
      cautionCopy: ec.cautionCopy,
      evidenceBadge: "Test/Local validation",
    };
  }
  return {
    show: true,
    sourceLabel: ec.sourceLabel,
    isLive: false,
    capturedAt: ec.capturedAt,
    statusLabel: statusLabel(ec.status),
    acceptedCount: ec.acceptedCount,
    rejectedCount: ec.rejectedCount,
    notCheckedCount: ec.notCheckedCount,
    metricRows: ec.metrics.map((m) => ({
      key: m.key,
      label: m.label,
      statusLabel: statusLabel(m.status),
      value: m.value,
      reason: m.reason,
      derived: m.derived,
    })),
    derivedNotes: ec.derivedNotes,
    warnings: ec.warnings,
    contextSummary: ec.contextSummary,
    cautionCopy:
      ec.status === "rejected" || ec.rejectedCount > 0
        ? "Environment Check has rejected metrics — do not treat them as healthy. More data is needed."
        : ec.notCheckedCount > 0 && ec.acceptedCount === 0
          ? "Environment Check metrics were not_checked — more data is needed."
          : "",
    evidenceBadge: "Test/Local validation",
  };
}

export function buildAiDoctorViewModel(
  input: CompileAiDoctorContextInput,
): AiDoctorViewModel {
  const compiled: CompiledAiDoctorContext = compileAiDoctorContext(input);
  const block = envCheckBlock(compiled.environmentCheck);
  const sensorUsable =
    !!compiled.sensor && compiled.sensor.usableMetrics.length > 0;
  const envUsable =
    compiled.environmentCheck.present &&
    compiled.environmentCheck.acceptedCount > 0 &&
    compiled.environmentCheck.status !== "rejected";

  let missing = "";
  if (!sensorUsable && !envUsable) {
    missing =
      "More data is needed before AI Doctor can draw conclusions: no usable live sensor reading and no accepted Environment Check evidence.";
  } else if (block.show && (block.rejectedCount > 0 || block.notCheckedCount > 0)) {
    missing =
      "Environment Check evidence is weak: some metrics are rejected or not_checked — AI Doctor should remain cautious.";
  }

  return {
    hasAnyEvidence: compiled.hasAnyEvidence,
    environmentCheck: block,
    combinedSafetyNotes: compiled.combinedSafetyNotes,
    missingContextCaution: missing,
  };
}
