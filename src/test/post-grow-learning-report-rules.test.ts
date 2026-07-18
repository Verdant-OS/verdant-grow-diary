import { describe, expect, it } from "vitest";

import {
  POST_GROW_LESSON_EVENT_TYPE,
  buildPostGrowLearningReportViewModel,
  buildPostGrowLessonActionQueueDraft,
  buildPostGrowReportImageSvg,
  buildPostGrowReportSummaryText,
} from "@/lib/postGrowLearningReportRules";

const archivedGrow = {
  id: "grow-1",
  name: "Archive Run",
  stage: "drying",
  is_archived: true,
  started_at: "2026-01-01T00:00:00.000Z",
};

describe("buildPostGrowLearningReportViewModel", () => {
  it("builds a happy-path report for an archived grow", () => {
    const vm = buildPostGrowLearningReportViewModel({
      grow: archivedGrow,
      harvests: [
        {
          harvested_at: "2026-04-01T00:00:00.000Z",
          yield_grams: 112.5,
          medium: "coco",
        },
      ],
      diaryEntries: [
        {
          id: "d1",
          note: "Dry checkpoint",
          entry_at: "2026-04-02T00:00:00.000Z",
          photo_url: "photo-a.jpg",
          details: { event_type: "dry_checkpoint", weight_g: 160, rh_pct: 64 },
        },
        {
          id: "d2",
          note: "Jar check",
          entry_at: "2026-04-05T00:00:00.000Z",
          photo_url: null,
          details: { event_type: "cure_burp", weight_g: 112, rh_pct: 62 },
        },
        {
          id: "lesson",
          note: "Keep dry room RH steadier next run.",
          entry_at: "2026-04-06T00:00:00.000Z",
          photo_url: null,
          details: { event_type: POST_GROW_LESSON_EVENT_TYPE },
        },
      ],
      sensorReadings: [
        {
          metric: "temperature_c",
          value: 24,
          ts: "2026-03-01T00:00:00.000Z",
          source: "live",
          quality: "ok",
        },
        {
          metric: "temperature_c",
          value: 25,
          ts: "2026-03-02T00:00:00.000Z",
          source: "live",
          quality: "ok",
        },
        {
          metric: "humidity_pct",
          value: 55,
          ts: "2026-03-01T00:00:00.000Z",
          source: "live",
          quality: "ok",
        },
        {
          metric: "vpd_kpa",
          value: 1.2,
          ts: "2026-03-01T00:00:00.000Z",
          source: "live",
          quality: "ok",
        },
      ],
      actions: [
        {
          id: "a1",
          action_type: "advisory",
          status: "completed",
          completed_at: "2026-03-01T00:00:00.000Z",
        },
      ],
    });

    expect(vm.eligible).toBe(true);
    expect(vm.header.yieldGrams).toBe(112.5);
    expect(vm.dataCompleteness.label).toBe("Strong");
    expect(vm.environment.find((m) => m.key === "temperature_c")?.avg).toBe(24.5);
    expect(vm.postHarvest.points).toHaveLength(2);
    expect(vm.postHarvest.weightLossPct).toBeCloseTo(30, 0);
    expect(vm.actionEffectiveness.completedActions).toBe(1);
    expect(vm.lesson.text).toBe("Keep dry room RH steadier next run.");
    expect(vm.photos).toHaveLength(1);
  });

  it("keeps labeled non-live context out of aggregates and excludes diagnostics", () => {
    const vm = buildPostGrowLearningReportViewModel({
      grow: archivedGrow,
      sensorReadings: [
        {
          metric: "temperature_c",
          value: 99,
          ts: "2026-03-01T00:00:00.000Z",
          source: "live",
          quality: "ok",
          raw_payload: {
            vendor: "ecowitt_windows_testbench",
            metadata: { confidence: "test" },
          },
        },
        {
          metric: "temperature_c",
          value: 24,
          ts: "2026-03-02T00:00:00.000Z",
          source: "live",
          quality: "ok",
          raw_payload: {
            vendor: "ecowitt_windows_testbench",
            metadata: {
              reported_verdant_source: "live",
              raw_payload: {
                PASSKEY: "classification-only-secret",
                stationtype: "GW2000A",
                dateutc: "2026-03-02 00:00:00",
              },
            },
          },
        },
        { metric: "temperature_c", value: 30, ts: "2026-03-03T00:00:00.000Z", source: "demo" },
        { metric: "temperature_c", value: 31, ts: "2026-03-04T00:00:00.000Z", source: "stale" },
        { metric: "temperature_c", value: 32, ts: "2026-03-05T00:00:00.000Z", source: "invalid" },
      ],
    });

    expect(vm.environment.find((m) => m.key === "temperature_c")).toMatchObject({
      count: 1,
      avg: 24,
      min: 24,
      max: 24,
    });
    expect(vm.sensorReadingSources).toEqual([
      { source: "live" },
      { source: "demo" },
      { source: "stale" },
      { source: "invalid" },
    ]);
    expect(JSON.stringify(vm)).not.toMatch(/raw_payload|classification-only-secret/i);

    const nonEvidenceOnly = buildPostGrowLearningReportViewModel({
      grow: archivedGrow,
      sensorReadings: [
        {
          metric: "temperature_c",
          value: 30,
          ts: "2026-03-03T00:00:00.000Z",
          source: "demo",
        },
      ],
    });
    expect(nonEvidenceOnly.dataCompleteness.missing).toContain("Sensor readings");
    expect(nonEvidenceOnly.sensorReadingSources).toEqual([{ source: "demo" }]);

    const missingQuality = buildPostGrowLearningReportViewModel({
      grow: archivedGrow,
      sensorReadings: [
        { metric: "temperature_c", value: 24, ts: "2026-03-02T00:00:00.000Z", source: "live" },
      ],
    });
    expect(missingQuality.environment[0].count).toBe(0);
    expect(missingQuality.sensorReadingSources).toEqual([{ source: "live" }]);
  });

  it("keeps active veg grows ineligible and reports thin data honestly", () => {
    const vm = buildPostGrowLearningReportViewModel({
      grow: { id: "grow-2", name: "Active Veg", stage: "veg", is_archived: false },
      diaryEntries: [],
      sensorReadings: [],
      harvests: [],
    });

    expect(vm.eligible).toBe(false);
    expect(vm.ineligibleReason).toMatch(/archived, harvest, or drying-stage/i);
    expect(vm.dataCompleteness.label).toBe("Thin");
    expect(vm.dataCompleteness.missing).toContain("Harvest record");
  });

  it("treats drying-stage completed grows as eligible even before archive", () => {
    const vm = buildPostGrowLearningReportViewModel({
      grow: { id: "grow-3", name: "Drying Run", stage: "drying", is_archived: false },
    });

    expect(vm.eligible).toBe(true);
  });
});

describe("buildPostGrowLessonActionQueueDraft", () => {
  it("creates an approval-required manual advisory with no target device", () => {
    const draft = buildPostGrowLessonActionQueueDraft({
      growId: "grow-1",
      lessonText: "Do not flip to flower until canopy is even.",
    });

    expect(draft.grow_id).toBe("grow-1");
    expect(draft.status).toBe("pending_approval");
    expect(draft.source).toBe("manual");
    expect(draft.target_device).toBeNull();
    expect(draft.suggested_change).toMatch(/Review this lesson/i);
    expect(draft.reason).toMatch(/Grower approval required/i);
  });
});

describe("post-grow report exports", () => {
  it("builds text and SVG exports without AI/device-control claims", () => {
    const vm = buildPostGrowLearningReportViewModel({ grow: archivedGrow });
    const text = buildPostGrowReportSummaryText(vm);
    const svg = buildPostGrowReportImageSvg(vm);

    expect(text).toContain("Post-Grow Learning Report");
    expect(svg).toContain("<svg");
    expect(`${text}\n${svg}`).not.toMatch(/autopilot|device command|auto-execute/i);
  });
});
