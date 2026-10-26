/**
 * Copilot P2 on #2407 at e66265eb: the header's `invalidFields` lists a VPD
 * dropped only because its temperature or RH was invalid
 * (`vpd_dropped_temp_rh_invalid`). Treating that as the VPD's own rejection
 * marked an independent live VPD's record as rejected, so Tent Detail hid a
 * VPD that Tonight and the tents list accept. These cases run through the real
 * header builder.
 */
import { describe, expect, it } from "vitest";
import { buildTentSensorHeaderView } from "@/lib/tentSensorChartRules";
import {
  resolveTentDetailVpd,
  tentDetailCaptureClimate,
  tentDetailHeaderRejection,
} from "@/lib/tentDetailVpdRules";
import { buildTonightTentMetrics } from "@/lib/tonightTentHomeViewModel";

const NOW = Date.parse("2026-10-22T03:00:00.000Z");
const T = new Date(NOW - 15 * 60_000).toISOString();
const row = (id: string, metric: string, value: number, source: string) => ({
  id,
  ts: T,
  captured_at: T,
  metric,
  value,
  source,
  tent_id: "tent-1",
});

// The page's wiring (src/pages/TentDetail.tsx): the real header builder and
// Tonight's choice over the same rows, with no stored VPD to fall back on.
function resolveFor(rows: ReturnType<typeof row>[]) {
  const header = buildTentSensorHeaderView(rows, NOW);
  const rejection = tentDetailHeaderRejection(header.truth, header.snapshot, {
    existingIsSnapshotVpd: Number.isFinite(header.snapshot?.vpd ?? NaN),
  });
  const tonight = buildTonightTentMetrics({
    rows,
    rowsRead: { status: "success" },
    snapshot: { status: "idle", snapshot: null },
    now: new Date(NOW),
  }).find((metric) => metric.key === "vpd");
  const out = resolveTentDetailVpd({
    tonight,
    existing: { value: null, capturedAt: null, source: null, stale: false },
    rejectedCapturedAt: header.capturedAt,
    ...rejection,
    contributors: tonight?.inputs ?? null,
    captureClimate: tentDetailCaptureClimate(rows, null),
    nowMs: NOW,
  });
  return { header, rejection, tonight, out };
}

describe("a dependency-dropped VPD is not the VPD's own rejection", () => {
  it("keeps an independent live VPD beside an invalid manual temperature at the same instant", () => {
    const { header, rejection, tonight, out } = resolveFor([
      row("row-temp", "temperature_c", 99, "manual"),
      row("row-vpd", "vpd_kpa", 1.2, "live"),
    ]);
    // Tonight accepts the live VPD.
    expect(tonight?.state).toBe("value");
    // The header itself still drops the VPD for the dependency.
    expect(header.truth?.invalidFields).toEqual(expect.arrayContaining(["temp", "vpd"]));
    expect(header.truth?.reasonCodes).toContain("vpd_dropped_temp_rh_invalid");
    expect(rejection.rejectedMetrics).toEqual(["temp"]);
    expect(out.value).toBe(1.2);
  });

  it("still withholds a VPD from the same record as the invalid temperature", () => {
    const { out } = resolveFor([
      row("row-temp", "temperature_c", 99, "live"),
      row("row-vpd", "vpd_kpa", 1.2, "live"),
    ]);
    expect(out.value).toBeNull();
  });

  it("keeps an intrinsically invalid VPD rejected", () => {
    const { rejection, out } = resolveFor([
      row("row-temp", "temperature_c", 24, "live"),
      row("row-vpd", "vpd_kpa", 9, "live"),
    ]);
    expect(rejection.rejectedMetrics).toContain("vpd");
    expect(out.value).toBeNull();
  });
});
