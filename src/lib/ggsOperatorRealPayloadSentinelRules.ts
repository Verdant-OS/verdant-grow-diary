/**
 * Canonical read contract for the operator GGS post-commit Sentinel.
 *
 * Operator-pasted data is not independently verified live telemetry. These
 * rules require the server-authored attestation envelope and select one
 * coherent payload cohort before the generic read-only evaluator runs.
 */
import {
  buildGgsRealPayloadCohortId,
  GGS_OPERATOR_ATTESTATION_BOUNDARY,
  GGS_OPERATOR_ATTESTED_PROVENANCE,
  GGS_REAL_PAYLOAD_SOURCE,
  GGS_REAL_PAYLOAD_SOURCE_APP,
} from "@/lib/ggsRealPayloadIngestRules";
import {
  evaluateGgsSentinelReadiness,
  GGS_SENTINEL_METRICS,
  type GgsSentinelEvaluateInput,
  type GgsSentinelEvaluation,
  type GgsSentinelInputRow,
  type GgsSentinelMetric,
} from "@/lib/ggsSentinelSmokeRunner";

export const GGS_OPERATOR_SENTINEL_SOURCE = GGS_REAL_PAYLOAD_SOURCE;
export const GGS_OPERATOR_SENTINEL_ACCEPTED_SOURCES = new Set<string>([
  GGS_OPERATOR_SENTINEL_SOURCE,
]);
export const GGS_OPERATOR_SENTINEL_QUALITY = "ok" as const;
export const GGS_OPERATOR_SENTINEL_VENDOR = GGS_REAL_PAYLOAD_SOURCE_APP;
export const GGS_OPERATOR_SENTINEL_PROVENANCE = GGS_OPERATOR_ATTESTED_PROVENANCE;
export const GGS_OPERATOR_SENTINEL_METRICS = GGS_SENTINEL_METRICS;
export const GGS_OPERATOR_SENTINEL_PROVENANCE_CONTAINS = Object.freeze({
  source_app: GGS_OPERATOR_SENTINEL_VENDOR,
  provenance: GGS_OPERATOR_SENTINEL_PROVENANCE,
  operator_attestation: {
    attested: true,
    boundary: GGS_OPERATOR_ATTESTATION_BOUNDARY,
  },
});

interface TrustedOperatorCohortMetadata {
  cohortId: string;
  deviceId: string;
  capturedAt: string;
  attestedAt: string;
}

export type GgsOperatorCohortSelection =
  | {
      ok: true;
      cohortId: string;
      deviceId: string;
      capturedAt: string;
      rows: GgsSentinelInputRow[];
    }
  | {
      ok: false;
      reason: "no_rows" | "operator_attestation_missing";
    };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readTrustedOperatorCohortMetadata(
  row: GgsSentinelInputRow,
): TrustedOperatorCohortMetadata | null {
  if (!row || typeof row !== "object") return null;
  if (!GGS_OPERATOR_SENTINEL_METRICS.includes(row.metric as GgsSentinelMetric)) return null;
  if (
    row.source !== GGS_OPERATOR_SENTINEL_SOURCE ||
    !Number.isFinite(Date.parse(row.captured_at))
  ) {
    return null;
  }

  const deviceId = typeof row.device_id === "string" ? row.device_id.trim() : "";
  const raw = row.raw_payload;
  if (!deviceId || !isPlainObject(raw)) return null;
  const rowCapturedAtMs = Date.parse(row.captured_at);
  const rawCapturedAtMs =
    typeof raw.captured_at === "string" ? Date.parse(raw.captured_at) : Number.NaN;
  if (
    raw.source_app !== GGS_OPERATOR_SENTINEL_VENDOR ||
    raw.provenance !== GGS_OPERATOR_SENTINEL_PROVENANCE ||
    raw.device_id !== deviceId ||
    raw.sensor_id !== deviceId ||
    !Number.isFinite(rawCapturedAtMs) ||
    rawCapturedAtMs !== rowCapturedAtMs
  ) {
    return null;
  }

  const expectedCohortId = buildGgsRealPayloadCohortId(
    deviceId,
    new Date(rowCapturedAtMs).toISOString(),
  );
  if (raw.cohort_id !== expectedCohortId) return null;

  const attestation = raw.operator_attestation;
  if (
    !isPlainObject(attestation) ||
    attestation.attested !== true ||
    attestation.boundary !== GGS_OPERATOR_ATTESTATION_BOUNDARY ||
    typeof attestation.attested_at !== "string" ||
    !Number.isFinite(Date.parse(attestation.attested_at))
  ) {
    return null;
  }

  return {
    cohortId: expectedCohortId,
    deviceId,
    capturedAt: row.captured_at,
    attestedAt: attestation.attested_at,
  };
}

