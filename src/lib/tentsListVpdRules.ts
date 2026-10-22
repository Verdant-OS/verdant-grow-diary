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
import { snapshotCaptureRef } from "@/lib/sensorCaptureRefRules";

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
import { classifySnapshotTimestamp } from "@/lib/sensorTruthRules";
import { tentDetailCaptureClimate, tonightCaptureRejected } from "@/lib/tentDetailVpdRules";
import {
  buildTonightTentMetrics,
  DIARY_SOURCE_LABEL,
  TONIGHT_FUTURE_SKEW_MS,
  type TonightSensorRow,
} from "@/lib/tonightTentHomeViewModel";

type TonightSnapshotInput = Parameters<typeof buildTonightTentMetrics>[0]["snapshot"];

export function tentsListCanonicalVpd(
  rows: readonly BuildTentSnapshotInput[],
  tentId: string,
  nowMs: number,
  snapshot: TonightSnapshotInput = { status: "idle", snapshot: null },
): CanonicalTentVpd | null {
  const tonightRows: TonightSensorRow[] = rows.map(({ id, ...row }) => ({
    ...row,
    ...(id ? { id } : {}),
    tent_id: row.tent_id ?? tentId,
  }));
  const metrics = buildTonightTentMetrics({
    rows: tonightRows,
    rowsRead: { status: "success" },
    snapshot,
    now: new Date(nowMs),
  });
  const vpd = metrics.find((metric) => metric.key === "vpd");
  if (vpd?.state !== "value" || typeof vpd.value !== "number") return null;
  // Tonight runs no realism check. The same capture gate the tent page applies
  // decides here too: the pair a calculated VPD came from, and every
  // temperature and RH at its capture (realism and intake quality). A rejected
  // capture is returned flagged, never shown, so the list never shows telemetry
  // the tent page withholds (Codex P1 on #2303 at 3d1e5800). The VPD's own
  // value is still passed through: buildTentSnapshotView grades it Invalid.
  const metricValue = (key: string) => {
    const metric = metrics.find((m) => m.key === key);
    return metric?.state === "value" && typeof metric.value === "number" ? metric.value : null;
  };
  const climate = tentDetailCaptureClimate(
    rows.map((row) => ({
      metric: row.metric,
      value: typeof row.value === "number" ? row.value : null,
      ts: row.ts,
      captured_at: row.captured_at ?? null,
      quality: row.quality ?? null,
      source: row.source ?? null,
      capture_ref: row.capture_ref ?? null,
    })),
    snapshot.status === "ok" ? snapshot.snapshot : null,
  );
  const rejected = tonightCaptureRejected(
    vpd,
    { temp: metricValue("temp"), rh: metricValue("rh") },
    climate,
  );
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
    const rowSource = refs
      ? (SNAPSHOT_ROW_SOURCE[refs[key]?.source ?? ""] ?? "unverified")
      : source;
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
  return rows;
}
