/**
 * Repairs for the four reviewer findings left open when #2101 merged
 * (Timeline watering/feeding detail lines), plus the boundary cases the
 * Testing Standard asks for and the Quick Log feed/water type resolution
 * that the same production bug (2026-10-14, Timeline "feed label") needs.
 *  1. Legacy scalar arrays (training_actions, symptoms) stay readable; nested
 *     objects stay suppressed.
 *  2. water_temp_c honours the grower's temperature unit.
 *  3. Feeding products keep their validated dose (amount + unit).
 *  4. A combined entry labels Watering and Feeding volumes distinctly; a
 *     single envelope keeps the plain label.
 */
import { describe, expect, it } from "vitest";
import { presentTimelineDiaryEntryDetails } from "@/lib/timelineDiaryEntryDetailPresentationRules";
import { resolveEffectiveQuickLogCareType } from "@/lib/environmentCheckTimelineViewModel";
import { getEventType } from "@/lib/diary";

const rendered = (details: unknown, unit: "celsius" | "fahrenheit" = "celsius") =>
  presentTimelineDiaryEntryDetails(details, unit).detailLines.map(
    (line) => `${line.label}: ${line.value}`,
  );

describe("legacy array detail chips", () => {
  it("keeps readable scalar arrays and suppresses nested objects", () => {
    const { extra } = presentTimelineDiaryEntryDetails(
      {
        event_type: "training",
        training_actions: ["topping", "lst"],
        symptoms: ["yellowing"],
        nested: { a: 1 },
        mixed: ["ok", { bad: true }, 3],
        empty: [],
      },
      "celsius",
    );
    expect(extra).toContainEqual(["training_actions", "topping, lst"]);
    expect(extra).toContainEqual(["symptoms", "yellowing"]);
    expect(extra).toContainEqual(["mixed", "ok, 3"]);
    expect(extra.map(([k]) => k)).not.toContain("nested");
    expect(extra.map(([k]) => k)).not.toContain("empty");
    expect(JSON.stringify(extra)).not.toContain("[object Object]");
  });
});

describe("typed watering and feeding lines", () => {
  it("shows water temperature in the selected unit", () => {
    expect(rendered({ watering: { water_temp_c: 20 } }, "fahrenheit")).toContain(
      "Water temperature: 68 °F",
    );
    expect(rendered({ watering: { water_temp_c: 20 } }, "celsius")).toContain(
      "Water temperature: 20 °C",
    );
    expect(rendered({ watering: { water_temp_c: 21.5 } }, "fahrenheit")).toContain(
      "Water temperature: 70.7 °F",
    );
  });

  it("keeps the product dose, with the stored mL/L token shown as mL/L", () => {
    expect(
      rendered({
        feeding: {
          products: [
            { name: "FloraGro", brand: "General Hydroponics", amount: 5, unit: "ml" },
            { name: "CalMag", amount: 2.5, unit: "ml_per_l" },
            { name: "Silica", amount: Number.NaN, unit: "ml" },
          ],
        },
      }),
    ).toContain("Products: FloraGro (General Hydroponics) 5 ml, CalMag 2.5 mL/L, Silica");
  });

  it("labels volumes by activity only when both envelopes carry one", () => {
    const both = rendered({
      watering: { volume_ml: 500, ph: 6.2 },
      feeding: { volume_ml: 1000, products: [{ name: "FloraGro", amount: 5, unit: "ml" }] },
    });
    expect(both).toContain("Watering volume: 500 ml");
    expect(both).toContain("Feeding volume: 1000 ml");
    expect(both).not.toContain("Volume: 500 ml");
    expect(both).toContain("pH: 6.2");
    expect(rendered({ watering: { volume_ml: 500 } })).toContain("Volume: 500 ml");
  });

  it("boundaries: absent envelopes, invalid products and non-finite numbers add nothing", () => {
    expect(rendered({ event_type: "watering" })).toEqual([]);
    expect(rendered({ watering: null, feeding: undefined })).toEqual([]);
    expect(rendered({ feeding: { products: [null, 42, {}, { name: "   " }] } })).toEqual([]);
    expect(rendered({ watering: { volume_ml: Number.NaN, ph: Number.POSITIVE_INFINITY } })).toEqual(
      [],
    );
  });

  it("is deterministic across repeated calls with the same input", () => {
    const input = { watering: { volume_ml: 500 }, feeding: { volume_ml: 1000 } };
    expect(presentTimelineDiaryEntryDetails(input, "fahrenheit")).toEqual(
      presentTimelineDiaryEntryDetails(input, "fahrenheit"),
    );
  });
});

describe("Quick Log feed and water rows resolve to their care type", () => {
  it("resolves a feed row to Feeding and a water row to Watering", () => {
    const feed = { event_type: "note", feeding: { volume_ml: 1000, products: [] } };
    const water = { event_type: "note", watering: { volume_ml: 500 } };
    expect(resolveEffectiveQuickLogCareType({ details: feed })).toBe("feeding");
    expect(getEventType(resolveEffectiveQuickLogCareType({ details: feed })).value).toBe("feeding");
    expect(resolveEffectiveQuickLogCareType({ details: water })).toBe("watering");
  });

  it("keeps a plain note on its current type", () => {
    expect(resolveEffectiveQuickLogCareType({ details: { event_type: "note" } })).toBe("note");
    expect(
      resolveEffectiveQuickLogCareType({
        details: { event_type: "observation", watering: null, feeding: null },
      }),
    ).toBe("observation");
    expect(resolveEffectiveQuickLogCareType({ details: { event_type: "note", feeding: {} } })).toBe(
      "note",
    );
  });
});
