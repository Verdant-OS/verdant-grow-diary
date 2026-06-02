import { describe, it, expect } from "vitest";
import {
  buildAiDoctorContextQuickActions,
  AI_DOCTOR_NO_WARNING_CONTEXT_COPY,
} from "@/lib/aiDoctorContextQuickActionsViewModel";
import { PLANT_QUICKLOG_PREFILL_EVENT } from "@/lib/plantQuickLogPrefillRules";

describe("buildAiDoctorContextQuickActions", () => {
  const base = { plantId: "p1", plantName: "Plant A", growId: "g1", tentId: "t1" };

  it("returns empty list when nothing is missing", () => {
    expect(buildAiDoctorContextQuickActions({ missing: [], ...base })).toEqual([]);
  });

  it("maps missing strain/stage/medium to a single update_plant_profile action", () => {
    const actions = buildAiDoctorContextQuickActions({
      missing: ["strain", "stage", "medium"],
      ...base,
    });
    expect(actions).toHaveLength(1);
    expect(actions[0].kind).toBe("update_plant_profile");
    expect(actions[0].label).toBe("Update plant profile");
    expect(actions[0].target).toMatchObject({ kind: "link" });
    expect(actions[0].satisfies).toEqual(["strain", "stage", "medium"]);
  });

  it("maps missing recent timeline/watering to Add recent log via quicklog event", () => {
    const actions = buildAiDoctorContextQuickActions({
      missing: ["recent-timeline-activity", "recent-watering-or-feeding"],
      ...base,
    });
    const log = actions.find((a) => a.kind === "add_recent_log");
    expect(log).toBeDefined();
    expect(log!.label).toBe("Add recent log");
    expect(log!.target.kind).toBe("event");
    if (log!.target.kind === "event") {
      expect(log!.target.eventName).toBe(PLANT_QUICKLOG_PREFILL_EVENT);
      expect(log!.target.payload?.plantId).toBe("p1");
    }
  });

  it("maps missing manual sensor snapshot to sensors route link", () => {
    const actions = buildAiDoctorContextQuickActions({
      missing: ["recent-manual-sensor-snapshot"],
      ...base,
    });
    const snap = actions.find((a) => a.kind === "add_manual_sensor_snapshot");
    expect(snap).toBeDefined();
    expect(snap!.label).toBe("Add manual sensor snapshot");
    expect(snap!.target).toMatchObject({ kind: "link" });
    if (snap!.target.kind === "link") {
      expect(snap!.target.href).toContain("/sensors");
      expect(snap!.target.href).toContain("g1");
    }
  });

  it("maps missing plant-photo to Add plant photo via quicklog event", () => {
    const actions = buildAiDoctorContextQuickActions({
      missing: ["plant-photo"],
      ...base,
    });
    expect(actions).toHaveLength(1);
    expect(actions[0].kind).toBe("add_plant_photo");
    expect(actions[0].label).toBe("Add plant photo");
    expect(actions[0].target.kind).toBe("event");
  });

  it("produces no action for unknown / warning-context codes", () => {
    const actions = buildAiDoctorContextQuickActions({
      missing: ["recent-warnings", "no-warning-context", "made-up"],
      ...base,
    });
    expect(actions).toEqual([]);
  });

  it("disables quicklog-based actions when plantId is missing", () => {
    const actions = buildAiDoctorContextQuickActions({
      missing: ["recent-timeline-activity", "plant-photo"],
      plantId: null,
    });
    for (const a of actions) {
      if (a.kind === "add_recent_log" || a.kind === "add_plant_photo") {
        expect(a.disabled).toBe(true);
        expect(a.disabledReason).toMatch(/plant context/i);
      }
    }
  });

  it("exposes calm no-warning copy constant", () => {
    expect(AI_DOCTOR_NO_WARNING_CONTEXT_COPY).toBe("No warning context found.");
  });

  it("dedupes and orders actions stably regardless of missing input order", () => {
    const a = buildAiDoctorContextQuickActions({
      missing: ["plant-photo", "stage", "recent-manual-sensor-snapshot", "strain"],
      ...base,
    }).map((x) => x.kind);
    expect(a).toEqual([
      "update_plant_profile",
      "add_manual_sensor_snapshot",
      "add_plant_photo",
    ]);
  });
});
