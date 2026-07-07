/**
 * Tests for buildQuickLogTargetPanel — the pure view-model behind the
 * Quick Log target summary panel.
 */
import { describe, it, expect } from "vitest";
import {
  buildQuickLogTargetPanel,
  QUICK_LOG_TARGET_NO_TENT_LABEL,
  QUICK_LOG_TARGET_NO_STRAIN_LABEL,
  QUICK_LOG_TARGET_NO_GROW_LABEL,
  QUICK_LOG_TARGET_WHOLE_TENT_LABEL,
  QUICK_LOG_TARGET_NOT_SPECIFIC_LABEL,
} from "@/lib/quickLogTargetPanelViewModel";
import type { ResolvedQuickLogV2Target } from "@/lib/quickLogV2Rules";

const grows = [
  { id: "g1", name: "Summer Run 2026" },
  { id: "g2", name: "  " }, // whitespace-only — should be treated as missing
];
const tents = [
  { id: "t1", name: "Tent A", grow_id: "g1" },
  { id: "t2", name: "", grow_id: "g1" },
];
const plants = [
  { id: "p1", name: "Auto #1", strain: "Bruce Banner", tent_id: "t1", grow_id: "g1" },
  { id: "p2", name: "Photo #2", strain: null, tent_id: null, grow_id: "g1" },
  { id: "p3", name: "Summer Run 2026", strain: "Zkittlez", tent_id: "t1", grow_id: "g1" }, // name equals grow name
];

function plantTarget(plantId: string, tentId: string | null, growId: string | null): ResolvedQuickLogV2Target {
  return { ok: true, targetType: "plant", targetId: plantId, plantId, tentId, growId };
}
function tentTarget(tentId: string, growId: string | null): ResolvedQuickLogV2Target {
  return { ok: true, targetType: "tent", targetId: tentId, plantId: null, tentId, growId };
}

describe("buildQuickLogTargetPanel — resolution + visibility", () => {
  it("returns a hidden panel when no target is resolved", () => {
    const panel = buildQuickLogTargetPanel({
      resolved: { ok: false, reason: "no_selection" },
      plants,
      tents,
      grows,
    });
    expect(panel.visible).toBe(false);
    expect(panel.fields).toEqual([]);
  });

  it("hides when resolved is null/undefined", () => {
    expect(buildQuickLogTargetPanel({ resolved: null, plants, tents, grows }).visible).toBe(false);
    expect(buildQuickLogTargetPanel({ resolved: undefined, plants, tents, grows }).visible).toBe(false);
  });
});

describe("buildQuickLogTargetPanel — plant scope", () => {
  it("renders Grow / Tent / Plant / Strain as four distinct fields", () => {
    const panel = buildQuickLogTargetPanel({
      resolved: plantTarget("p1", "t1", "g1"),
      plants,
      tents,
      grows,
    });
    expect(panel.visible).toBe(true);
    expect(panel.scope).toBe("plant");
    expect(panel.fields.map((f) => f.label)).toEqual(["Grow", "Tent", "Plant", "Strain"]);
    expect(panel.fields.map((f) => f.value)).toEqual([
      "Summer Run 2026",
      "Tent A",
      "Auto #1",
      "Bruce Banner",
    ]);
    for (const f of panel.fields) expect(f.present).toBe(true);
  });

  it("shows explicit 'No tent assigned' warning when plant has no tent", () => {
    const panel = buildQuickLogTargetPanel({
      resolved: plantTarget("p2", null, "g1"),
      plants,
      tents,
      grows,
    });
    const tent = panel.fields.find((f) => f.label === "Tent")!;
    expect(tent.value).toBe(QUICK_LOG_TARGET_NO_TENT_LABEL);
    expect(tent.present).toBe(false);
    expect(tent.emphasis).toBe("warning");
  });

  it("shows 'No strain recorded' as muted when strain is missing or blank", () => {
    const panel = buildQuickLogTargetPanel({
      resolved: plantTarget("p2", null, "g1"),
      plants,
      tents,
      grows,
    });
    const strain = panel.fields.find((f) => f.label === "Strain")!;
    expect(strain.value).toBe(QUICK_LOG_TARGET_NO_STRAIN_LABEL);
    expect(strain.present).toBe(false);
    expect(strain.emphasis).toBe("muted");
  });

  it("never leaks strain into the plant field", () => {
    const panel = buildQuickLogTargetPanel({
      resolved: plantTarget("p1", "t1", "g1"),
      plants,
      tents,
      grows,
    });
    const plant = panel.fields.find((f) => f.label === "Plant")!;
    expect(plant.value).toBe("Auto #1");
    expect(plant.value).not.toContain("Bruce Banner");
  });

  it("never leaks grow name into the plant field even when plant name equals grow name", () => {
    const panel = buildQuickLogTargetPanel({
      resolved: plantTarget("p3", "t1", "g1"),
      plants,
      tents,
      grows,
    });
    const plant = panel.fields.find((f) => f.label === "Plant")!;
    const grow = panel.fields.find((f) => f.label === "Grow")!;
    // The plant is literally named "Summer Run 2026" — it must render
    // in the plant row because it IS the plant name, but the grow
    // row must render it independently in the grow row (no merging).
    expect(plant.value).toBe("Summer Run 2026");
    expect(grow.value).toBe("Summer Run 2026");
    expect(plant.label).toBe("Plant");
    expect(grow.label).toBe("Grow");
  });

  it("falls back to 'No grow linked' when grow is missing / blank", () => {
    const panel = buildQuickLogTargetPanel({
      resolved: plantTarget("p1", "t1", "g2"),
      plants,
      tents,
      grows,
    });
    const grow = panel.fields.find((f) => f.label === "Grow")!;
    expect(grow.value).toBe(QUICK_LOG_TARGET_NO_GROW_LABEL);
    expect(grow.present).toBe(false);
  });
});

describe("buildQuickLogTargetPanel — tent scope", () => {
  it("renders four fields with Plant = 'Whole tent' and Strain = '—'", () => {
    const panel = buildQuickLogTargetPanel({
      resolved: tentTarget("t1", "g1"),
      plants,
      tents,
      grows,
    });
    expect(panel.scope).toBe("tent");
    const map = Object.fromEntries(panel.fields.map((f) => [f.label, f]));
    expect(map.Grow.value).toBe("Summer Run 2026");
    expect(map.Tent.value).toBe("Tent A");
    expect(map.Plant.value).toBe(QUICK_LOG_TARGET_WHOLE_TENT_LABEL);
    expect(map.Plant.present).toBe(false);
    expect(map.Strain.value).toBe(QUICK_LOG_TARGET_NOT_SPECIFIC_LABEL);
    expect(map.Strain.present).toBe(false);
  });
});

describe("buildQuickLogTargetPanel — determinism", () => {
  it("returns identical output for identical input", () => {
    const a = buildQuickLogTargetPanel({
      resolved: plantTarget("p1", "t1", "g1"),
      plants,
      tents,
      grows,
    });
    const b = buildQuickLogTargetPanel({
      resolved: plantTarget("p1", "t1", "g1"),
      plants,
      tents,
      grows,
    });
    expect(a).toEqual(b);
  });
});
