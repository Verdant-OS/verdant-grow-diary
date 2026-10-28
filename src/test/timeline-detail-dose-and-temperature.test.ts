/**
 * Timeline diary details — dose identity and temperature rounding.
 *
 * Product rows may arrive as one object and may name the brand as
 * nutrient_brand. A dose is shown only with a unit. Water temperature
 * follows the grower's unit and stays at one decimal.
 */
import { describe, expect, it } from "vitest";
import { presentTimelineDiaryEntryDetails } from "@/lib/timelineDiaryEntryDetailPresentationRules";

describe("timeline detail dose and temperature edges", () => {
  it("reads nutrient_brand and keeps a dose only when the unit is present", () => {
    const branded = presentTimelineDiaryEntryDetails(
      {
        feeding: {
          products: {
            name: "CalMag",
            nutrient_brand: "Botanicare",
            amount: 2,
            unit: "ml",
          },
        },
      },
      "celsius",
    );
    const unitless = presentTimelineDiaryEntryDetails(
      { feeding: { nutrients: [{ name: "FloraGro", amount: 5 }] } },
      "celsius",
    );
    const zero = presentTimelineDiaryEntryDetails(
      { feeding: { products: [{ nutrient_brand: "Canna", amount: 0, unit: "ml" }] } },
      "celsius",
    );

    expect(branded.detailLines.map((line) => line.value)).toEqual(["CalMag (Botanicare) 2 ml"]);
    expect(unitless.detailLines.map((line) => line.value)).toEqual(["FloraGro"]);
    expect(zero.detailLines.map((line) => line.value)).toEqual(["Canna 0 ml"]);
  });

  it("rounds water temperature to one decimal in the grower's unit", () => {
    const fahrenheit = presentTimelineDiaryEntryDetails(
      { watering: { water_temp_c: 21 } },
      "fahrenheit",
    );
    const celsius = presentTimelineDiaryEntryDetails(
      { watering: { water_temp_c: 20.06 } },
      "celsius",
    );

    expect(fahrenheit.detailLines.find((line) => line.key === "watering.water_temp_c")?.value).toBe(
      "69.8 °F",
    );
    expect(celsius.detailLines.find((line) => line.key === "watering.water_temp_c")?.value).toBe(
      "20.1 °C",
    );
  });

  it("hides a plain array that contains a blank or a non-finite number", () => {
    const blank = presentTimelineDiaryEntryDetails(
      { training_actions: ["topping", " "] },
      "celsius",
    );
    const broken = presentTimelineDiaryEntryDetails({ scores: [1, Number.NaN] }, "celsius");
    const plain = presentTimelineDiaryEntryDetails({ checks: [true, 2] }, "celsius");

    expect(blank.extra).toEqual([]);
    expect(broken.extra).toEqual([]);
    expect(plain.extra).toEqual([["checks", "true, 2"]]);
  });
});
