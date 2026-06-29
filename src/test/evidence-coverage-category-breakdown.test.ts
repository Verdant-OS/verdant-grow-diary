import { describe, expect, it } from "vitest";
import {
  buildEvidenceCoverageViewModel,
  UNCATEGORIZED_LABEL,
} from "@/lib/evidenceCoverageViewModel";

const validRef = {
  id: "ref-1",
  kind: "sensor_snapshot",
  source: "live",
  occurred_at: "2026-01-01T00:00:00Z",
};

describe("evidenceCoverageViewModel — category breakdown", () => {
  it("groups alerts by metric and actions by action_type", () => {
    const vm = buildEvidenceCoverageViewModel({
      alerts: [
        { metric: "vpd", originating_timeline_events: [validRef] },
        { metric: "vpd", originating_timeline_events: [] },
        { metric: "temp", originating_timeline_events: [validRef] },
      ],
      actions: [
        { action_type: "adjust_vpd", originating_timeline_events: [validRef] },
        { action_type: "adjust_vpd", originating_timeline_events: [] },
        { action_type: "check_runoff", originating_timeline_events: [] },
      ],
    });
    const alertLabels = vm.alertsByCategory.map((r) => r.label).sort();
    expect(alertLabels).toEqual(["temp", "vpd"]);
    const actionLabels = vm.actionsByCategory.map((r) => r.label).sort();
    expect(actionLabels).toEqual(["adjust_vpd", "check_runoff"]);
    const vpd = vm.alertsByCategory.find((r) => r.label === "vpd")!;
    expect(vpd).toMatchObject({ total: 2, linked: 1, fallbackOnly: 1, invalidRefs: 0, linkedPct: 50 });
  });

  it("maps missing/empty/non-string category to Uncategorized", () => {
    const vm = buildEvidenceCoverageViewModel({
      alerts: [
        { originating_timeline_events: [] },
        { metric: "", originating_timeline_events: [] },
        { metric: 123 as unknown as string, originating_timeline_events: [] },
      ],
      actions: [],
    });
    expect(vm.alertsByCategory).toHaveLength(1);
    expect(vm.alertsByCategory[0].label).toBe(UNCATEGORIZED_LABEL);
    expect(vm.alertsByCategory[0].total).toBe(3);
    expect(vm.alertsByCategory[0].fallbackOnly).toBe(3);
  });

  it("counts linked when at least one valid ref survives a mixed array", () => {
    const vm = buildEvidenceCoverageViewModel({
      alerts: [
        {
          metric: "vpd",
          originating_timeline_events: [{ id: "" }, { raw_payload: {} }, validRef],
        },
      ],
      actions: [],
    });
    const row = vm.alertsByCategory[0];
    expect(row.linked).toBe(1);
    expect(row.invalidRefs).toBe(0);
  });

  it("counts non-empty malformed refs as invalid + fallbackOnly", () => {
    const vm = buildEvidenceCoverageViewModel({
      alerts: [
        { metric: "vpd", originating_timeline_events: [{ raw_payload: {} }] },
      ],
      actions: [],
    });
    expect(vm.alertsByCategory[0].invalidRefs).toBe(1);
    expect(vm.alertsByCategory[0].fallbackOnly).toBe(1);
    expect(vm.alertsByCategory[0].linked).toBe(0);
  });

  it("sorts deterministically: fallbackOnly desc, invalidRefs desc, total desc, label asc", () => {
    const vm = buildEvidenceCoverageViewModel({
      alerts: [
        // a: 2 fallback
        { metric: "a", originating_timeline_events: [] },
        { metric: "a", originating_timeline_events: [] },
        // b: 2 fallback, 1 invalid
        { metric: "b", originating_timeline_events: [] },
        { metric: "b", originating_timeline_events: [{ raw_payload: {} }] },
        // c: 1 linked, 0 fallback
        { metric: "c", originating_timeline_events: [validRef] },
        // d: 2 fallback (tie with a on fallback+invalid+total → label asc → a before d)
        { metric: "d", originating_timeline_events: [] },
        { metric: "d", originating_timeline_events: [] },
      ],
      actions: [],
    });
    expect(vm.alertsByCategory.map((r) => r.label)).toEqual(["b", "a", "d", "c"]);
  });

  it("linkedPct is deterministic and rounded", () => {
    const vm = buildEvidenceCoverageViewModel({
      alerts: [
        { metric: "vpd", originating_timeline_events: [validRef] },
        { metric: "vpd", originating_timeline_events: [validRef] },
        { metric: "vpd", originating_timeline_events: [] },
      ],
      actions: [],
    });
    // 2/3 = 67
    expect(vm.alertsByCategory[0].linkedPct).toBe(67);
  });

  it("sanitizes labels — never leaks UUID-shaped or payload-like strings", () => {
    const uuid = "11111111-2222-3333-4444-555555555555";
    const vm = buildEvidenceCoverageViewModel({
      alerts: [
        { metric: uuid, originating_timeline_events: [] },
        { metric: "raw_payload", originating_timeline_events: [] },
        { metric: "  vpd_low  ", originating_timeline_events: [validRef] },
      ],
      actions: [],
    });
    const labels = vm.alertsByCategory.map((r) => r.label);
    expect(labels.join("|")).not.toContain(uuid);
    expect(labels.join("|").toLowerCase()).not.toContain("raw_payload");
    expect(labels).toContain("vpd_low");
    // UUID + raw_payload both fall back to Uncategorized → collapse into one row.
    expect(labels.filter((l) => l === UNCATEGORIZED_LABEL)).toHaveLength(1);
  });

  it("returns empty breakdowns for empty inputs", () => {
    const vm = buildEvidenceCoverageViewModel({ alerts: [], actions: [] });
    expect(vm.alertsByCategory).toEqual([]);
    expect(vm.actionsByCategory).toEqual([]);
  });
});
