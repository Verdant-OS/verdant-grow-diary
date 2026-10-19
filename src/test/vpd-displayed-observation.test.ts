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

  it("ages a Quick Log fallback against now", () => {
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
      fallback: { ts: freshAt, vpd: 1.1, source: "manual", stale: false },
      nowMs: NOW_MS,
    });
    expect(fresh).toEqual({
      value: 1.1,
      capturedAt: freshAt,
      source: "manual",
      stale: false,
    });
  });

  it("never lets a recent CSV or other historical fallback read as current (Codex P1 at 5211eb07)", () => {
    const freshAt = new Date(NOW_MS - 2 * 60 * 1000).toISOString();
    const base = {
      snapshotVpd: null,
      snapshotCapturedAt: "2026-10-15T11:50:00.000Z",
      snapshotSource: "live",
      snapshotStale: false,
      nowMs: NOW_MS,
    };
    for (const source of ["csv", "demo", null]) {
      const shown = resolveDisplayedVpdObservation({
        ...base,
        fallback: { ts: freshAt, vpd: 1.1, source, stale: false },
      });
      expect(shown.value).toBe(1.1);
      expect(shown.stale).toBe(true);
    }
    expect(
      resolveDisplayedVpdObservation({
        ...base,
        fallback: { ts: freshAt, vpd: 1.1, source: "live", stale: false },
      }).stale,
    ).toBe(false);
  });

  it("keeps a fallback's persisted stale lineage even when it is recent", () => {
    // Codex P1 at 1f55727a: a recent live row that persistence marked stale
    // must never be presented as a current reading.
    const freshAt = new Date(NOW_MS - 2 * 60 * 1000).toISOString();
    expect(
      resolveDisplayedVpdObservation({
        snapshotVpd: null,
        snapshotCapturedAt: "2026-10-15T11:50:00.000Z",
        snapshotSource: "live",
        snapshotStale: false,
        fallback: { ts: freshAt, vpd: 1.1, source: "live", stale: true },
        nowMs: NOW_MS,
      }),
    ).toEqual({ value: 1.1, capturedAt: freshAt, source: "live", stale: true });
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

describe("resolveDisplayedVpdObservation respects a header that rejected its VPD", () => {
  it("does not restore a VPD the stored snapshot observed but sensor truth rejected", () => {
    expect(
      resolveDisplayedVpdObservation({
        snapshotVpd: null,
        snapshotVpdRejected: true,
        snapshotCapturedAt: "2026-10-15T11:58:00.000Z",
        snapshotSource: "live",
        snapshotStale: false,
        fallback: { ts: "2026-10-15T11:50:00.000Z", vpd: 1.1, source: "manual" },
        nowMs: NOW_MS,
      }),
    ).toEqual({ value: null, capturedAt: null, source: null, stale: false });
  });

  it("lets a newer valid fallback supersede a rejected snapshot VPD", () => {
    // Codex P1 at 80ec8672: a Quick Log manual VPD logged after the rejected
    // snapshot is the grower's current valid reading and must not be hidden.
    expect(
      resolveDisplayedVpdObservation({
        snapshotVpd: null,
        snapshotVpdRejected: true,
        snapshotCapturedAt: "2026-10-15T11:50:00.000Z",
        snapshotSource: "live",
        snapshotStale: false,
        fallback: { ts: "2026-10-15T11:58:00.000Z", vpd: 1.1, source: "manual" },
        nowMs: NOW_MS,
      }),
    ).toEqual({
      value: 1.1,
      capturedAt: "2026-10-15T11:58:00.000Z",
      source: "manual",
      stale: false,
    });
  });

  it("still withholds a same-instant fallback or one when the snapshot time is unknown", () => {
    const base = {
      snapshotVpd: null,
      snapshotVpdRejected: true,
      snapshotSource: "live",
      snapshotStale: false,
      fallback: { ts: "2026-10-15T11:58:00.000Z", vpd: 1.1, source: "manual" },
      nowMs: NOW_MS,
    };
    const hidden = { value: null, capturedAt: null, source: null, stale: false };
    expect(
      resolveDisplayedVpdObservation({ ...base, snapshotCapturedAt: "2026-10-15T11:58:00.000Z" }),
    ).toEqual(hidden);
    expect(resolveDisplayedVpdObservation({ ...base, snapshotCapturedAt: null })).toEqual(hidden);
    expect(
      resolveDisplayedVpdObservation({
        ...base,
        snapshotCapturedAt: "2026-10-15T11:50:00.000Z",
        fallback: { ts: "not-a-time", vpd: 1.1, source: "manual" },
      }),
    ).toEqual(hidden);
  });
});
