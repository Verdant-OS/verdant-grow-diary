/**
 * The /tents list VPD, from the same derivation as the Dashboard's Tonight
 * card (VER-189, docs/specs/dashboard-canonical-tent-vpd.md; #2268). Tonight
 * calculates VPD from a same-capture temperature/RH pair when no newer stored
 * vpd_kpa exists, so a manual reading shows a VPD here instead of "—".
 *
 * Pure: the clock is injected.
 */
import type { BuildTentSnapshotInput } from "@/lib/dashboardEnvironmentSnapshotViewModel";
import { buildTonightTentMetrics, type TonightSensorRow } from "@/lib/tonightTentHomeViewModel";

export function tentsListCanonicalVpdKpa(
  rows: readonly BuildTentSnapshotInput[],
  tentId: string,
  nowMs: number,
): number | null {
  const tonightRows: TonightSensorRow[] = rows.map(({ id, ...row }) => ({
    ...row,
    ...(id ? { id } : {}),
    tent_id: row.tent_id ?? tentId,
  }));
  const vpd = buildTonightTentMetrics({
    rows: tonightRows,
    rowsRead: { status: "success" },
    snapshot: { status: "idle", snapshot: null },
    now: new Date(nowMs),
  }).find((metric) => metric.key === "vpd");
  return vpd?.state === "value" ? vpd.value : null;
}
