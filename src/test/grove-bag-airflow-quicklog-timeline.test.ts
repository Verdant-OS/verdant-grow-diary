import { describe, it, expect } from "vitest";
import { validateCureCheckDetails } from "@/lib/harvestCureRules";
import { buildCureCheckCardViewModel } from "@/lib/harvestCureTimelineCardViewModel";

describe("Quick Log Grove Bag airflow integration", () => {
  it("omitted airflow does not block save and is not persisted", () => {
    const r = validateCureCheckDetails({ container_label: "Jar A" });
    expect(r.ok).toBe(true);
    expect(r.value.airflow_observation).toBeUndefined();
  });

  it("saved details include airflow_observation when selected", () => {
    const r = validateCureCheckDetails({
      container_label: "Jar A",
      airflow_observation: "gentle_indirect",
    });
    expect(r.ok).toBe(true);
    expect(r.value.airflow_observation).toBe("gentle_indirect");
  });

  it("invalid airflow value normalizes to unknown and is not persisted", () => {
    const r = validateCureCheckDetails({ airflow_observation: "hurricane" });
    expect(r.ok).toBe(true);
    expect(r.value.airflow_observation).toBeUndefined();
  });

  it("explicit unknown is not persisted (only explicit observations stored)", () => {
    const r = validateCureCheckDetails({ airflow_observation: "unknown" });
    expect(r.ok).toBe(true);
    expect(r.value.airflow_observation).toBeUndefined();
  });

  it("each named observation is preserved exactly", () => {
    for (const v of ["gentle_indirect", "stagnant", "strong_direct", "fluctuating"] as const) {
      const r = validateCureCheckDetails({ airflow_observation: v });
      expect(r.value.airflow_observation).toBe(v);
    }
  });
});

describe("Timeline Grove Bag cure card with airflow", () => {
  it("renders airflow label and recorded copy for gentle_indirect", () => {
    const vm = buildCureCheckCardViewModel({
      details: { container_label: "Jar A", airflow_observation: "gentle_indirect" },
    });
    expect(vm.airflow?.timelineLabel).toBe("Airflow: Gentle indirect airflow");
    expect(vm.airflow?.status).toBe("recorded");
    expect(vm.airflow?.copy).toMatch(/gentle indirect/i);
  });

  it("renders caution copy when strong_direct", () => {
    const vm = buildCureCheckCardViewModel({
      details: { airflow_observation: "strong_direct" },
    });
    expect(vm.airflow?.status).toBe("caution");
    expect(vm.airflow?.copy).toMatch(/grower review required/i);
  });

  it("renders needs_review for stagnant and fluctuating", () => {
    for (const v of ["stagnant", "fluctuating"] as const) {
      const vm = buildCureCheckCardViewModel({ details: { airflow_observation: v } });
      expect(vm.airflow?.status).toBe("needs_review");
    }
  });

  it("omitted airflow does not attach an airflow view-model", () => {
    const vm = buildCureCheckCardViewModel({ details: { container_label: "Jar A" } });
    expect(vm.airflow).toBeUndefined();
  });

  it("airflow does not affect mold caution state and creates no alerts/actions", () => {
    const vm = buildCureCheckCardViewModel({
      details: { airflow_observation: "strong_direct" },
    });
    // Mold caution is independent.
    expect(vm.cautionState).toBe("none");
    // Pure VM has no alert/action surface.
    expect((vm as Record<string, unknown>).alert).toBeUndefined();
    expect((vm as Record<string, unknown>).actionQueueItem).toBeUndefined();
  });
});
