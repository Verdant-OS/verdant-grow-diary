/**
 * Quick Log target panel — combination regression coverage.
 *
 * Locks in that Grow / Tent / Plant / Strain always render as four
 * DISTINCT fields for every real target combination the grower can
 * assemble in Quick Log, and that no field ever collapses into a
 * combined ambiguous string (e.g. "Plant · Strain", "Tent · Plant",
 * strain text bleeding into the plant field).
 *
 * These are additive tests. They do not modify the view-model.
 */
import { describe, it, expect } from "vitest";
import {
  buildQuickLogTargetPanel,
  QUICK_LOG_TARGET_NO_TENT_LABEL,
  QUICK_LOG_TARGET_NO_STRAIN_LABEL,
  QUICK_LOG_TARGET_WHOLE_TENT_LABEL,
  QUICK_LOG_TARGET_NOT_SPECIFIC_LABEL,
} from "@/lib/quickLogTargetPanelViewModel";
import type { ResolvedQuickLogV2Target } from "@/lib/quickLogV2Rules";

const grows = [
  { id: "g1", name: "Summer Run 2026" },
  { id: "g2", name: "Winter 2027" },
];
const tents = [
  { id: "t1", name: "Tent A", grow_id: "g1" },
  { id: "t2", name: "Tent B", grow_id: "g2" },
];
const plants = [
  // full context
  { id: "p1", name: "Auto #1", strain: "Bruce Banner", tent_id: "t1", grow_id: "g1" },
  // no tent
  { id: "p2", name: "Photo #2", strain: "Zkittlez", tent_id: null, grow_id: "g1" },
  // strain missing
  { id: "p3", name: "Mystery #3", strain: null, tent_id: "t1", grow_id: "g1" },
  // plant name resembles a grow label
  { id: "p4", name: "Summer Run", strain: "GG4", tent_id: "t1", grow_id: "g1" },
  // strain text could be mistaken for a plant name
  { id: "p5", name: "Auto #5", strain: "Blue Dream Auto #5", tent_id: "t1", grow_id: "g1" },
];

function plantT(id: string, tentId: string | null, growId: string | null): ResolvedQuickLogV2Target {
  return { ok: true, targetType: "plant", targetId: id, plantId: id, tentId, growId };
}
function tentT(id: string, growId: string | null): ResolvedQuickLogV2Target {
  return { ok: true, targetType: "tent", targetId: id, plantId: null, tentId: id, growId };
}

function values(panel: ReturnType<typeof buildQuickLogTargetPanel>) {
  return Object.fromEntries(panel.fields.map((f) => [f.label, f.value]));
}

describe("QuickLog target panel — combination regression", () => {
  it("Grow + Tent + Plant + Strain — all four distinct labels present", () => {
    const p = buildQuickLogTargetPanel({ resolved: plantT("p1", "t1", "g1"), plants, tents, grows });
    expect(p.fields.map((f) => f.label)).toEqual(["Grow", "Tent", "Plant", "Strain"]);
    expect(values(p)).toEqual({
      Grow: "Summer Run 2026",
      Tent: "Tent A",
      Plant: "Auto #1",
      Strain: "Bruce Banner",
    });
  });

  it("Grow + Plant + Strain, no tent — warning row, other fields intact", () => {
    const p = buildQuickLogTargetPanel({ resolved: plantT("p2", null, "g1"), plants, tents, grows });
    const map = values(p);
    expect(map.Tent).toBe(QUICK_LOG_TARGET_NO_TENT_LABEL);
    expect(map.Grow).toBe("Summer Run 2026");
    expect(map.Plant).toBe("Photo #2");
    expect(map.Strain).toBe("Zkittlez");
    const tent = p.fields.find((f) => f.label === "Tent")!;
    expect(tent.emphasis).toBe("warning");
    expect(tent.present).toBe(false);
  });

  it("Grow + Tent scope, no plant selected — Plant = 'Whole tent', Strain = '—'", () => {
    const p = buildQuickLogTargetPanel({ resolved: tentT("t1", "g1"), plants, tents, grows });
    const map = values(p);
    expect(map.Plant).toBe(QUICK_LOG_TARGET_WHOLE_TENT_LABEL);
    expect(map.Strain).toBe(QUICK_LOG_TARGET_NOT_SPECIFIC_LABEL);
    expect(map.Tent).toBe("Tent A");
    expect(map.Grow).toBe("Summer Run 2026");
  });

  it("Plant whose name resembles a grow label — plant renders in Plant, grow in Grow", () => {
    const p = buildQuickLogTargetPanel({ resolved: plantT("p4", "t1", "g1"), plants, tents, grows });
    const map = values(p);
    expect(map.Plant).toBe("Summer Run");
    expect(map.Grow).toBe("Summer Run 2026");
    // Never merged into one composite label
    expect(map.Plant).not.toContain("·");
    expect(map.Grow).not.toContain("·");
    expect(map.Plant).not.toBe(map.Grow);
  });

  it("Strain text that resembles a plant name — strain stays in Strain, plant stays in Plant", () => {
    const p = buildQuickLogTargetPanel({ resolved: plantT("p5", "t1", "g1"), plants, tents, grows });
    const map = values(p);
    expect(map.Plant).toBe("Auto #5");
    expect(map.Strain).toBe("Blue Dream Auto #5");
    // The plant field must be exactly the plant name — no strain suffix.
    expect(map.Plant).not.toContain("Blue Dream");
  });

  it("Missing strain renders neutral 'No strain recorded' — not the plant name, not empty", () => {
    const p = buildQuickLogTargetPanel({ resolved: plantT("p3", "t1", "g1"), plants, tents, grows });
    const map = values(p);
    expect(map.Strain).toBe(QUICK_LOG_TARGET_NO_STRAIN_LABEL);
    const strain = p.fields.find((f) => f.label === "Strain")!;
    expect(strain.present).toBe(false);
    expect(strain.value).not.toBe(map.Plant);
    expect(String(strain.value).trim().length).toBeGreaterThan(0);
  });

  it("Every combination produces exactly four fields in Grow / Tent / Plant / Strain order", () => {
    const cases: ResolvedQuickLogV2Target[] = [
      plantT("p1", "t1", "g1"),
      plantT("p2", null, "g1"),
      plantT("p3", "t1", "g1"),
      plantT("p4", "t1", "g1"),
      plantT("p5", "t1", "g1"),
      tentT("t1", "g1"),
      tentT("t2", "g2"),
    ];
    for (const resolved of cases) {
      const p = buildQuickLogTargetPanel({ resolved, plants, tents, grows });
      expect(p.fields.map((f) => f.label)).toEqual(["Grow", "Tent", "Plant", "Strain"]);
      // No field value ever contains an interpunct combined-label separator.
      for (const f of p.fields) {
        expect(String(f.value)).not.toMatch(/·/);
      }
    }
  });

  it("Save target IDs are unaffected by panel rendering (view-model is read-only)", () => {
    const resolved = plantT("p1", "t1", "g1");
    const before = { ...resolved };
    buildQuickLogTargetPanel({ resolved, plants, tents, grows });
    expect(resolved).toEqual(before);
  });
});
