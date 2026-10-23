/**
 * The /tents list VPD, from the same derivation as the Dashboard's Tonight
 * card (VER-189, docs/specs/dashboard-canonical-tent-vpd.md; #2268). Tonight
 * calculates VPD from a same-capture temperature/RH pair when no newer stored
 * vpd_kpa exists, so a manual reading shows a VPD here instead of "—".
 *
 * It reads the same inputs as the Dashboard: the tent's stored rows and its
 * diary-inclusive snapshot (`useLatestSensorSnapshot`), so a newer Quick Log or
 * Environment Check capture is not missed (Codex P2 on #2303). The VPD keeps
 * its own source and capture time, so the strip never grades it with another
 * capture's freshness (Codex P1 on #2303).
 *
 * Pure: the clock is injected.
 */
import type {
  BuildTentSnapshotInput,
  CanonicalTentVpd,
} from "@/lib/dashboardEnvironmentSnapshotViewModel";
import { sensorCaptureRef, snapshotCaptureRef } from "@/lib/sensorCaptureRefRules";
import { normalizeSensorSource, type SensorSource } from "@/lib/sensor/sensorSourceRules";

/** Label for a VPD from a generic diary snapshot: historical, not current. */
export { DIARY_SOURCE_LABEL } from "@/lib/tonightTentHomeViewModel";

/** The row source each snapshot source projects to; unavailable projects nothing. */
const SNAPSHOT_ROW_SOURCE: Partial<Record<string, string>> = {
  diary: "diary",
  manual: "manual",
  live: "live",
  csv: "csv",
  sim: "sim",
  unverified: "unverified",
};

/** Canonical sources a raw row source normalizes to (e.g. `pi_bridge` → live). */
const CANONICAL_ROW_SOURCE: Partial<Record<SensorSource, string>> = {
  live: "live",
  manual: "manual",
  csv: "csv",
  demo: "sim",
};

/**
 * Row source for a raw sensor-row source: known snapshot tokens first, then
 * the canonical resolver, so a proven `pi_bridge` row stays Live here as it
 * does on the raw-row path (Codex P2 on #2303 at 4a304fe3). Anything else is
 * `unverified`, which never reads as healthy.
 */
function rawRowSource(raw: string | null | undefined): string {
  return (
    SNAPSHOT_ROW_SOURCE[raw ?? ""] ??
    CANONICAL_ROW_SOURCE[normalizeSensorSource(raw)] ??
    "unverified"
  );
}
import { classifySnapshotTimestamp } from "@/lib/sensorTruthRules";
import { tentDetailCaptureClimate, tonightCaptureRejected } from "@/lib/tentDetailVpdRules";
import {
  buildTonightTentMetrics,
  DIARY_SOURCE_LABEL,
  isClimateMetric,
  TONIGHT_FUTURE_SKEW_MS,
  type TonightRowsReadStatus,
  type TonightSensorRow,
} from "@/lib/tonightTentHomeViewModel";

type TonightSnapshotInput = Parameters<typeof buildTonightTentMetrics>[0]["snapshot"];

