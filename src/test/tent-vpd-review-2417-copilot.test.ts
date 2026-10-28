/**
 * Copilot P1s on #2417 at 066f72a2.
 * - The fallback VPD check must fence diagnostic (testbench) rows, as the
 *   capture climate does: a diagnostic invalid `vpd_kpa` at a physical VPD's
 *   instant must not withhold the physical reading.
 * - The tent page's own observation is held to its own capture: a
 *   quality-flagged RH at that capture withholds it, even when it is newer
 *   than Tonight's VPD.
 */
import { describe, expect, it } from "vitest";
import type { TonightMetricView } from "@/lib/tonightTentHomeViewModel";
import {
  resolveTentDetailVpd,
  tentDetailCaptureClimate,
  tentDetailVpdRowUntrusted,
} from "@/lib/tentDetailVpdRules";

const NOW = Date.parse("2026-10-23T03:00:00.000Z");
const at = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString();

const DIAGNOSTIC_PAYLOAD = {
  vendor: "ecowitt_windows_testbench",
  metadata: { confidence: "test", verdant_source: "live" },
};

const row = (metric: string, value: number, ts: string, extra: Record<string, unknown> = {}) => ({
  metric,
  value,
  ts,
  captured_at: ts,
  source: "live",
  quality: "ok",
  ...extra,
});

describe("the fallback VPD check ignores diagnostic rows", () => {
  it("keeps a physical VPD beside a diagnostic invalid VPD at the same instant", () => {
    const t = at(5);
    const rows = [
      row("vpd_kpa", 1.1, t),
      row("vpd_kpa", 9.9, t, { quality: "invalid", raw_payload: DIAGNOSTIC_PAYLOAD }),
    ];
    expect(tentDetailVpdRowUntrusted(rows, t)).toBe(false);
  });

  it("still withholds a physical VPD whose own quality flag is invalid", () => {
    const t = at(5);
    expect(tentDetailVpdRowUntrusted([row("vpd_kpa", 1.1, t, { quality: "invalid" })], t)).toBe(
      true,
    );
  });
});

describe("the existing observation is checked against its own capture", () => {
  const tonightAt = at(20);
  const tonight: TonightMetricView = {
    key: "vpd",
    label: "VPD",
    state: "value",
    value: 1.0,
    source: "live",
    sourceLabel: null,
    capturedAt: tonightAt,
    ageText: null,
    calculated: false,
  };
  const resolve = (climateRows: ReturnType<typeof row>[], cachedAt: string) =>
    resolveTentDetailVpd({
      tonight,
      existing: { value: 1.2, capturedAt: cachedAt, source: "live", stale: false },
      rejectedMetrics: [],
      rejectedCapturedAt: null,
      contributors: null,
      captureClimate: tentDetailCaptureClimate(climateRows, null),
      nowMs: NOW,
    });

  it("withholds a newer cached VPD whose capture carries a quality-flagged RH", () => {
    const cachedAt = at(5);
    const out = resolve(
      [
        row("humidity_pct", 55, cachedAt, { quality: "suspect" }),
        row("temperature_c", 25, cachedAt),
      ],
      cachedAt,
    );
    expect(out.value).not.toBe(1.2);
    expect(out.value).toBe(1.0);
  });

  it("keeps a newer cached VPD when the flagged RH belongs to another capture", () => {
    const cachedAt = at(5);
    const out = resolve([row("humidity_pct", 55, at(8), { quality: "suspect" })], cachedAt);
    expect(out.value).toBe(1.2);
  });
});
