/**
 * #2114 CodeRabbit r4319986037: an implausible reservoir EC (e.g. a µS/cm
 * entry) must suppress the change delta instead of showing a fabricated
 * swing beside its invalid chip.
 */
import { describe, expect, it } from "vitest";
import { buildManualSnapshotChangeContext } from "@/lib/manualSensorSnapshotChangeContextRules";

const previous = { ts: "2026-10-19T09:00:00.000Z", metrics: { reservoir_ec_ms_cm: 1.2 } };

describe("reservoir EC change delta", () => {
  it("suppresses the delta when the latest value is µS/cm-sized", () => {
    const ctx = buildManualSnapshotChangeContext({
      latest: { ts: "2026-10-19T10:00:00.000Z", metrics: { reservoir_ec_ms_cm: 1400 } },
      previous,
    });
    expect(ctx.deltas.map((d) => d.key)).not.toContain("reservoir_ec_ms_cm");
    expect(ctx.suppressedDeltas).toEqual([
      expect.objectContaining({ key: "reservoir_ec_ms_cm", side: "current" }),
    ]);
  });

  it("keeps the delta for two plausible values", () => {
    const ctx = buildManualSnapshotChangeContext({
      latest: { ts: "2026-10-19T10:00:00.000Z", metrics: { reservoir_ec_ms_cm: 1.6 } },
      previous,
    });
    expect(ctx.deltas).toEqual([
      expect.objectContaining({
        key: "reservoir_ec_ms_cm",
        label: "Reservoir EC",
        formatted: "+0.40 mS/cm",
      }),
    ]);
    expect(ctx.suppressedDeltas).toEqual([]);
  });
});
