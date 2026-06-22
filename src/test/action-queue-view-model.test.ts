/**
 * actionQueueViewModel — pure helper tests for the drawer view model.
 */
import { describe, it, expect } from "vitest";
import {
  buildActionDrawerViewModel,
  ACTION_DRAWER_SAFETY_REMINDER,
  ACTION_DRAWER_NO_CONTEXT_HELP,
} from "@/lib/actionQueueViewModel";

const BASE = {
  id: "aq-1",
  grow_id: "g-1",
  tent_id: "t-1",
  plant_id: "p-1",
  source: "ai_doctor",
  action_type: "lower_humidity",
  target_metric: "humidity_pct",
  suggested_change: "Lower humidity to 55%",
  reason: "Mold risk. [alert:alert-xyz] [session:sess-1]",
  risk_level: "medium",
  status: "pending_approval",
};

describe("buildActionDrawerViewModel", () => {
  it("uses the sanitized recommendation as the title when present", () => {
    const vm = buildActionDrawerViewModel(BASE);
    expect(vm.titleLabel).toBe("Lower humidity to 55%");
  });

  it("falls back to formatted action_type when suggested_change is missing", () => {
    const vm = buildActionDrawerViewModel({
      ...BASE,
      suggested_change: null,
    });
    expect(vm.titleLabel).toBe("Lower Humidity");
  });

  it("strips back-pointer tokens from the visible reason text", () => {
    const vm = buildActionDrawerViewModel(BASE);
    expect(vm.reasonText).toBe("Mold risk.");
    expect(vm.reasonText).not.toContain("[alert:");
    expect(vm.reasonText).not.toContain("[session:");
  });

  it("maps source to a human label, never the raw enum", () => {
    expect(buildActionDrawerViewModel(BASE).sourceLabel).toBe("AI Doctor");
    expect(
      buildActionDrawerViewModel({ ...BASE, source: "environment_alert" })
        .sourceLabel,
    ).toBe("Environment Alert");
    expect(buildActionDrawerViewModel({ ...BASE, source: "manual" }).sourceLabel).toBe(
      "Manual",
    );
    expect(buildActionDrawerViewModel({ ...BASE, source: "" }).sourceLabel).toBe(
      "Unknown",
    );
  });

  it("returns risk and status labels rather than raw enums", () => {
    const vm = buildActionDrawerViewModel(BASE);
    expect(vm.riskLabel).toBe("Medium risk");
    expect(vm.statusLabel).toBe("Pending review");
  });

  it("resolves related grow/tent/plant labels via lookups", () => {
    const vm = buildActionDrawerViewModel(BASE, {
      growsById: { "g-1": { name: "Greenhouse A" } },
      tentsById: { "t-1": { name: "Tent One" } },
      plantsById: { "p-1": { nickname: "Bertha", strain: "Blue Dream" } },
    });
    expect(vm.growLabel).toBe("Greenhouse A");
    expect(vm.tentLabel).toBe("Tent One");
    expect(vm.plantLabel).toBe("Bertha");
    expect(vm.hasRelatedContext).toBe(true);
  });

  it("returns null labels when lookups are missing", () => {
    const vm = buildActionDrawerViewModel(BASE);
    expect(vm.growLabel).toBeNull();
    expect(vm.tentLabel).toBeNull();
    expect(vm.plantLabel).toBeNull();
    expect(vm.hasRelatedContext).toBe(false);
    expect(vm.noContextHelpText).toBe(ACTION_DRAWER_NO_CONTEXT_HELP);
  });

  it("always exposes the constant safety reminder", () => {
    const vm = buildActionDrawerViewModel(BASE);
    expect(vm.safetyReminder).toBe(ACTION_DRAWER_SAFETY_REMINDER);
    expect(vm.safetyReminder.toLowerCase()).toContain("grower approves");
    expect(vm.safetyReminder.toLowerCase()).toContain(
      "no equipment is controlled",
    );
  });

  it("never surfaces internal id values in any visible field", () => {
    const vm = buildActionDrawerViewModel(BASE);
    const visible = [
      vm.titleLabel,
      vm.recommendationText,
      vm.reasonText,
      vm.riskLabel,
      vm.statusLabel,
      vm.sourceLabel,
      vm.targetLabel,
      vm.noContextHelpText,
      vm.safetyReminder,
    ].join("\n");
    expect(visible).not.toContain("aq-1");
    expect(visible).not.toContain("alert-xyz");
    expect(visible).not.toContain("sess-1");
  });
});
