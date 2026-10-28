/** Quick Log manual VPD fallback for the two compact environment displays. */
import type { SensorReading } from "@/mock";
import type {
  BuildTentSnapshotInput,
  CanonicalTentVpd,
} from "@/lib/dashboardEnvironmentSnapshotViewModel";
import { toFiniteNumber } from "@/lib/sensorSnapshot";
import { withMetricDeviceIds } from "@/lib/dashboardSensorEvidenceRules";
import { buildTentSensorHeaderView } from "@/lib/tentSensorChartRules";
import { readObservedSensorMetric } from "@/lib/sensorReadingSelectionRules";
import {
  resolveTentDetailVpd,
  tentDetailCaptureClimate,
  tentDetailHeaderRejection,
  tentDetailVpdRowUntrusted,
} from "@/lib/tentDetailVpdRules";
import {
  buildTonightTentMetrics,
  TONIGHT_FUTURE_SKEW_MS,
  type TonightRowsReadStatus,
} from "@/lib/tonightTentHomeViewModel";
import {
  quickLogManualsForTent,
  resolveDisplayedVpdObservation,
  vpdStabilityInputsFromWideReadings,
} from "@/lib/vpdStabilityInputRules";

type SnapshotInput = Parameters<typeof buildTonightTentMetrics>[0]["snapshot"];

/**
 * Admit only the manual fallback Tent Detail would display. Raw rows remain
 * separate from manual history: their rejection evidence must survive the
 * Dashboard's chart filtering. No fabricated capture identity or live source.
 * A null result leaves the existing compact-display path unchanged.
 */
export function selectTentEnvironmentManualDisplay(input: {
  tentId: string;
  sensorRows: readonly BuildTentSnapshotInput[];
  manualReadings: readonly SensorReading[] | null | undefined;
  now: number;
  sensorStatus?: TonightRowsReadStatus;
  snapshot?: SnapshotInput;
}): { rows: BuildTentSnapshotInput[]; canonicalVpd: CanonicalTentVpd } | null {
  const { tentId, now } = input;
  const manuals = quickLogManualsForTent(input.manualReadings, tentId).filter(
    (reading) =>
      reading.source === "manual" &&
      Number.isFinite(Date.parse(reading.capturedAt)) &&
      Date.parse(reading.capturedAt) <= now + TONIGHT_FUTURE_SKEW_MS,
  );
  const fallback = vpdStabilityInputsFromWideReadings(manuals)[0];
  if (!fallback) return null;
  const rows = [...input.sensorRows];
  const climateRows = rows.map((row) => ({ ...row, value: toFiniteNumber(row.value) }));
  const header = buildTentSensorHeaderView(rows, now);
  const snap = header.snapshot ? withMetricDeviceIds(header.snapshot, rows) : null;
  const untrusted = tentDetailVpdRowUntrusted(
    climateRows,
    header.capturedAt,
    snap?.metric_refs?.vpd?.source,
    snap?.metric_device_ids?.vpd,
  );
  // Detail keeps its observed header VPD before consulting manual history.
  if (!untrusted && Number.isFinite(snap?.vpd ?? NaN)) return null;
  const existing = resolveDisplayedVpdObservation({
    snapshotVpd: null,
    snapshotVpdRejected: untrusted || (header.truth?.invalidFields.includes("vpd") ?? false),
    snapshotCapturedAt: header.capturedAt,
    snapshotSource: snap?.source ?? null,
    snapshotStale: header.stale,
    fallback,
    nowMs: now,
  });
  const snapshot = input.snapshot ?? { status: "idle", snapshot: null };
  const tonight = buildTonightTentMetrics({
    rows: rows.map((row) => ({ ...row, id: row.id ?? undefined, tent_id: row.tent_id ?? tentId })),
    rowsRead: { status: input.sensorStatus ?? "success" },
    snapshot,
    now: new Date(now),
  }).find((metric) => metric.key === "vpd");
  const observation = resolveTentDetailVpd({
    tonight,
    existing,
    rejectedCapturedAt: header.capturedAt,
    ...tentDetailHeaderRejection(header.truth, snap, { existingIsSnapshotVpd: false }),
    contributors: tonight?.inputs ?? null,
    captureClimate: tentDetailCaptureClimate(
      climateRows,
      snapshot.status === "ok" ? snapshot.snapshot : null,
    ),
    nowMs: now,
  });
  if (
    observation.value === null ||
    observation.source !== "manual" ||
    observation.calculated ||
    observation.capturedAt !== existing.capturedAt ||
    observation.value !== existing.value
  )
    return null;

  // Pick one original wide reading; never splice sibling values from separate
  // events at the same instant. observedMetrics prevents placeholder zeroes.
  const manual = manuals.find(
    (reading) =>
      reading.capturedAt === observation.capturedAt &&
      vpdStabilityInputsFromWideReadings([reading])[0]?.vpd === observation.value,
  );
  if (!manual) return null;
  const manualRows: BuildTentSnapshotInput[] = [];
  for (const [key, metric] of [
    ["temp", "temperature_c"],
    ["rh", "humidity_pct"],
    ["vpd", "vpd_kpa"],
  ] as const) {
    const value = readObservedSensorMetric(manual, key);
    if (value === null) continue;
    manualRows.push({
      tent_id: tentId,
      metric,
      value,
      ts: manual.capturedAt,
      captured_at: manual.capturedAt,
      source: "manual",
      quality: observation.stale ? "stale" : null,
    });
  }
  return {
    rows: manualRows,
    canonicalVpd: {
      kpa: observation.value,
      capturedAt: observation.capturedAt,
      source: observation.stale ? "stale" : "manual",
      sourceLabel: "Manual",
      ageText: null,
    },
  };
}
