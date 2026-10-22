/**
 * Codex review of #2303 at 4dc23aad: two Tent Detail VPD resolver cases.
 * - P2: a newer Quick Log manual VPD (grow_events, which Tonight does not
 *   read) must not be replaced by Tonight's older value.
 * - P2: a sensor-truth rejection at an older capture must not block Tonight's
 *   newer, valid capture; a rejection at Tonight's own capture still does.
 * Codex review at 69de43db:
 * - P1: a same-capture temperature or RH whose intake quality flag is not ok
 *   rejects Tonight's direct VPD, however plausible the flagged number.
 */
import { describe, expect, it } from "vitest";
import { resolveTentDetailVpd, tentDetailCaptureClimate } from "@/lib/tentDetailVpdRules";
import type { TonightMetricView } from "@/lib/tonightTentHomeViewModel";

const NOW = Date.parse("2026-10-22T03:00:00.000Z");
const at = (hoursAgo: number) => new Date(NOW - hoursAgo * 3_600_000).toISOString();

const tonightAt = (hoursAgo: number): TonightMetricView => ({
  key: "vpd",
  label: "VPD",
  state: "value",
  value: 1.75,
  source: "manual",
  sourceLabel: "Manual",
  capturedAt: at(hoursAgo),
  ageText: `${hoursAgo}h ago`,
  calculated: true,
});
const CONTRIBUTORS = { temp: (80 - 32) / 1.8, rh: 50 };
const NO_VPD = { value: null, capturedAt: null, source: null, stale: false };

describe("resolveTentDetailVpd keeps newer evidence", () => {
  it("keeps a newer Quick Log manual VPD over Tonight's older value", () => {
    const manual = { value: 1.1, capturedAt: at(0.5), source: "manual" as const, stale: false };
    const out = resolveTentDetailVpd({
      tonight: tonightAt(2),
      existing: manual,
      rejectedMetrics: [],
      rejectedCapturedAt: null,
      contributors: CONTRIBUTORS,
      captureClimate: [],
      nowMs: NOW,
    });
    expect(out.value).toBe(1.1);
    expect(out.capturedAt).toBe(manual.capturedAt);
    expect(out.calculated).toBe(false);
  });

  it("still prefers Tonight when it is the newer capture", () => {
    const manual = { value: 1.1, capturedAt: at(5), source: "manual" as const, stale: false };
    const out = resolveTentDetailVpd({
      tonight: tonightAt(2),
      existing: manual,
      rejectedMetrics: [],
      rejectedCapturedAt: null,
      contributors: CONTRIBUTORS,
      captureClimate: [],
      nowMs: NOW,
    });
    expect(out.value).toBe(1.75);
    expect(out.calculated).toBe(true);
  });
});

describe("resolveTentDetailVpd scopes rejections to their capture", () => {
  it("does not let an older rejected capture block Tonight's newer valid one", () => {
    const out = resolveTentDetailVpd({
      tonight: tonightAt(1),
      existing: NO_VPD,
      rejectedMetrics: ["rh"],
      rejectedCapturedAt: at(48),
      contributors: CONTRIBUTORS,
      captureClimate: [{ at: at(1), temp: CONTRIBUTORS.temp, rh: CONTRIBUTORS.rh }],
      nowMs: NOW,
    });
    expect(out.value).toBe(1.75);
  });

  it.each([0, 1])(
    "keeps blocking when the rejection is at or after Tonight's capture (%ih newer)",
    (offset) => {
      const out = resolveTentDetailVpd({
        tonight: tonightAt(1 + offset),
        existing: NO_VPD,
        rejectedMetrics: ["rh"],
        rejectedCapturedAt: at(1),
        contributors: CONTRIBUTORS,
        captureClimate: [],
        nowMs: NOW,
      });
      expect(out.value).toBeNull();
    },
  );

  it("keeps blocking when the rejected capture time is unknown", () => {
    const out = resolveTentDetailVpd({
      tonight: tonightAt(1),
      existing: NO_VPD,
      rejectedMetrics: ["vpd"],
      rejectedCapturedAt: null,
      contributors: CONTRIBUTORS,
      captureClimate: [],
      nowMs: NOW,
    });
    expect(out.value).toBeNull();
  });
});

describe("resolveTentDetailVpd honours intake quality at Tonight's capture", () => {
  // A stored vpd_kpa row Tonight selected directly, not calculated.
  const direct = (): TonightMetricView => ({ ...tonightAt(1), value: 1.2, calculated: false });
  const rowsAt = (hoursAgo: number, quality: string | null) => [
    { metric: "temperature_c", value: 24, captured_at: at(hoursAgo), quality },
    { metric: "humidity_pct", value: 55, captured_at: at(hoursAgo), quality: "ok" },
  ];

  it("carries each row's intake quality into the capture climate", () => {
    const climate = tentDetailCaptureClimate(rowsAt(1, "invalid"), null);
    expect(climate.map((c) => c.untrusted)).toEqual([true, false]);
    expect(tentDetailCaptureClimate(rowsAt(1, null), null).map((c) => c.untrusted)).toEqual([
      false,
      false,
    ]);
  });

  it.each(["invalid", "degraded"])(
    "rejects a direct VPD whose capture holds a plausible temperature flagged %s",
    (quality) => {
      const out = resolveTentDetailVpd({
        tonight: direct(),
        existing: NO_VPD,
        // The header's truth check rejected nothing: the flagged value is plausible,
        // and the header belongs to a newer CO2-only capture anyway.
        rejectedMetrics: [],
        rejectedCapturedAt: at(0.05),
        contributors: null,
        captureClimate: tentDetailCaptureClimate(rowsAt(1, quality), null),
        nowMs: NOW,
      });
      expect(out.value).toBeNull();
    },
  );

  it("keeps the direct VPD when the same capture's climate is flagged ok", () => {
    const out = resolveTentDetailVpd({
      tonight: direct(),
      existing: NO_VPD,
      rejectedMetrics: [],
      rejectedCapturedAt: at(0.05),
      contributors: null,
      captureClimate: tentDetailCaptureClimate(rowsAt(1, "ok"), null),
      nowMs: NOW,
    });
    expect(out.value).toBe(1.2);
  });

  it("ignores a flagged row at a different capture", () => {
    const out = resolveTentDetailVpd({
      tonight: direct(),
      existing: NO_VPD,
      rejectedMetrics: [],
      rejectedCapturedAt: at(0.05),
      contributors: null,
      captureClimate: tentDetailCaptureClimate(rowsAt(6, "invalid"), null),
      nowMs: NOW,
    });
    expect(out.value).toBe(1.2);
  });
});
