/**
 * One-Tent Loop Proof View Model — unit tests.
 *
 * Asserts deterministic, safe, presenter-ready data:
 *   - 9 loop steps in exact order
 *   - Live sensor validation is reported as blocked in blocked_summary
 *   - No step claims live data is ready
 *   - Action Queue step includes an approval-required safety note
 *   - Deterministic for the same `now`
 *   - Generated timestamp uses the injected `now`
 *   - No fake-live language anywhere in the view model
 */
import { describe, it, expect } from "vitest";
import {
  buildOneTentLoopProofViewModel,
  ONE_TENT_LOOP_PROOF_STEP_IDS,
} from "@/lib/oneTentLoopProofViewModel";

const EXPECTED_ORDER = [
  "grow",
  "tent",
  "plant",
  "quick-log",
  "timeline",
  "sensor-snapshot",
  "ai-doctor",
  "alert",
  "approval-required-action-queue",
];

const EXPECTED_LABELS = [
  "Grow",
  "Tent",
  "Plant",
  "Quick Log",
  "Timeline",
  "Sensor Snapshot",
  "AI Doctor",
  "Alert",
  "Approval-Required Action Queue",
];

const FORBIDDEN_COPY = [
  "execute",
  "run command",
  "send command",
  "control device",
  "turn on",
  "turn off",
  "set fan",
  "set light",
  "dose",
  "flush immediately",
  "guaranteed",
  "definitely",
  "certainly",
];

