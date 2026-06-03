/**
 * VERDANT-13: tests for the deterministic V0 loop harness.
 *
 * Pure tests — no Supabase, no React, no I/O.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  runV0Loop,
  AI_DOCTOR_MIN_ACTION_CONFIDENCE,
  type V0LoopInput,
} from "@/lib/v0LoopHarness";
import type { NormalizedSensorReading } from "@/lib/sensorReadingNormalizationRules";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = "2026-06-03T12:00:00.000Z";
// 5 minutes before NOW → fresh
const CAPTURED_FRESH = "2026-06-03T11:55:00.000Z";
// 2 hours before NOW → would be stale if marked live
const CAPTURED_STALE = "2026-06-03T10:00:00.000Z";

function reading(overrides: Partial<NormalizedSensorReading> = {}): NormalizedSensorReading {
  return {
    captured_at: CAPTURED_FRESH,
    source: "live",
    temperature_c: 24,
    humidity_pct: 55,
    vpd_kpa: 1.0,
    co2_ppm: 800,
    soil_moisture_pct: 60,
    raw_payload: { fixture: true },
    ...overrides,
  };
}

function baseInput(overrides: Partial<V0LoopInput> = {}): V0LoopInput {
  return {
    grow: { id: "grow-1" },
    tent: { id: "tent-1" },
    plant: { id: "plant-1", isAutoflower: false, stage: "veg" },
    reading: reading(),
    targets: {
      temperature_c: { min: 20, max: 28 },
      humidity_pct: { min: 40, max: 65 },
      vpd_kpa: { min: 0.8, max: 1.4 },
    },
    deadband: { temperature_c: 0.5, humidity_pct: 2, vpd_kpa: 0.05 },
    diaryContext: { recentEntryCount: 3 },
    aiDoctor: {
      summary: "Environment within target bands.",
      confidence: 0.8,
      outputRef: "ai-out-001",
    },
    now: NOW,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Happy path
// ---------------------------------------------------------------------------

describe("V0 loop harness — happy path", () => {
  it("clean reading → AI context → no alerts → no action draft and state healthy", () => {
    const r = runV0Loop(baseInput());
    expect(r.state).toBe("healthy");
    expect(r.alerts).toEqual([]);
    expect(r.actionDraft).toBeNull();
    expect(r.sensorContext.sourceState).toBe("live");
    expect(r.aiDoctorSummary).toContain("AI Doctor:");
    expect(r.aiDoctorSummary).toContain("confidence 80%");
    expect(r.traceability).toEqual({
      growId: "grow-1",
      tentId: "tent-1",
      plantId: "plant-1",
      sensorCapturedAt: CAPTURED_FRESH,
      sourceCategory: "live",
      aiOutputRef: "ai-out-001",
      generatedAt: NOW,
    });
  });

  it("clean reading with out-of-band temp produces approval-required action draft", () => {
    const input = baseInput({
      reading: reading({ temperature_c: 31 }), // > 28 + deadband 0.5
    });
    const r = runV0Loop(input);
    expect(r.state).toBe("degraded");
    expect(r.alerts.length).toBeGreaterThan(0);
    const draft = r.actionDraft;
    expect(draft).not.toBeNull();
    expect(draft?.status).toBe("pending_approval");
    expect(draft?.action_type).toBe("advisory");
    expect(draft?.source).toBe("environment_alert");
    expect(draft?.grow_id).toBe("grow-1");
    expect(draft?.tent_id).toBe("tent-1");
    expect(draft?.plant_id).toBe("plant-1");
    expect(draft?.suggested_change).toMatch(/review/i);
  });
});

// ---------------------------------------------------------------------------
// 2. Threshold boundaries ± deadband
// ---------------------------------------------------------------------------

describe("V0 loop harness — threshold boundaries", () => {
  it("value within band → no alert", () => {
    const r = runV0Loop(baseInput({ reading: reading({ temperature_c: 28 }) }));
    expect(r.alerts.find((a) => a.metric === "temperature_c")).toBeUndefined();
  });

  it("value inside deadband shoulder → watch", () => {
    const r = runV0Loop(baseInput({ reading: reading({ temperature_c: 28.3 }) }));
    const a = r.alerts.find((x) => x.metric === "temperature_c");
    expect(a?.severity).toBe("watch");
  });

  it("value past deadband → warning (out)", () => {
    const r = runV0Loop(baseInput({ reading: reading({ temperature_c: 30 }) }));
    const a = r.alerts.find((x) => x.metric === "temperature_c");
    expect(a?.severity).toBe("warning");
  });

  it("low side past deadband → warning low", () => {
    const r = runV0Loop(baseInput({ reading: reading({ humidity_pct: 35 }) }));
    const a = r.alerts.find((x) => x.metric === "humidity_pct");
    expect(a?.severity).toBe("warning");
    expect(a?.title).toContain("low");
  });
});

// ---------------------------------------------------------------------------
// 3. Stale → watch/degraded; never healthy
// ---------------------------------------------------------------------------

describe("V0 loop harness — stale telemetry", () => {
  it("stale reading produces degraded state and suppresses action draft", () => {
    const r = runV0Loop(
      baseInput({
        reading: reading({
          captured_at: CAPTURED_STALE,
          source: "stale",
          temperature_c: 31, // would normally trigger
        }),
      }),
    );
    expect(r.state).toBe("degraded");
    expect(r.actionDraft).toBeNull();
    expect(r.notes.some((n) => /stale/i.test(n))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. Invalid telemetry never healthy
// ---------------------------------------------------------------------------

describe("V0 loop harness — invalid telemetry", () => {
  it("invalid source classification → untrusted, no action", () => {
    const r = runV0Loop(
      baseInput({
        reading: reading({ source: "invalid", temperature_c: 24 }),
      }),
    );
    expect(r.state).toBe("untrusted");
    expect(r.actionDraft).toBeNull();
    expect(r.aiDoctorSummary).toMatch(/untrusted|invalid/i);
  });

  it("critical metric out of plausible range never reports healthy", () => {
    // Temperature -50 → invalid metric
    const r = runV0Loop(
      baseInput({
        reading: reading({ temperature_c: -50 }),
      }),
    );
    expect(r.state).not.toBe("healthy");
  });
});

// ---------------------------------------------------------------------------
// 5. Missing plant context degrades gracefully
// ---------------------------------------------------------------------------

describe("V0 loop harness — missing plant context", () => {
  it("no plant + no diary + no usable metrics → insufficient_data", () => {
    const r = runV0Loop(
      baseInput({
        plant: null,
        diaryContext: { recentEntryCount: 0 },
        reading: reading({
          temperature_c: null,
          humidity_pct: null,
          vpd_kpa: null,
          co2_ppm: null,
          soil_moisture_pct: null,
        }),
        targets: null,
      }),
    );
    expect(r.state).toBe("insufficient_data");
    expect(r.actionDraft).toBeNull();
    expect(r.aiDoctorSummary).toMatch(/more data needed/i);
    expect(r.traceability.plantId).toBeNull();
  });

  it("no plant but usable metrics + diary → still proceeds without crashing", () => {
    const r = runV0Loop(baseInput({ plant: null }));
    expect(r.state).toBe("healthy");
    expect(r.traceability.plantId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 6. Low-confidence AI must not produce action
// ---------------------------------------------------------------------------

describe("V0 loop harness — low-confidence AI", () => {
  it("AI confidence below threshold suppresses action draft", () => {
    const r = runV0Loop(
      baseInput({
        reading: reading({ temperature_c: 31 }),
        aiDoctor: {
          summary: "Possible heat stress.",
          confidence: AI_DOCTOR_MIN_ACTION_CONFIDENCE - 0.1,
          outputRef: "ai-low",
        },
      }),
    );
    expect(r.actionDraft).toBeNull();
    expect(r.notes.some((n) => /confidence/i.test(n))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 7. No executable device command in any draft
// ---------------------------------------------------------------------------

describe("V0 loop harness — no device commands", () => {
  it.each([
    [{ temperature_c: 31 }],
    [{ humidity_pct: 80 }],
    [{ humidity_pct: 30 }],
    [{ vpd_kpa: 2.0 }],
  ])("draft for %j is advisory only", (overrides) => {
    const r = runV0Loop(baseInput({ reading: reading(overrides) }));
    if (r.actionDraft) {
      const text = r.actionDraft.suggested_change.toLowerCase();
      for (const verb of [
        "turn on",
        "turn off",
        "switch on",
        "switch off",
        "auto-dose",
        "execute",
        "start pump",
        "stop pump",
        "open valve",
        "close valve",
      ]) {
        expect(text).not.toContain(verb);
      }
      expect(r.actionDraft.action_type).toBe("advisory");
      expect(r.actionDraft.status).toBe("pending_approval");
    }
  });
});

// ---------------------------------------------------------------------------
// 8. Determinism
// ---------------------------------------------------------------------------

describe("V0 loop harness — determinism", () => {
  it("same input produces identical output (deep equality)", () => {
    const a = runV0Loop(baseInput({ reading: reading({ temperature_c: 31 }) }));
    const b = runV0Loop(baseInput({ reading: reading({ temperature_c: 31 }) }));
    expect(a).toEqual(b);
  });

  it("alerts are sorted deterministically by severity then metric", () => {
    const r = runV0Loop(
      baseInput({
        reading: reading({
          temperature_c: 31, // warning high
          humidity_pct: 66.5, // watch high (within deadband 2)
          vpd_kpa: 2.0, // warning high
        }),
      }),
    );
    const severities = r.alerts.map((a) => a.severity);
    // sorted: critical, warning, watch, info — so warnings come before watch
    const firstWatchIdx = severities.indexOf("watch");
    const lastWarningIdx = severities.lastIndexOf("warning");
    if (firstWatchIdx !== -1 && lastWarningIdx !== -1) {
      expect(lastWarningIdx).toBeLessThan(firstWatchIdx);
    }
    // Within the same severity, metrics should be sorted alphabetically.
    const warnings = r.alerts.filter((a) => a.severity === "warning").map((a) => a.metric);
    const sortedWarnings = [...warnings].sort();
    expect(warnings).toEqual(sortedWarnings);
  });
});

// ---------------------------------------------------------------------------
// 9. Traceability shape
// ---------------------------------------------------------------------------

describe("V0 loop harness — traceability", () => {
  it("traceability contains all required fields including AI ref when supplied", () => {
    const r = runV0Loop(baseInput());
    expect(r.traceability.sensorCapturedAt).toBe(CAPTURED_FRESH);
    expect(r.traceability.sourceCategory).toBe("live");
    expect(r.traceability.growId).toBe("grow-1");
    expect(r.traceability.tentId).toBe("tent-1");
    expect(r.traceability.plantId).toBe("plant-1");
    expect(r.traceability.aiOutputRef).toBe("ai-out-001");
    expect(r.traceability.generatedAt).toBe(NOW);
  });

  it("traceability tolerates missing plant and missing AI fixture", () => {
    const r = runV0Loop(baseInput({ plant: null, aiDoctor: null }));
    expect(r.traceability.plantId).toBeNull();
    expect(r.traceability.aiOutputRef).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 10. Static safety scan
// ---------------------------------------------------------------------------

describe("V0 loop harness — static safety scan", () => {
  const src = readFileSync(
    resolve(process.cwd(), "src/lib/v0LoopHarness.ts"),
    "utf-8",
  );

  it("contains no service_role references", () => {
    expect(src.toLowerCase()).not.toContain("service_role");
  });

  it("contains no device control or autopilot execution language", () => {
    // Scan a copy with the deliberate FORBIDDEN_ACTION_VERBS literal stripped
    // out, so the defensive denylist itself does not trip the check.
    const stripped = src.replace(
      /FORBIDDEN_ACTION_VERBS[\s\S]*?\];/,
      "FORBIDDEN_ACTION_VERBS = [];",
    );
    const banned = [
      "supabase.from",
      "fetch(",
      "axios",
      "autopilot",
      "execute_command",
      "device.control",
    ];
    for (const b of banned) {
      expect(stripped.toLowerCase()).not.toContain(b.toLowerCase());
    }
  });
});

// ---------------------------------------------------------------------------
// Autoflower-sensitive guidance stays conservative
// ---------------------------------------------------------------------------

describe("V0 loop harness — autoflower conservatism", () => {
  it("autoflower note appears in summary and notes when triggered", () => {
    const r = runV0Loop(
      baseInput({
        plant: { id: "plant-1", isAutoflower: true, stage: "flower" },
        reading: reading({ temperature_c: 31 }),
      }),
    );
    expect(r.aiDoctorSummary).toMatch(/autoflower/i);
    expect(r.notes.some((n) => /autoflower/i.test(n))).toBe(true);
    // Still review-first, no device command
    if (r.actionDraft) {
      expect(r.actionDraft.suggested_change.toLowerCase()).toMatch(/review/);
    }
  });
});
