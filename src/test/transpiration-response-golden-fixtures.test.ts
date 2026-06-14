// Golden fixture tests for the Transpiration Response rules skeleton.
// Asserts deterministic, stable output shape for each canonical case.
// Pure logic only — no UI, no Supabase, no alerts, no Action Queue.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  evaluateTranspirationWindow,
  type TranspirationWindowInput,
} from "@/lib/transpirationResponseRules";

type Expected = {
  status: string;
  confidence: string;
  primaryMetricPresent: boolean;
  supportingMetricPresent: boolean;
  moistureProxyPresent: boolean;
  warnings: string[];
  confidenceReasons: string[];
};

type Case = {
  id: string;
  description: string;
  input: TranspirationWindowInput;
  expected: Expected;
};

const fixturePath = "fixtures/transpiration-response/golden-windows.json";
const raw = JSON.parse(readFileSync(fixturePath, "utf8")) as { cases: Case[] };

describe("transpiration response golden fixtures", () => {
  for (const c of raw.cases) {
    it(`${c.id}: ${c.description}`, () => {
      const r = evaluateTranspirationWindow(c.input);
      expect(r.status).toBe(c.expected.status);
      expect(r.confidence).toBe(c.expected.confidence);
      expect(r.waterLossRatePerVpdPerSize !== null).toBe(
        c.expected.primaryMetricPresent,
      );
      expect(r.waterLossRatePerVpd !== null).toBe(
        c.expected.supportingMetricPresent,
      );
      expect(r.moistureResponseProxy !== null).toBe(
        c.expected.moistureProxyPresent,
      );
      expect(r.warnings).toEqual([...c.expected.warnings].sort());
      expect(r.confidenceReasons).toEqual(
        [...c.expected.confidenceReasons].sort(),
      );
    });
  }

  it("every fixture has stable deterministic ordering", () => {
    for (const c of raw.cases) {
      const r = evaluateTranspirationWindow(c.input);
      expect(r.warnings).toEqual([...r.warnings].sort());
      expect(r.confidenceReasons).toEqual([...r.confidenceReasons].sort());
      expect(r.sourceSummary).toEqual([...r.sourceSummary].sort());
    }
  });
});