export function isTrustedGgsOperatorSentinelRow(row: GgsSentinelInputRow): boolean {
  return (
    readTrustedOperatorCohortMetadata(row) !== null &&
    row.quality === GGS_OPERATOR_SENTINEL_QUALITY &&
    typeof row.value === "number" &&
    Number.isFinite(row.value)
  );
}

/**
 * Select exactly one payload cohort. The newest cohort wins even when it is
 * incomplete, so an older metric or a different device can never backfill it.
 */
export function selectLatestTrustedGgsOperatorSentinelCohort(
  rows: readonly GgsSentinelInputRow[],
): GgsOperatorCohortSelection {
  const inputRows = Array.isArray(rows) ? rows : [];
  if (inputRows.length === 0) return { ok: false, reason: "no_rows" };

  const cohorts = new Map<
    string,
    {
      metadata: TrustedOperatorCohortMetadata;
      rows: GgsSentinelInputRow[];
    }
  >();

  for (const row of inputRows) {
    const metadata = readTrustedOperatorCohortMetadata(row);
    if (!metadata) continue;
    const key = `${metadata.cohortId}\u0000${metadata.attestedAt}`;
    const existing = cohorts.get(key);
    if (existing) {
      existing.rows.push(row);
    } else {
      cohorts.set(key, { metadata, rows: [row] });
    }
  }

  const ordered = [...cohorts.values()].sort((a, b) => {
    const capturedDelta = Date.parse(b.metadata.capturedAt) - Date.parse(a.metadata.capturedAt);
    if (capturedDelta !== 0) return capturedDelta;
    const attestedDelta = Date.parse(b.metadata.attestedAt) - Date.parse(a.metadata.attestedAt);
    if (attestedDelta !== 0) return attestedDelta;
    const deviceOrder = a.metadata.deviceId.localeCompare(b.metadata.deviceId);
    if (deviceOrder !== 0) return deviceOrder;
    return a.metadata.cohortId.localeCompare(b.metadata.cohortId);
  });
  const latest = ordered[0];
  if (!latest) return { ok: false, reason: "operator_attestation_missing" };

  return {
    ok: true,
    cohortId: latest.metadata.cohortId,
    deviceId: latest.metadata.deviceId,
    capturedAt: latest.metadata.capturedAt,
    rows: [...latest.rows],
  };
}

export function evaluateGgsOperatorAttestedSentinelReadiness(
  input: GgsSentinelEvaluateInput,
): GgsSentinelEvaluation {
  const selection = selectLatestTrustedGgsOperatorSentinelCohort(input.rows);
  if (selection.ok === false) {
    const blocked = evaluateGgsSentinelReadiness({
      ...input,
      rows: [],
      acceptedSources: GGS_OPERATOR_SENTINEL_ACCEPTED_SOURCES,
    });
    if (selection.reason === "no_rows") return blocked;
    return {
      ...blocked,
      state: "BLOCKED_OPERATOR_ATTESTATION_MISSING",
      checks: [
        ...blocked.checks,
        {
          id: "operator_attestation",
          label: "Server-authored operator attestation present",
          status: "fail",
          detail: "No trusted operator-attested GGS payload cohort found",
        },
      ],
    };
  }

  const evaluated = evaluateGgsSentinelReadiness({
    ...input,
    rows: selection.rows,
    acceptedSources: GGS_OPERATOR_SENTINEL_ACCEPTED_SOURCES,
  });
  const hasUntrustedRow = selection.rows.some((row) => !isTrustedGgsOperatorSentinelRow(row));
  const distinctMetrics = new Set(selection.rows.map((row) => row.metric));
  const hasDuplicates = distinctMetrics.size !== selection.rows.length;
  if (hasUntrustedRow) {
    return {
      ...evaluated,
      state: "BLOCKED_VALIDATION_ERROR",
      passed: false,
      checks: [
        ...evaluated.checks,
        {
          id: "cohort_rows_trusted",
          label: "All rows in the latest payload cohort are valid",
          status: "fail",
          detail: "Latest cohort contains a non-ok quality or invalid value",
        },
      ],
    };
  }
  if (hasDuplicates) {
    return {
      ...evaluated,
      state: "BLOCKED_COHORT_INCOHERENT",
      passed: false,
      checks: [
        ...evaluated.checks,
        {
          id: "cohort_coherence",
          label: "One row per metric in a single payload cohort",
          status: "fail",
          detail: "Duplicate metric rows found in the selected cohort",
        },
      ],
    };
  }

  const checks = [
    ...evaluated.checks,
    {
      id: "operator_attestation",
      label: "Server-authored operator attestation present",
      status: "pass" as const,
      detail: `One coherent payload cohort from device ${selection.deviceId}`,
    },
  ];
  if (!evaluated.passed) return { ...evaluated, checks };
  return {
    ...evaluated,
    state: "PASS_OPERATOR_ATTESTED_SENTINEL_READY",
    checks,
    passed: true,
  };
}
