import { describe, it, expect } from "vitest";
import {
  validateAndResolveBridgeIntake,
  type BridgeIntakePayload,
  BRIDGE_LIVE_FRESH_MS,
  BRIDGE_MANUAL_FRESH_MS,
} from "@/lib/sensorBridgeIntakeRules";

const TENT = "11111111-1111-1111-1111-111111111111";
const PLANT = "22222222-2222-2222-2222-222222222222";
const NOW = Date.parse("2026-06-02T12:00:00.000Z");

function payload(
  overrides: Partial<BridgeIntakePayload> = {},
): BridgeIntakePayload {
  return {
    tent_id: TENT,
    plant_id: PLANT,
    submitted_source: "live",
    captured_at: new Date(NOW - 60_000).toISOString(),
    confidence: 0.9,
    authenticated: true,
    readings: [
      { metric: "temperature_c", value: 24.5, unit: "C" },
      { metric: "humidity_pct", value: 55, unit: "%" },
    ],
    ...overrides,
  };
}

describe("validateAndResolveBridgeIntake — happy path", () => {
  it("normalizes a valid authenticated live payload", () => {
    const r = validateAndResolveBridgeIntake(payload(), { now: NOW });
    expect(r.ok).toBe(true);
    expect(r.resolved_source).toBe("live");
    expect(r.readings).toHaveLength(2);
    expect(r.tent_id).toBe(TENT);
    expect(r.plant_id).toBe(PLANT);
    expect(r.captured_at).toBeTruthy();
    expect(r.confidence).toBeGreaterThan(0.5);
  });
});

describe("validateAndResolveBridgeIntake — structural rejection", () => {
  it("rejects missing payload", () => {
    const r = validateAndResolveBridgeIntake(null, { now: NOW });
    expect(r.ok).toBe(false);
    expect(r.resolved_source).toBe("invalid");
    expect(r.reasons).toContain("payload_missing");
  });

  it("rejects missing tent_id", () => {
    const r = validateAndResolveBridgeIntake(
      payload({ tent_id: undefined }),
      { now: NOW },
    );
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("tent_id_missing");
  });

  it("rejects missing captured_at", () => {
    const r = validateAndResolveBridgeIntake(
      payload({ captured_at: undefined }),
      { now: NOW },
    );
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("captured_at_missing");
  });

  it("rejects unparseable captured_at", () => {
    const r = validateAndResolveBridgeIntake(
      payload({ captured_at: "not-a-date" }),
      { now: NOW },
    );
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("captured_at_invalid");
  });

  it("rejects empty readings list", () => {
    const r = validateAndResolveBridgeIntake(
      payload({ readings: [] }),
      { now: NOW },
    );
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("readings_empty");
  });
});

describe("validateAndResolveBridgeIntake — freshness downgrades", () => {
  it("downgrades stale live reading to stale", () => {
    const r = validateAndResolveBridgeIntake(
      payload({
        captured_at: new Date(NOW - BRIDGE_LIVE_FRESH_MS - 60_000).toISOString(),
      }),
      { now: NOW },
    );
    expect(r.resolved_source).toBe("stale");
    expect(r.reasons).toContain("stale_for_live");
    expect(r.suspicions).toContain("downgraded_live_to_stale");
  });

  it("downgrades stale manual reading to stale", () => {
    const r = validateAndResolveBridgeIntake(
      payload({
        submitted_source: "manual",
        captured_at: new Date(
          NOW - BRIDGE_MANUAL_FRESH_MS - 60_000,
        ).toISOString(),
      }),
      { now: NOW },
    );
    expect(r.resolved_source).toBe("stale");
    expect(r.reasons).toContain("stale_for_manual");
  });

  it("preserves manual within window", () => {
    const r = validateAndResolveBridgeIntake(
      payload({
        submitted_source: "manual",
        captured_at: new Date(NOW - 60_000).toISOString(),
      }),
      { now: NOW },
    );
    expect(r.resolved_source).toBe("manual");
  });
});

