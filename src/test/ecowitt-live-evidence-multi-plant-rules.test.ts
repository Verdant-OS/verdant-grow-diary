/**
 * EcoWitt Live Evidence multi-plant rules tests — pure deterministic.
 */
import { describe, it, expect } from "vitest";
import {
  parsePlantIdEntries,
  evaluateLiveEvidenceForPlants,
} from "@/lib/ecowittLiveEvidenceMultiPlantRules";
import { getEcowittLiveEvidenceTemplate } from "@/lib/ecowittLiveEvidenceTemplates";
import { createInitialEcowittLiveEvidenceFormState } from "@/lib/ecowittLiveEvidenceFormRules";

describe("parsePlantIdEntries", () => {
  it("parses comma-separated entries", () => {
    expect(parsePlantIdEntries("a, b, c")).toEqual(["a", "b", "c"]);
  });
  it("parses newline-separated entries", () => {
    expect(parsePlantIdEntries("a\nb\nc")).toEqual(["a", "b", "c"]);
  });
  it("dedupes while preserving order", () => {
    expect(parsePlantIdEntries("a, b, a, c, b")).toEqual(["a", "b", "c"]);
  });
  it("returns empty array for blank input", () => {
    expect(parsePlantIdEntries("")).toEqual([]);
    expect(parsePlantIdEntries("   ")).toEqual([]);
  });
  it("trims whitespace and filters empty tokens", () => {
    expect(parsePlantIdEntries("  a , ,b ,  ")).toEqual(["a", "b"]);
  });
});

describe("evaluateLiveEvidenceForPlants", () => {
  it("empty plant field produces a single tent-level result", () => {
    const formState = getEcowittLiveEvidenceTemplate(
      "live_verified_example",
    )!.build();
    const out = evaluateLiveEvidenceForPlants({
      formState,
      plantIdsInput: "",
    });
    expect(out.per_plant).toHaveLength(1);
    expect(out.per_plant[0].plant_id).toBeNull();
    expect(out.overall_verdict).toBe("verified_live");
  });

  it("multiple plant IDs produce one verdict per plant", () => {
    const formState = getEcowittLiveEvidenceTemplate(
      "live_verified_example",
    )!.build();
    const out = evaluateLiveEvidenceForPlants({
      formState,
      plantIdsInput: "plant-a, plant-b, plant-c",
    });
    expect(out.per_plant).toHaveLength(3);
    expect(out.per_plant.map((p) => p.plant_id)).toEqual([
      "plant-a",
      "plant-b",
      "plant-c",
    ]);
    expect(out.overall_verdict).toBe("verified_live");
  });

  it("overall uses most conservative verdict (mismatch dominates)", () => {
    const base = getEcowittLiveEvidenceTemplate(
      "live_verified_example",
    )!.build();
    // Introduce a mismatch by changing controller value
    const formState = {
      ...base,
      metric_rows: base.metric_rows.map((r) =>
        r.key === "temp_f"
          ? { ...r, controller_value: "100" }
          : r,
      ),
    };
    const out = evaluateLiveEvidenceForPlants({
      formState,
      plantIdsInput: "p1, p2",
    });
    expect(out.overall_verdict).toBe("mismatch");
    expect(out.overall_is_live_proof).toBe(false);
  });

  it("stale template yields stale overall", () => {
    const formState = getEcowittLiveEvidenceTemplate(
      "stale_evidence_example",
    )!.build();
    const out = evaluateLiveEvidenceForPlants({
      formState,
      plantIdsInput: "p1, p2",
    });
    expect(out.overall_verdict).toBe("stale");
  });

  it("includes a note that per-plant verdicts are not plant-specific sensor proof", () => {
    const formState = getEcowittLiveEvidenceTemplate(
      "live_verified_example",
    )!.build();
    const out = evaluateLiveEvidenceForPlants({
      formState,
      plantIdsInput: "p1, p2",
    });
    expect(out.note.toLowerCase()).toMatch(/not be treated as plant-specific/);
  });

  it("combined_next_steps dedupes and includes unit warnings when present", () => {
    const formState = {
      ...createInitialEcowittLiveEvidenceFormState(),
      source: "live",
      captured_at: "2026-06-09T12:00:00Z",
      now: "2026-06-09T12:01:00Z",
      tent_id: "t",
      raw_payload_present: true,
      normalized_payload_present: true,
      operator_compared_controller: true,
      metric_rows: createInitialEcowittLiveEvidenceFormState().metric_rows.map(
        (r) =>
          r.key === "temp_f"
            ? {
                ...r,
                enabled: true,
                backend_value: "72",
                controller_value: "22",
                backend_unit: "F",
                controller_unit: "C",
              }
            : r,
      ),
    };
    const out = evaluateLiveEvidenceForPlants({
      formState,
      plantIdsInput: "",
    });
    expect(out.unit_warnings.length).toBeGreaterThan(0);
    expect(
      out.combined_next_steps.some((s) => /Unit mismatch/i.test(s)),
    ).toBe(true);
  });
});
