/**
 * sensor-source-summary-rules — pure helper tests.
 */
import { describe, it, expect } from "vitest";
import { summarizeSensorSources } from "@/lib/sensorSourceSummaryRules";

describe("summarizeSensorSources", () => {
  it("returns empty zero-counts for null/empty input", () => {
    const r1 = summarizeSensorSources(null);
    expect(r1.total).toBe(0);
    expect(r1.isEmpty).toBe(true);
    expect(r1.counts).toEqual({ live: 0, manual: 0, csv: 0, demo: 0, stale: 0, invalid: 0 });
    expect(summarizeSensorSources([]).isEmpty).toBe(true);
  });

  it("counts each canonical source", () => {
    const now = Date.parse("2025-06-01T12:00:00Z");
    const ts = "2025-06-01T11:59:00Z";
    const r = summarizeSensorSources(
      [
        { source: "live", captured_at: ts },
        { source: "live", captured_at: ts },
        { source: "manual", captured_at: ts },
        { source: "csv", captured_at: ts },
        { source: "demo", captured_at: ts },
        { source: "invalid", captured_at: ts },
      ],
      { now, staleMs: 60_000 },
    );
    expect(r.total).toBe(6);
    expect(r.counts.live).toBe(2);
    expect(r.counts.manual).toBe(1);
    expect(r.counts.csv).toBe(1);
    expect(r.counts.demo).toBe(1);
    expect(r.counts.invalid).toBe(1);
    expect(r.counts.stale).toBe(0);
  });

  it("counts missing/unknown source as invalid", () => {
    const r = summarizeSensorSources([
      { source: null, ts: "2025-01-01T00:00:00Z" },
      { source: "bogus", ts: "2025-01-01T00:00:00Z" },
      { source: "", ts: "2025-01-01T00:00:00Z" },
    ]);
    expect(r.counts.invalid).toBe(3);
    expect(r.counts.live).toBe(0);
  });

  it("uses fallback when provided (e.g. demo mode)", () => {
    const r = summarizeSensorSources(
      [{ source: null, ts: "2025-01-01T00:00:00Z" }],
      { fallback: "demo" },
    );
    expect(r.counts.demo).toBe(1);
    expect(r.counts.invalid).toBe(0);
  });

  it("downgrades old live readings to stale when staleMs is set", () => {
    const now = Date.parse("2025-01-01T12:00:00Z");
    const r = summarizeSensorSources(
      [
        { source: "live", captured_at: "2025-01-01T11:59:30Z" },
        { source: "live", captured_at: "2025-01-01T00:00:00Z" },
      ],
      { now, staleMs: 60_000 },
    );
    expect(r.counts.live).toBe(1);
    expect(r.counts.stale).toBe(1);
  });

  it("does not downgrade explicit csv/manual/demo to stale", () => {
    const now = Date.parse("2025-06-01T12:00:00Z");
    const old = "2020-01-01T00:00:00Z";
    const r = summarizeSensorSources(
      [
        { source: "csv", captured_at: old },
        { source: "manual", captured_at: old },
        { source: "demo", captured_at: old },
      ],
      { now, staleMs: 1000 },
    );
    expect(r.counts.csv).toBe(1);
    expect(r.counts.manual).toBe(1);
    expect(r.counts.demo).toBe(1);
    expect(r.counts.stale).toBe(0);
  });

  it("filters by half-open date range [from, to)", () => {
    const data = [
      { source: "live", captured_at: "2025-01-01T00:00:00Z" }, // before
      { source: "live", captured_at: "2025-01-05T00:00:00Z" }, // in
      { source: "live", captured_at: "2025-01-10T00:00:00Z" }, // at upper -> excluded
    ];
    const now = Date.parse("2025-01-05T01:00:00Z");
    const r = summarizeSensorSources(data, {
      range: { from: "2025-01-02T00:00:00Z", to: "2025-01-10T00:00:00Z" },
      now,
      staleMs: 24 * 60 * 60 * 1000,
    });
    expect(r.total).toBe(1);
    expect(r.counts.live).toBe(1);
  });

  it("returns empty when nothing falls inside the range", () => {
    const r = summarizeSensorSources(
      [{ source: "live", captured_at: "2025-01-01T00:00:00Z" }],
      { range: { from: "2025-02-01T00:00:00Z" } },
    );
    expect(r.isEmpty).toBe(true);
    expect(r.total).toBe(0);
  });
});
