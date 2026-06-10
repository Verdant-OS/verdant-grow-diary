/**
 * AI Doctor Confidence Audit — View Model Tests.
 */
import { describe, it, expect } from "vitest";
import {
  buildAiDoctorConfidenceAuditViewModel,
  AI_DOCTOR_CONFIDENCE_RULE_IDS,
} from "@/lib/aiDoctorConfidenceAuditViewModel";

describe("aiDoctorConfidenceAuditViewModel", () => {
  it("returns rules in expected deterministic order", () => {
    const vm = buildAiDoctorConfidenceAuditViewModel();
    expect(vm.rules.map((r) => r.id)).toEqual(AI_DOCTOR_CONFIDENCE_RULE_IDS);
  });

  it("includes all required hard caps with documented max scores", () => {
    const vm = buildAiDoctorConfidenceAuditViewModel();
    const caps = Object.fromEntries(
      vm.hard_caps.map((c) => [c.id, c.max_score]),
    );
    expect(caps["no-trustworthy-sensors-no-events"]).toBe(35);
    expect(caps["stale-or-invalid-only"]).toBe(30);
    expect(caps["demo-or-csv-only"]).toBe(40);
    expect(caps["major-missing-information"]).toBe(45);
    expect(caps["poor-visual-quality-weak-context"]).toBe(35);
  });

  it("documents the high-confidence quartet (all four requirements)", () => {
    const vm = buildAiDoctorConfidenceAuditViewModel();
    expect(vm.high_confidence_requirements.length).toBe(4);
    const blob = vm.high_confidence_requirements.join(" | ").toLowerCase();
    expect(blob).toMatch(/sensor/);
    expect(blob).toMatch(/grow events|recent.*events/);
    expect(blob).toMatch(/visual|closeup/);
    expect(blob).toMatch(/missing information/);
  });

  it("includes all required safety flags", () => {
    const vm = buildAiDoctorConfidenceAuditViewModel();
    const required = [
      "weak_context",
      "no_trustworthy_sensor_data",
      "no_recent_grow_events",
      "demo_or_csv_only",
      "stale_or_invalid_readings_present",
      "poor_visual_quality",
      "major_missing_information",
      "avoid_overdiagnosis",
    ];
    for (const flag of required) {
      expect(vm.safety_flags).toContain(flag);
    }
  });

  it("documents that demo/CSV never increase confidence", () => {
    const vm = buildAiDoctorConfidenceAuditViewModel();
    const demoRule = vm.rules.find(
      (r) => r.id === "demo-only-or-csv-only-context",
    );
    expect(demoRule).toBeDefined();
    expect(demoRule!.hard_cap).toBe(40);
    const note = vm.source_quality_notes.join(" ").toLowerCase();
    expect(note).toMatch(/demo data must never raise confidence/);
    expect(note).toMatch(/csv.*historical/);
  });

  it("documents that stale/invalid lowers confidence and is never healthy", () => {
    const vm = buildAiDoctorConfidenceAuditViewModel();
    const staleOnly = vm.rules.find(
      (r) => r.id === "stale-only-or-invalid-only-context",
    );
    expect(staleOnly!.hard_cap).toBe(30);
    const mixed = vm.rules.find(
      (r) => r.id === "stale-or-invalid-alongside-other-data",
    );
    expect(mixed).toBeDefined();
    const sourceNotes = vm.source_quality_notes.join(" ").toLowerCase();
    expect(sourceNotes).toMatch(/never read as healthy/);
  });

  it("is deterministic for the same `now` input", () => {
    const a = buildAiDoctorConfidenceAuditViewModel("2026-01-01T00:00:00.000Z");
    const b = buildAiDoctorConfidenceAuditViewModel("2026-01-01T00:00:00.000Z");
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it("uses the injected `now` for generated_at", () => {
    const vm = buildAiDoctorConfidenceAuditViewModel(
      "2027-03-15T12:34:56.000Z",
    );
    expect(vm.generated_at).toBe("2027-03-15T12:34:56.000Z");
  });

  it("falls back to a stable default when no `now` is provided", () => {
    const vm = buildAiDoctorConfidenceAuditViewModel();
    expect(typeof vm.generated_at).toBe("string");
    expect(vm.generated_at.length).toBeGreaterThan(0);
  });

  it("accepts a Date object for `now`", () => {
    const d = new Date("2028-05-05T05:05:05.000Z");
    const vm = buildAiDoctorConfidenceAuditViewModel(d);
    expect(vm.generated_at).toBe("2028-05-05T05:05:05.000Z");
  });

  it("output is frozen", () => {
    const vm = buildAiDoctorConfidenceAuditViewModel();
    expect(Object.isFrozen(vm)).toBe(true);
    expect(Object.isFrozen(vm.rules)).toBe(true);
    expect(Object.isFrozen(vm.hard_caps)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Scenario tests
  // -------------------------------------------------------------------------
  it("includes 6 scenarios in deterministic order", () => {
    const vm = buildAiDoctorConfidenceAuditViewModel();
    expect(vm.scenarios.length).toBe(6);
    expect(vm.scenarios.map((s) => s.id)).toEqual([
      "demo-csv-only",
      "stale-invalid-only",
      "major-missing-information",
      "poor-visual-weak-context",
      "no-trustworthy-no-events",
      "conflicting-weak-signals",
    ]);
  });

  it("demo-csv-only scenario has cap 40 and expected flags", () => {
    const vm = buildAiDoctorConfidenceAuditViewModel();
    const s = vm.scenarios.find((x) => x.id === "demo-csv-only");
    expect(s).toBeDefined();
    expect(s!.confidence_ceiling).toBe(40);
    expect(s!.applies_safety_flags).toContain("demo_or_csv_only");
    expect(s!.applies_safety_flags).toContain("weak_context");
    expect(s!.applies_safety_flags).toContain("avoid_overdiagnosis");
  });

  it("stale-invalid-only scenario has cap 30 and expected flags", () => {
    const vm = buildAiDoctorConfidenceAuditViewModel();
    const s = vm.scenarios.find((x) => x.id === "stale-invalid-only");
    expect(s).toBeDefined();
    expect(s!.confidence_ceiling).toBe(30);
    expect(s!.applies_safety_flags).toContain("stale_or_invalid_readings_present");
    expect(s!.applies_safety_flags).toContain("no_trustworthy_sensor_data");
  });

  it("major-missing-information scenario has cap 45", () => {
    const vm = buildAiDoctorConfidenceAuditViewModel();
    const s = vm.scenarios.find((x) => x.id === "major-missing-information");
    expect(s).toBeDefined();
    expect(s!.confidence_ceiling).toBe(45);
    expect(s!.applies_safety_flags).toContain("major_missing_information");
  });

  it("poor-visual-weak-context scenario has cap 35", () => {
    const vm = buildAiDoctorConfidenceAuditViewModel();
    const s = vm.scenarios.find((x) => x.id === "poor-visual-weak-context");
    expect(s).toBeDefined();
    expect(s!.confidence_ceiling).toBe(35);
    expect(s!.applies_safety_flags).toContain("poor_visual_quality");
  });

  it("no-trustworthy-no-events scenario has cap 35", () => {
    const vm = buildAiDoctorConfidenceAuditViewModel();
    const s = vm.scenarios.find((x) => x.id === "no-trustworthy-no-events");
    expect(s).toBeDefined();
    expect(s!.confidence_ceiling).toBe(35);
    expect(s!.applies_safety_flags).toContain("no_trustworthy_sensor_data");
    expect(s!.applies_safety_flags).toContain("no_recent_grow_events");
  });

  it("conflicting-weak-signals scenario does not imply certainty", () => {
    const vm = buildAiDoctorConfidenceAuditViewModel();
    const s = vm.scenarios.find((x) => x.id === "conflicting-weak-signals");
    expect(s).toBeDefined();
    expect(s!.confidence_ceiling).toBe(-1);
    expect(s!.applies_safety_flags).toContain("weak_context");
    expect(s!.applies_safety_flags).toContain("avoid_overdiagnosis");
    const takeaway = s!.operator_takeaway.toLowerCase();
    expect(takeaway).toMatch(/not a single certain diagnosis/);
  });

  it("scenarios are frozen", () => {
    const vm = buildAiDoctorConfidenceAuditViewModel();
    expect(Object.isFrozen(vm.scenarios)).toBe(true);
    for (const s of vm.scenarios) {
      expect(Object.isFrozen(s)).toBe(true);
    }
  });
});
