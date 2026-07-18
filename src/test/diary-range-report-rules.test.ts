/**
 * diaryRangeReportRules — pure view-model builder for the date-range
 * diary report. Range inclusion, logged-only numbers, provenance
 * honesty, caps, and id-leak guarantees.
 */
import { describe, it, expect } from "vitest";
import {
  buildDiaryRangeReport,
  DIARY_RANGE_PHOTO_CAP,
  DIARY_RANGE_SAFETY_COPY,
  DIARY_RANGE_SOURCE_HONESTY_COPY,
  type BuildDiaryRangeReportInput,
} from "@/lib/diaryRangeReportRules";

const NOW = new Date("2026-07-17T12:00:00.000Z");
const GROW_UUID = "3b9f2a10-1111-2222-3333-444455556666";

function baseInput(
  overrides: Partial<BuildDiaryRangeReportInput> = {},
): BuildDiaryRangeReportInput {
  return {
    grow: { name: "Blue Dream #1", stage: "veg" },
    diaryEntries: [],
    growEvents: [],
    harvests: [],
    sensorReadings: [],
    startDate: "2026-07-01",
    endDate: "2026-07-10",
    now: NOW,
    ...overrides,
  };
}

function diary(id: string, day: string, details: Record<string, unknown>, photo?: string) {
  return {
    id,
    note: "",
    photo_url: photo ?? null,
    entry_at: `${day}T10:00:00.000Z`,
    details,
  };
}

describe("range handling", () => {
  it("includes both endpoint days and excludes outside rows", () => {
    const vm = buildDiaryRangeReport(
      baseInput({
        diaryEntries: [
          diary("a", "2026-06-30", { event_type: "watering" }),
          diary("b", "2026-07-01", { event_type: "watering" }),
          diary("c", "2026-07-10", { event_type: "watering" }),
          diary("d", "2026-07-11", { event_type: "watering" }),
        ],
      }),
    );
    expect(vm.watering.count).toBe(2);
    expect(vm.header.totalInRange).toBe(2);
  });

  it("counts rows without usable timestamps honestly instead of guessing", () => {
    const vm = buildDiaryRangeReport(
      baseInput({
        diaryEntries: [
          {
            id: "x",
            note: "",
            photo_url: null,
            entry_at: null,
            details: { event_type: "watering" },
          },
          diary("ok", "2026-07-05", { event_type: "watering" }),
        ],
      }),
    );
    expect(vm.watering.count).toBe(1);
    expect(vm.header.excludedNoTimestamp).toBe(1);
  });
});

describe("watering / feeding — logged-only numbers", () => {
  it("sums only logged ml and never invents zeros", () => {
    const vm = buildDiaryRangeReport(
      baseInput({
        diaryEntries: [
          diary("w1", "2026-07-02", { event_type: "watering", watering_amount_ml: 500 }),
          diary("w2", "2026-07-04", { event_type: "watering" }),
          diary("w3", "2026-07-06", { event_type: "watering", watering_amount_ml: 250 }),
        ],
      }),
    );
    expect(vm.watering.count).toBe(3);
    expect(vm.watering.totalMl).toBe(750);
  });

  it("totalMl stays null when no watering carries an amount", () => {
    const vm = buildDiaryRangeReport(
      baseInput({
        diaryEntries: [diary("w1", "2026-07-02", { event_type: "watering" })],
      }),
    );
    expect(vm.watering.totalMl).toBeNull();
  });

  it("pH/EC ranges come only from logged values, null otherwise", () => {
    const withValues = buildDiaryRangeReport(
      baseInput({
        diaryEntries: [
          diary("f1", "2026-07-02", { event_type: "feeding", ph: 6.2, ec: 1.4 }),
          diary("f2", "2026-07-05", { event_type: "feeding", ph: 5.9 }),
        ],
      }),
    );
    expect(withValues.feeding.phRange).toEqual({ min: 5.9, max: 6.2 });
    expect(withValues.feeding.ecRange).toEqual({ min: 1.4, max: 1.4 });

    const without = buildDiaryRangeReport(
      baseInput({
        diaryEntries: [diary("f1", "2026-07-02", { event_type: "feeding" })],
      }),
    );
    expect(without.feeding.phRange).toBeNull();
    expect(without.feeding.ecRange).toBeNull();
  });
});

describe("training breakdown", () => {
  it("counts by token including defoliation subtype", () => {
    const vm = buildDiaryRangeReport(
      baseInput({
        diaryEntries: [
          diary("t1", "2026-07-02", { event_type: "training" }),
          diary("t2", "2026-07-03", { event_type: "training", subtype: "defoliation" }),
          diary("t3", "2026-07-04", { event_type: "defoliation" }),
        ],
      }),
    );
    expect(vm.training.count).toBe(3);
    const byToken = Object.fromEntries(vm.training.byType.map((t) => [t.token, t.count]));
    expect(byToken.defoliation).toBe(2);
    expect(byToken.training).toBe(1);
  });
});

