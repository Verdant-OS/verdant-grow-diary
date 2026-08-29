/**
 * quickLogSensorSnapshotViewModelAdapter — provenance fail-closed tests
 * (issue #1003).
 *
 * Safety contract under test:
 *  - Unknown / non-allowlisted provider strings NEVER normalize to
 *    canonical "live", regardless of freshness. Freshness alone must
 *    not upgrade provenance.
 *  - Canonical vocabulary (live | manual | csv | demo | stale | invalid)
 *    passes through labeled correctly; the sanctioned alias table keeps
 *    sim→demo, diary→manual, and the reviewed first-party pi_bridge→live.
 *  - Unknown provenance resolves downstream to an explicit untrusted
 *    state (effectiveSource "invalid") and is never attachable — the
 *    attachment payload can never be stamped source: "live" from a
 *    provider string.
 *  - Adapted output carries only whitelisted fields — never raw_payload,
 *    tokens, or private identifiers.
 */
import { describe, expect, it } from "vitest";
import { adaptQuickLogSensorContextInput } from "@/lib/quickLogSensorSnapshotViewModelAdapter";
import { buildQuickLogSensorSnapshotViewModel } from "@/lib/quickLogSensorSnapshotViewModel";
import {
  EMPTY_SENSOR_SNAPSHOT,
  type SensorSnapshot,
  type SensorSnapshotStatus,
} from "@/lib/latestSensorSnapshotRules";

const CAPTURED_AT = "2026-08-27T10:00:00.000Z";
const NOW = new Date("2026-08-27T10:05:00.000Z");

function snap(partial: Partial<SensorSnapshot> = {}): SensorSnapshot {
  return {
    ...EMPTY_SENSOR_SNAPSHOT,
    sensor_snapshot_id: "s1",
    tent_id: "t1",
    captured_at: CAPTURED_AT,
    age_minutes: 5,
    source: "live",
    confidence: 0.9,
    freshness: "fresh",
    status: "fresh_live" as SensorSnapshotStatus,
    badge_label: "Live • as of 5 min ago • source: live",
    metrics: {
      temp_f: 77,
      humidity_pct: 55,
      vpd_kpa: 1.1,
      soil_moisture_pct: 40,
      co2_ppm: null,
    },
    metricDetails: { ...EMPTY_SENSOR_SNAPSHOT.metricDetails },
    warnings: [],
    usable: true,
    ...partial,
  };
}

function adapt(over: Partial<SensorSnapshot> = {}) {
  return adaptQuickLogSensorContextInput({
    state: { status: "ready", snapshot: snap(over) },
    tentId: "t1",
    plantId: "p1",
  });
}

const UNKNOWN_PROVIDERS = [
  "ecowitt",
  "ecowitt_mqtt",
  "home_assistant",
  "esp32",
  "totally_unknown_vendor",
] as const;

describe("adaptQuickLogSensorContextInput — unknown provenance fails closed (#1003)", () => {
  it("unknown provider + fresh freshness + fresh timestamp never becomes live", () => {
    for (const provider of UNKNOWN_PROVIDERS) {
      const result = adapt({ source: provider, freshness: "fresh" });
      expect(result.snapshot?.source, `provider=${provider}`).not.toBe("live");
      expect(result.snapshot?.source, `provider=${provider}`).toBe("invalid");
      // Provider identity is preserved for diagnostics only.
      expect(result.snapshot?.sourceDetail).toBe(provider);
    }
  });

  it("freshness alone cannot upgrade provenance (stale/invalid/unknown freshness)", () => {
    for (const freshness of ["fresh", "stale", "invalid", "unknown"] as const) {
      const result = adapt({ source: "home_assistant", freshness });
      expect(result.snapshot?.source, `freshness=${freshness}`).toBe("invalid");
    }
    // invalid freshness still sets the explicit invalid flag.
    expect(adapt({ source: "home_assistant", freshness: "invalid" }).snapshot?.invalid).toBe(true);
  });

  it("unknown provider resolves downstream to explicit untrusted state, never attachable", () => {
    const vm = buildQuickLogSensorSnapshotViewModel(
      adapt({ source: "home_assistant", freshness: "fresh" }),
      { now: NOW },
    );
    expect(vm.display?.effectiveSource).toBe("invalid");
    expect(vm.display?.reasonCodes).toContain("invalid_flag");
    expect(vm.isAttachable).toBe(false);
    expect(vm.attachment).toBeNull();
    expect(vm.warning).not.toBeNull();
  });
});

