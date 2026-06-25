/**
 * EcoWitt Live Bring-Up view model — pure deterministic tests.
 */
import { describe, it, expect } from "vitest";
import {
  buildEcowittLiveBringupViewModel,
  ECOWITT_BRINGUP_STEP_IDS,
  ECOWITT_BRINGUP_COMMAND_IDS,
  ECOWITT_BRINGUP_EVIDENCE_IDS,
  ECOWITT_BRINGUP_GO_NO_GO_IDS,
} from "@/lib/ecowittLiveBringupViewModel";

const EXPECTED_STEPS = [
  "mosquitto-running",
  "ecowitt-app-diy",
  "listener-reachable",
  "mqtt-subscribe",
  "local-valid-payload",
  "local-invalid-payload",
  "backend-accept-reject",
  "controller-vs-backend",
  "go-no-go",
];

const EXPECTED_COMMANDS = [
  "mosquitto-verbose",
  "mqtt-subscribe",
  "local-sender-valid",
  "local-sender-invalid",
  "edge-function-serve",
  "health-check",
];

const REQUIRED_EVIDENCE = [
  "ecowitt-app-temperature",
  "ecowitt-app-humidity",
  "mqtt-raw-timestamp",
  "mqtt-raw-values",
  "normalized-payload",
  "accept-reject-result",
  "stored-source-label",
  "backend-captured-at",
  "backend-confidence",
  "tent-id-present",
];

describe("buildEcowittLiveBringupViewModel — structure and determinism", () => {
  it("returns checklist steps in the exact required order", () => {
    expect([...ECOWITT_BRINGUP_STEP_IDS]).toEqual(EXPECTED_STEPS);
  });

  it("default overall status is blocked", () => {
    const vm = buildEcowittLiveBringupViewModel();
    expect(vm.overall_status).toBe("blocked");
  });

  it("step 8 requires real device comparison evidence", () => {
    const vm = buildEcowittLiveBringupViewModel();
    const step = vm.steps[7];
    expect(step.id).toBe("controller-vs-backend");
    expect(step.operator_action.toLowerCase()).toMatch(/controller/);
    expect(step.expected_evidence.toLowerCase()).toMatch(
      /controller|app/,
    );
    expect(step.blocked_if.toLowerCase()).toMatch(/physically|controller|app/);
  });

  it("GO/NO-GO rules include all four statuses", () => {
    const vm = buildEcowittLiveBringupViewModel();
    const statuses = vm.go_no_go_rules.map((r) => r.status).sort();
    expect(statuses).toEqual(["blocked", "mismatch", "partial", "ready"]);
    expect([...ECOWITT_BRINGUP_GO_NO_GO_IDS].sort()).toEqual(
      ["blocked", "mismatch", "partial", "ready"],
    );
  });

  it("commands include mosquitto, subscribe, valid/invalid senders, edge serve, health check", () => {
    expect([...ECOWITT_BRINGUP_COMMAND_IDS].sort()).toEqual(
      [...EXPECTED_COMMANDS].sort(),
    );
  });

  it("commands do not include secrets, tokens, env values, or service role keys", () => {
    const vm = buildEcowittLiveBringupViewModel();
    for (const c of vm.commands) {
      const text = `${c.command} ${c.safety_note} ${c.purpose}`;
      expect(text).not.toMatch(/service_role/i);
      expect(text).not.toMatch(/OPENAI_API_KEY/);
      expect(text).not.toMatch(/VITE_/);
      expect(text).not.toMatch(/process\.env/);
      expect(text).not.toMatch(/bearer\s+[A-Za-z0-9]/i);
      expect(text).not.toMatch(/sk-[A-Za-z0-9]/);
      expect(text).not.toMatch(/bridge[-_ ]?token/i);
    }
  });

  it("evidence fields include source, captured_at, confidence, tent_id, payload evidence", () => {
    for (const id of REQUIRED_EVIDENCE) {
      expect(ECOWITT_BRINGUP_EVIDENCE_IDS).toContain(id);
    }
    const vm = buildEcowittLiveBringupViewModel();
    const required = vm.evidence_fields.filter((e) => e.required_for_ready);
    expect(required.length).toBeGreaterThanOrEqual(REQUIRED_EVIDENCE.length);
  });

  it("evidence fields include plant_id when relevant (optional, not required for ready)", () => {
    const vm = buildEcowittLiveBringupViewModel();
    const plant = vm.evidence_fields.find((e) => e.id === "plant-id-present");
    expect(plant).toBeDefined();
    expect(plant?.required_for_ready).toBe(false);
  });

  it("source truth warnings prevent fake-live claims", () => {
    const vm = buildEcowittLiveBringupViewModel();
    const joined = vm.source_truth_warnings.join(" ").toLowerCase();
    expect(joined).toMatch(/not call data live/);
    expect(joined).toMatch(/local sender/);
    expect(joined).toMatch(/stale/);
    expect(joined).toMatch(/invalid/);
    expect(joined).toMatch(/celsius|fahrenheit/);
    expect(joined).toMatch(/grower approval/);
  });

  it("produces deterministic output for the same now", () => {
    const a = buildEcowittLiveBringupViewModel("2026-06-09T22:00:00Z");
    const b = buildEcowittLiveBringupViewModel("2026-06-09T22:00:00Z");
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("uses the injected now for generated_at", () => {
    const vm = buildEcowittLiveBringupViewModel("2026-06-09T22:00:00Z");
    expect(vm.generated_at).toBe("2026-06-09T22:00:00Z");
    const vm2 = buildEcowittLiveBringupViewModel(
      new Date("2026-06-09T22:00:00Z"),
    );
    expect(vm2.generated_at).toBe("2026-06-09T22:00:00.000Z");
  });

  it("defaults generated_at to a stable sentinel when no now is provided", () => {
    const vm = buildEcowittLiveBringupViewModel();
    expect(vm.generated_at).toBe("static");
  });

  it("output is frozen", () => {
    const vm = buildEcowittLiveBringupViewModel();
    expect(Object.isFrozen(vm)).toBe(true);
  });
});
