/**
 * Pure parsing and presentation rules for the operator-only paid-return
 * cohort snapshot. This module accepts and exposes fixed aggregate counts
 * only; it never carries user, subscription, provider, or grow identifiers.
 */

export interface PaidReturnCounts {
  paidReturnMetricsAvailable: boolean;
  trackedPaidActivations: number;
  inFlightPaidActivations: number;
  maturedPaidActivations60d: number;
  manualGrowReturned60d: number;
  serverCompletedAiDoctorReturned60d: number;
  paidReturned60d: number;
}

export interface PaidReturnSnapshot {
  ok: boolean;
  reason: string | null;
  reasonLabel: string | null;
  generatedAt: string | null;
  counts: PaidReturnCounts;
}

export type PaidReturnCohortStatus =
  | "metrics_unavailable"
  | "integrity_mismatch"
  | "maturing"
  | "no_return_observed"
  | "return_observed";

export interface PaidReturnCohortViewModel {
  status: PaidReturnCohortStatus;
  statusLabel: string;
  guidance: string;
  trackedPaidActivations: number;
  inFlightPaidActivations: number;
  maturedPaidActivations60d: number;
  manualGrowReturned60d: number;
  serverCompletedAiDoctorReturned60d: number;
  paidReturned60d: number;
  returnRatePercent: number | null;
}

const EMPTY_COUNTS: PaidReturnCounts = Object.freeze({
  paidReturnMetricsAvailable: false,
  trackedPaidActivations: 0,
  inFlightPaidActivations: 0,
  maturedPaidActivations60d: 0,
  manualGrowReturned60d: 0,
  serverCompletedAiDoctorReturned60d: 0,
  paidReturned60d: 0,
});

const REASON_LABELS: Readonly<Record<string, string>> = Object.freeze({
  not_authenticated: "Sign in is required to view paid-return cohorts.",
  operator_required: "Operator role is required to view paid-return cohorts.",
  unknown_response: "Paid-return cohort data was not recognized.",
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function isValidCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/** Discards every response field except the fixed aggregate count allowlist. */
export function parsePaidReturnSnapshot(input: unknown): PaidReturnSnapshot {
  if (!isRecord(input)) {
    return {
      ok: false,
      reason: "unknown_response",
      reasonLabel: REASON_LABELS.unknown_response,
      generatedAt: null,
      counts: { ...EMPTY_COUNTS },
    };
  }

  const ok = input.ok === true;
  const reason = asString(input.reason) ?? (ok ? null : "unknown_response");
  const raw = isRecord(input.counts) ? input.counts : {};
  const countFields = [
    raw.tracked_paid_activations,
    raw.in_flight_paid_activations,
    raw.matured_paid_activations_60d,
    raw.manual_grow_returned_60d,
    raw.server_completed_ai_doctor_returned_60d,
    raw.paid_returned_60d,
  ];

  return {
    ok,
    reason,
    reasonLabel: reason
      ? (REASON_LABELS[reason] ?? "Paid-return cohort data is unavailable.")
      : null,
    generatedAt: asString(input.generated_at),
    counts: {
      paidReturnMetricsAvailable: countFields.every(isValidCount),
      trackedPaidActivations: asCount(raw.tracked_paid_activations),
      inFlightPaidActivations: asCount(raw.in_flight_paid_activations),
      maturedPaidActivations60d: asCount(raw.matured_paid_activations_60d),
      manualGrowReturned60d: asCount(raw.manual_grow_returned_60d),
      serverCompletedAiDoctorReturned60d: asCount(raw.server_completed_ai_doctor_returned_60d),
      paidReturned60d: asCount(raw.paid_returned_60d),
    },
  };
}

/**
 * Builds a conservative operator readout. Rates appear only for a cohort that
 * has fully reached day 60, and impossible aggregate relationships fail closed.
 */
export function buildPaidReturnCohortViewModel(
  counts: PaidReturnCounts,
): PaidReturnCohortViewModel {
  const trackedPaidActivations = asCount(counts.trackedPaidActivations);
  const inFlightPaidActivations = asCount(counts.inFlightPaidActivations);
  const maturedPaidActivations60d = asCount(counts.maturedPaidActivations60d);
  const manualGrowReturned60d = asCount(counts.manualGrowReturned60d);
  const serverCompletedAiDoctorReturned60d = asCount(counts.serverCompletedAiDoctorReturned60d);
  const paidReturned60d = asCount(counts.paidReturned60d);
  const base = {
    trackedPaidActivations,
    inFlightPaidActivations,
    maturedPaidActivations60d,
    manualGrowReturned60d,
    serverCompletedAiDoctorReturned60d,
    paidReturned60d,
  };

  if (!counts.paidReturnMetricsAvailable) {
    return {
      ...base,
      returnRatePercent: null,
      status: "metrics_unavailable",
      statusLabel: "Paid-return metrics unavailable",
      guidance:
        "The cohort report did not return its complete aggregate count set. Do not infer a return rate from missing fields.",
    };
  }

  const integrityMismatch =
    maturedPaidActivations60d + inFlightPaidActivations !== trackedPaidActivations ||
    manualGrowReturned60d > maturedPaidActivations60d ||
    serverCompletedAiDoctorReturned60d > maturedPaidActivations60d ||
    paidReturned60d > maturedPaidActivations60d ||
    paidReturned60d < manualGrowReturned60d ||
    paidReturned60d < serverCompletedAiDoctorReturned60d ||
    paidReturned60d > manualGrowReturned60d + serverCompletedAiDoctorReturned60d;

  if (integrityMismatch) {
    return {
      ...base,
      returnRatePercent: null,
      status: "integrity_mismatch",
      statusLabel: "Paid-return counts need review",
      guidance:
        "The aggregate cohort counts do not reconcile. Review the server snapshot before using this return signal.",
    };
  }

  if (maturedPaidActivations60d === 0) {
    return {
      ...base,
      returnRatePercent: null,
      status: "maturing",
      statusLabel: "60-day cohort still maturing",
      guidance:
        "The tracker is intentionally forward-looking. Wait for a captured paid cohort to complete its full 60-day window before inferring a return rate.",
    };
  }

  const returnRatePercent = Math.round((paidReturned60d / maturedPaidActivations60d) * 1_000) / 10;

  if (paidReturned60d === 0) {
    return {
      ...base,
      returnRatePercent,
      status: "no_return_observed",
      statusLabel: "No qualified return observed",
      guidance:
        "No mature paid cohort member has yet returned through manual grow activity or a server-recorded fresh validated AI Doctor review. Review the post-purchase handoff before scaling acquisition.",
    };
  }

  return {
    ...base,
    returnRatePercent,
    status: "return_observed",
    statusLabel: "Qualified return observed",
    guidance:
      "Return activity is present in a mature paid cohort. Treat it as a product-behavior signal, not proof that an acquisition source caused retention.",
  };
}
