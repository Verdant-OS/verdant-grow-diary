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
import { classifySnapshotTimestamp } from "@/lib/sensorTruthRules";
import {
  buildTonightTentMetrics,
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
  const vpd = buildTonightTentMetrics({
    rows: tonightRows,
    rowsRead: { status: "success" },
    snapshot,
    now: new Date(nowMs),
  }).find((metric) => metric.key === "vpd");
  if (vpd?.state !== "value" || typeof vpd.value !== "number") return null;
  return {
    kpa: vpd.value,
    capturedAt: vpd.capturedAt,
    source: vpd.source,
    sourceLabel: vpd.sourceLabel,
    ageText: vpd.ageText,
  };
}

/**
 * Rows standing in for a diary-only capture (Quick Log sensor_snapshot or
 * Environment Check) when the tent has no stored sensor rows and no manual
 * snapshot card, so the list shows the Dashboard's evidence instead of
 * "No sensor data yet" (Codex P2 on #2303 at 69de43db). A diary capture is
 * manual evidence; anything else returns no rows. A capture whose timestamp
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
  if (snap.source !== "diary" && !snap.diary_evidence_ref) return [];
  const rows: BuildTentSnapshotInput[] = [];
  const push = (metric: string, value: number | null) => {
    if (typeof value !== "number" || !Number.isFinite(value)) return;
    rows.push({
      metric,
      value,
      ts: snap.ts as string,
      captured_at: snap.ts,
      tent_id: tentId,
      source: "manual",
    });
  };
  push("temperature_c", snap.temp);
  push("humidity_pct", snap.rh);
  push("vpd_kpa", snap.vpd);
  return rows;
}
