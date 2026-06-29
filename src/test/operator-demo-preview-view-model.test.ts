import { describe, it, expect } from "vitest";
import { buildOperatorDemoPreviewViewModel } from "@/lib/operatorDemoPreviewViewModel";
import { loadDemoEvidenceChainFixture } from "@/lib/demoEvidenceChainFixture";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("operatorDemoPreviewViewModel", () => {
  const vm = buildOperatorDemoPreviewViewModel();
  const fx = loadDemoEvidenceChainFixture();

  it("labels source as demo, never live", () => {
    expect(vm.sourceLabel).toBe("demo");
    expect(vm.sensorReading.sourceLabel).toBe("Demo");
    expect(JSON.stringify(vm).toLowerCase()).not.toContain('"live"');
  });

  it("grow label is not a raw UUID", () => {
    expect(UUID_RE.test(vm.growLabel)).toBe(false);
    expect(vm.growLabel.length).toBeGreaterThan(0);
  });

  it("alert evidence refs come from fixture loader (not inferred)", () => {
    expect(vm.alert.evidenceRefs).toEqual(fx.alert.originating_timeline_events);
    expect(vm.alert.evidenceRefs).toHaveLength(1);
    expect(vm.alert.evidenceRefs[0].id).toBe(fx.reading.id);
  });

  it("action evidence refs are forwarded from alert refs", () => {
    expect(vm.action.evidenceRefs).toEqual(
      fx.action.originating_timeline_events,
    );
    expect(vm.action.evidenceRefs[0].id).toBe(fx.alert.originating_timeline_events[0].id);
  });

  it("action status normalizes to approval-required copy", () => {
    expect(vm.action.statusLabel).toBe("Pending approval");
  });

  it("post-grow eligibility reflects archived+harvest fixture state", () => {
    expect(vm.postGrow.eligible).toBe(true);
    expect(vm.postGrow.archived).toBe(true);
    expect(vm.postGrow.harvestedAtLabel).toBe(fx.grow.harvested_at);
  });

  it("safety notes mention approval-required, not automation", () => {
    const blob = vm.safetyNotes.join(" ").toLowerCase();
    expect(blob).toContain("approval");
    expect(blob).not.toContain("automatically");
    expect(blob).not.toContain("device command");
  });

  it("does not expose raw payload / token / prompt fields", () => {
    const blob = JSON.stringify(vm).toLowerCase();
    for (const bad of [
      "raw_payload",
      "service_role",
      "bridge_token",
      "api_token",
      "access_token",
      "refresh_token",
      "jwt",
      "prompt",
      "completion",
      "model_output",
    ]) {
      expect(blob).not.toContain(bad);
    }
  });

  it("is deterministic", () => {
    const a = buildOperatorDemoPreviewViewModel();
    const b = buildOperatorDemoPreviewViewModel();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