describe("environment — provenance honesty", () => {
  it("aggregates metrics and rolls up sources through the canonical normalizer", () => {
    const vm = buildDiaryRangeReport(
      baseInput({
        sensorReadings: [
          { metric: "temperature_c", value: 20, ts: "2026-07-02T10:00:00Z", source: "live" },
          { metric: "temperature_c", value: 30, ts: "2026-07-03T10:00:00Z", source: "demo" },
          {
            metric: "humidity_pct",
            value: 55,
            ts: "2026-07-03T11:00:00Z",
            source: "garbage-source",
          },
        ],
      }),
    );
    const temp = vm.environment.metrics.find((m) => m.key === "temperature_c");
    // Demo stays visible in the source rollup but never feeds the aggregate.
    expect(temp?.min).toBe(68);
    expect(temp?.max).toBe(68);
    expect(temp?.avg).toBe(68);
    expect(temp?.count).toBe(1);

    const labels = vm.environment.sources.map((s) => `${s.kind}:${s.count}`).sort();
    // demo stays demo; unknown strings normalize to invalid — never live.
    expect(labels).toContain("live:1");
    expect(labels).toContain("demo:1");
    expect(labels).toContain("invalid:1");
    const liveCount = vm.environment.sources.find((s) => s.kind === "live")?.count;
    expect(liveCount).toBe(1);
    expect(vm.environment.readingCount).toBe(3);
  });

  it("excludes diagnostic lineage while retaining physical gateway evidence", () => {
    const vm = buildDiaryRangeReport(
      baseInput({
        sensorReadings: [
          {
            metric: "temperature_c",
            value: 99,
            ts: "2026-07-02T10:00:00Z",
            source: "live",
            raw_payload: {
              vendor: "ecowitt_windows_testbench",
              metadata: { confidence: "test" },
            },
          },
          {
            metric: "temperature_c",
            value: 22,
            ts: "2026-07-03T10:00:00Z",
            source: "live",
            raw_payload: {
              vendor: "ecowitt_windows_testbench",
              metadata: {
                reported_verdant_source: "live",
                raw_payload: {
                  PASSKEY: "classification-only-secret",
                  stationtype: "GW2000A",
                  dateutc: "2026-07-03 10:00:00",
                },
              },
            },
          },
        ],
      }),
    );

    const temp = vm.environment.metrics.find((m) => m.key === "temperature_c");
    expect(temp).toMatchObject({ count: 1, min: 71.6, max: 71.6, avg: 71.6 });
    expect(vm.environment.readingCount).toBe(1);
    expect(vm.environment.sources).toEqual([{ kind: "live", label: "Live", count: 1 }]);
    expect(JSON.stringify(vm)).not.toMatch(/raw_payload|classification-only-secret/i);
  });
});

describe("photos", () => {
  it("caps items and reports the honest remainder", () => {
    const rows = Array.from({ length: 30 }, (_, i) =>
      diary(`p${i}`, "2026-07-05", { event_type: "photo" }, `https://signed.example/p${i}.jpg`),
    );
    const vm = buildDiaryRangeReport(baseInput({ diaryEntries: rows }));
    expect(vm.photos.items).toHaveLength(DIARY_RANGE_PHOTO_CAP);
    expect(vm.photos.totalCount).toBe(30);
    expect(vm.photos.moreCount).toBe(6);
  });
});

describe("harvest outcomes", () => {
  it("combines harvests table and Quick Log harvest details, grams only when logged", () => {
    const vm = buildDiaryRangeReport(
      baseInput({
        harvests: [{ harvested_at: "2026-07-08T12:00:00Z", yield_grams: 120 }],
        growEvents: [
          {
            id: "ge1",
            event_type: "harvest",
            occurred_at: "2026-07-09T12:00:00Z",
            note: "",
            details: { harvest: { wetWeight: "500", weightUnit: "g", dry_weight_grams: 100 } },
          },
          {
            id: "ge2",
            event_type: "harvest",
            occurred_at: "2026-07-09T13:00:00Z",
            note: "",
            // lb without canonical grams: skipped, never guessed.
            details: { harvest: { wetWeight: "2", weightUnit: "lb" } },
          },
        ],
      }),
    );
    expect(vm.harvest.entries).toHaveLength(3);
    expect(vm.harvest.totalWetGrams).toBe(500);
    expect(vm.harvest.totalDryGrams).toBe(220);
  });

  it("reports null totals when nothing carries weight", () => {
    const vm = buildDiaryRangeReport(baseInput());
    expect(vm.harvest.totalWetGrams).toBeNull();
    expect(vm.harvest.totalDryGrams).toBeNull();
    expect(vm.harvest.entries).toHaveLength(0);
  });
});

describe("display safety", () => {
  it("never leaks ids into display strings", () => {
    const vm = buildDiaryRangeReport(
      baseInput({
        grow: { name: "Tent Run", stage: "veg" },
        diaryEntries: [diary(GROW_UUID, "2026-07-05", { event_type: "watering" })],
      }),
    );
    const text = JSON.stringify([
      vm.header,
      vm.watering.entries,
      vm.feeding,
      vm.training.byType,
      vm.environment.sources,
      vm.harvest,
    ]);
    expect(text).not.toContain(GROW_UUID);
  });

  it("safety + source honesty copy stay pinned", () => {
    expect(DIARY_RANGE_SAFETY_COPY).toBe(
      "Verdant suggestions remain grower-approved. This report does not include device commands.",
    );
    expect(DIARY_RANGE_SOURCE_HONESTY_COPY).toContain("live, manual, CSV, demo, stale, or invalid");
  });

  it("is deterministic for the injected now", () => {
    const a = buildDiaryRangeReport(baseInput());
    const b = buildDiaryRangeReport(baseInput());
    expect(a).toEqual(b);
    expect(a.header.generatedOn).toBe("2026-07-17");
  });
});
