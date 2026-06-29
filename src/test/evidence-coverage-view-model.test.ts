import { describe, expect, it } from "vitest";
import {
  buildEvidenceCoverageViewModel,
  EMPTY_EVIDENCE_COVERAGE_VIEW_MODEL,
  EVIDENCE_COVERAGE_NOTES,
} from "@/lib/evidenceCoverageViewModel";

const validRef = {
  id: "ref-1",
  kind: "sensor_snapshot",
  source: "live",
  occurred_at: "2026-01-01T00:00:00Z",
};
const validRef2 = { ...validRef, id: "ref-2" };

describe("evidenceCoverageViewModel", () => {
  it("returns zero counts for empty/undefined inputs", () => {
    const vm = buildEvidenceCoverageViewModel({ alerts: [], actions: [] });
    expect(vm.alerts.total).toBe(0);
    expect(vm.actions.total).toBe(0);
    expect(vm.overall.total).toBe(0);
    expect(vm.alerts.linkedPct).toBe(0);
    expect(vm.notes).toEqual(EVIDENCE_COVERAGE_NOTES);
  });

  it("counts valid alert refs as linked", () => {
    const vm = buildEvidenceCoverageViewModel({
      alerts: [{ originating_timeline_events: [validRef] }],
      actions: [],
    });
    expect(vm.alerts).toEqual({
      total: 1,
      linked: 1,
      fallbackOnly: 0,
      invalidRefs: 0,
      linkedPct: 100,
    });
  });

  it("counts valid action refs as linked", () => {
    const vm = buildEvidenceCoverageViewModel({
      alerts: [],
      actions: [{ originating_timeline_events: [validRef] }],
    });
    expect(vm.actions.linked).toBe(1);
    expect(vm.actions.linkedPct).toBe(100);
  });

  it("treats empty/null/missing refs as fallback-only, not invalid", () => {
    const vm = buildEvidenceCoverageViewModel({
      alerts: [
        { originating_timeline_events: [] },
        { originating_timeline_events: null },
        {},
      ],
      actions: [],
    });
    expect(vm.alerts.fallbackOnly).toBe(3);
    expect(vm.alerts.linked).toBe(0);
    expect(vm.alerts.invalidRefs).toBe(0);
    expect(vm.alerts.linkedPct).toBe(0);
  });

  it("counts non-empty malformed refs as invalidRefs and fallbackOnly", () => {
    const vm = buildEvidenceCoverageViewModel({
      alerts: [
        { originating_timeline_events: [{ raw_payload: { x: 1 } }] },
        { originating_timeline_events: [{ id: "" }] },
        { originating_timeline_events: "not an array" },
      ],
      actions: [],
    });
    expect(vm.alerts.invalidRefs).toBe(3);
    expect(vm.alerts.fallbackOnly).toBe(3);
    expect(vm.alerts.linked).toBe(0);
  });

  it("counts linked when at least one valid ref survives a mixed array", () => {
    const vm = buildEvidenceCoverageViewModel({
      alerts: [
        {
          originating_timeline_events: [
            { id: "" },
            { raw_payload: { x: 1 } },
            validRef,
          ],
        },
      ],
      actions: [],
    });
    expect(vm.alerts.linked).toBe(1);
    expect(vm.alerts.invalidRefs).toBe(0);
  });

  it("linkedPct is deterministic and rounded", () => {
    const vm = buildEvidenceCoverageViewModel({
      alerts: [
        { originating_timeline_events: [validRef] },
        { originating_timeline_events: [validRef2] },
        { originating_timeline_events: [] },
      ],
      actions: [],
    });
    // 2/3 = 66.67% -> 67
    expect(vm.alerts.linkedPct).toBe(67);
    // re-run deterministic
    const vm2 = buildEvidenceCoverageViewModel({
      alerts: [
        { originating_timeline_events: [validRef] },
        { originating_timeline_events: [validRef2] },
        { originating_timeline_events: [] },
      ],
      actions: [],
    });
    expect(vm2.alerts.linkedPct).toBe(vm.alerts.linkedPct);
  });

  it("combines alerts + actions into overall", () => {
    const vm = buildEvidenceCoverageViewModel({
      alerts: [{ originating_timeline_events: [validRef] }],
      actions: [{ originating_timeline_events: [] }],
    });
    expect(vm.overall.total).toBe(2);
    expect(vm.overall.linked).toBe(1);
    expect(vm.overall.fallbackOnly).toBe(1);
    expect(vm.overall.linkedPct).toBe(50);
  });

  it("rejects rows carrying forbidden payload fields and counts them invalid", () => {
    const vm = buildEvidenceCoverageViewModel({
      alerts: [
        {
          originating_timeline_events: [
            { id: "x", kind: "sensor_snapshot", source: "live", raw_payload: {} },
          ],
        },
      ],
      actions: [],
    });
    expect(vm.alerts.linked).toBe(0);
    expect(vm.alerts.invalidRefs).toBe(1);
  });

  it("notes are factual and contain no inference/automation language", () => {
    const text = EVIDENCE_COVERAGE_NOTES.join(" ").toLowerCase();
    for (const banned of [
      "fake live",
      "healthy",
      "guaranteed",
      "definitely",
      "auto execute",
      "device command",
    ]) {
      expect(text).not.toContain(banned);
    }
  });

  it("empty constant has zero buckets", () => {
    expect(EMPTY_EVIDENCE_COVERAGE_VIEW_MODEL.overall.total).toBe(0);
  });
});
