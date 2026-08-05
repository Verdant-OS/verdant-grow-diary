/**
 * Static test: the measurement ID is centralized in src/constants/analytics.ts
 * and resolved from the linked Lovable Google Analytics connector, with a
 * validated fallback.
 *
 * Deliberately does NOT pin a literal id: the connector owns the value. What is
 * pinned is the resolution contract — valid connector value wins, anything
 * malformed falls back rather than darkening the property.
 */
import { describe, it, expect } from "vitest";
import {
  GOOGLE_ANALYTICS_MEASUREMENT_ID,
  GOOGLE_ANALYTICS_MEASUREMENT_ID_FALLBACK,
  GA4_MEASUREMENT_ID_PATTERN,
  resolveGoogleAnalyticsMeasurementId,
} from "@/constants/analytics";

describe("Google Analytics measurement ID constant", () => {
  it("is a non-empty string in valid GA4 format", () => {
    expect(typeof GOOGLE_ANALYTICS_MEASUREMENT_ID).toBe("string");
    expect(GOOGLE_ANALYTICS_MEASUREMENT_ID).toMatch(GA4_MEASUREMENT_ID_PATTERN);
  });

  it("matches whatever the connector env var supplies, when it is well-formed", () => {
    const raw = import.meta.env["VITE_LOVABLE_CONNECTOR_GOOGLE_ANALYTICS_API_KEY"];
    if (typeof raw === "string" && GA4_MEASUREMENT_ID_PATTERN.test(raw.trim())) {
      expect(GOOGLE_ANALYTICS_MEASUREMENT_ID).toBe(raw.trim());
    } else {
      expect(GOOGLE_ANALYTICS_MEASUREMENT_ID).toBe(GOOGLE_ANALYTICS_MEASUREMENT_ID_FALLBACK);
    }
  });

  it("has a well-formed fallback", () => {
    expect(GOOGLE_ANALYTICS_MEASUREMENT_ID_FALLBACK).toMatch(GA4_MEASUREMENT_ID_PATTERN);
  });
});

describe("resolveGoogleAnalyticsMeasurementId", () => {
  it("accepts a well-formed connector value", () => {
    expect(resolveGoogleAnalyticsMeasurementId("G-ABCDE12345")).toBe("G-ABCDE12345");
  });

  it("trims surrounding whitespace", () => {
    expect(resolveGoogleAnalyticsMeasurementId("  G-ABCDE12345\n")).toBe("G-ABCDE12345");
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["empty string", ""],
    ["whitespace only", "   "],
    ["missing G- prefix", "UA-12345-1"],
    ["lowercase body", "G-abcde12345"],
    ["too short", "G-ABCDE1234"],
    ["too long", "G-ABCDE123456"],
    ["non-string", 12345],
  ])("falls back for %s", (_label, input) => {
    expect(resolveGoogleAnalyticsMeasurementId(input)).toBe(
      GOOGLE_ANALYTICS_MEASUREMENT_ID_FALLBACK,
    );
  });

  it("is deterministic", () => {
    const a = resolveGoogleAnalyticsMeasurementId("G-ZZZZZZZZZZ");
    const b = resolveGoogleAnalyticsMeasurementId("G-ZZZZZZZZZZ");
    expect(a).toBe(b);
  });
});