export function tentsListCanonicalVpd(
  rows: readonly BuildTentSnapshotInput[],
  tentId: string,
  nowMs: number,
  snapshot: TonightSnapshotInput = { status: "idle", snapshot: null },
  // The raw read's own status, so a failed refresh of cached rows follows
  // Tonight's refresh-error semantics instead of reading as a success (Codex
  // P2 on #2303 at b2606eca).
  rowsReadStatus: TonightRowsReadStatus = "success",
): CanonicalTentVpd | null {
  const tonightRows: TonightSensorRow[] = rows.map(({ id, ...row }) => ({
    ...row,
    ...(id ? { id } : {}),
    tent_id: row.tent_id ?? tentId,
  }));
  const metrics = buildTonightTentMetrics({
    rows: tonightRows,
    rowsRead: { status: rowsReadStatus },
    snapshot,
    now: new Date(nowMs),
  });
  const vpd = metrics.find((metric) => metric.key === "vpd");
  // Tonight withholds its newest VPD as invalid (a quality-rejected capture):
  // an explicit rejection, so the list never falls back to an older value
  // that would read healthy (Codex P1 on #2303 at 3e689090).
  if (vpd?.state === "invalid") {
    return {
      kpa: null,
      capturedAt: vpd.capturedAt,
      source: vpd.source,
      sourceLabel: vpd.sourceLabel,
      captureRefs: vpd.captureRefs,
      ageText: vpd.ageText,
      rejected: true,
      ...(rowsReadStatus === "success" ? {} : { rowsReadFailed: true }),
    };
  }
  // Tonight could not read the VPD at all: say so, so the list never restores
  // a cached stored VPD as healthy beside Tonight's "unavailable" (Copilot on
  // #2303 at b49c32ae).
  if (vpd?.state === "unavailable") {
    return {
      kpa: null,
      capturedAt: null,
      source: null,
      sourceLabel: null,
      ageText: null,
      unavailable: true,
    };
  }
  // Tonight has no VPD: say so explicitly, so the strip never derives one
  // from rows Tonight does not read (Copilot on #2442 at e50d6087).
  if (vpd?.state === "missing") {
    return {
      kpa: null,
      capturedAt: null,
      source: null,
      sourceLabel: null,
      ageText: null,
      missing: true,
    };
  }
  if (vpd?.state !== "value" || typeof vpd.value !== "number") return null;
  // Tonight runs no realism check. The same capture gate the tent page applies
  // decides here too: the pair a calculated VPD came from, and every
  // temperature and RH at its capture (realism and intake quality). A rejected
  // capture is returned flagged, never shown, so the list never shows telemetry
  // the tent page withholds (Codex P1 on #2303 at 3d1e5800). The VPD's own
  // value is still passed through: buildTentSnapshotView grades it Invalid.
  const climate = tentDetailCaptureClimate(
    rows.map((row) => ({
      metric: row.metric,
      value: typeof row.value === "number" ? row.value : null,
      ts: row.ts,
      captured_at: row.captured_at ?? null,
      quality: row.quality ?? null,
      source: row.source ?? null,
      capture_ref: row.capture_ref ?? null,
      // Kept until tentDetailCaptureClimate's diagnostic fence runs (Copilot
      // P1 on #2412 at 8d8c4900).
      raw_payload: row.raw_payload,
    })),
    snapshot.status === "ok" ? snapshot.snapshot : null,
  );
  // A calculated VPD is checked against the pair it came from, not the
  // newer temperature and RH the card may show (Codex P2 on #2303 at 3e689090).
  const rejected = tonightCaptureRejected(vpd, vpd.inputs ?? null, climate);
  return {
    kpa: vpd.value,
    capturedAt: vpd.capturedAt,
    // A generic diary snapshot is historical context: graded "Historical",
    // never a healthy Manual value (Codex P1 on #2303 at 4bd3fae7).
    source: vpd.historical ? "diary" : vpd.source,
    sourceLabel: vpd.historical ? DIARY_SOURCE_LABEL : vpd.sourceLabel,
    captureRefs: vpd.captureRefs,
    ageText: vpd.ageText,
    // An explicit rejection, not null: the strip must also withhold its own
    // stored VPD when the rejected capture is its latest cohort
    // (Codex P1 on #2303 at 108e3eab).
    ...(rejected ? { rejected: true } : {}),
    // A capture-gate rejection after a failed raw read stands whatever the
    // cached cohort's age, as Tonight's own invalid does (Copilot P1 on #2412
    // at 8d8c4900).
    ...(rejected && rowsReadStatus !== "success" ? { rowsReadFailed: true } : {}),
  };
}

