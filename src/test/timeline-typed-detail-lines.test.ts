import { describe, expect, it } from "vitest";
import { presentTimelineDiaryEntryDetails } from "@/lib/timelineDiaryEntryDetailPresentationRules";

const waterFeedCheck = {
  event_type: "watering",
  watering: {
    volume_ml: 500,
    ph: 6.2,
    runoff_ph: 6.4,
  },
  feeding: {
    line_id: "default",
    products: [{ name: "FloraGro", brand: "General Hydroponics", amount: 5, unit: "ml" }],
    volume_ml: 1000,
  },
  manual_provenance: {
    source: "manual",
    transport: "operator_entered",
    confidence: "unverified",
  },
};

describe("typed diary detail lines", () => {
  it("renders watering and feeding objects as readable lines", () => {
    const result = presentTimelineDiaryEntryDetails(waterFeedCheck, "celsius");
    const rendered = [...result.detailLines.map((line) => `${line.label}: ${line.value}`)];
    expect(rendered.join(" | ")).toContain("Volume: 500 ml");
    expect(rendered.join(" | ")).toContain("pH: 6.2");
    expect(rendered.join(" | ")).toContain("FloraGro");
    expect(rendered.join(" | ")).toContain("General Hydroponics");
    expect(rendered.join(" | ")).not.toContain("[object Object]");
    expect(result.extra.map(([key, value]) => `${key}: ${value}`).join(" | ")).not.toContain(
      "[object Object]",
    );
  });

  it("hides the internal manual provenance object", () => {
    const result = presentTimelineDiaryEntryDetails(waterFeedCheck, "celsius");
    const blob = JSON.stringify(result);
    expect(blob).not.toContain("manual_provenance");
    expect(blob).not.toContain("operator_entered");
    expect(blob).not.toContain("unverified");
  });
});
