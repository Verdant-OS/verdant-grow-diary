import {
  reviewManualSensorSnapshot,
  type SensorSnapshotReviewInput,
  type SensorSnapshotReviewOptions,
  type SensorSnapshotReviewResult,
} from "@/lib/sensorSnapshotReviewRules";

/** Corrections may repair historical evidence without promoting it to current evidence. */
export function reviewManualSensorCorrection(
  input: SensorSnapshotReviewInput,
  options?: SensorSnapshotReviewOptions,
): SensorSnapshotReviewResult {
  const review = reviewManualSensorSnapshot(input, options);
  const findings = review.findings.map((finding) =>
    finding.key === "captured_at_too_old"
      ? {
          ...finding,
          severity: "warning" as const,
          message:
            "This corrects a historical reading. Its original observation time stays unchanged; it cannot support current-room guidance.",
        }
      : finding,
  );
  return {
    ...review,
    findings,
    canSave: !findings.some((finding) => finding.severity === "blocker"),
  };
}