describe("adaptQuickLogSensorContextInput — canonical vocabulary preserved", () => {
  it("every canonical source passes through labeled correctly", () => {
    for (const source of ["live", "manual", "csv", "demo", "stale", "invalid"] as const) {
      const result = adapt({ source });
      expect(result.snapshot?.source).toBe(source);
      expect(result.snapshot?.sourceDetail).toBe(source);
    }
  });

  it("normalizes case and surrounding whitespace on canonical labels", () => {
    expect(adapt({ source: "  Live " }).snapshot?.source).toBe("live");
    expect(adapt({ source: "MANUAL" }).snapshot?.source).toBe("manual");
    // Discriminating case: with stale freshness the old code mapped a
    // padded label through the unknown branch to "stale"; normalization
    // must recognize the canonical label regardless of freshness.
    expect(adapt({ source: "  Live ", freshness: "stale" }).snapshot?.source).toBe("live");
  });

  it("maps sim→demo and diary→manual", () => {
    expect(adapt({ source: "sim" }).snapshot?.source).toBe("demo");
    expect(adapt({ source: "diary" }).snapshot?.source).toBe("manual");
  });

  it("keeps the reviewed first-party pi_bridge alias as live (no over-demotion)", () => {
    // pi_bridge is the one active production ingest path that stores a
    // provider string; sensorSourceRules / sensorLiveMembership sanction
    // it as trust-live. The fail-close must not demote it.
    const result = adapt({ source: "pi_bridge", freshness: "fresh" });
    expect(result.snapshot?.source).toBe("live");
    expect(result.snapshot?.sourceDetail).toBe("pi_bridge");
  });

  it("null/empty source stays null and does not invent live", () => {
    expect(adapt({ source: null }).snapshot?.source).toBeNull();
    expect(adapt({ source: "" }).snapshot?.source).toBeNull();
  });

  it("canonical live + fresh capture remains attachable as live (no over-demotion)", () => {
    const vm = buildQuickLogSensorSnapshotViewModel(adapt({ source: "live" }), { now: NOW });
    expect(vm.display?.effectiveSource).toBe("live");
    expect(vm.isAttachable).toBe(true);
    expect(vm.attachment?.source).toBe("live");
  });
});

describe("adaptQuickLogSensorContextInput — output safety", () => {
  it("adapted output carries only whitelisted snapshot fields", () => {
    const result = adapt();
    expect(Object.keys(result).sort()).toEqual(["plantId", "snapshot", "tentId"]);
    expect(Object.keys(result.snapshot ?? {}).sort()).toEqual([
      "capturedAt",
      "confidence",
      "invalid",
      "metrics",
      "source",
      "sourceDetail",
    ]);
  });

  it("adversarial extra fields on the upstream snapshot never reach the output", () => {
    const tainted = snap() as SensorSnapshot & Record<string, unknown>;
    tainted.raw_payload = { PASSKEY: "d41d8cd98f00b204e9800998ecf8427e" };
    tainted.bridge_token = "vbt_secret_token_value_123456";
    const result = adaptQuickLogSensorContextInput({
      state: { status: "ready", snapshot: tainted },
      tentId: "t1",
    });
    const json = JSON.stringify(result);
    expect(json).not.toContain("raw_payload");
    expect(json).not.toContain("PASSKEY");
    expect(json).not.toContain("d41d8cd98f00b204e9800998ecf8427e");
    expect(json).not.toContain("vbt_secret_token_value_123456");
  });

  it("is deterministic for identical inputs", () => {
    expect(adapt({ source: "home_assistant", freshness: "fresh" })).toEqual(
      adapt({ source: "home_assistant", freshness: "fresh" }),
    );
  });
});
