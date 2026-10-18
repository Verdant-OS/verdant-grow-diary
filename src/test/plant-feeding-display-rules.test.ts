import { describe, expect, it } from "vitest";

import {
  enrichPlantFeedingDiaryRow,
  enrichPlantFeedingDiaryRows,
  isQuickLogPlaceholderNote,
  resolveFeedingNutrientLineName,
} from "@/lib/plantFeedingDisplayRules";

describe("plantFeedingDisplayRules", () => {
  describe("isQuickLogPlaceholderNote", () => {
    it("matches the database placeholder case-insensitively", () => {
      expect(isQuickLogPlaceholderNote("(quick log)")).toBe(true);
      expect(isQuickLogPlaceholderNote("  (Quick Log)  ")).toBe(true);
      expect(isQuickLogPlaceholderNote("Half strength")).toBe(false);
    });
  });

  describe("resolveFeedingNutrientLineName", () => {
    it("reads nested feeding.line_id and JSON-string details", () => {
      expect(
        resolveFeedingNutrientLineName({
          feeding: { line_id: "Flora Series" },
        }),
      ).toBe("Flora Series");

      expect(resolveFeedingNutrientLineName(JSON.stringify({ nutrient_brand: "Athena Pro" }))).toBe(
        "Athena Pro",
      );
    });

    it("falls back to root_zone_v1.nutrientLine and rejects unsafe placeholders", () => {
      expect(
        resolveFeedingNutrientLineName({
          root_zone_v1: { nutrientLine: "Cronk Bonnie & Clyde" },
        }),
      ).toBe("Cronk Bonnie & Clyde");

      expect(resolveFeedingNutrientLineName({ feeding: { line_id: "default" } })).toBe(null);
      expect(resolveFeedingNutrientLineName({ feeding: { line_id: "service_role=leak" } })).toBe(
        null,
      );
      expect(
        resolveFeedingNutrientLineName({
          feeding: { line_id: "x".repeat(121) },
        }),
      ).toBe(null);
    });
  });

  describe("enrichPlantFeedingDiaryRow", () => {
    const baseFeedingRow = {
      id: "feed-1",
      entry_type: "feeding",
      note: "(quick log)",
      details: {
        event_type: "feeding",
        feeding: {
          line_id: "Flora Series",
          volume_ml: 1000,
          ph: 6.1,
          ec_in: 1.5,
          runoff_ml: 120,
          products: [{ name: "Micro", amount: 2, unit: "ml/L" }],
        },
      },
    };

    it("replaces the placeholder note and lifts nested feeding metrics for normalizers", () => {
      const enriched = enrichPlantFeedingDiaryRow(baseFeedingRow) as typeof baseFeedingRow & {
        details: Record<string, unknown>;
      };
      expect(enriched.note).toBe("Flora Series");
      expect(enriched.details.watering_amount_ml).toBe(1000);
      expect(enriched.details.ph).toBe(6.1);
      expect(enriched.details.ec).toBe(1.5);
      expect(enriched.details.runoff_ml).toBe(120);
      expect(enriched.details.nutrients).toEqual([{ name: "Micro", amount: 2, unit: "ml/L" }]);
      expect(enriched.details.recipe).toBe("Flora Series");
    });

    it("prepends the line name when a custom grower note is present", () => {
      const enriched = enrichPlantFeedingDiaryRow({
        ...baseFeedingRow,
        note: "Half strength today",
      });
      expect(enriched.note).toBe("Flora Series · Half strength today");
    });

    it("keeps the line when a custom note merely contains the line text as a substring", () => {
      // Codex P2 at 1a1985f3: line "Grow" must not be hidden by "Strong growth today".
      const enriched = enrichPlantFeedingDiaryRow({
        ...baseFeedingRow,
        note: "Strong growth today",
        details: { ...baseFeedingRow.details, feeding: { line_id: "Grow" } },
      });
      expect(enriched.note).toBe("Grow · Strong growth today");
    });

    it("does not prepend the line again when the note already is or starts with it", () => {
      expect(enrichPlantFeedingDiaryRow({ ...baseFeedingRow, note: "flora series" }).note).toBe(
        "flora series",
      );
      const once = enrichPlantFeedingDiaryRow({ ...baseFeedingRow, note: "Half strength" });
      expect(enrichPlantFeedingDiaryRow(once).note).toBe("Flora Series · Half strength");
    });

    it("returns non-feeding rows by reference", () => {
      const noteRow = {
        id: "n1",
        entry_type: "note",
        note: "Checked the canopy",
        details: { event_type: "note" },
      };
      expect(enrichPlantFeedingDiaryRow(noteRow)).toBe(noteRow);
    });
  });

  describe("enrichPlantFeedingDiaryRows", () => {
    it("returns an empty array for nullish or empty input", () => {
      expect(enrichPlantFeedingDiaryRows(null)).toEqual([]);
      expect(enrichPlantFeedingDiaryRows(undefined)).toEqual([]);
      expect(enrichPlantFeedingDiaryRows([])).toEqual([]);
    });
  });
});
