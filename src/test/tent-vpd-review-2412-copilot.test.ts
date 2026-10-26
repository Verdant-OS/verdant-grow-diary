/**
 * Copilot P1s on #2412 at 8d8c4900.
 * - A capture-gate rejection after a failed raw refresh must carry
 *   `rowsReadFailed`, or the strip restores its cached VPD as OK.
 * - Diagnostic (testbench) rows must not enter the capture climate: a
 *   canonical-live testbench RH of 150% would otherwise share a physical
 *   VPD's capture ref and hide a VPD that Tonight and the header accept.
 */
import { describe, expect, it } from "vitest";
import { EMPTY_SNAPSHOT } from "@/lib/sensorSnapshot";
import type { CaptureEvidenceSnapshot } from "@/lib/sensorSnapshotCaptureEvidence";
import { tentsListCanonicalVpd } from "@/lib/tentsListVpdRules";
import { tentDetailCaptureClimate } from "@/lib/tentDetailVpdRules";

const NOW = Date.parse("2026-10-22T03:00:00.000Z");
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
  tent_id: "tent-1",
  source: "live",
  quality: "ok",
  ...extra,
});

describe("a capture-gate rejection after a failed refresh carries rowsReadFailed", () => {
  it("flags the read failure on a snapshot VPD rejected for an unrealistic RH", () => {
    const snapAt = at(10);
    const snap: CaptureEvidenceSnapshot = {
      ...EMPTY_SNAPSHOT,
      source: "live",
      ts: snapAt,
      rh: 150,
      vpd: 1.1,
      tent_id: "tent-1",
      metric_refs: {
        rh: { id: "row-rh", captured_at: snapAt, source: "live" },
        vpd: { id: "row-vpd", captured_at: snapAt, source: "live" },
      },
    };
    const cached = at(5);
    const out = tentsListCanonicalVpd(
      [
        row("temperature_c", 25, cached),
        row("humidity_pct", 55, cached),
        row("vpd_kpa", 1.2, cached),
      ],
      "tent-1",
      NOW,
      { status: "ok", snapshot: snap },
      "refresh_error",
    );
    expect(out?.rejected).toBe(true);
    expect(out?.rowsReadFailed).toBe(true);
  });
});

describe("diagnostic rows stay out of the capture climate", () => {
  it("does not let a testbench RH at a physical VPD's instant reject it", () => {
    const t = at(5);
    const out = tentsListCanonicalVpd(
      [
        row("temperature_c", 24, t),
        row("humidity_pct", 50, t),
        row("vpd_kpa", 1.2, t),
        row("humidity_pct", 150, t, { raw_payload: DIAGNOSTIC_PAYLOAD }),
      ],
      "tent-1",
      NOW,
    );
    expect(out?.kpa).toBe(1.2);
    expect(out?.rejected).toBeUndefined();
  });

  it("leaves diagnostic rows out of tentDetailCaptureClimate", () => {
    const t = at(5);
    const climate = tentDetailCaptureClimate(
      [row("humidity_pct", 150, t, { raw_payload: DIAGNOSTIC_PAYLOAD })],
      null,
    );
    expect(climate).toEqual([]);
  });
});