describe("validateAndResolveBridgeIntake — authentication gating", () => {
  it("downgrades unauthenticated live claim to stale", () => {
    const r = validateAndResolveBridgeIntake(
      payload({ authenticated: false }),
      { now: NOW },
    );
    expect(r.resolved_source).toBe("stale");
    expect(r.reasons).toContain("unauthenticated_live_claim");
    expect(r.suspicions).toContain("downgraded_live_unauthenticated");
  });

  it("unknown submitted source is never healthy", () => {
    const r = validateAndResolveBridgeIntake(
      payload({ submitted_source: "anything" }),
      { now: NOW },
    );
    expect(r.resolved_source).toBe("invalid");
    expect(r.ok).toBe(false);
  });

  it("demo source stays demo even when authenticated and fresh", () => {
    const r = validateAndResolveBridgeIntake(
      payload({ submitted_source: "demo" }),
      { now: NOW },
    );
    expect(r.resolved_source).toBe("demo");
  });

  it("csv source stays csv", () => {
    const r = validateAndResolveBridgeIntake(
      payload({ submitted_source: "csv" }),
      { now: NOW },
    );
    expect(r.resolved_source).toBe("csv");
  });
});

describe("validateAndResolveBridgeIntake — suspicious telemetry", () => {
  it("flags Celsius value that looks like Fahrenheit", () => {
    const r = validateAndResolveBridgeIntake(
      payload({
        readings: [{ metric: "temperature_c", value: 78, unit: "F" }],
      }),
      { now: NOW },
    );
    expect(r.suspicions).toContain("temp_c_suspected_fahrenheit");
    // live + per-reading suspicion → downgraded to stale
    expect(r.resolved_source).toBe("stale");
  });

  it("flags µS/cm submitted as mS/cm by magnitude", () => {
    const r = validateAndResolveBridgeIntake(
      payload({
        readings: [{ metric: "ec", value: 1200 }],
      }),
      { now: NOW },
    );
    expect(r.suspicions).toContain("ec_suspected_us_per_cm");
  });

  it("rejects humidity outside 0..100 as invalid reading", () => {
    const r = validateAndResolveBridgeIntake(
      payload({
        readings: [{ metric: "humidity_pct", value: 150 }],
      }),
      { now: NOW },
    );
    expect(r.reasons).toContain("humidity_out_of_range");
    expect(r.readings).toHaveLength(0);
  });

  it("flags humidity stuck at 100", () => {
    const r = validateAndResolveBridgeIntake(
      payload({
        readings: [{ metric: "humidity_pct", value: 100 }],
      }),
      { now: NOW },
    );
    expect(r.suspicions).toContain("humidity_stuck_extreme");
    expect(r.resolved_source).toBe("stale");
  });

  it("flags soil moisture stuck at 0", () => {
    const r = validateAndResolveBridgeIntake(
      payload({
        readings: [{ metric: "soil_moisture_pct", value: 0 }],
      }),
      { now: NOW },
    );
    expect(r.suspicions).toContain("soil_moisture_stuck_extreme");
  });

  it("flags pH outside realistic 4.5..8.5", () => {
    const r = validateAndResolveBridgeIntake(
      payload({
        readings: [{ metric: "ph", value: 3.2 }],
      }),
      { now: NOW },
    );
    expect(r.suspicions).toContain("ph_outside_realistic");
  });

  it("rejects pH outside physical 0..14 as invalid reading", () => {
    const r = validateAndResolveBridgeIntake(
      payload({
        readings: [{ metric: "ph", value: 99 }],
      }),
      { now: NOW },
    );
    expect(r.reasons).toContain("ph_out_of_realistic_range");
    expect(r.readings).toHaveLength(0);
  });
});

describe("validateAndResolveBridgeIntake — safety properties", () => {
  it("never returns raw payload bytes in reasons", () => {
    const r = validateAndResolveBridgeIntake(
      payload({
        readings: [{ metric: "humidity_pct", value: 999 }],
      }),
      { now: NOW },
    );
    for (const code of r.reasons) {
      expect(typeof code).toBe("string");
      // codes are short snake_case, never full payloads
      expect(code.length).toBeLessThanOrEqual(40);
      expect(code).not.toContain("999");
    }
  });

  it("never classifies unknown telemetry as healthy/live", () => {
    const r = validateAndResolveBridgeIntake(
      payload({ submitted_source: "unknown" }),
      { now: NOW },
    );
    expect(r.resolved_source).not.toBe("live");
  });

  it("never marks a payload with rejected reading as fully healthy live", () => {
    const r = validateAndResolveBridgeIntake(
      payload({
        readings: [
          { metric: "temperature_c", value: 24, unit: "C" },
          { metric: "humidity_pct", value: 200 },
        ],
      }),
      { now: NOW },
    );
    // one valid reading remains, but per-reading rejection should surface
    expect(r.reasons).toContain("humidity_out_of_range");
  });
});
