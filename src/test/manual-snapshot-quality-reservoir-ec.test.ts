/**
 * #2114 Codex P2: a fresh EC-only diary snapshot carries only reservoir EC.
 * The quality evaluator must count it as a reading (not "missing") and must
 * flag an impossible reservoir EC as invalid, never usable.
 */
import { describe, expect, it } from "vitest";
import { evaluateManualSensorSnapshotQuality } from "@/lib/manualSensorSnapshotQualityRules";

const NOW = Date.parse("2026-10-19T12:00:00.000Z");
const captured_at = "2026-10-19T11:30:00.000Z";

function evaluate(reservoir_ec_mscm: number) {
  return evaluateManualSensorSnapshotQuality(
    { source: "manual", captured_at, reservoir_ec_mscm },
    { mode: "current", nowMs: NOW },
  );
}

describe("manual snapshot quality counts reservoir EC", () => {
  it("rates a fresh, plausible EC-only snapshot usable", () => {
    const q = evaluate(1.4);
    expect(q.missingFields).not.toContain("metrics");
    expect(q.quality).toBe("usable");
  });

  it("marks a negative reservoir EC invalid", () => {
    const q = evaluate(-0.5);
    expect(q.quality).toBe("invalid");
    expect(q.invalidFields).toContain("reservoir_ec_mscm");
  });

  it("marks a µS/cm-sized reservoir EC invalid", () => {
    const q = evaluate(1400);
    expect(q.quality).toBe("invalid");
    expect(q.invalidFields).toContain("reservoir_ec_mscm");
  });
});
