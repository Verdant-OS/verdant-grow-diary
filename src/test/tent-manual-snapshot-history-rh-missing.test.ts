/**
 * #2803: Recent manual snapshots must not call an in-range temperature
 * invalid when RH was left empty, and an out-of-range temperature gets
 * the Invalid temp tag once.
 */
import { describe, expect, it } from "vitest";
import { buildManualSnapshotHistoryList } from "@/lib/manualSensorSnapshotHistoryListRules";
import type { ChangeContextReading } from "@/lib/manualSensorSnapshotChangeContextRules";

const TENT = "tent-a";
const fToC = (fahrenheit: number) => ((fahrenheit - 32) * 5) / 9;

function rows(iso: string, metrics: Record<string, number>): ChangeContextReading[] {
  return Object.entries(metrics).map(([metric, value]) => ({
    ts: iso,
    metric,
    value,
    source: "manual",
    tent_id: TENT,
    snapshot_id: iso,
  }));
}

function invalidTempTags(entry: {
  invalidChips: { chip: string }[];
  suppressedDeltas: { reasonChip: string }[];
}): number {
  return (
    entry.invalidChips.filter((chip) => chip.chip === "Invalid temp").length +
    entry.suppressedDeltas.filter((delta) => delta.reasonChip === "Invalid temp").length
  );
}

describe("recent manual snapshots — missing RH versus out-of-range temp (#2803)", () => {
  const previous = rows("2026-11-03T18:00:00.000Z", {
    temperature_c: fToC(75),
    humidity_pct: 55,
  });

  it("does not tag 72°F or 80°F invalid when RH is empty", () => {
    const list = buildManualSnapshotHistoryList(
      [
        ...rows("2026-11-03T20:55:00.000Z", { temperature_c: fToC(80) }),
        ...rows("2026-11-03T20:40:00.000Z", { temperature_c: fToC(72) }),
        ...previous,
      ],
      { tentId: TENT },
    );
    for (const entry of list.slice(0, 2)) {
      expect(invalidTempTags(entry)).toBe(0);
      expect(entry.metrics.some((metric) => metric.key === "temperature_c")).toBe(true);
      expect(entry.rhNote).toBe("RH missing · VPD not computed");
    }
  });

  it("tags 40°F with RH present exactly once", () => {
    const list = buildManualSnapshotHistoryList(
      [
        ...rows("2026-11-03T21:10:00.000Z", {
          temperature_c: fToC(40),
          humidity_pct: 60,
        }),
        ...previous,
      ],
      { tentId: TENT },
    );
    expect(invalidTempTags(list[0])).toBe(1);
    expect(list[0].rhNote).toBeNull();
  });
});
