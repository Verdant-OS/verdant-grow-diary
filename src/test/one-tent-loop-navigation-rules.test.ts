import { describe, it, expect } from "vitest";
import {
  ONE_TENT_LOOP_ORDER,
  ONE_TENT_LOOP_CTA_LABEL,
  ONE_TENT_LOOP_DISABLED_COPY,
  ONE_TENT_LOOP_EMPTY_STATE,
  ONE_TENT_LOOP_HELPER_COPY,
  ONE_TENT_LOOP_SENSOR_SOURCES,
  getNextLoopStep,
  resolveOneTentLoopNextStep,
} from "@/lib/oneTentLoopNavigationRules";

describe("oneTentLoopNavigationRules", () => {
  it("preserves canonical loop order", () => {
    expect(ONE_TENT_LOOP_ORDER).toEqual([
      "grow",
      "tent",
      "plant",
      "quick-log",
      "timeline",
      "sensor-snapshot",
      "ai-doctor",
      "alert",
      "action-queue",
    ]);
  });

  it("has the expected safe CTA label per step", () => {
    expect(ONE_TENT_LOOP_CTA_LABEL).toMatchObject({
      grow: "Open tent",
      tent: "Open plant",
      plant: "Add quick log",
      "quick-log": "View timeline",
      timeline: "Review sensor snapshot",
      "sensor-snapshot": "Open AI Doctor",
      "ai-doctor": "Review alert",
      alert: "Add to Action Queue",
      "action-queue": "Review approval-required action",
    });
  });

  it("getNextLoopStep walks the loop and stops at the end", () => {
    expect(getNextLoopStep("grow")).toBe("tent");
    expect(getNextLoopStep("alert")).toBe("action-queue");
    expect(getNextLoopStep("action-queue")).toBeNull();
  });

  it("returns disabled calm copy when required ids are missing", () => {
    const r = resolveOneTentLoopNextStep("grow", {});
    expect(r.disabled).toBe(true);
    expect(r.href).toBeNull();
    expect(r.disabledReason).toBe(ONE_TENT_LOOP_DISABLED_COPY);
  });

  it("enables grow → tent when tentId would normally be missing (grow CTA opens grow route)", () => {
    const r = resolveOneTentLoopNextStep("grow", { growId: "g1" });
    expect(r.disabled).toBe(false);
    expect(r.href).toBe("/grows/g1");
  });

  it("enables routes for tent and plant when ids are present", () => {
    expect(resolveOneTentLoopNextStep("tent", { tentId: "t1" }).href).toBe("/tents/t1");
    expect(resolveOneTentLoopNextStep("plant", { plantId: "p1" }).href).toBe("/plants/p1");
  });

  it("routes quick-log → timeline and timeline → sensors without ids", () => {
    expect(resolveOneTentLoopNextStep("quick-log").href).toBe("/timeline");
    expect(resolveOneTentLoopNextStep("timeline").href).toBe("/sensors");
  });

  it("routes sensor-snapshot → ai doctor entry", () => {
    expect(resolveOneTentLoopNextStep("sensor-snapshot").href).toBe("/doctor");
  });

  it("routes ai-doctor and alert to alert index when alertId missing", () => {
    expect(resolveOneTentLoopNextStep("ai-doctor").href).toBe("/alerts");
    expect(resolveOneTentLoopNextStep("alert").href).toBe("/alerts");
  });

  it("routes alert with alertId to alert detail", () => {
    expect(
      resolveOneTentLoopNextStep("alert", { alertId: "a1" }).href,
    ).toBe("/alerts/a1");
  });

  it("routes action-queue to action detail when actionId is present", () => {
    expect(
      resolveOneTentLoopNextStep("action-queue", { actionId: "x1" }).href,
    ).toBe("/actions/x1");
    expect(resolveOneTentLoopNextStep("action-queue").href).toBe("/actions");
  });

  it("exposes the six canonical sensor source labels", () => {
    expect(ONE_TENT_LOOP_SENSOR_SOURCES).toEqual([
      "live",
      "manual",
      "csv",
      "demo",
      "stale",
      "invalid",
    ]);
  });

  it("empty-state copy mentions approval-required for Action Queue", () => {
    expect(ONE_TENT_LOOP_EMPTY_STATE["action-queue"]).toMatch(/approval-required/i);
  });

  it("empty-state copy never calls missing sensor data healthy", () => {
    for (const step of Object.values(ONE_TENT_LOOP_EMPTY_STATE)) {
      expect(step.toLowerCase()).not.toMatch(/healthy/);
    }
  });

  it("has helper copy for downstream steps with the expected cautious wording", () => {
    expect(ONE_TENT_LOOP_HELPER_COPY.timeline).toBe(
      "Open Sensor Snapshot from Timeline to cross-check telemetry and proceed.",
    );
    expect(ONE_TENT_LOOP_HELPER_COPY["sensor-snapshot"]).toBe(
      "Open AI Doctor page to review available context and prepare for next actions.",
    );
    expect(ONE_TENT_LOOP_HELPER_COPY["ai-doctor"]).toBe(
      "Open Alert page to review and plan approval-required actions.",
    );
    expect(ONE_TENT_LOOP_HELPER_COPY.alert).toBe(
      "Review the approval-required Action Queue before taking action.",
    );
  });

  it("leaves upstream helper copy empty to avoid noisy duplication", () => {
    for (const step of ["grow", "tent", "plant", "quick-log", "action-queue"] as const) {
      expect(ONE_TENT_LOOP_HELPER_COPY[step]).toBe("");
    }
  });

  it("helper copy never calls missing telemetry healthy or implies automation", () => {
    for (const copy of Object.values(ONE_TENT_LOOP_HELPER_COPY)) {
      const lower = copy.toLowerCase();
      expect(lower).not.toMatch(/healthy/);
      expect(lower).not.toMatch(/auto[- ]?(run|execute|apply)|relay|actuator/);
    }
  });
});
