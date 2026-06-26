import { describe, it, expect } from "vitest";
import {
  normalizeGroveBagAirflowObservation,
  getGroveBagAirflowStatus,
  getGroveBagAirflowCopy,
  buildGroveBagAirflowViewModel,
} from "@/lib/groveBagAirflowRules";

describe("normalizeGroveBagAirflowObservation", () => {
  it("normalizes valid airflow values (case/whitespace tolerant)", () => {
    expect(normalizeGroveBagAirflowObservation("gentle_indirect")).toBe("gentle_indirect");
    expect(normalizeGroveBagAirflowObservation(" Stagnant ")).toBe("stagnant");
    expect(normalizeGroveBagAirflowObservation("STRONG_DIRECT")).toBe("strong_direct");
    expect(normalizeGroveBagAirflowObservation("fluctuating")).toBe("fluctuating");
    expect(normalizeGroveBagAirflowObservation("unknown")).toBe("unknown");
  });

  it("falls back to unknown for invalid / missing values", () => {
    expect(normalizeGroveBagAirflowObservation(undefined)).toBe("unknown");
    expect(normalizeGroveBagAirflowObservation(null)).toBe("unknown");
    expect(normalizeGroveBagAirflowObservation("")).toBe("unknown");
    expect(normalizeGroveBagAirflowObservation("hurricane")).toBe("unknown");
    expect(normalizeGroveBagAirflowObservation(42 as unknown)).toBe("unknown");
  });
});

describe("getGroveBagAirflowStatus", () => {
  it("maps observations to expected statuses", () => {
    expect(getGroveBagAirflowStatus("gentle_indirect")).toBe("recorded");
    expect(getGroveBagAirflowStatus("stagnant")).toBe("needs_review");
    expect(getGroveBagAirflowStatus("fluctuating")).toBe("needs_review");
    expect(getGroveBagAirflowStatus("unknown")).toBe("needs_review");
    expect(getGroveBagAirflowStatus("strong_direct")).toBe("caution");
  });
});

describe("getGroveBagAirflowCopy", () => {
  it("returns grower-review wording for strong_direct", () => {
    expect(getGroveBagAirflowCopy("strong_direct")).toMatch(/grower review required/i);
    expect(getGroveBagAirflowCopy("strong_direct")).toMatch(/caution/i);
  });

  it("never contains automation / AI / device-control wording", () => {
    const forbidden =
      /\b(automated airflow|auto[- ]?adjust|device[- ]?control|AI recommends|guaranteed cure)\b/i;
    for (const v of [
      "gentle_indirect",
      "stagnant",
      "fluctuating",
      "strong_direct",
      "unknown",
    ] as const) {
      expect(getGroveBagAirflowCopy(v)).not.toMatch(forbidden);
    }
  });

  it("returns not-recorded copy for unknown", () => {
    expect(getGroveBagAirflowCopy("unknown")).toMatch(/not recorded/i);
  });
});

describe("buildGroveBagAirflowViewModel", () => {
  it("produces a timeline label and copy", () => {
    const vm = buildGroveBagAirflowViewModel("gentle_indirect");
    expect(vm.observation).toBe("gentle_indirect");
    expect(vm.label).toBe("Gentle indirect airflow");
    expect(vm.timelineLabel).toBe("Airflow: Gentle indirect airflow");
    expect(vm.status).toBe("recorded");
  });

  it("safely normalizes garbage input to unknown", () => {
    const vm = buildGroveBagAirflowViewModel("???");
    expect(vm.observation).toBe("unknown");
    expect(vm.status).toBe("needs_review");
  });
});
