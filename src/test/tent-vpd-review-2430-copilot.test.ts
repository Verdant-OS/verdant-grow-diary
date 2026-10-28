/**
 * Copilot P1 on #2430 at fcd86356: a rejection placeholder at the same instant
 * as an independent, valid snapshot capture no longer outranks it. A
 * same-capture rejection and a strictly newer one still win.
 */
import { describe, expect, it } from "vitest";
import { buildTonightTentMetrics, type TonightMetricView } from "@/lib/tonightTentHomeViewModel";

const NOW = Date.parse("2026-10-23T15:30:00.000Z");
const at = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString();
const T = at(3);
const ref = (source: string, iso: string, id: string) => ({ id, captured_at: iso, source });

function tonightVpd(rejected: { source: string; captured_at: string }): TonightMetricView {
  return buildTonightTentMetrics({
    rows: [],
    rowsRead: { status: "error" },
    snapshot: {
      status: "ok",
      snapshot: {
        source: "live",
        ts: T,
        temp: null,
        rh: null,
        vpd: 1.2,
        metric_refs: { vpd: ref("live", T, "r-vpd") },
        rejected_quality_rows: [{ metric: "vpd_kpa", value: 9.9, quality: "invalid", ...rejected }],
      } as never,
    },
    now: new Date(NOW),
  }).find((m) => m.key === "vpd")!;
}

describe("equal-time rejection placeholders rank behind the snapshot", () => {
  it("keeps a valid live VPD beside a rejected manual VPD at the same instant", () => {
    const vpd = tonightVpd({ source: "manual", captured_at: T });
    expect(vpd.state).toBe("value");
    expect(vpd.value).toBe(1.2);
    expect(vpd.source).toBe("live");
  });

  it("still withholds when the rejected VPD is the snapshot's own capture", () => {
    expect(tonightVpd({ source: "live", captured_at: T }).state).toBe("invalid");
  });

  it("still withholds behind a strictly newer rejected VPD", () => {
    expect(tonightVpd({ source: "manual", captured_at: at(1) }).state).toBe("invalid");
  });
});
