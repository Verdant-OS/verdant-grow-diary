import { describe, expect, it } from "vitest";
import { presentTimelineDiaryEntryDetails } from "@/lib/timelineDiaryEntryDetailPresentationRules";

describe("timeline detail presentation follow-up", () => {
  it("keeps an array of plain training actions as a readable extra chip", () => {
    const result = presentTimelineDiaryEntryDetails({ training_actions: ["topping"] }, "celsius");
    expect(result.extra).toEqual([["training_actions", "topping"]]);
  });

  it("converts stored Celsius water temperature when the grower prefers Fahrenheit", () => {
    const details = { watering: { water_temp_c: 20 } };
    const fahrenheit = presentTimelineDiaryEntryDetails(details, "fahrenheit");
    const celsius = presentTimelineDiaryEntryDetails(details, "celsius");
    const fahrenheitLine = fahrenheit.detailLines.find(
      (line) => line.key === "watering.water_temp_c",
    );
    const celsiusLine = celsius.detailLines.find((line) => line.key === "watering.water_temp_c");
    expect(fahrenheitLine?.value).toBe("68 °F");
    expect(celsiusLine?.value).toBe("20 °C");
  });

  it("includes the nutrient amount and unit on the product line", () => {
    const result = presentTimelineDiaryEntryDetails(
      {
        feeding: {
          products: [{ name: "FloraGro", brand: "General Hydroponics", amount: 5, unit: "ml" }],
        },
      },
      "celsius",
    );
    expect(result.detailLines.map((line) => line.value).join(" | ")).toContain(
      "FloraGro (General Hydroponics) 5 ml",
    );
  });

  it("labels watering and feeding volumes separately", () => {
    const result = presentTimelineDiaryEntryDetails(
      {
        watering: { volume_ml: 500 },
        feeding: { volume_ml: 1000 },
      },
      "celsius",
    );
    const labels = result.detailLines.map((line) => `${line.label}: ${line.value}`);
    expect(labels).toContain("Water Volume: 500 ml");
    expect(labels).toContain("Feed Volume: 1000 ml");
  });

  it("stays empty and stable when watering and feeding data is absent or invalid", () => {
    const details = {
      watering: null,
      feeding: {
        products: [null, { amount: Number.NaN, unit: "ml" }, { name: " " }],
        volume_ml: Number.POSITIVE_INFINITY,
        water_temp_c: Number.NaN,
      },
      training_actions: ["topping", { hidden: true }],
    };
    const once = presentTimelineDiaryEntryDetails(details, "fahrenheit");
    const twice = presentTimelineDiaryEntryDetails(details, "fahrenheit");
    expect(once).toEqual(twice);
    expect(once.detailLines).toEqual([]);
    expect(JSON.stringify(once)).not.toContain("[object Object]");
    expect(once.extra).toEqual([]);
  });
});
