/**
 * AUD-003: The Sensors page must NOT show "Unavailable" for valid-but-stale
 * readings. When a reading exists but is older than the freshness window,
 * the page should keep rendering the chart and show a "Stale" badge.
 */
import { describe, it, expect } from "vitest";
import { classifyGrowDataSource } from "@/lib/growDataSourceLabelRules";

const NOW = Date.parse("2026-05-27T12:00:00Z");

describe("AUD-003 — stale Sensors readings are labelled Stale, not Unavailable", () => {
  it("a 2-hour-old live reading classifies as Stale (chart still renders)", () => {
    const out = classifyGrowDataSource(
      {
        source: "sensor",
        value: 24.2,
        timestamp: new Date(NOW - 2 * 60 * 60 * 1000).toISOString(),
      },
      { now: NOW },
    );
    expect(out.label).toBe("Stale");
  });

  it("a fresh reading still classifies as Live", () => {
    const out = classifyGrowDataSource(
      {
        source: "sensor",
        value: 24.2,
        timestamp: new Date(NOW - 60 * 1000).toISOString(),
      },
      { now: NOW },
    );
    expect(out.label).toBe("Live");
  });

  it("no reading at all still classifies as Unavailable", () => {
    const out = classifyGrowDataSource(
      { source: null, value: null, timestamp: null },
      { now: NOW },
    );
    expect(out.label).toBe("Unavailable");
  });
});
