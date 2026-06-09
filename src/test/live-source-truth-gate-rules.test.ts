/**
 * Live Source Truth Gate — pure rules tests + static safety scan.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  evaluateLiveSourceTruth,
  LIVE_SOURCE_TRUTH_FUTURE_SKEW_MS,
  LIVE_SOURCE_TRUTH_STALE_AFTER_MS,
  type LiveSourceTruthEvidence,
  type LiveSourceTruthMetricEvidence,
} from "@/lib/liveSourceTruthGateRules";

const NOW = "2026-06-09T22:00:00Z";
const RECENT = "2026-06-09T21:59:30Z";

function ev(
  overrides: Partial<LiveSourceTruthEvidence> = {},
): LiveSourceTruthEvidence {
  return {
    source: "live",
    captured_at: RECENT,
    now: NOW,
    tent_id: "tent_1",
    plant_id: "plant_1",
    confidence: 0.9,
    raw_payload_present: true,
    normalized_payload_present: true,
    operator_compared_controller: true,
    metrics: [
      { key: "temp_f", backend_value: 75, controller_value: 75.5, unit: "F" },
      { key: "humidity_pct", backend_value: 55, controller_value: 56 },
    ],
    ...overrides,
  };
}

const FORBIDDEN_COPY = [
  /\bguaranteed\b/i,
  /\bdefinitely\b/i,
  /\bcertainly\b/i,
];

describe("evaluateLiveSourceTruth — verified_live happy path", () => {
  it("returns verified_live with complete evidence and matching metrics", () => {
    const r = evaluateLiveSourceTruth(ev());
    expect(r.verdict).toBe("verified_live");
    expect(r.is_live_proof).toBe(true);
    expect(r.confidence_label).toBe("high");
    expect(r.summary).toMatch(/Live proof verified/i);
  });

  it("includes metric_results for each provided metric in stable order", () => {
    const r = evaluateLiveSourceTruth(
      ev({
        metrics: [
          { key: "humidity_pct", backend_value: 55, controller_value: 55 },
          { key: "temp_f", backend_value: 75, controller_value: 75, unit: "F" },
        ],
      }),
    );
    expect(r.metric_results.map((m) => m.key)).toEqual([
      "temp_f",
      "humidity_pct",
    ]);
  });
});

describe("evaluateLiveSourceTruth — source-based verdicts", () => {
  it("live source without operator comparison returns unverified_live", () => {
    const r = evaluateLiveSourceTruth(
      ev({ operator_compared_controller: false }),
    );
    expect(r.verdict).toBe("unverified_live");
    expect(r.is_live_proof).toBe(false);
    expect(r.confidence_label).toBe("medium");
  });

  it("demo source returns not_live_proof", () => {
    const r = evaluateLiveSourceTruth(
      ev({ source: "demo", operator_compared_controller: false }),
    );
    expect(r.verdict).toBe("not_live_proof");
    expect(r.confidence_label).toBe("low");
  });

  it("csv source returns not_live_proof", () => {
    const r = evaluateLiveSourceTruth(
      ev({ source: "csv", operator_compared_controller: false }),
    );
    expect(r.verdict).toBe("not_live_proof");
  });

  it("manual source returns not_live_proof", () => {
    const r = evaluateLiveSourceTruth(
      ev({ source: "manual", operator_compared_controller: false }),
    );
    expect(r.verdict).toBe("not_live_proof");
  });

  it("stale source returns stale", () => {
    const r = evaluateLiveSourceTruth(ev({ source: "stale" }));
    expect(r.verdict).toBe("stale");
    expect(r.confidence_label).toBe("low");
  });

  it("old captured_at returns stale", () => {
    const old = new Date(
      Date.parse(NOW) - LIVE_SOURCE_TRUTH_STALE_AFTER_MS - 60_000,
    ).toISOString();
    const r = evaluateLiveSourceTruth(ev({ captured_at: old }));
    expect(r.verdict).toBe("stale");
  });

  it("future captured_at beyond skew returns invalid", () => {
    const future = new Date(
      Date.parse(NOW) + LIVE_SOURCE_TRUTH_FUTURE_SKEW_MS + 60_000,
    ).toISOString();
    const r = evaluateLiveSourceTruth(ev({ captured_at: future }));
    expect(r.verdict).toBe("invalid");
  });

  it("missing captured_at returns invalid", () => {
    const r = evaluateLiveSourceTruth(ev({ captured_at: null }));
    expect(r.verdict).toBe("invalid");
  });

  it("missing tent_id for live source returns invalid", () => {
    const r = evaluateLiveSourceTruth(ev({ tent_id: null }));
    expect(r.verdict).toBe("invalid");
  });

  it("missing raw payload prevents verified_live", () => {
    const r = evaluateLiveSourceTruth(ev({ raw_payload_present: false }));
    expect(r.verdict).not.toBe("verified_live");
  });

  it("missing normalized payload prevents verified_live", () => {
    const r = evaluateLiveSourceTruth(
      ev({ normalized_payload_present: false }),
    );
    expect(r.verdict).not.toBe("verified_live");
  });
});

describe("evaluateLiveSourceTruth — comparison & tolerance", () => {
  it("backend/controller mismatch returns mismatch", () => {
    const r = evaluateLiveSourceTruth(
      ev({
        metrics: [
          { key: "temp_f", backend_value: 75, controller_value: 90, unit: "F" },
        ],
      }),
    );
    expect(r.verdict).toBe("mismatch");
    expect(r.metric_results[0].status).toBe("mismatch");
  });

  it("per-metric tolerance override works", () => {
    const r = evaluateLiveSourceTruth(
      ev({
        metrics: [
          {
            key: "temp_f",
            backend_value: 75,
            controller_value: 77,
            unit: "F",
            tolerance: 5,
          },
        ],
      }),
    );
    expect(r.verdict).toBe("verified_live");
    expect(r.metric_results[0].status).toBe("match");
  });

  it("compared metric missing controller value yields unverified_live", () => {
    const r = evaluateLiveSourceTruth(
      ev({
        metrics: [
          { key: "temp_f", backend_value: 75, controller_value: null, unit: "F" },
        ],
      }),
    );
    expect(r.verdict).toBe("unverified_live");
    expect(r.metric_results[0].status).toBe("missing_controller");
  });

  it("compared metric missing backend value returns invalid", () => {
    const r = evaluateLiveSourceTruth(
      ev({
        metrics: [
          { key: "temp_f", backend_value: null, controller_value: 75, unit: "F" },
        ],
      }),
    );
    expect(r.verdict).toBe("invalid");
    expect(r.metric_results[0].status).toBe("missing_backend");
  });
});

describe("evaluateLiveSourceTruth — suspicious values", () => {
  const cases: Array<[string, LiveSourceTruthMetricEvidence]> = [
    [
      "humidity 0",
      { key: "humidity_pct", backend_value: 0, controller_value: 0 },
    ],
    [
      "humidity 100",
      { key: "humidity_pct", backend_value: 100, controller_value: 100 },
    ],
    [
      "soil moisture 0",
      { key: "soil_moisture_pct", backend_value: 0, controller_value: 0 },
    ],
    [
      "soil moisture 100",
      { key: "soil_moisture_pct", backend_value: 100, controller_value: 100 },
    ],
    [
      "pH below range",
      { key: "ph", backend_value: 2, controller_value: 2 },
    ],
    [
      "pH above range",
      { key: "ph", backend_value: 11, controller_value: 11 },
    ],
    [
      "CO2 below range",
      { key: "co2_ppm", backend_value: 100, controller_value: 100 },
    ],
    [
      "CO2 above range",
      { key: "co2_ppm", backend_value: 6000, controller_value: 6000 },
    ],
  ];

  it.each(cases)("%s returns invalid", (_label, metric) => {
    const r = evaluateLiveSourceTruth(ev({ metrics: [metric] }));
    expect(r.verdict).toBe("invalid");
  });
});

describe("evaluateLiveSourceTruth — unit-mismatch warnings", () => {
  it("Celsius-as-Fahrenheit warning blocks live proof on a compared metric", () => {
    const r = evaluateLiveSourceTruth(
      ev({
        metrics: [
          { key: "temp_f", backend_value: 35, controller_value: 35, unit: "F" },
        ],
      }),
    );
    expect(r.verdict).toBe("invalid");
    expect(r.warnings.join(" ")).toMatch(/Celsius shown as Fahrenheit/i);
  });

  it("µS/cm-as-mS/cm warning blocks live proof", () => {
    const r = evaluateLiveSourceTruth(
      ev({
        metrics: [
          { key: "soil_ec_ms_cm", backend_value: 50, controller_value: 50 },
        ],
      }),
    );
    expect(r.verdict).toBe("invalid");
    expect(r.warnings.join(" ")).toMatch(/µS\/cm shown as mS\/cm/);
  });

  it("mS/cm-as-µS/cm warning blocks live proof", () => {
    const r = evaluateLiveSourceTruth(
      ev({
        metrics: [
          { key: "soil_ec_us_cm", backend_value: 5, controller_value: 5 },
        ],
      }),
    );
    expect(r.verdict).toBe("invalid");
    expect(r.warnings.join(" ")).toMatch(/mS\/cm shown as µS\/cm/);
  });
});

describe("evaluateLiveSourceTruth — malformed input", () => {
  it("malformed metric array (non-array) returns invalid", () => {
    const e = ev({
      // Intentionally malformed for the runtime guard
      metrics: { not: "an array" } as unknown as LiveSourceTruthMetricEvidence[],
    });
    const r = evaluateLiveSourceTruth(e);
    expect(r.verdict).toBe("invalid");
  });

  it("no metrics returns invalid for live source", () => {
    const r = evaluateLiveSourceTruth(ev({ metrics: [] }));
    expect(r.verdict).toBe("invalid");
  });

  it("unknown metric key returns invalid", () => {
    const r = evaluateLiveSourceTruth(
      ev({
        metrics: [
          {
            key: "wattage" as unknown as LiveSourceTruthMetricEvidence["key"],
            backend_value: 100,
            controller_value: 100,
          },
        ],
      }),
    );
    expect(r.verdict).toBe("invalid");
  });
});

describe("evaluateLiveSourceTruth — precedence", () => {
  it("invalid source has precedence over stale", () => {
    const r = evaluateLiveSourceTruth(
      ev({
        source: "invalid",
        captured_at: new Date(
          Date.parse(NOW) - LIVE_SOURCE_TRUTH_STALE_AFTER_MS - 60_000,
        ).toISOString(),
      }),
    );
    expect(r.verdict).toBe("invalid");
  });

  it("stale has precedence over mismatch", () => {
    const r = evaluateLiveSourceTruth(
      ev({
        captured_at: new Date(
          Date.parse(NOW) - LIVE_SOURCE_TRUTH_STALE_AFTER_MS - 60_000,
        ).toISOString(),
        metrics: [
          { key: "temp_f", backend_value: 75, controller_value: 90, unit: "F" },
        ],
      }),
    );
    expect(r.verdict).toBe("stale");
  });

  it("mismatch has precedence over unverified", () => {
    const r = evaluateLiveSourceTruth(
      ev({
        operator_compared_controller: false,
        metrics: [
          { key: "temp_f", backend_value: 75, controller_value: 90, unit: "F" },
        ],
      }),
    );
    expect(r.verdict).toBe("mismatch");
  });
});

describe("evaluateLiveSourceTruth — determinism & shape", () => {
  it("deterministic output for the same input", () => {
    const a = evaluateLiveSourceTruth(ev());
    const b = evaluateLiveSourceTruth(ev());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("limitations/warnings/required_next_steps arrays are stably sorted", () => {
    const r = evaluateLiveSourceTruth(
      ev({
        operator_compared_controller: false,
        raw_payload_present: false,
        normalized_payload_present: false,
      }),
    );
    const sortedLim = [...r.limitations].sort();
    expect(r.limitations).toEqual(sortedLim);
    const sortedW = [...r.warnings].sort();
    expect(r.warnings).toEqual(sortedW);
    const sortedN = [...r.required_next_steps].sort();
    expect(r.required_next_steps).toEqual(sortedN);
  });

  it("no forbidden overconfidence copy appears in summaries/warnings", () => {
    const verdicts: Array<Partial<LiveSourceTruthEvidence>> = [
      {},
      { operator_compared_controller: false },
      { source: "demo" },
      { source: "stale" },
      { source: "invalid" },
      {
        metrics: [
          { key: "temp_f", backend_value: 75, controller_value: 90, unit: "F" },
        ],
      },
    ];
    for (const v of verdicts) {
      const r = evaluateLiveSourceTruth(ev(v));
      const text = [r.summary, ...r.warnings, ...r.limitations].join(" ");
      for (const pat of FORBIDDEN_COPY) {
        expect(text).not.toMatch(pat);
      }
    }
  });

  it("verified_live returns is_live_proof: true", () => {
    expect(evaluateLiveSourceTruth(ev()).is_live_proof).toBe(true);
  });

  it("every other verdict returns is_live_proof: false", () => {
    const others: Array<Partial<LiveSourceTruthEvidence>> = [
      { operator_compared_controller: false },
      { source: "demo", operator_compared_controller: false },
      { source: "csv", operator_compared_controller: false },
      { source: "manual", operator_compared_controller: false },
      { source: "stale" },
      { source: "invalid" },
      { captured_at: null },
      {
        metrics: [
          { key: "temp_f", backend_value: 75, controller_value: 90, unit: "F" },
        ],
      },
    ];
    for (const o of others) {
      const r = evaluateLiveSourceTruth(ev(o));
      expect(r.is_live_proof).toBe(false);
    }
  });
});

// =========================================================================
// Static safety scan
// =========================================================================

describe("liveSourceTruthGateRules — static safety", () => {
  const src = readFileSync(
    resolve(__dirname, "../..", "src/lib/liveSourceTruthGateRules.ts"),
    "utf8",
  );

  it("does not import Supabase or model/edge clients", () => {
    expect(src).not.toMatch(/@\/integrations\/supabase/);
    expect(src).not.toMatch(/from\s+["']@supabase/);
    expect(src).not.toMatch(/supabase\./);
    expect(src).not.toMatch(/openai/i);
    expect(src).not.toMatch(/anthropic/i);
    expect(src).not.toMatch(/gemini/i);
  });

  it("does not call fetch or functions.invoke", () => {
    expect(src).not.toMatch(/fetch\s*\(/);
    expect(src).not.toMatch(/functions\.invoke/);
  });

  it("does not reference DB write helpers", () => {
    expect(src).not.toMatch(/\.insert\(/);
    expect(src).not.toMatch(/\.upsert\(/);
    expect(src).not.toMatch(/\.update\(/);
    expect(src).not.toMatch(/\.delete\(/);
    expect(src).not.toMatch(/\.rpc\(/);
  });

  it("does not reference alerts or action_queue tables", () => {
    expect(src).not.toMatch(/from\(["']alerts["']\)/);
    expect(src).not.toMatch(/from\(["']action_queue["']\)/);
  });

  it("does not contain secrets, env values, or service role", () => {
    expect(src).not.toMatch(/service_role/);
    expect(src).not.toMatch(/bridge[-_ ]?token/i);
    expect(src).not.toMatch(/OPENAI_API_KEY/);
    expect(src).not.toMatch(/VITE_/);
    expect(src).not.toMatch(/process\.env/);
    expect(src).not.toMatch(/sk-[A-Za-z0-9]/);
  });

  it("does not use browser persistence or clipboard", () => {
    expect(src).not.toContain("localStorage");
    expect(src).not.toContain("sessionStorage");
    expect(src).not.toContain("navigator.clipboard");
  });

  it("does not contain executable device-control names", () => {
    const names = [
      "controlDevice",
      "executeDevice",
      "sendCommand",
      "turnOn",
      "turnOff",
      "setFan",
      "setLight",
      "setPump",
      "setHeater",
      "setHumidifier",
      "doseNutrients",
      "flushReservoir",
    ];
    for (const n of names) expect(src).not.toContain(n);
  });

  it("does not use Date.now()", () => {
    expect(src).not.toMatch(/Date\.now\(/);
  });

  it("has no external imports", () => {
    const fromMatches = src.match(/from\s+["'][^"']+["']/g) || [];
    expect(fromMatches.length).toBe(0);
  });
});
