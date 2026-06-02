import { describe, it, expect } from "vitest";
import { buildBridgeIntakeStatusViewModel } from "@/lib/sensorBridgeIntakeViewModel";
import {
  validateAndResolveBridgeIntake,
  type BridgeIntakePayload,
} from "@/lib/sensorBridgeIntakeRules";

const TENT = "11111111-1111-1111-1111-111111111111";
const NOW = Date.parse("2026-06-02T12:00:00.000Z");

function basePayload(o: Partial<BridgeIntakePayload> = {}): BridgeIntakePayload {
  return {
    tent_id: TENT,
    submitted_source: "live",
    captured_at: new Date(NOW - 60_000).toISOString(),
    authenticated: true,
    confidence: 0.9,
    readings: [{ metric: "humidity_pct", value: 50 }],
    ...o,
  };
}

describe("buildBridgeIntakeStatusViewModel", () => {
  it("returns no-intake state when input is null", () => {
    const vm = buildBridgeIntakeStatusViewModel({ lastResult: null });
    expect(vm.label).toMatch(/no bridge intake/i);
    expect(vm.severity).toBe("info");
    expect(vm.resolvedSource).toBe(null);
    expect(vm.controlDisclosure).toMatch(/no device control/i);
    expect(vm.isAccepted).toBe(false);
  });

  it("renders accepted live with good severity", () => {
    const result = validateAndResolveBridgeIntake(basePayload(), { now: NOW });
    const vm = buildBridgeIntakeStatusViewModel({ lastResult: result });
    expect(vm.isAccepted).toBe(true);
    expect(vm.severity).toBe("good");
    expect(vm.resolvedSource).toBe("live");
    expect(vm.lastAcceptedAtIso).toBeTruthy();
    expect(vm.lastRejectedReasonCode).toBe(null);
    expect(vm.controlDisclosure).toMatch(/no device control/i);
  });

  it("renders rejected payload with a reason code (no raw data)", () => {
    const result = validateAndResolveBridgeIntake(
      basePayload({ captured_at: undefined }),
      { now: NOW },
    );
    const vm = buildBridgeIntakeStatusViewModel({ lastResult: result });
    expect(vm.isAccepted).toBe(false);
    expect(vm.severity).toBe("warning");
    expect(vm.lastRejectedReasonCode).toBeTruthy();
    expect(vm.lastAcceptedAtIso).toBe(null);
  });

  it("renders stale-downgraded reading with watch severity", () => {
    const result = validateAndResolveBridgeIntake(
      basePayload({ authenticated: false }),
      { now: NOW },
    );
    const vm = buildBridgeIntakeStatusViewModel({ lastResult: result });
    expect(vm.resolvedSource).toBe("stale");
    expect(vm.severity).toBe("watch");
  });

  it("demo intake never reports as live", () => {
    const result = validateAndResolveBridgeIntake(
      basePayload({ submitted_source: "demo" }),
      { now: NOW },
    );
    const vm = buildBridgeIntakeStatusViewModel({ lastResult: result });
    expect(vm.resolvedSource).toBe("demo");
    expect(vm.message).not.toMatch(/live/i);
  });
});