/**
 * Rows standing in for a diary-only capture (Quick Log sensor_snapshot or
 * Environment Check) when the tent has no stored sensor rows and no manual
 * snapshot card, so the list shows the Dashboard's evidence instead of
 * "No sensor data yet" (Codex P2 on #2303 at 69de43db), or when the raw
 * readings read failed but the snapshot read succeeded (Codex P2 at
 * fa8edcff and 4bd3fae7). Rows keep the snapshot's own source. A capture whose timestamp
 * the shared sensor-truth classifier rejects (missing or unparseable) yields
 * no rows either (Codex P1 on #2303 at 85ec1e78), and so does one stamped
 * further ahead than Tonight's own one-minute skew: the shared classifier
 * allows five minutes, which would show as current here what the Dashboard
 * withholds (Codex P1 on #2303 at 0c19a9e0).
 */
export function tentsListDiarySnapshotRows(
  snapshot: TonightSnapshotInput,
  tentId: string,
  nowMs: number,
): BuildTentSnapshotInput[] {
  const snap = snapshot.status === "ok" ? snapshot.snapshot : null;
  if (!snap || !snap.ts || classifySnapshotTimestamp(snap.ts, nowMs) !== "ok") return [];
  if (Date.parse(snap.ts) - nowMs > TONIGHT_FUTURE_SKEW_MS) return [];
  // Each row keeps the snapshot's own source: a generic diary blob stays
  // `diary` (unverified, never healthy), an Environment Check or manual
  // envelope stays `manual`, and a snapshot read from sensor rows keeps its
  // live/manual/csv/sim source (Codex P1 and P2 on #2303 at 4bd3fae7).
  const source = SNAPSHOT_ROW_SOURCE[snap.source];
  if (!source) return [];
  const rows: BuildTentSnapshotInput[] = [];
  const push = (metric: string, key: string, value: number | null) => {
    if (typeof value !== "number" || !Number.isFinite(value)) return;
    // Each row carries the identity of the record behind it (its diary entry,
    // or the exact sensor row in metric_refs), so no capture check joins it
    // to another record by time.
    const captureRef = snapshotCaptureRef(snap, key);
    // A snapshot built from sensor rows can mix sources (a manual temperature
    // beside a CSV VPD classifies as `manual`), so each row takes its own
    // metric ref's source. A row-built snapshot without a ref for this metric,
    // or a ref source this list does not know, falls back to `unverified`,
    // which never reads as healthy (Codex P1 on #2303 at 0994ea2a).
    const refs = (snap as { metric_refs?: Partial<Record<string, { source: string }>> })
      .metric_refs;
    const rowSource = refs ? (refs[key] ? rawRowSource(refs[key]?.source) : "unverified") : source;
    rows.push({
      metric,
      value,
      ts: snap.ts as string,
      captured_at: snap.ts,
      tent_id: tentId,
      source: rowSource,
      ...(captureRef ? { capture_ref: captureRef } : {}),
    });
  };
  push("temperature_c", "temp", snap.temp);
  push("humidity_pct", "rh", snap.rh);
  push("vpd_kpa", "vpd", snap.vpd);
  // Siblings the snapshot read dropped for intake quality ride along with
  // their quality, so the capture gate rejects their capture here exactly as
  // it does on the raw-row path (Codex P1 on #2303 at 0994ea2a).
  // Tonight ignores non-climate rejects, so a rejected CO2 row must not become
  // the fallback's latest cohort (Copilot P1 on #2407 at e66265eb).
  // Only the displayed capture's own siblings ride along: a rejected row at
  // another instant would become the fallback's latest cohort and blank the
  // valid temperature and RH. Tonight still judges that capture from the
  // snapshot itself (Codex P2 on #2412 at 8d8c4900).
  const snapMs = Date.parse(snap.ts as string);
  for (const rejected of snap.rejected_quality_rows ?? []) {
    if (!isClimateMetric(rejected.metric)) continue;
    if (Date.parse(rejected.captured_at) !== snapMs) continue;
    const captureRef = sensorCaptureRef(rejected.captured_at, rejected.source, rejected.device_id);
    rows.push({
      metric: rejected.metric,
      value: rejected.value,
      ts: rejected.captured_at,
      captured_at: rejected.captured_at,
      tent_id: tentId,
      source: rawRowSource(rejected.source),
      quality: rejected.quality,
      ...(captureRef ? { capture_ref: captureRef } : {}),
    });
  }
  return rows;
}
