import { describe, expect, it } from "vitest";
import { resolveDisplayedVpdObservation } from "@/lib/vpdStabilityInputRules";

const NOW_MS = Date.parse("2026-10-15T12:00:00.000Z");

describe("resolveDisplayedVpdObservation", () => {
  it("keeps a stored snapshot's own freshness when that snapshot observed VPD", () => {
    const observed = resolveDisplayedVpdObservation({
      snapshotVpd: 0.9,
      snapshotCapturedAt: "2026-10-15T11:40:00.000Z",
      snapshotSource: "live",
      snapshotStale: true,
      fallback: {
        ts: "2026-10-15T11:55:00.000Z",
        vpd: 1.2,
        source: "manual",
        stale: false,
      },
      nowMs: NOW_MS,
    });
    expect(observed).toEqual({
      value: 0.9,
      capturedAt: "2026-10-15T11:40:00.000Z",
      source: "live",
      stale: true,
    });
  });

  it("ages a Quick Log fallback against now instead of the stability stale flag", () => {
    const twoDaysAgo = new Date(NOW_MS - 2 * 24 * 60 * 60 * 1000).toISOString();
    const aged = resolveDisplayedVpdObservation({
      snapshotVpd: null,
      snapshotCapturedAt: null,
      snapshotSource: null,
      snapshotStale: false,
      fallback: { ts: twoDaysAgo, vpd: 1.1, source: "manual", stale: false },
      nowMs: NOW_MS,
    });
    expect(aged).toEqual({
      value: 1.1,
      capturedAt: twoDaysAgo,
      source: "manual",
      stale: true,
    });

    const freshAt = new Date(NOW_MS - 5 * 60 * 1000).toISOString();
    const fresh = resolveDisplayedVpdObservation({
      snapshotVpd: undefined,
      snapshotCapturedAt: "2026-10-13T12:00:00.000Z",
      snapshotSource: "live",
      snapshotStale: true,
      fallback: { ts: freshAt, vpd: 1.1, source: "manual", stale: true },
      nowMs: NOW_MS,
    });
    expect(fresh).toEqual({
      value: 1.1,
      capturedAt: freshAt,
      source: "manual",
      stale: false,
    });
  });

  it("treats a fallback without a timestamp as not current", () => {
    expect(
      resolveDisplayedVpdObservation({
        snapshotVpd: null,
        snapshotCapturedAt: null,
        snapshotSource: null,
        snapshotStale: false,
        fallback: { ts: "not-a-time", vpd: 1.1, source: "manual" },
        nowMs: NOW_MS,
      }),
    ).toEqual({ value: 1.1, capturedAt: null, source: "manual", stale: true });
  });

  it("uses the manual window for a manual fallback and the live window for live", () => {
    const twentyHoursAgo = new Date(NOW_MS - 20 * 60 * 60 * 1000).toISOString();
    expect(
      resolveDisplayedVpdObservation({
        snapshotVpd: null,
        snapshotCapturedAt: null,
        snapshotSource: null,
        snapshotStale: false,
        fallback: { ts: twentyHoursAgo, vpd: 1, source: "manual" },
        nowMs: NOW_MS,
      }).stale,
    ).toBe(false);
    expect(
      resolveDisplayedVpdObservation({
        snapshotVpd: null,
        snapshotCapturedAt: null,
        snapshotSource: null,
        snapshotStale: false,
        fallback: { ts: twentyHoursAgo, vpd: 1, source: "live" },
        nowMs: NOW_MS,
      }).stale,
    ).toBe(true);
  });
});
