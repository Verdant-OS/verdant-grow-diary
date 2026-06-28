/**
 * End-of-Run Grow Report — pure view-model tests.
 *
 * Fixed fixture dates keep output deterministic. No network, no React.
 */
import { describe, it, expect } from "vitest";
import {
  buildEndOfRunGrowReportViewModel,
  normalizeGrowReportSensorSource,
  GROW_REPORT_SENSOR_SOURCES,
  REPORT_DATA_SOURCE_NOTE,
  ACTION_QUEUE_SAFETY_NOTE,
  ALERTS_EMPTY_COPY,
  type GrowReportInput,
} from "@/lib/endOfRunGrowReportViewModel";

const GROW = {
  id: "grow-1",
  name: "Blue Dream Run",
  stage: "flower",
  started_at: "2026-01-01T00:00:00Z",
  is_archived: false,
};

function fullInput(): GrowReportInput {
  return {
    grow: GROW,
    tents: [
      { id: "tent-a", name: "Tent A", grow_id: "grow-1" },
      { id: "tent-b", name: "Tent B", grow_id: "grow-1" },
    ],
    plants: [
      // intentionally out of order to test sorting
      { id: "p-2", name: "Zelda", strain: "BD", stage: "flower", tent_id: "tent-a" },
      { id: "p-1", name: "alpha", strain: null, stage: null, tent_id: "tent-b" },
    ],
    events: [
      { id: "e1", event_type: "watering", occurred_at: "2026-01-02T00:00:00Z", plant_id: "p-2" },
      { id: "e2", event_type: "watering", occurred_at: "2026-01-03T00:00:00Z", plant_id: "p-2" },
      { id: "e3", event_type: "feeding", occurred_at: "2026-01-04T00:00:00Z", plant_id: "p-2" },
      { id: "e4", event_type: "photo", occurred_at: "2026-01-05T00:00:00Z", plant_id: "p-2" },
      { id: "e5", event_type: "training", occurred_at: "2026-01-06T00:00:00Z", plant_id: "p-2" },
      { id: "e6", event_type: "symptoms", occurred_at: "2026-01-07T00:00:00Z", plant_id: "p-2" },
      { id: "e7", event_type: "observation", occurred_at: "2026-01-08T00:00:00Z", plant_id: "p-1" },
      { id: "e8", event_type: "note", occurred_at: "2026-01-09T00:00:00Z", plant_id: "p-1" },
      // deleted event must be ignored
      {
        id: "e9",
        event_type: "watering",
        occurred_at: "2026-01-10T00:00:00Z",
        plant_id: "p-1",
        is_deleted: true,
      },
    ],
    sensorReadings: [
      { id: "s1", source: "live", ts: "2026-01-02T01:00:00Z", tent_id: "tent-a" },
      { id: "s2", source: "manual", ts: "2026-01-03T01:00:00Z", tent_id: "tent-a" },
      { id: "s3", source: "csv", ts: "2026-01-04T01:00:00Z", tent_id: "tent-a" },
      { id: "s4", source: "demo", ts: "2026-01-05T01:00:00Z", tent_id: "tent-a" },
      { id: "s5", source: "imported", ts: "2026-01-06T01:00:00Z", tent_id: "tent-a" },
      { id: "s6", source: "ecowitt", ts: "2026-01-07T01:00:00Z", tent_id: "tent-a" },
      {
        id: "s7",
        source: "live",
        quality: "invalid",
        ts: "2026-01-08T01:00:00Z",
        tent_id: "tent-a",
      },
      { id: "s8", source: "live", quality: "stale", ts: "2026-01-09T01:00:00Z", tent_id: "tent-a" },
    ],
    alerts: [
      { id: "a1", status: "open", severity: "high", metric: "temp", plant_id: "p-2" },
      { id: "a2", status: "resolved", severity: "low", metric: "temp", plant_id: "p-2" },
      { id: "a3", status: "open", severity: "high", metric: "rh" },
    ],
    actions: [
      { id: "act1", status: "pending_approval", plant_id: "p-2" },
      { id: "act2", status: "approved", plant_id: "p-2" },
      { id: "act3", status: "completed" },
    ],
    aiDoctorSessions: [
      { id: "d1", plant_id: "p-2" },
      { id: "d2", plant_id: "p-2" },
    ],
  };
}

describe("buildEndOfRunGrowReportViewModel — header", () => {
  it("builds header from grow data", () => {
    const vm = buildEndOfRunGrowReportViewModel(fullInput());
    expect(vm.header.growId).toBe("grow-1");
    expect(vm.header.growName).toBe("Blue Dream Run");
    expect(vm.header.startedAt).toBe("2026-01-01T00:00:00Z");
    expect(vm.header.tentCount).toBe(2);
    expect(vm.header.plantCount).toBe(2);
    expect(vm.header.statusBadges).toEqual([
      "Preview",
      "Read-only",
      "Based on available logged data",
    ]);
    expect(vm.header.dataSourceNote).toBe(REPORT_DATA_SOURCE_NOTE);
    expect(vm.header.hasDateRange).toBe(true);
  });

  it("derives tent count from tent_ids when no tents array provided", () => {
    const input = fullInput();
    input.tents = null;
    const vm = buildEndOfRunGrowReportViewModel(input);
    expect(vm.header.tentCount).toBe(2); // tent-a + tent-b from plants/events
  });
});

