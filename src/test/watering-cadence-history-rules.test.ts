/**
 * Pure unit tests for read-only watering cadence / last-water history strip.
 * Pins: history only, no schedule/overdue language, water-only cadence.
 */
import { describe, expect, it } from "vitest";
import {
  WATERING_CADENCE_EMPTY_COPY,
  WATERING_CADENCE_HISTORY_CAVEAT,
  WATERING_CADENCE_UNMEASURED_VOLUME,
  buildWateringCadenceHistory,
  cadenceEventsFromIrrigationLedger,
  formatWateringCadenceDuration,
  formatWateringCadenceRelative,
} from "@/lib/wateringCadenceHistoryRules";

const T0 = Date.parse("2026-08-06T18:00:00.000Z");

function hoursBefore(h: number): string {
  return new Date(T0 - h * 3600_000).toISOString();
}

describe("formatWateringCadenceDuration", () => {
  it("formats whole units without inventing a schedule", () => {
    expect(formatWateringCadenceDuration(30_000)).toBe("just now");
    expect(formatWateringCadenceDuration(5 * 60_000)).toBe("5m");
    expect(formatWateringCadenceDuration(3 * 3600_000)).toBe("3h");
    expect(formatWateringCadenceDuration(3 * 24 * 3600_000)).toBe("3d");
  });
});

describe("formatWateringCadenceRelative", () => {
  it("appends ago for ages above just-now", () => {
    expect(formatWateringCadenceRelative(T0 - 2 * 3600_000, T0)).toBe("2h ago");
    expect(formatWateringCadenceRelative(T0, T0)).toBe("just now");
  });
});

describe("buildWateringCadenceHistory", () => {
  it("returns empty when no dated waterings exist", () => {
    const vm = buildWateringCadenceHistory(
      [
        { id: "f1", kind: "feeding", occurredAt: hoursBefore(1), volumeMl: 500, sourceLabel: "Manual log" },
        { id: "w-bad", kind: "watering", occurredAt: null, volumeMl: 1000, sourceLabel: "Manual log" },
      ],
      { now: T0 },
    );
    expect(vm.status).toBe("empty");
    expect(vm.emptyCopy).toBe(WATERING_CADENCE_EMPTY_COPY);
    expect(vm.lastWatering).toBeNull();
    expect(vm.caveat).toBe(WATERING_CADENCE_HISTORY_CAVEAT);
  });

  it("ignores feeding for cadence and keeps water-only last event", () => {
    const vm = buildWateringCadenceHistory(
      [
        {
          id: "f1",
          kind: "feeding",
          occurredAt: hoursBefore(1),
          volumeMl: 900,
          sourceLabel: "Manual log",
        },
        {
          id: "w1",
          kind: "watering",
          occurredAt: hoursBefore(6),
          volumeMl: 1800,
          sourceLabel: "Manual log",
        },
        {
          id: "w2",
          kind: "watering",
          occurredAt: hoursBefore(30),
          volumeMl: 1500,
          sourceLabel: "Imported log",
        },
      ],
      { now: T0 },
    );
    expect(vm.status).toBe("history");
    expect(vm.wateringCount).toBe(2);
    expect(vm.lastWatering?.volumeLabel).toBe("1800 ml");
    expect(vm.lastWatering?.relativeLabel).toBe("6h ago");
    expect(vm.lastInterval?.valueLabel).toBe("24h");
    expect(vm.recentWaterings).toHaveLength(2);
  });

  it("labels missing volume honestly", () => {
    const vm = buildWateringCadenceHistory(
      [
        {
          id: "w1",
          kind: "watering",
          occurredAt: hoursBefore(2),
          volumeMl: null,
          sourceLabel: "Manual log",
        },
      ],
      { now: T0 },
    );
    expect(vm.lastWatering?.volumeLabel).toBe(WATERING_CADENCE_UNMEASURED_VOLUME);
    expect(vm.lastInterval).toBeNull();
  });

  it("never emits schedule, overdue, or recommendation copy", () => {
    const vm = buildWateringCadenceHistory(
      [
        {
          id: "w1",
          kind: "watering",
          occurredAt: hoursBefore(72),
          volumeMl: 1000,
          sourceLabel: "Manual log",
        },
        {
          id: "w0",
          kind: "watering",
          occurredAt: hoursBefore(12),
          volumeMl: 1200,
          sourceLabel: "Manual log",
        },
      ],
      { now: T0 },
    );
    const blob = JSON.stringify(vm).toLowerCase();
    expect(blob).not.toMatch(/overdue/);
    expect(blob).not.toMatch(/should water/);
    expect(blob).not.toMatch(/water now/);
    expect(blob).not.toMatch(/due in/);
    // Positive schedule claims forbidden; the caveat may say "not a schedule".
    expect(blob).not.toMatch(/\bis (a )?schedule\b/);
    expect(blob).not.toMatch(/watering schedule/);
    expect(vm.caveat).toMatch(/history only/i);
    expect(vm.caveat).toMatch(/not a schedule/i);
  });
});

describe("cadenceEventsFromIrrigationLedger", () => {
  it("maps ledger rows 1:1", () => {
    const events = cadenceEventsFromIrrigationLedger([
      {
        id: "a",
        kind: "watering",
        occurredAt: hoursBefore(1),
        volumeMl: 500,
        sourceLabel: "Manual log",
      },
    ]);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("watering");
  });
});
