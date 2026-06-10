import { describe, expect, it } from "vitest";
import {
  detectCsvMappingTemplate,
} from "@/lib/csvMappingTemplates";

describe("detectCsvMappingTemplate", () => {
  it("auto-selects thp_export from THP header signature", () => {
    const headers = [
      "deviceSerialnum",
      "temperature(°C)",
      "humidity",
      "vpd",
      "temperature(°F)",
      "Timestamp",
      "ppfd",
    ];
    const result = detectCsvMappingTemplate(headers);
    expect(result).not.toBeNull();
    expect(result?.templateId).toBe("thp_export");
    expect(result?.confidence).toBe("high");
  });

  it("ignores BOM/case/whitespace differences in headers", () => {
    const headers = [
      " Timestamp ",
      "Temperature(°C)",
      "HUMIDITY",
      "VPD",
    ];
    const result = detectCsvMappingTemplate(headers);
    expect(result?.templateId).toBe("thp_export");
  });

  it("returns null when no template's required headers are present", () => {
    const headers = ["foo", "bar", "baz"];
    expect(detectCsvMappingTemplate(headers)).toBeNull();
  });

  it("does not auto-pick reset or unconstrained generic templates", () => {
    // Only timestamp + humidity — no template requires that combo, so no auto-pick.
    const headers = ["timestamp", "humidity"];
    const result = detectCsvMappingTemplate(headers);
    expect(result).toBeNull();
  });
});