describe("buildEndOfRunGrowReportViewModel — run summary", () => {
  it("counts timeline / log / photo / sensor / alert / action categories", () => {
    const vm = buildEndOfRunGrowReportViewModel(fullInput());
    const byKey = (k: string) => vm.runSummary.categories.find((c) => c.key === k)?.count;
    expect(byKey("timeline_events")).toBe(8); // deleted event excluded
    expect(byKey("watering")).toBe(2);
    expect(byKey("feeding")).toBe(1);
    expect(byKey("photos")).toBe(1);
    expect(byKey("training")).toBe(1);
    expect(byKey("symptoms_observations")).toBe(2); // 1 symptom + 1 observation
    expect(byKey("notes")).toBe(1);
    expect(byKey("sensor_snapshots")).toBe(8);
    expect(byKey("alerts")).toBe(3);
    expect(byKey("action_items")).toBe(3);
    expect(byKey("ai_doctor")).toBe(2);
    expect(vm.runSummary.hasAnyData).toBe(true);
  });
});

describe("buildEndOfRunGrowReportViewModel — empty grow", () => {
  it("handles an empty grow safely and does not treat missing categories as success", () => {
    const vm = buildEndOfRunGrowReportViewModel({ grow: GROW });
    expect(vm.isEmpty).toBe(true);
    expect(vm.runSummary.hasAnyData).toBe(false);
    for (const c of vm.runSummary.categories) expect(c.count).toBe(0);
    expect(vm.plants).toEqual([]);
    expect(vm.sensorTruth.hasData).toBe(false);
    expect(vm.alerts.hasData).toBe(false);
    expect(vm.alerts.note).toBe(ALERTS_EMPTY_COPY);
    // No success/health verdict anywhere in the serialized model.
    const serialized = JSON.stringify(vm).toLowerCase();
    expect(serialized).not.toContain("healthy");
    expect(serialized).not.toContain("successful");
    expect(serialized).not.toContain("guaranteed");
  });
});

describe("buildEndOfRunGrowReportViewModel — plant summaries", () => {
  it("sorts plants by name then id and emits missing-context chips", () => {
    const vm = buildEndOfRunGrowReportViewModel(fullInput());
    expect(vm.plants.map((p) => p.id)).toEqual(["p-1", "p-2"]); // alpha, Zelda
    const alpha = vm.plants[0];
    expect(alpha.strainLabel).toBe("Unknown strain");
    expect(alpha.stageLabel).toBe("Unknown stage");
    expect(alpha.missingContext).toContain("Unknown strain");
    expect(alpha.missingContext).toContain("Unknown stage");
    expect(alpha.missingContext).toContain("No watering logs");
    expect(alpha.missingContext).toContain("No alerts reviewed");

    const zelda = vm.plants[1];
    expect(zelda.wateringCount).toBe(2);
    expect(zelda.feedingCount).toBe(1);
    expect(zelda.photoCount).toBe(1);
    expect(zelda.alertCount).toBe(2);
    expect(zelda.aiDoctorCount).toBe(2);
    expect(zelda.mostDocumentedArea).toBe("Watering");
    expect(zelda.firstLoggedAt).toBe("2026-01-02T00:00:00Z");
    expect(zelda.latestLoggedAt).toBe("2026-01-07T00:00:00Z");
    // Zelda has tent-a snapshots, so no "No sensor snapshots" chip.
    expect(zelda.missingContext).not.toContain("No sensor snapshots");
  });

  it("reports 'No logged data yet' as most documented area for a plant with no events", () => {
    const vm = buildEndOfRunGrowReportViewModel({
      grow: GROW,
      plants: [{ id: "p-x", name: "Solo", strain: "X", stage: "veg", tent_id: "t" }],
    });
    expect(vm.plants[0].mostDocumentedArea).toBe("No logged data yet");
  });
});

