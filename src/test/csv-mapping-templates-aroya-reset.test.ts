/**
 * Tests for the AROYA-shaped representative template and blank reset
 * template, plus the missing-required-header block behavior.
 */
import { describe, it, expect } from "vitest";

import {
  applyCsvMappingTemplate,
  CSV_MAPPING_TEMPLATES,
  getCsvMappingTemplate,
} from "@/lib/csvMappingTemplates";
import { emptyRepresentativeMapping } from "@/lib/representativeCsvSensorPreviewRules";

describe("csv mapping templates — AROYA-shaped representative", () => {
  const tpl = getCsvMappingTemplate("aroya_representative")!;

  it("is registered in CSV_MAPPING_TEMPLATES", () => {
    expect(CSV_MAPPING_TEMPLATES.find((t) => t.id === "aroya_representative")).toBeTruthy();
  });

  it("maps representative AROYA-style headers when present", () => {
    const headers = [
      "timestamp",
      "room_temp",
      "room_rh",
      "room_vpd",
      "substrate_ec",
      "substrate_vwc",
      "substrate_temp",
    ];
    const result = applyCsvMappingTemplate(tpl, headers);
    expect(result.blocked).toBe(false);
    expect(result.mapping.timestamp).toBe("timestamp");
    expect(result.mapping.air_temp.column).toBe("room_temp");
    expect(result.mapping.humidity.column).toBe("room_rh");
    expect(result.mapping.vpd.column).toBe("room_vpd");
    expect(result.mapping.substrate_ec.column).toBe("substrate_ec");
    expect(result.mapping.substrate_ec.unit).toBe("mS/cm");
    expect(result.mapping.vwc.column).toBe("substrate_vwc");
    expect(result.mapping.substrate_temp.column).toBe("substrate_temp");
  });

  it("blocks apply when required headers are missing", () => {
    const headers = ["room_temp", "room_rh"]; // no timestamp
    const result = applyCsvMappingTemplate(tpl, headers);
    expect(result.blocked).toBe(true);
    expect(result.missingRequiredHeaders).toContain("timestamp");
    expect(result.blockReason).toMatch(/does not match this file/i);
    // Mapping must not be partially applied.
    expect(result.mapping.air_temp.column).toBeNull();
    expect(result.mapping.humidity.column).toBeNull();
  });

  it("leaves ambiguous fields unmapped when two headers match", () => {
    const headers = ["timestamp", "ec", "substrate_ec"];
    const result = applyCsvMappingTemplate(tpl, headers);
    expect(result.blocked).toBe(false);
    expect(result.ambiguousFields).toContain("substrate_ec");
    expect(result.mapping.substrate_ec.column).toBeNull();
  });

  it("does not introduce live/source labels", () => {
    const result = applyCsvMappingTemplate(tpl, ["timestamp"]);
    const s = JSON.stringify(result);
    expect(s).not.toMatch(/"live"/);
  });
});

describe("csv mapping templates — blank reset", () => {
  const tpl = getCsvMappingTemplate("blank_reset")!;

  it("clears mapping without matching headers and never blocks", () => {
    const result = applyCsvMappingTemplate(tpl, ["timestamp", "temperature"]);
    expect(result.blocked).toBe(false);
    expect(result.mapping).toEqual(emptyRepresentativeMapping());
    expect(result.ambiguousFields).toEqual([]);
    expect(result.unmatchedFields).toEqual([]);
    expect(result.missingRequiredHeaders).toEqual([]);
  });
});
