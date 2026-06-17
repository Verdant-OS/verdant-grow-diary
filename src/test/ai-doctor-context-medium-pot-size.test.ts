/**
 * Compiler + readiness derivation tests for medium / pot_size context.
 *
 * Pure unit tests. No I/O, no Supabase, no AI calls.
 */
import { describe, it, expect, vi } from "vitest";
import { compilePlantContextFromRows } from "@/lib/aiDoctorContextCompiler";
import { deriveAiDoctorContextEvidenceFlags } from "@/lib/aiDoctorReadinessViewModel";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      throw new Error("Supabase access not allowed in compiler test");
    },
  },
}));

const NOW = new Date("2026-06-10T12:00:00Z");

function ctx(overrides: Record<string, unknown> = {}) {
  return compilePlantContextFromRows({
    plant: {
      id: "p1",
      name: "Plant A",
      strain: "NL",
      stage: "veg",
      grow_id: "g1",
      tent_id: "t1",
      ...overrides,
    },
    growEvents: [],
    sensorReadings: [],
    now: NOW,
  });
}

describe("compilePlantContextFromRows — medium / pot_size", () => {
  it("includes medium when plant row has a non-blank value", () => {
    const c = ctx({ medium: "coco" });
    expect(c.medium).toBe("coco");
  });

  it("includes pot_size when plant row has a non-blank value", () => {
    const c = ctx({ pot_size: "11 L" });
    expect(c.pot_size).toBe("11 L");
  });

  it("trims surrounding whitespace", () => {
    const c = ctx({ medium: "  soil  ", pot_size: "  3 gal  " });
    expect(c.medium).toBe("soil");
    expect(c.pot_size).toBe("3 gal");
  });

  it("leaves medium null when missing", () => {
    expect(ctx({}).medium).toBeNull();
  });

  it("leaves medium null when empty / blank string", () => {
    expect(ctx({ medium: "" }).medium).toBeNull();
    expect(ctx({ medium: "   " }).medium).toBeNull();
  });

  it("leaves pot_size null when missing / malformed (non-string)", () => {
    expect(ctx({}).pot_size).toBeNull();
    expect(ctx({ pot_size: 11 as unknown as string }).pot_size).toBeNull();
    expect(ctx({ pot_size: null }).pot_size).toBeNull();
  });

  it("does NOT infer medium or pot_size from strain or stage", () => {
    const c = ctx({ strain: "Coco Loco", stage: "soil-veg" });
    expect(c.medium).toBeNull();
    expect(c.pot_size).toBeNull();
  });
});

describe("deriveAiDoctorContextEvidenceFlags — medium / pot_size", () => {
  it("marks medium as known when context has a valid medium", () => {
    const flags = deriveAiDoctorContextEvidenceFlags(ctx({ medium: "soil" }), 0);
    expect(flags.hasUnknownMedium).toBe(false);
  });

  it("marks pot size as known when context has a valid pot size", () => {
    const flags = deriveAiDoctorContextEvidenceFlags(ctx({ pot_size: "5 gal" }), 0);
    expect(flags.hasUnknownPotSize).toBe(false);
  });

  it("keeps unknown medium / pot size true when absent", () => {
    const flags = deriveAiDoctorContextEvidenceFlags(ctx({}), 0);
    expect(flags.hasUnknownMedium).toBe(true);
    expect(flags.hasUnknownPotSize).toBe(true);
  });

  it("keeps unknown true when context value is blank-only", () => {
    const flags = deriveAiDoctorContextEvidenceFlags(
      ctx({ medium: "  ", pot_size: "" }),
      0,
    );
    expect(flags.hasUnknownMedium).toBe(true);
    expect(flags.hasUnknownPotSize).toBe(true);
  });
});
