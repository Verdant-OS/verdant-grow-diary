/**
 * AI Doctor Engine — Phase 1 Foundation contract + determinism tests.
 *
 * Pure. No Supabase, no fetch, no AI/model calls, no writes.
 *
 * Covers:
 *   - exported staleness-window constant and the documented boundary
 *   - per-plant integration isolation
 *   - payload/result shape contract
 *   - deterministic, table-driven sensor-summary fuzz
 *   - photo-context matrix
 *   - static safety guards
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AI_DOCTOR_SENSOR_STALENESS_WINDOW_HOURS,
  AI_DOCTOR_SENSOR_STALENESS_WINDOW_MS,
  compileAiDoctorContextPayloadFromRows,
  executeAiDoctorEngine,
  type AiDoctorContextPayload,
  type AiDoctorDiagnosisResult,
  type AiDoctorMetricKey,
  type AiDoctorSensorSource,
  type CompileAiDoctorContextPayloadFromRowsInput,
} from "@/lib/aiDoctorEnginePhase1Foundation";

const NOW = new Date("2026-06-04T12:00:00Z");
const iso = (offsetMs: number) => new Date(NOW.getTime() - offsetMs).toISOString();

function basePlant(
  overrides: Partial<CompileAiDoctorContextPayloadFromRowsInput> = {},
): CompileAiDoctorContextPayloadFromRowsInput {
  return {
    plant: {
      id: "p1",
      name: "Plant A",
      strain: "Blue Dream",
      stage: "veg",
      medium: "soil",
      pot_size: "7gal",
      tent_id: "t1",
      grow_id: "g1",
    },
    grow: { id: "g1" },
    tent: { id: "t1" },
    logs: [],
    photos: [],
    sensorReadings: [],
    now: NOW,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Exported staleness constant
// ---------------------------------------------------------------------------

describe("AI_DOCTOR_SENSOR_STALENESS_WINDOW_* exported constants", () => {
  it("hours constant is 6 and ms constant is the derived 6h value", () => {
    expect(AI_DOCTOR_SENSOR_STALENESS_WINDOW_HOURS).toBe(6);
    expect(AI_DOCTOR_SENSOR_STALENESS_WINDOW_MS).toBe(6 * 60 * 60 * 1000);
  });

  it("compiler honors the exported window: age > 6h is stale; age === 6h is fresh", () => {
    const exactly = compileAiDoctorContextPayloadFromRows(
      basePlant({
        sensorReadings: [
          {
            metric: "temperature_c",
            value: 22,
            captured_at: iso(AI_DOCTOR_SENSOR_STALENESS_WINDOW_MS),
            source: "live",
          },
        ],
      }),
    );
    const justOver = compileAiDoctorContextPayloadFromRows(
      basePlant({
        sensorReadings: [
          {
            metric: "temperature_c",
            value: 22,
            captured_at: iso(AI_DOCTOR_SENSOR_STALENESS_WINDOW_MS + 1000),
            source: "live",
          },
        ],
      }),
    );
    const tExact = exactly.sensor_summary.find((m) => m.metric === "temperature_c")!;
    const tOver = justOver.sensor_summary.find((m) => m.metric === "temperature_c")!;
    expect(tExact.is_stale).toBe(false);
    expect(tOver.is_stale).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Per-plant isolation
// ---------------------------------------------------------------------------

describe("per-plant isolation: two compile→execute passes do not leak across plants", () => {
  it("Plant A (high context, degraded telemetry) and Plant B (low context, clean) stay separate", async () => {
    const ctxA = compileAiDoctorContextPayloadFromRows({
      plant: {
        id: "plant-A",
        name: "Alpha",
        strain: "Blue Dream",
        stage: "veg",
        medium: "soil",
        pot_size: "7gal",
        tent_id: "tent-A",
        grow_id: "grow-A",
      },
      grow: { id: "grow-A" },
      tent: { id: "tent-A" },
      logs: [{ occurred_at: iso(60_000), event_type: "watering", source: "manual" }],
      photos: [{ captured_at: iso(120_000) }, { captured_at: iso(180_000) }],
      sensorReadings: [
        { metric: "temperature_c", value: 23, captured_at: iso(60_000), source: "live" },
        { metric: "vpd_kpa", value: 99, captured_at: iso(60_000), source: "invalid" },
      ],
      now: NOW,
    });

    const ctxB = compileAiDoctorContextPayloadFromRows({
      plant: {
        id: "plant-B",
        name: "Bravo",
        strain: "OG Kush",
        stage: "flower",
        medium: "coco",
        pot_size: "3gal",
        tent_id: "tent-B",
        grow_id: "grow-B",
      },
      grow: { id: "grow-B" },
      tent: { id: "tent-B" },
      logs: [],
      photos: [],
      sensorReadings: [],
      now: NOW,
    });

    const rA = await executeAiDoctorEngine({ context: ctxA });
    const rB = await executeAiDoctorEngine({ context: ctxB });

    // Identity isolation.
    expect(ctxA.plant_id).toBe("plant-A");
    expect(ctxB.plant_id).toBe("plant-B");
    expect(ctxA.tent_id).toBe("tent-A");
    expect(ctxB.tent_id).toBe("tent-B");
    expect(ctxA.grow_id).toBe("grow-A");
    expect(ctxB.grow_id).toBe("grow-B");

    // Plant-specific photo/log counts.
    expect(ctxA.recent_photos_count).toBe(2);
    expect(ctxB.recent_photos_count).toBe(0);
    expect(ctxA.recent_logs).toHaveLength(1);
    expect(ctxB.recent_logs).toHaveLength(0);

    // Sensor summary stays plant-specific.
    const aVpd = ctxA.sensor_summary.find((m) => m.metric === "vpd_kpa")!;
    const bVpd = ctxB.sensor_summary.find((m) => m.metric === "vpd_kpa")!;
    expect(aVpd.is_invalid).toBe(true);
    expect(bVpd.latest_value).toBeNull();
    expect(bVpd.is_invalid).toBe(false);

    // missing_information stays plant-specific.
    expect(rA.missing_information).not.toContain("recent photo (14d)");
    expect(rB.missing_information).toContain("recent photo (14d)");
    expect(rB.missing_information).toContain(
      "recent trustworthy sensor reading (7d)",
    );

    // Only the eligible plant (A) gets an approval-required suggestion.
    expect(rA.action_queue_suggestion).not.toBeNull();
    expect(rA.action_queue_suggestion!.approval_required).toBe(true);
    expect(rB.action_queue_suggestion).toBeNull();
    expect(rB.confidence).toBe("low");

    // Diagnosis text does not leak the other plant's identity.
    const joinedA = `${rA.summary} ${rA.likely_issue} ${rA.evidence.join(" ")}`;
    const joinedB = `${rB.summary} ${rB.likely_issue} ${rB.evidence.join(" ")}`;
    expect(joinedA).not.toMatch(/plant-B|Bravo|OG Kush|tent-B|grow-B/);
    expect(joinedB).not.toMatch(/plant-A|Alpha|Blue Dream|tent-A|grow-A/);
  });
});

// ---------------------------------------------------------------------------
// Payload + result contract
// ---------------------------------------------------------------------------

const EXPECTED_PAYLOAD_KEYS = [
  "grow_id",
  "tent_id",
  "plant_id",
  "plant_name",
  "strain",
  "stage",
  "medium",
  "pot_size",
  "recent_logs",
  "recent_photos_count",
  "recent_watering_events",
  "recent_feeding_events",
  "sensor_summary",
  "source_breakdown",
  "missing_context",
  "context_trust_level",
] as const;

const EXPECTED_SNAPSHOT_KEYS = [
  "metric",
  "latest_value",
  "latest_source",
  "latest_captured_at",
  "is_stale",
  "is_invalid",
  "is_degraded",
  "sample_count_7d",
] as const;

const EXPECTED_RESULT_KEYS = [
  "summary",
  "likely_issue",
  "confidence",
  "evidence",
  "missing_information",
  "possible_causes",
  "immediate_action",
  "what_not_to_do",
  "follow_up_24h",
  "recovery_plan_3_day",
  "risk_level",
  "action_queue_suggestion",
] as const;

describe("contract: AiDoctorContextPayload and AiDoctorDiagnosisResult shape", () => {
  it("AiDoctorContextPayload exposes the stable documented keys", () => {
    const ctx = compileAiDoctorContextPayloadFromRows(
      basePlant({
        logs: [{ occurred_at: iso(60_000), event_type: "watering", source: "manual" }],
        photos: [{ captured_at: iso(120_000) }],
        sensorReadings: [
          { metric: "temperature_c", value: 23, captured_at: iso(60_000), source: "live" },
        ],
      }),
    );
    for (const key of EXPECTED_PAYLOAD_KEYS) {
      expect(ctx, `payload missing key ${key}`).toHaveProperty(key);
    }
  });

  it("sensor_summary entries expose stable per-metric keys", () => {
    const ctx = compileAiDoctorContextPayloadFromRows(
      basePlant({
        sensorReadings: [
          { metric: "temperature_c", value: 23, captured_at: iso(60_000), source: "live" },
        ],
      }),
    );
    expect(ctx.sensor_summary.length).toBeGreaterThan(0);
    for (const snap of ctx.sensor_summary) {
      for (const key of EXPECTED_SNAPSHOT_KEYS) {
        expect(snap, `snapshot missing key ${key}`).toHaveProperty(key);
      }
    }
  });

  it("source_breakdown rows expose source + reading_count_7d", () => {
    const ctx = compileAiDoctorContextPayloadFromRows(
      basePlant({
        sensorReadings: [
          { metric: "vpd_kpa", value: 1.0, captured_at: iso(60_000), source: "live" },
          { metric: "vpd_kpa", value: 1.0, captured_at: iso(60_000), source: "csv" },
        ],
      }),
    );
    expect(ctx.source_breakdown.length).toBeGreaterThan(0);
    for (const row of ctx.source_breakdown) {
      expect(row).toHaveProperty("source");
      expect(row).toHaveProperty("reading_count_7d");
    }
  });

  it("AiDoctorDiagnosisResult exposes the stable documented keys", async () => {
    const ctx = compileAiDoctorContextPayloadFromRows(
      basePlant({
        logs: [{ occurred_at: iso(60_000), event_type: "watering", source: "manual" }],
        photos: [{ captured_at: iso(120_000) }],
        sensorReadings: [
          { metric: "temperature_c", value: 23, captured_at: iso(60_000), source: "live" },
        ],
      }),
    );
    const r = await executeAiDoctorEngine({ context: ctx });
    for (const key of EXPECTED_RESULT_KEYS) {
      expect(r, `result missing key ${key}`).toHaveProperty(key);
    }
  });

  it("typed surfaces still compile (compile-time assertion)", () => {
    const _ctx: AiDoctorContextPayload | null = null;
    const _r: AiDoctorDiagnosisResult | null = null;
    expect(_ctx).toBeNull();
    expect(_r).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Deterministic sensor-summary fuzz (table-driven, seeded shuffle)
// ---------------------------------------------------------------------------

const ALL_METRICS: readonly AiDoctorMetricKey[] = [
  "temperature_c",
  "humidity_pct",
  "vpd_kpa",
  "co2_ppm",
  "soil_moisture_pct",
  "soil_ec_ms_cm",
  "ppfd_umol",
  "reservoir_ph",
  "reservoir_ec_ms_cm",
];

const ALL_SOURCES: readonly AiDoctorSensorSource[] = [
  "live",
  "manual",
  "csv",
  "demo",
  "stale",
  "invalid",
];

/** Deterministic LCG so the "fuzz" is reproducible without dependencies. */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}
function shuffle<T>(arr: readonly T[], seed: number): T[] {
  const rand = lcg(seed);
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function buildFuzzRows(): CompileAiDoctorContextPayloadFromRowsInput["sensorReadings"] {
  const rows: NonNullable<CompileAiDoctorContextPayloadFromRowsInput["sensorReadings"]> = [];
  // Two readings per (metric, source) at varying ages within the 7d window.
  let ageMs = 30_000;
  for (const metric of ALL_METRICS) {
    for (const source of ALL_SOURCES) {
      rows.push({
        metric,
        value: 1 + (ageMs % 7),
        captured_at: iso(ageMs),
        source,
      });
      rows.push({
        metric,
        value: 2 + (ageMs % 5),
        captured_at: iso(ageMs + 60_000),
        source,
      });
      ageMs += 90_000;
    }
  }
  return rows;
}

describe("deterministic fuzz: sensor_summary is stable under row shuffling and repeated runs", () => {
  const base = compileAiDoctorContextPayloadFromRows(
    basePlant({ sensorReadings: buildFuzzRows() }),
  );

  it("repeated runs with the same input return identical sensor_summary", () => {
    const again = compileAiDoctorContextPayloadFromRows(
      basePlant({ sensorReadings: buildFuzzRows() }),
    );
    expect(again.sensor_summary).toEqual(base.sensor_summary);
    expect(again.source_breakdown).toEqual(base.source_breakdown);
  });

  for (const seed of [1, 42, 1337, 99991]) {
    it(`shuffled input (seed=${seed}) yields identical sensor_summary + source_breakdown`, () => {
      const shuffled = shuffle(buildFuzzRows() ?? [], seed);
      const ctx = compileAiDoctorContextPayloadFromRows(
        basePlant({ sensorReadings: shuffled }),
      );
      expect(ctx.sensor_summary).toEqual(base.sensor_summary);
      expect(ctx.source_breakdown).toEqual(base.source_breakdown);
    });
  }

  it("invalid readings never surface as healthy latest values; missing metrics are never invented", () => {
    for (const snap of base.sensor_summary) {
      if (snap.is_invalid) expect(snap.latest_value).toBeNull();
      if (snap.latest_source === null) {
        expect(snap.latest_value).toBeNull();
        expect(snap.latest_captured_at).toBeNull();
        expect(snap.sample_count_7d).toBe(0);
      }
    }
  });

  it("stale-source readings are flagged degraded; live/manual fresh readings are not degraded", () => {
    const staleCtx = compileAiDoctorContextPayloadFromRows(
      basePlant({
        sensorReadings: [
          { metric: "co2_ppm", value: 800, captured_at: iso(60_000), source: "stale" },
        ],
      }),
    );
    const liveCtx = compileAiDoctorContextPayloadFromRows(
      basePlant({
        sensorReadings: [
          { metric: "co2_ppm", value: 800, captured_at: iso(60_000), source: "live" },
        ],
      }),
    );
    const s = staleCtx.sensor_summary.find((m) => m.metric === "co2_ppm")!;
    const l = liveCtx.sensor_summary.find((m) => m.metric === "co2_ppm")!;
    expect(s.is_stale).toBe(true);
    expect(s.is_degraded).toBe(true);
    expect(l.is_degraded).toBe(false);
  });

  it("source labels remain fully separated across live/manual/csv/demo/stale/invalid", () => {
    const sources = base.source_breakdown.map((b) => b.source);
    // Every source appears (fuzz includes all 6); no merging.
    for (const s of ALL_SOURCES) expect(sources).toContain(s);
    // No duplicate source rows.
    expect(new Set(sources).size).toBe(sources.length);
  });
});

// ---------------------------------------------------------------------------
// Photo-context matrix
// ---------------------------------------------------------------------------

interface MatrixRow {
  label: string;
  recentPhoto: boolean;
  oldPhotoOnly: boolean;
  recentLog: boolean;
  validSensor: boolean;
  invalidSensor: boolean;
  expectConfidence: "low" | "medium" | "high";
  expectMissingPhoto: boolean;
  expectSuggestion: boolean;
}

const MATRIX: readonly MatrixRow[] = [
  {
    label: "everything present, clean telemetry → high, no suggestion",
    recentPhoto: true, oldPhotoOnly: false, recentLog: true,
    validSensor: true, invalidSensor: false,
    expectConfidence: "high", expectMissingPhoto: false, expectSuggestion: false,
  },
  {
    label: "everything present + invalid telemetry → high, approval-required suggestion",
    recentPhoto: true, oldPhotoOnly: false, recentLog: true,
    validSensor: true, invalidSensor: true,
    expectConfidence: "high", expectMissingPhoto: false, expectSuggestion: true,
  },
  {
    label: "no recent photo, only old photo → medium, missing photo, no suggestion",
    recentPhoto: false, oldPhotoOnly: true, recentLog: true,
    validSensor: true, invalidSensor: false,
    expectConfidence: "medium", expectMissingPhoto: true, expectSuggestion: false,
  },
  {
    label: "no photo at all, log + valid sensor → medium, missing photo, no suggestion",
    recentPhoto: false, oldPhotoOnly: false, recentLog: true,
    validSensor: true, invalidSensor: false,
    expectConfidence: "medium", expectMissingPhoto: true, expectSuggestion: false,
  },
  {
    label: "no log, no photo, only invalid sensor → low, no suggestion",
    recentPhoto: false, oldPhotoOnly: false, recentLog: false,
    validSensor: false, invalidSensor: true,
    expectConfidence: "low", expectMissingPhoto: true, expectSuggestion: false,
  },
  {
    label: "log only, no sensors, no photo → low/medium, missing photo, no suggestion",
    recentPhoto: false, oldPhotoOnly: false, recentLog: true,
    validSensor: false, invalidSensor: false,
    expectConfidence: "medium", expectMissingPhoto: true, expectSuggestion: false,
  },
];

describe("photo-context matrix", () => {
  for (const row of MATRIX) {
    it(row.label, async () => {
      const sensorReadings: NonNullable<
        CompileAiDoctorContextPayloadFromRowsInput["sensorReadings"]
      > = [];
      if (row.validSensor) {
        sensorReadings.push({
          metric: "temperature_c",
          value: 23,
          captured_at: iso(60_000),
          source: "live",
        });
      }
      if (row.invalidSensor) {
        sensorReadings.push({
          metric: "vpd_kpa",
          value: 99,
          captured_at: iso(60_000),
          source: "invalid",
        });
      }
      const photos: NonNullable<
        CompileAiDoctorContextPayloadFromRowsInput["photos"]
      > = [];
      if (row.recentPhoto) photos.push({ captured_at: iso(120_000) });
      if (row.oldPhotoOnly) {
        photos.push({ captured_at: iso(40 * 24 * 60 * 60 * 1000) });
      }
      const logs: NonNullable<
        CompileAiDoctorContextPayloadFromRowsInput["logs"]
      > = row.recentLog
        ? [{ occurred_at: iso(60_000), event_type: "watering", source: "manual" }]
        : [];

      const ctx = compileAiDoctorContextPayloadFromRows(
        basePlant({ logs, photos, sensorReadings }),
      );
      const r = await executeAiDoctorEngine({ context: ctx });

      expect(r.confidence).toBe(row.expectConfidence);

      if (row.expectMissingPhoto) {
        expect(r.missing_information).toContain("recent photo (14d)");
      } else {
        expect(r.missing_information).not.toContain("recent photo (14d)");
      }

      if (row.expectSuggestion) {
        expect(r.action_queue_suggestion).not.toBeNull();
        expect(r.action_queue_suggestion!.approval_required).toBe(true);
      } else {
        expect(r.action_queue_suggestion).toBeNull();
      }

      // Low confidence MUST never emit a suggestion.
      if (r.confidence === "low") {
        expect(r.action_queue_suggestion).toBeNull();
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Static safety guards (kept tight on the foundation module)
// ---------------------------------------------------------------------------

describe("static safety — aiDoctorEnginePhase1Foundation.ts (contract suite)", () => {
  const RAW = readFileSync(
    resolve(__dirname, "../lib/aiDoctorEnginePhase1Foundation.ts"),
    "utf8",
  );
  const SOURCE = RAW
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("does not import Supabase / call external services / write action_queue / control devices", () => {
    expect(SOURCE).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(SOURCE).not.toMatch(/createClient\s*\(/);
    expect(SOURCE).not.toMatch(/service_role/i);
    expect(SOURCE).not.toMatch(/bridge[_-]?token/i);
    expect(SOURCE).not.toMatch(/\bfetch\s*\(/);
    expect(SOURCE).not.toMatch(/functions\.invoke/);
    expect(SOURCE).not.toMatch(/openai|anthropic|gemini|ai-gateway|lovable\.dev\/ai/i);
    expect(SOURCE).not.toMatch(/action_queue\s*\.insert|insertActionQueue|alertsClient/i);
    expect(SOURCE).not.toMatch(/executeDeviceCommand|deviceControl|sendDeviceCommand/i);
  });
});
