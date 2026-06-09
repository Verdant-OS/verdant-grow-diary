/**
 * Sensor Truth Audit — View Model Tests.
 */
import { describe, it, expect } from "vitest";
import {
  buildSensorTruthAuditViewModel,
  SENSOR_TRUTH_SOURCE_LABEL_ORDER,
  SENSOR_TRUTH_SUSPICIOUS_CHECK_IDS,
  type SensorTruthAuditViewModel,
} from "@/lib/sensorTruthAuditViewModel";

describe("sensorTruthAuditViewModel", () => {
  it("returns all six source labels in exact order", () => {
    const vm = buildSensorTruthAuditViewModel();
    const labels = vm.source_rules.map((r) => r.label);
    expect(labels).toEqual(["live", "manual", "csv", "demo", "stale", "invalid"]);
    expect(labels).toEqual(SENSOR_TRUTH_SOURCE_LABEL_ORDER);
  });

  it("source rules explain live correctly", () => {
    const vm = buildSensorTruthAuditViewModel();
    const live = vm.source_rules.find((r) => r.label === "live");
    expect(live).toBeDefined();
    expect(live!.meaning.toLowerCase()).toContain("real");
    expect(live!.allowed_use.toLowerCase()).toContain("full context");
  });

  it("source rules explain manual correctly", () => {
    const vm = buildSensorTruthAuditViewModel();
    const manual = vm.source_rules.find((r) => r.label === "manual");
    expect(manual).toBeDefined();
    expect(manual!.meaning.toLowerCase()).toContain("grower-entered");
  });

  it("source rules explain csv correctly", () => {
    const vm = buildSensorTruthAuditViewModel();
    const csv = vm.source_rules.find((r) => r.label === "csv");
    expect(csv).toBeDefined();
    expect(csv!.meaning.toLowerCase()).toContain("imported");
  });

  it("source rules explain demo correctly", () => {
    const vm = buildSensorTruthAuditViewModel();
    const demo = vm.source_rules.find((r) => r.label === "demo");
    expect(demo).toBeDefined();
    expect(demo!.meaning.toLowerCase()).toContain("sample");
  });

  it("source rules explain stale correctly", () => {
    const vm = buildSensorTruthAuditViewModel();
    const stale = vm.source_rules.find((r) => r.label === "stale");
    expect(stale).toBeDefined();
    expect(stale!.meaning.toLowerCase()).toContain("old");
  });

  it("source rules explain invalid correctly", () => {
    const vm = buildSensorTruthAuditViewModel();
    const invalid = vm.source_rules.find((r) => r.label === "invalid");
    expect(invalid).toBeDefined();
    expect(invalid!.meaning.toLowerCase()).toContain("malformed");
  });

  it("demo is never described as live", () => {
    const vm = buildSensorTruthAuditViewModel();
    const demo = vm.source_rules.find((r) => r.label === "demo");
    expect(demo).toBeDefined();
    expect(demo!.meaning.toLowerCase()).not.toContain("live");
    expect(demo!.safety_notes.toLowerCase()).not.toContain("live");
    expect(demo!.allowed_use.toLowerCase()).not.toContain("live");
  });

  it("csv is never described as live", () => {
    const vm = buildSensorTruthAuditViewModel();
    const csv = vm.source_rules.find((r) => r.label === "csv");
    expect(csv).toBeDefined();
    expect(csv!.meaning.toLowerCase()).not.toContain("live");
    expect(csv!.safety_notes.toLowerCase()).not.toContain("live");
  });

  it("stale is never described as current", () => {
    const vm = buildSensorTruthAuditViewModel();
    const stale = vm.source_rules.find((r) => r.label === "stale");
    expect(stale).toBeDefined();
    expect(stale!.meaning.toLowerCase()).not.toContain("current");
    expect(stale!.safety_notes.toLowerCase()).not.toContain("current");
  });

  it("invalid is never described as healthy", () => {
    const vm = buildSensorTruthAuditViewModel();
    const invalid = vm.source_rules.find((r) => r.label === "invalid");
    expect(invalid).toBeDefined();
    expect(invalid!.meaning.toLowerCase()).not.toContain("healthy");
    expect(invalid!.safety_notes.toLowerCase()).not.toContain("healthy");
  });

  it("includes all suspicious data checks", () => {
    const vm = buildSensorTruthAuditViewModel();
    expect(vm.suspicious_checks.length).toBe(6);
    const ids = vm.suspicious_checks.map((c) => c.id);
    expect(ids).toEqual(SENSOR_TRUTH_SUSPICIOUS_CHECK_IDS);
    expect(ids).toContain("celsius-as-fahrenheit");
    expect(ids).toContain("us-cm-as-ms-cm");
    expect(ids).toContain("humidity-stuck-at-0-or-100");
    expect(ids).toContain("soil-moisture-stuck-at-0-or-100");
    expect(ids).toContain("ph-outside-realistic-range");
    expect(ids).toContain("old-readings-as-current");
  });

  it("each suspicious check has description, why_it_matters, and expected_handling", () => {
    const vm = buildSensorTruthAuditViewModel();
    for (const check of vm.suspicious_checks) {
      expect(check.description.length).toBeGreaterThan(10);
      expect(check.why_it_matters.length).toBeGreaterThan(10);
      expect(check.expected_handling.length).toBeGreaterThan(10);
    }
  });

  it("includes blocked EcoWitt/MQTT live-data note", () => {
    const vm = buildSensorTruthAuditViewModel();
    expect(vm.blocked_live_data_note.toLowerCase()).toContain("ecowitt");
    expect(vm.blocked_live_data_note.toLowerCase()).toContain("mqtt");
    expect(vm.blocked_live_data_note.toLowerCase()).toContain("blocked");
  });

  it("output is deterministic for same now", () => {
    const now = "2026-06-09T12:00:00.000Z";
    const a = buildSensorTruthAuditViewModel(now);
    const b = buildSensorTruthAuditViewModel(now);
    expect(a).toEqual(b);
  });

  it("generated timestamp uses injected now", () => {
    const now = "2026-06-09T12:34:56.789Z";
    const vm = buildSensorTruthAuditViewModel(now);
    expect(vm.generated_at).toBe(now);
  });

  it("generated timestamp falls back to default when now is undefined", () => {
    const vm = buildSensorTruthAuditViewModel();
    expect(vm.generated_at).toBe("2026-06-09T00:00:00.000Z");
  });

  it("generated timestamp falls back to default for invalid string", () => {
    const vm = buildSensorTruthAuditViewModel("not-a-date");
    expect(vm.generated_at).toBe("2026-06-09T00:00:00.000Z");
  });

  it("generated timestamp falls back to default for invalid Date", () => {
    const vm = buildSensorTruthAuditViewModel(new Date("invalid"));
    expect(vm.generated_at).toBe("2026-06-09T00:00:00.000Z");
  });

  it("freezes output when project style supports it", () => {
    const vm = buildSensorTruthAuditViewModel();
    expect(Object.isFrozen(vm)).toBe(true);
    expect(Object.isFrozen(vm.source_rules)).toBe(true);
    expect(Object.isFrozen(vm.suspicious_checks)).toBe(true);
    expect(Object.isFrozen(vm.core_warnings)).toBe(true);
    expect(Object.isFrozen(vm.validation_notes)).toBe(true);
    expect(Object.isFrozen(vm.badges)).toBe(true);
  });

  it("has core warnings covering demo, csv, stale, and invalid", () => {
    const vm = buildSensorTruthAuditViewModel();
    const combined = vm.core_warnings.join(" ").toLowerCase();
    expect(combined).toContain("demo");
    expect(combined).toContain("csv");
    expect(combined).toContain("stale");
    expect(combined).toContain("invalid");
  });

  it("has no empty default arrays", () => {
    const vm = buildSensorTruthAuditViewModel();
    expect(vm.source_rules.length).toBeGreaterThan(0);
    expect(vm.suspicious_checks.length).toBeGreaterThan(0);
    expect(vm.core_warnings.length).toBeGreaterThan(0);
    expect(vm.validation_notes.length).toBeGreaterThan(0);
    expect(vm.badges.length).toBeGreaterThan(0);
  });

  it("title and subtitle are present", () => {
    const vm = buildSensorTruthAuditViewModel();
    expect(vm.title).toBe("Sensor Truth Audit");
    expect(vm.subtitle.length).toBeGreaterThan(20);
    expect(vm.subtitle.toLowerCase()).toContain("internal audit");
  });
});
