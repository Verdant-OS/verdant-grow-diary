import { describe, expect, it } from "vitest";
import {
  getNextPublicOneTentTourStepId,
  isPublicOneTentTourStepId,
  PUBLIC_ONE_TENT_TOUR_STEPS,
  resolvePublicOneTentTourStep,
} from "@/lib/publicOneTentTourRules";

describe("public One-Tent tour rules", () => {
  it("covers the complete product axis in order", () => {
    expect(PUBLIC_ONE_TENT_TOUR_STEPS.flatMap((step) => step.journey)).toEqual([
      "Grow",
      "Tent",
      "Plant",
      "Quick Log",
      "Timeline",
      "Sensor Snapshot",
      "AI Doctor",
      "Alert",
      "Action Queue",
    ]);
  });

  it("resolves exact IDs and fails closed to the first step", () => {
    expect(resolvePublicOneTentTourStep("memory").id).toBe("memory");
    for (const malformed of [null, undefined, "", "MEMORY", "device_control", 3, {}]) {
      expect(resolvePublicOneTentTourStep(malformed).id).toBe("home");
    }
  });

  it("advances deterministically and ends without wrapping", () => {
    expect(getNextPublicOneTentTourStepId("home")).toBe("quick_log");
    expect(getNextPublicOneTentTourStepId("quick_log")).toBe("memory");
    expect(getNextPublicOneTentTourStepId("memory")).toBe("doctor");
    expect(getNextPublicOneTentTourStepId("doctor")).toBe("action_queue");
    expect(getNextPublicOneTentTourStepId("action_queue")).toBeNull();
    expect(getNextPublicOneTentTourStepId("invalid")).toBe("quick_log");
  });

  it("recognizes only the fixed step allowlist", () => {
    for (const step of PUBLIC_ONE_TENT_TOUR_STEPS) {
      expect(isPublicOneTentTourStepId(step.id)).toBe(true);
    }
    expect(isPublicOneTentTourStepId("execute")).toBe(false);
    expect(isPublicOneTentTourStepId(null)).toBe(false);
  });

  it("keeps sensor provenance and non-live labeling explicit", () => {
    const memory = resolvePublicOneTentTourStep("memory");
    const rendered = JSON.stringify(memory);
    for (const label of ["Live", "Manual", "CSV", "Demo", "Stale", "Invalid"]) {
      expect(rendered).toContain(label);
    }
    expect(memory.safetyNote).toMatch(/not live telemetry/i);
    expect(memory.safetyNote).toMatch(/never appear healthy/i);
  });

  it("keeps weak-evidence AI guidance conservative", () => {
    const doctor = resolvePublicOneTentTourStep("doctor");
    const rendered = JSON.stringify(doctor);
    expect(rendered).toContain("Partial");
    expect(rendered).toContain("Missing information");
    expect(rendered).toMatch(/avoid aggressive nutrient or irrigation changes/i);
    expect(doctor.safetyNote).toMatch(/not an aggressive diagnosis/i);
  });

  it("keeps Action Queue approval-required and device control unavailable", () => {
    const action = resolvePublicOneTentTourStep("action_queue");
    const rendered = JSON.stringify(action);
    expect(rendered).toContain("Approval required");
    expect(rendered).toContain('"label":"Device control","value":"Unavailable"');
    expect(action.safetyNote).toMatch(/does not auto-create/i);
    expect(action.safetyNote).toMatch(/execute device commands/i);
  });

  it("returns identical content for repeated inputs", () => {
    const first = resolvePublicOneTentTourStep("doctor");
    const second = resolvePublicOneTentTourStep("doctor");
    expect(second).toEqual(first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});
