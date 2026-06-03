/**
 * VERDANT-18: AI Doctor deterministic testing foundation.
 */
import { describe, expect, it } from "vitest";

import { MockAIClient, ProductionAIClient } from "@/lib/ai/AIClient";
import {
  DOCTOR_FIXTURES,
  buildDoctorFixtureRegistry,
  getFixtureByName,
} from "@/lib/ai/doctorFixtures";
import { fixtureKeyFor } from "@/lib/ai/fixtureKey";
import type { DoctorAnalysis, DoctorContext } from "@/lib/ai/types";

function mockClient() {
  return new MockAIClient(buildDoctorFixtureRegistry());
}

// ---------------------------------------------------------------------------
// MockAIClient registry behavior
// ---------------------------------------------------------------------------

describe("MockAIClient", () => {
  it("returns the registered fixture output for a known context", async () => {
    const f = getFixtureByName("clean_high_vpd_flower");
    const out = await mockClient().analyze(f.context);
    expect(out.summary).toBe(f.analysis.summary);
    expect(out.likelyIssue).toBe(f.analysis.likelyIssue);
    expect(out.confidence).toBe(f.analysis.confidence);
    expect(out.shouldCreateActionQueueItem).toBe(true);
    expect(out.actionQueueSuggestion?.status).toBe("pending_approval");
  });

  it("returns a deep clone so callers cannot mutate the shared fixture", async () => {
    const f = getFixtureByName("within_target_no_action");
    const client = mockClient();
    const a = await client.analyze(f.context);
    (a as { summary: string }).summary = "MUTATED";
    const b = await client.analyze(f.context);
    expect(b.summary).toBe(f.analysis.summary);
  });

  it("throws a clear, actionable error for missing fixtures", async () => {
    const ctx: DoctorContext = {
      growId: "g",
      tentId: "t",
      plant: { id: "p", stage: "veg", isAutoflower: false },
      snapshot: {
        capturedAt: "2026-06-03T11:55:00.000Z",
        source: "live",
        temperatureC: 99, // far outside any fixture bucket
        humidityPct: 12,
        vpdKpa: 5,
        co2Ppm: null,
        soilMoisturePct: 0,
      },
    };
    await expect(mockClient().analyze(ctx)).rejects.toThrow(
      /MockAIClient: no fixture registered for key/,
    );
  });

  it("ProductionAIClient throws not-implemented", async () => {
    const ctx = getFixtureByName("within_target_no_action").context;
    await expect(new ProductionAIClient().analyze(ctx)).rejects.toThrow(
      /not implemented/i,
    );
  });
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe("Doctor determinism", () => {
  it("fixtureKeyFor is deterministic across calls", () => {
    const ctx = getFixtureByName("clean_high_vpd_flower").context;
    const keys = Array.from({ length: 10 }, () => fixtureKeyFor(ctx));
    expect(new Set(keys).size).toBe(1);
  });

  it("same input returns identical output 10 times", async () => {
    const client = mockClient();
    const ctx = getFixtureByName("high_humidity_flower").context;
    const outs: DoctorAnalysis[] = [];
    for (let i = 0; i < 10; i++) outs.push(await client.analyze(ctx));
    for (let i = 1; i < outs.length; i++) {
      expect(outs[i]).toEqual(outs[0]);
    }
  });

  it("registry build is stable: every fixture is reachable by its own context", async () => {
    const client = mockClient();
    for (const f of DOCTOR_FIXTURES) {
      const out = await client.analyze(f.context);
      expect(out.summary).toBe(f.analysis.summary);
    }
  });
});

// ---------------------------------------------------------------------------
// Safety invariants across all fixtures
// ---------------------------------------------------------------------------

describe("Doctor fixtures — safety invariants", () => {
  it("low-confidence outputs never create an action queue item", () => {
    for (const f of DOCTOR_FIXTURES) {
      if (f.analysis.confidence < 0.6) {
        expect(f.analysis.shouldCreateActionQueueItem).toBe(false);
        expect(f.analysis.actionQueueSuggestion ?? null).toBeNull();
      }
    }
  });

  it("stale or invalid telemetry never yields a healthy/normal analysis", () => {
    for (const f of DOCTOR_FIXTURES) {
      const src = f.context.snapshot.source;
      if (src === "stale" || src === "invalid") {
        expect(f.analysis.shouldCreateActionQueueItem).toBe(false);
        expect(f.analysis.summary.toLowerCase()).not.toMatch(
          /\b(healthy|normal|within target)\b/,
        );
      }
    }
  });

  it("every action suggestion is advisory + pending_approval (no executable command)", () => {
    const forbidden = [
      "turn on",
      "turn off",
      "switch on",
      "switch off",
      "start pump",
      "stop pump",
      "open valve",
      "close valve",
      "auto-dose",
      "execute",
    ];
    for (const f of DOCTOR_FIXTURES) {
      const s = f.analysis.actionQueueSuggestion;
      if (!s) continue;
      expect(s.actionType).toBe("advisory");
      expect(s.status).toBe("pending_approval");
      const text = s.suggestedChange.toLowerCase();
      for (const v of forbidden) expect(text).not.toContain(v);
    }
  });

  it("autoflower fixtures keep recommendations conservative (no high-stress training, no nutrient changes)", () => {
    const autoFixtures = DOCTOR_FIXTURES.filter(
      (f) => f.context.plant?.isAutoflower === true,
    );
    expect(autoFixtures.length).toBeGreaterThan(0);
    for (const f of autoFixtures) {
      const text = [
        f.analysis.immediateAction,
        f.analysis.actionQueueSuggestion?.suggestedChange ?? "",
        ...f.analysis.whatNotToDo,
      ]
        .join(" ")
        .toLowerCase();
      // The actionable text should not propose high-stress changes.
      expect(text).not.toMatch(/\b(topping|super[- ]?crop|defoliat\w*|transplant)\b.*(now|today|immediately)/);
      // whatNotToDo should explicitly warn against high-stress or nutrient changes.
      const dontList = f.analysis.whatNotToDo.join(" ").toLowerCase();
      expect(dontList).toMatch(
        /defoliat|nutrient|transplant|high[- ]?stress|training/,
      );
    }
  });

  it("missing plant context never asserts plant-health certainty", () => {
    const f = getFixtureByName("missing_plant_context");
    expect(f.analysis.shouldCreateActionQueueItem).toBe(false);
    expect(f.analysis.likelyIssue).toBe("");
    expect(f.analysis.missingInformation.length).toBeGreaterThan(0);
  });

  it("every fixture has a unique deterministic key", () => {
    const seen = new Set<string>();
    for (const f of DOCTOR_FIXTURES) {
      const k = fixtureKeyFor(f.context);
      expect(seen.has(k)).toBe(false);
      seen.add(k);
    }
    expect(seen.size).toBe(DOCTOR_FIXTURES.length);
  });
});
