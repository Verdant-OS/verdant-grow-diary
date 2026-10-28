/**
 * Codex and Copilot findings on #2422 at bcdf2ea6.
 * - The fallback VPD check matches a flagged VPD row to the selected capture
 *   by source when both are known; an unrelated manual row cannot blank a
 *   valid live one.
 * - An explicit stale or invalid temperature/RH source is untrusted in the
 *   capture climate whatever its quality flag.
 * - A rejected calculated VPD (`kpa: null`) at the cohort's own capture reads
 *   Invalid, not Unknown.
 * - A cross-capture canonical VPD keeps its own source label beside the
 *   status word.
 */
import { describe, expect, it } from "vitest";
import { buildTentSnapshotView } from "@/lib/dashboardEnvironmentSnapshotViewModel";
import { sensorCaptureRef } from "@/lib/sensorCaptureRefRules";
import type { TonightMetricView } from "@/lib/tonightTentHomeViewModel";
import {
  resolveTentDetailVpd,
  tentDetailCaptureClimate,
  tentDetailVpdRowUntrusted,
} from "@/lib/tentDetailVpdRules";

const NOW = Date.parse("2026-10-23T03:00:00.000Z");
const at = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString();
const row = (metric: string, value: number, ts: string, extra: Record<string, unknown> = {}) => ({
  metric,
  value,
  ts,
  captured_at: ts,
  source: "live",
  quality: "ok",
  tent_id: "tent-1",
  ...extra,
});

describe("the fallback VPD check matches the selected capture", () => {
  const T = at(5);
  const rows = [
    row("vpd_kpa", 1.1, T),
    row("vpd_kpa", 9.9, T, { source: "manual", quality: "invalid" }),
  ];

  it("ignores a flagged manual VPD when the selected VPD is live", () => {
    expect(tentDetailVpdRowUntrusted(rows, T, "live")).toBe(false);
  });

  it("still withholds when the flagged row is the selected capture", () => {
    expect(tentDetailVpdRowUntrusted(rows, T, "manual")).toBe(true);
  });

  it("falls back to the instant when the selected source is unknown", () => {
    expect(tentDetailVpdRowUntrusted(rows, T, null)).toBe(true);
  });
});

describe("explicit stale or invalid climate sources are untrusted", () => {
  it.each(["stale", "invalid"])("marks a quality-ok %s RH untrusted", (source) => {
    const climate = tentDetailCaptureClimate([row("humidity_pct", 55, at(5), { source })], null);
    expect(climate).toEqual([expect.objectContaining({ rh: 55, untrusted: true })]);
  });

  it.each(["stale", "invalid"])(
    "withholds a newer cached VPD whose capture has a %s RH sibling",
    (source) => {
      const cachedAt = at(5);
      const tonight: TonightMetricView = {
        key: "vpd",
        label: "VPD",
        state: "value",
        value: 1.0,
        source: "live",
        sourceLabel: null,
        capturedAt: at(20),
        ageText: null,
        calculated: false,
      };
      const out = resolveTentDetailVpd({
        tonight,
        existing: { value: 1.2, capturedAt: cachedAt, source: "live", stale: false },
        rejectedMetrics: [],
        rejectedCapturedAt: null,
        contributors: null,
        captureClimate: tentDetailCaptureClimate(
          [row("humidity_pct", 55, cachedAt, { source }), row("temperature_c", 25, cachedAt)],
          null,
        ),
        nowMs: NOW,
      });
      expect(out.value).not.toBe(1.2);
    },
  );
});

describe("the strip keeps rejected and cross-capture VPD evidence honest", () => {
  it("labels a rejected calculated VPD at the cohort's capture Invalid, not Unknown", () => {
    const T = at(2);
    const view = buildTentSnapshotView(
      [row("temperature_c", 24, T), row("humidity_pct", 100, T)] as never,
      "veg",
      NOW,
      {
        canonicalVpd: {
          kpa: null,
          capturedAt: T,
          source: "live",
          sourceLabel: "Live",
          ageText: "2m ago",
          rejected: true,
          captureRefs: [sensorCaptureRef(T, "live")],
        },
      },
    );
    const vpd = view.metrics.find((m) => m.key === "vpd")!;
    expect(vpd.status).toBe("invalid");
    expect(vpd.statusLabel).toBe("Invalid");
  });

  it.each([
    ["csv", "CSV", "Historical"],
    ["demo", "Demo", "Needs verification"],
  ])("keeps a %s VPD's source label beside its status word", (source, sourceLabel, word) => {
    const view = buildTentSnapshotView(
      [row("temperature_c", 24, at(1)), row("humidity_pct", 55, at(1))] as never,
      "veg",
      NOW,
      {
        canonicalVpd: {
          kpa: 1.1,
          capturedAt: at(6),
          source,
          sourceLabel,
          ageText: "6m ago",
          captureRefs: [sensorCaptureRef(at(6), source)],
        },
      },
    );
    const vpd = view.metrics.find((m) => m.key === "vpd")!;
    expect(vpd.statusLabel).toBe(`${word} · ${sourceLabel} · 6m ago`);
  });
});