describe("buildEndOfRunGrowReportViewModel — sensor truth", () => {
  it("counts sources correctly and labels each honestly", () => {
    const vm = buildEndOfRunGrowReportViewModel(fullInput());
    const st = vm.sensorTruth;
    expect(st.totalSnapshots).toBe(8);
    const count = (src: string) => st.bySource.find((s) => s.source === src)?.count;
    expect(count("live")).toBe(1); // 3 live rows, but 2 overridden by quality
    expect(count("manual")).toBe(1);
    expect(count("csv")).toBe(1);
    expect(count("demo")).toBe(1);
    expect(count("imported")).toBe(1);
    expect(count("unknown")).toBe(1); // ecowitt → unknown
    expect(count("invalid")).toBe(1); // quality override
    expect(count("stale")).toBe(1); // quality override
    // Labels present for all 8, including "Unknown source".
    expect(st.bySource.map((s) => s.source)).toEqual([...GROW_REPORT_SENSOR_SOURCES]);
    expect(st.bySource.find((s) => s.source === "unknown")?.label).toBe("Unknown source");
    expect(st.hasLiveData).toBe(true);
    expect(st.hasDegraded).toBe(true);
    expect(st.degradedWarning).not.toBeNull();
    expect(st.mostRecentAt).toBe("2026-01-09T01:00:00Z");
  });

  it("treats unknown/unrecognized source as unknown", () => {
    expect(normalizeGrowReportSensorSource("ecowitt")).toBe("unknown");
    expect(normalizeGrowReportSensorSource("")).toBe("unknown");
    expect(normalizeGrowReportSensorSource(null)).toBe("unknown");
    expect(normalizeGrowReportSensorSource(undefined)).toBe("unknown");
    expect(normalizeGrowReportSensorSource("LIVE")).toBe("live");
    expect(normalizeGrowReportSensorSource("anything", "invalid")).toBe("invalid");
    expect(normalizeGrowReportSensorSource("live", "stale")).toBe("stale");
  });

  it("flags only-non-live data and never describes it as live", () => {
    const vm = buildEndOfRunGrowReportViewModel({
      grow: GROW,
      tents: [{ id: "t" }],
      sensorReadings: [
        { id: "s1", source: "manual", ts: "2026-01-02T00:00:00Z", tent_id: "t" },
        { id: "s2", source: "demo", ts: "2026-01-03T00:00:00Z", tent_id: "t" },
      ],
    });
    expect(vm.sensorTruth.onlyNonLiveData).toBe(true);
    expect(vm.sensorTruth.hasLiveData).toBe(false);
    expect(vm.sensorTruth.note.toLowerCase()).toContain("no live");
  });
});

describe("buildEndOfRunGrowReportViewModel — alerts & actions", () => {
  it("summarizes alerts without implying resolution", () => {
    const vm = buildEndOfRunGrowReportViewModel(fullInput());
    expect(vm.alerts.total).toBe(3);
    expect(vm.alerts.resolved).toBe(1); // only the status=resolved one
    expect(vm.alerts.open).toBe(2);
    expect(vm.alerts.bySeverity).toEqual([
      { severity: "high", count: 2 },
      { severity: "low", count: 1 },
    ]);
    expect(vm.alerts.topMetrics[0]).toEqual({ key: "temp", label: "temp", count: 2 });
  });

  it("summarizes the action queue with an approval-required safety note", () => {
    const vm = buildEndOfRunGrowReportViewModel(fullInput());
    expect(vm.actionQueue.total).toBe(3);
    expect(vm.actionQueue.suggested).toBe(3);
    expect(vm.actionQueue.pendingApproval).toBe(1);
    expect(vm.actionQueue.approved).toBe(1);
    expect(vm.actionQueue.completed).toBe(1);
    expect(vm.actionQueue.rejected).toBe(0);
    expect(vm.actionQueue.safetyNote).toBe(ACTION_QUEUE_SAFETY_NOTE);
  });
});

describe("buildEndOfRunGrowReportViewModel — lessons", () => {
  it("produces rules-based lessons with evidence, sorted repeat-then-improve", () => {
    const vm = buildEndOfRunGrowReportViewModel({
      grow: GROW,
      events: [
        { id: "e1", event_type: "photo", occurred_at: "2026-01-02T00:00:00Z" },
        { id: "e2", event_type: "photo", occurred_at: "2026-01-03T00:00:00Z" },
        { id: "e3", event_type: "photo", occurred_at: "2026-01-04T00:00:00Z" },
        { id: "e4", event_type: "photo", occurred_at: "2026-01-05T00:00:00Z" },
        { id: "e5", event_type: "symptoms", occurred_at: "2026-01-06T00:00:00Z" },
      ],
      alerts: [{ id: "a1", status: "open", metric: "temp" }],
      // no actions, no sensors → triggers improve lessons
    });
    const ids = vm.lessons.map((l) => l.id);
    expect(ids).toContain("repeat-photo-logging");
    expect(ids).toContain("improve-add-sensor-snapshots");
    expect(ids).toContain("improve-add-watering-context");
    expect(ids).toContain("improve-connect-alerts-to-followup");
    // repeat category sorts before improve
    expect(vm.lessons[0].category).toBe("repeat");
    // every lesson carries evidence text
    for (const lesson of vm.lessons) {
      expect(lesson.evidence.length).toBeGreaterThan(0);
    }
  });

  it("emits no lessons when there is nothing to learn from", () => {
    const vm = buildEndOfRunGrowReportViewModel({ grow: GROW });
    expect(vm.lessons).toEqual([]);
  });
});

describe("buildEndOfRunGrowReportViewModel — determinism", () => {
  it("produces identical output for repeated identical input", () => {
    const a = buildEndOfRunGrowReportViewModel(fullInput());
    const b = buildEndOfRunGrowReportViewModel(fullInput());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
