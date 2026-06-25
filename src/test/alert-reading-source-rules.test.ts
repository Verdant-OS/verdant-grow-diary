/**
 * alertReadingSourceRules — pure helper tests.
 *
 * Validates that the helper:
 *   - Resolves alert.source exactly when it matches the SensorReadingSource
 *     enum.
 *   - Falls back to a `[source:<value>]` lineage tag in `reason`.
 *   - Returns null for unknown values so the UI omits the badge instead of
 *     printing a misleading "Unknown" chip.
 *   - Never promotes manual to live.
 */
import { describe, it, expect } from "vitest";
import { deriveAlertReadingSource } from "@/lib/alertReadingSourceRules";

describe("deriveAlertReadingSource", () => {
  it.each(["live", "manual", "csv", "demo", "stale", "invalid"] as const)(
    "returns %s when alert.source matches the enum",
    (s) => {
      expect(deriveAlertReadingSource({ source: s, reason: "x" })).toBe(s);
    },
  );

  it("returns null for non-enum alert.source like environment_alerts", () => {
    expect(
      deriveAlertReadingSource({ source: "environment_alerts", reason: "x" }),
    ).toBeNull();
  });

  it("falls back to [source:<value>] tag in reason", () => {
    expect(
      deriveAlertReadingSource({
        source: "environment_alerts",
        reason: "Humidity high. [source:manual]",
      }),
    ).toBe("manual");
  });

  it("ignores invalid tag values", () => {
    expect(
      deriveAlertReadingSource({
        source: "environment_alerts",
        reason: "[source:bogus]",
      }),
    ).toBeNull();
  });

  it("returns null for null/undefined inputs", () => {
    expect(deriveAlertReadingSource(null)).toBeNull();
    expect(deriveAlertReadingSource(undefined)).toBeNull();
    expect(deriveAlertReadingSource({})).toBeNull();
  });

  it("never promotes manual to live (exact match only)", () => {
    expect(
      deriveAlertReadingSource({ source: "manual", reason: "[source:live]" }),
    ).toBe("manual");
  });
});
