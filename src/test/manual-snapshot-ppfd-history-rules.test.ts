/**
 * Recent manual snapshots must keep a saved PPFD reading, label it, and
 * refuse to present an implausible PPFD value as a healthy chip.
 *
 * Pure rules only. No schema, persistence, or server changes.
 */
import { describe, expect, it } from "vitest";

import { buildManualSnapshotChangeContext } from "@/lib/manualSensorSnapshotChangeContextRules";
import { buildManualSnapshotHistoryList } from "@/lib/manualSensorSnapshotHistoryListRules";
import { PPFD_LABEL, PPFD_MAX, PPFD_UNIT_LONG } from "@/lib/ppfdRules";
import { classifyManualMetric } from "@/lib/sensorTruthRules";

const TENT = "tent-ppfd";
const T0 = "2026-10-08T15:00:00Z";
const T1 = "2026-10-09T15:00:00Z";

function manual(ts: string, metric: string, value: number | null, deviceId?: string | null) {
  return {
    ts,
    metric,
    value,
    source: "manual" as const,
    tent_id: TENT,
    device_id: deviceId ?? null,
  };
}

describe("classifyManualMetric — PPFD realism", () => {
  it("accepts a canopy PPFD inside the shared range, including the ceiling", () => {
    expect(classifyManualMetric("ppfd", 650).valid).toBe(true);
    expect(classifyManualMetric("ppfd", 0).valid).toBe(true);
    expect(classifyManualMetric("ppfd", PPFD_MAX).valid).toBe(true);
  });

  it("rejects a negative PPFD and a PPFD above PPFD_MAX", () => {
    const negative = classifyManualMetric("ppfd", -1);
    const high = classifyManualMetric("ppfd", PPFD_MAX + 1);
    expect(negative.valid).toBe(false);
    expect(negative.chip).toBe("Invalid PPFD");
    expect(high.valid).toBe(false);
    expect(high.chip).toBe("Invalid PPFD");
  });

  it("still treats an unrecognized metric as unchecked", () => {
    expect(classifyManualMetric("made_up_metric", -1).valid).toBe(true);
  });
});

describe("buildManualSnapshotHistoryList — PPFD chips", () => {
  it("keeps a saved PPFD value with the canonical label and unit", () => {
    const [entry] = buildManualSnapshotHistoryList(
      [manual(T1, "temperature_c", 24), manual(T1, "ppfd", 650)],
      { tentId: TENT },
    );
    const ppfd = entry.metrics.find((metric) => metric.key === "ppfd");
    expect(ppfd).toBeDefined();
    expect(ppfd?.label).toBe(PPFD_LABEL);
    expect(ppfd?.formatted).toBe(`650 ${PPFD_UNIT_LONG}`);
    expect(entry.invalidChips.map((chip) => chip.key)).not.toContain("ppfd");
  });

  it("orders PPFD after soil moisture and before soil EC", () => {
    const [entry] = buildManualSnapshotHistoryList(
      [
        manual(T1, "ppfd", 650),
        manual(T1, "reservoir_ph", 6.1),
        manual(T1, "soil_moisture_pct", 46),
        manual(T1, "temperature_c", 24),
      ],
      { tentId: TENT },
    );
    expect(entry.metrics.map((metric) => metric.key)).toEqual([
      "temperature_c",
      "soil_moisture_pct",
      "ppfd",
      "reservoir_ph",
    ]);
  });

  it("shows a PPFD-only manual snapshot instead of dropping the reading", () => {
    const list = buildManualSnapshotHistoryList([manual(T1, "ppfd", 650.4)], { tentId: TENT });
    expect(list).toHaveLength(1);
    expect(list[0].metrics.map((metric) => metric.formatted)).toEqual([`650 ${PPFD_UNIT_LONG}`]);
  });

  it("does not present a negative or above-max PPFD as a healthy chip", () => {
    const [entry] = buildManualSnapshotHistoryList(
      [manual(T1, "ppfd", -20), manual(T1, "temperature_c", 24)],
      { tentId: TENT },
    );
    expect(entry.metrics.map((metric) => metric.key)).toEqual(["temperature_c"]);
    expect(entry.metrics.map((metric) => metric.formatted).join(" ")).not.toContain("-20");
    expect(entry.invalidChips).toEqual([
      expect.objectContaining({ key: "ppfd", label: PPFD_LABEL, chip: "Invalid PPFD" }),
    ]);

    const [high] = buildManualSnapshotHistoryList([manual(T0, "ppfd", PPFD_MAX + 1)], {
      tentId: TENT,
    });
    expect(high.metrics).toEqual([]);
    expect(high.invalidChips.map((chip) => chip.chip)).toEqual(["Invalid PPFD"]);
    expect(high.invalidChips.map((chip) => chip.key)).toEqual(["ppfd"]);
  });

  it("suppresses a PPFD delta when either side fails the realism check", () => {
    const result = buildManualSnapshotChangeContext({
      previous: { ts: T0, metrics: { ppfd: 650, humidity_pct: 55 } },
      latest: { ts: T1, metrics: { ppfd: PPFD_MAX + 50, humidity_pct: 51 } },
    });
    expect(result.deltas.map((delta) => delta.key)).toEqual(["humidity_pct"]);
    expect(result.suppressedDeltas).toEqual([
      expect.objectContaining({
        key: "ppfd",
        label: PPFD_LABEL,
        reasonChip: "Invalid PPFD",
        side: "current",
      }),
    ]);
  });

  it("formats a realistic PPFD change with the canonical unit", () => {
    const result = buildManualSnapshotChangeContext({
      previous: { ts: T0, metrics: { ppfd: 600 } },
      latest: { ts: T1, metrics: { ppfd: 650 } },
    });
    expect(result.deltas).toEqual([
      expect.objectContaining({
        key: "ppfd",
        label: PPFD_LABEL,
        direction: "up",
        formatted: `+50 ${PPFD_UNIT_LONG}`,
      }),
    ]);
    expect(result.suppressedDeltas).toEqual([]);
  });
});