describe("buildOneTentLoopProofViewModel", () => {
  it("returns all 9 loop steps in exact order", () => {
    const vm = buildOneTentLoopProofViewModel();
    expect(vm.steps.length).toBe(9);
    expect(vm.steps.map((s) => s.id)).toEqual(EXPECTED_ORDER);
    expect(vm.steps.map((s) => s.label)).toEqual(EXPECTED_LABELS);
    expect([...ONE_TENT_LOOP_PROOF_STEP_IDS]).toEqual(EXPECTED_ORDER);
  });

  it("uses conservative status labels for each step", () => {
    const vm = buildOneTentLoopProofViewModel();
    const byId = Object.fromEntries(vm.steps.map((s) => [s.id, s.status]));
    expect(byId["grow"]).toBe("ready");
    expect(byId["tent"]).toBe("ready");
    expect(byId["plant"]).toBe("ready");
    expect(byId["quick-log"]).toBe("ready");
    expect(byId["timeline"]).toBe("ready");
    expect(byId["sensor-snapshot"]).toBe("partial");
    expect(byId["ai-doctor"]).toBe("partial");
    expect(byId["alert"]).toBe("partial");
    expect(byId["approval-required-action-queue"]).toBe("partial");
  });

  it("reports live sensor validation as blocked in blocked_summary", () => {
    const vm = buildOneTentLoopProofViewModel();
    const joined = vm.blocked_summary.join(" ").toLowerCase();
    expect(joined).toMatch(/live-data validation is blocked/);
    expect(joined).toMatch(/ecowitt|mqtt/);
    expect(joined).toMatch(/actual tent readings/);
    expect(joined).toMatch(/grower.*physically able to verify/);
    expect(joined).toMatch(/ghost.*default.*demo numbers/);
  });

  it("no step marks live sensor data as ready", () => {
    const vm = buildOneTentLoopProofViewModel();
    const sensor = vm.steps.find((s) => s.id === "sensor-snapshot")!;
    expect(sensor.status).not.toBe("ready");
    // No step text claims "live data is ready" or "live sensor data verified"
    for (const s of vm.steps) {
      const text = [
        ...s.evidence,
        ...s.missing_pieces,
        ...s.safety_notes,
        s.next_fix,
      ]
        .join(" ")
        .toLowerCase();
      expect(text).not.toMatch(/live (sensor )?data (is )?(ready|verified|proven)/);
      expect(text).not.toMatch(/end-to-end live (sensor )?(data|proof) (is )?(ready|verified|proven|complete)/);
    }
  });

  it("Action Queue step includes an approval-required safety note", () => {
    const vm = buildOneTentLoopProofViewModel();
    const aq = vm.steps.find((s) => s.id === "approval-required-action-queue")!;
    const safety = aq.safety_notes.join(" ").toLowerCase();
    expect(safety).toMatch(/approval-required/);
    expect(safety).toMatch(/grower decides/);
    expect(safety).toMatch(/no device control/);
    expect(safety).toMatch(/no automation/);
  });

  it("is deterministic for the same `now`", () => {
    const a = buildOneTentLoopProofViewModel("2026-06-09T00:00:00.000Z");
    const b = buildOneTentLoopProofViewModel("2026-06-09T00:00:00.000Z");
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("uses the injected `now` for generated_at (string)", () => {
    const vm = buildOneTentLoopProofViewModel("2026-07-15T12:34:56.000Z");
    expect(vm.generated_at).toBe("2026-07-15T12:34:56.000Z");
  });

  it("uses the injected `now` for generated_at (Date)", () => {
    const vm = buildOneTentLoopProofViewModel(
      new Date("2026-07-15T12:34:56.000Z"),
    );
    expect(vm.generated_at).toBe("2026-07-15T12:34:56.000Z");
  });

  it("falls back to a stable default when `now` is omitted or invalid", () => {
    const a = buildOneTentLoopProofViewModel();
    const b = buildOneTentLoopProofViewModel(new Date("not-a-date"));
    const c = buildOneTentLoopProofViewModel("not-a-date");
    expect(a.generated_at).toBe(b.generated_at);
    expect(a.generated_at).toBe(c.generated_at);
  });

  it("includes required badges (read-only / no-live / no-write / no-model / no-device)", () => {
    const vm = buildOneTentLoopProofViewModel();
    const text = vm.badges.join(" | ");
    expect(text).toMatch(/Internal proof checklist/);
    expect(text).toMatch(/Read-only/);
    expect(text).toMatch(/No live data queries/);
    expect(text).toMatch(/No database writes/);
    expect(text).toMatch(/No model calls/);
    expect(text).toMatch(/No device control/);
  });

  it("includes static safety summary items", () => {
    const vm = buildOneTentLoopProofViewModel();
    const joined = vm.safety_summary.join(" ").toLowerCase();
    expect(joined).toMatch(/demo.*manual.*live.*stale.*invalid/);
    expect(joined).toMatch(/not.*classified as healthy/);
    expect(joined).toMatch(/ai doctor must stay cautious/);
    expect(joined).toMatch(/alerts must not create action queue items automatically/);
    expect(joined).toMatch(/approval-required/);
    expect(joined).toMatch(/no blind automation/);
  });

  it("subtitle documents what the page does NOT do", () => {
    const vm = buildOneTentLoopProofViewModel();
    const s = vm.subtitle.toLowerCase();
    expect(s).toMatch(/does not validate live sensor data/);
    expect(s).toMatch(/does not.*run ai diagnosis/);
    expect(s).toMatch(/does not.*create alerts/);
    expect(s).toMatch(/does not.*create action queue items/);
    expect(s).toMatch(/does not.*execute actions/);
  });

  it("no view model text uses fake-live or overconfident language", () => {
    const vm = buildOneTentLoopProofViewModel();
    const blob = JSON.stringify(vm).toLowerCase();
    for (const forbidden of FORBIDDEN_COPY) {
      expect(blob.includes(forbidden)).toBe(false);
    }
  });

  it("step arrays are present (possibly empty) and stable", () => {
    const vm = buildOneTentLoopProofViewModel();
    for (const s of vm.steps) {
      expect(Array.isArray(s.evidence)).toBe(true);
      expect(Array.isArray(s.missing_pieces)).toBe(true);
      expect(Array.isArray(s.safety_notes)).toBe(true);
      expect(typeof s.next_fix).toBe("string");
    }
  });
});
