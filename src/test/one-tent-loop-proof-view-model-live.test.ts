/**
 * One-Tent Loop Live Proof View Model — tests.
 */
import { describe, it, expect } from "vitest";
import {
  buildOneTentLoopLiveProofView,
  buildOneTentLoopLiveProofTextReport,
  LIVE_PROOF_BANNER,
} from "@/lib/oneTentLoopLiveProofViewModel";
import { LOOP_STEP_IDS, type LoopEvidence } from "@/lib/oneTentLoopProofRules";

const NOW = Date.parse("2026-06-09T12:00:00.000Z");

const EMPTY: LoopEvidence = {
  grow: null,
  tent: null,
  plant: null,
  latest_quick_log: null,
  timeline: null,
  latest_sensor_snapshot: null,
  latest_ai_doctor: null,
  latest_alert: null,
  latest_action_queue: null,
  latest_follow_up: null,
  now_ms: NOW,
};

describe("buildOneTentLoopLiveProofView", () => {
  it("returns rows for all 10 loop steps in order", () => {
    const v = buildOneTentLoopLiveProofView(EMPTY, "2026-06-09T00:00:00.000Z");
    expect(v.steps.map((s) => s.id)).toEqual([...LOOP_STEP_IDS]);
  });

  it("emits stable banner and safety copy", () => {
    const v = buildOneTentLoopLiveProofView(EMPTY);
    expect(v.banner).toBe(LIVE_PROOF_BANNER);
    const j = v.safety_summary.join(" ").toLowerCase();
    expect(j).toMatch(/never shown as healthy/);
    expect(j).toMatch(/approval-required/);
    expect(j).toMatch(/no device command/);
  });

  it("counts empty evidence correctly (no passed rows)", () => {
    const v = buildOneTentLoopLiveProofView(EMPTY);
    expect(v.counts.passed).toBe(0);
    expect(v.counts.missing + v.counts.blocked).toBe(10);
  });

  it("never marks stale/invalid/demo/unknown as healthy", () => {
    const v = buildOneTentLoopLiveProofView({
      ...EMPTY,
      latest_sensor_snapshot: { source: "demo", captured_at: "2026-06-09T11:59:00.000Z" },
    });
    const sensor = v.steps.find((s) => s.id === "sensor-snapshot")!;
    expect(sensor.status).toBe("demo_only");
    expect(JSON.stringify(v).toLowerCase()).not.toMatch(/\bhealthy\b/);
  });

  it("does not leak raw payload or unknown fields", () => {
    const evil = {
      ...EMPTY,
      latest_sensor_snapshot: {
        source: "live" as const,
        captured_at: "2026-06-09T11:55:00.000Z",
        // These fields would be dangerous to echo:
        raw_payload: { secret_token: "TOKEN_LEAK", bridge_key: "BRIDGE_LEAK" },
        service_role: "SRV_LEAK",
      } as unknown as LoopEvidence["latest_sensor_snapshot"],
    };
    const v = buildOneTentLoopLiveProofView(evil, NOW);
    const dump = JSON.stringify(v);
    expect(dump).not.toMatch(/TOKEN_LEAK/);
    expect(dump).not.toMatch(/BRIDGE_LEAK/);
    expect(dump).not.toMatch(/SRV_LEAK/);
    expect(dump).not.toMatch(/service_role/);
    expect(dump).not.toMatch(/raw_payload/);
  });

  it("text report contains all step labels and no forbidden words", () => {
    const v = buildOneTentLoopLiveProofView(EMPTY);
    const text = buildOneTentLoopLiveProofTextReport(v).toLowerCase();
    for (const id of LOOP_STEP_IDS) {
      expect(text.includes(id.replace("-", " ")) || text.includes(id)).toBe(true);
    }
    for (const forbidden of ["healthy", "all good", "no issues detected", "success", "verified"]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("is deterministic for the same input + now", () => {
    const a = buildOneTentLoopLiveProofView(EMPTY, "2026-06-09T00:00:00.000Z");
    const b = buildOneTentLoopLiveProofView(EMPTY, "2026-06-09T00:00:00.000Z");
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
