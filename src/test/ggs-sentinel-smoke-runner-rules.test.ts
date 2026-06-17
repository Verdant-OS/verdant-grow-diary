import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assessMetricFreshness,
  runGgsSentinelSmoke,
  REQUIRED_METRIC_KEYS,
  SPIDER_FARMER_GGS_AGING_MS,
  type SentinelSensorRow,
} from "@/lib/ggsSentinelSmokeRunner";
import { SPIDER_FARMER_GGS_PROVIDER, SPIDER_FARMER_GGS_STALE_MS } from "@/lib/spiderFarmerGgsMappingRules";

const NOW = new Date("2026-06-17T12:00:00.000Z");
const fresh = (offsetSec = 60) =>
  new Date(NOW.getTime() - offsetSec * 1000).toISOString();
const aging = () =>
  new Date(NOW.getTime() - (SPIDER_FARMER_GGS_AGING_MS + 60_000)).toISOString();
const stale = () =>
  new Date(NOW.getTime() - (SPIDER_FARMER_GGS_STALE_MS + 60_000)).toISOString();

function row(overrides: Partial<SentinelSensorRow> & Pick<SentinelSensorRow, "metric" | "value">): SentinelSensorRow {
  return {
    source: SPIDER_FARMER_GGS_PROVIDER,
    quality: "live",
    captured_at: fresh(),
    ...overrides,
  };
}

function freshGgsBaseline(): SentinelSensorRow[] {
  return [
    row({ metric: "soil_temp_c", value: 22.4 }),
    row({ metric: "soil_ec", value: 1.8 }),
  ];
}

describe("runGgsSentinelSmoke — happy path", () => {
  it("PASS_LIVE_SENTINEL_READY when both required metrics are fresh + canonical + live quality", () => {
    const v = runGgsSentinelSmoke({ rows: freshGgsBaseline(), now: NOW });
    expect(v.state).toBe("PASS_LIVE_SENTINEL_READY");
    expect(v.reasonCodes).toEqual([]);
    expect(v.freshness).toHaveLength(REQUIRED_METRIC_KEYS.length);
    for (const f of v.freshness) {
      expect(f.state).toBe("fresh");
    }
  });

  it("is deterministic for the same input + now", () => {
    const rows = freshGgsBaseline();
    const a = runGgsSentinelSmoke({ rows, now: NOW });
    const b = runGgsSentinelSmoke({ rows, now: NOW });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("picks the latest row per metric when multiple are present", () => {
    const v = runGgsSentinelSmoke({
      rows: [
        row({ metric: "soil_temp_c", value: 20.0, captured_at: stale() }),
        row({ metric: "soil_temp_c", value: 22.5, captured_at: fresh(30) }),
        row({ metric: "soil_ec", value: 1.5, captured_at: aging() }),
        row({ metric: "soil_ec", value: 1.9, captured_at: fresh(45) }),
      ],
      now: NOW,
    });
    expect(v.state).toBe("PASS_LIVE_SENTINEL_READY");
  });
});

describe("runGgsSentinelSmoke — verdict precedence (lowest blocker wins)", () => {
  it("BLOCKED_NO_GGS_ROWS when rows array is empty", () => {
    const v = runGgsSentinelSmoke({ rows: [], now: NOW });
    expect(v.state).toBe("BLOCKED_NO_GGS_ROWS");
  });

  it("BLOCKED_VENDOR_PROVENANCE_MISSING when no row carries the spider_farmer_ggs source", () => {
    const v = runGgsSentinelSmoke({
      rows: [
        row({ metric: "soil_temp_c", value: 22, source: "ecowitt" }),
        row({ metric: "soil_ec", value: 1.8, source: "ecowitt" }),
      ],
      now: NOW,
    });
    expect(v.state).toBe("BLOCKED_VENDOR_PROVENANCE_MISSING");
  });

  it("BLOCKED_SOURCE_NOT_CANONICAL when any row carries a non-GGS source label, even if a GGS row exists", () => {
    const v = runGgsSentinelSmoke({
      rows: [
        row({ metric: "soil_temp_c", value: 22 }),
        row({ metric: "soil_ec", value: 1.8, source: "ecowitt" }),
      ],
      now: NOW,
    });
    expect(v.state).toBe("BLOCKED_SOURCE_NOT_CANONICAL");
  });

  it("BLOCKED_SOURCE_NOT_CANONICAL when any row carries a quality outside the closed vocabulary", () => {
    const v = runGgsSentinelSmoke({
      rows: [
        row({ metric: "soil_temp_c", value: 22 }),
        row({ metric: "soil_ec", value: 1.8, quality: "weird" }),
      ],
      now: NOW,
    });
    expect(v.state).toBe("BLOCKED_SOURCE_NOT_CANONICAL");
  });

  it("BLOCKED_VALIDATION_ERROR when a row has a non-finite value", () => {
    const v = runGgsSentinelSmoke({
      rows: [
        row({ metric: "soil_temp_c", value: 22 }),
        row({ metric: "soil_ec", value: Number.NaN }),
      ],
      now: NOW,
    });
    expect(v.state).toBe("BLOCKED_VALIDATION_ERROR");
  });

  it("BLOCKED_VALIDATION_ERROR when a row has an invalid captured_at string", () => {
    const v = runGgsSentinelSmoke({
      rows: [
        row({ metric: "soil_temp_c", value: 22 }),
        row({ metric: "soil_ec", value: 1.8, captured_at: "not-a-date" }),
      ],
      now: NOW,
    });
    expect(v.state).toBe("BLOCKED_VALIDATION_ERROR");
  });

  it("BLOCKED_NO_SOIL_TEMP_C when soil_temp_c row is absent (but soil_ec present)", () => {
    const v = runGgsSentinelSmoke({
      rows: [row({ metric: "soil_ec", value: 1.8 })],
      now: NOW,
    });
    expect(v.state).toBe("BLOCKED_NO_SOIL_TEMP_C");
  });

  it("BLOCKED_NO_EC when soil_ec row is absent (but soil_temp_c present)", () => {
    const v = runGgsSentinelSmoke({
      rows: [row({ metric: "soil_temp_c", value: 22 })],
      now: NOW,
    });
    expect(v.state).toBe("BLOCKED_NO_EC");
  });

  it("BLOCKED_STALE_READING when any row carries quality=stale", () => {
    const v = runGgsSentinelSmoke({
      rows: [
        row({ metric: "soil_temp_c", value: 22 }),
        row({ metric: "soil_ec", value: 1.8, quality: "stale" }),
      ],
      now: NOW,
    });
    expect(v.state).toBe("BLOCKED_STALE_READING");
  });

  it("BLOCKED_STALE_READING when latest row for a required metric is older than the stale threshold", () => {
    const v = runGgsSentinelSmoke({
      rows: [
        row({ metric: "soil_temp_c", value: 22, captured_at: stale() }),
        row({ metric: "soil_ec", value: 1.8 }),
      ],
      now: NOW,
    });
    expect(v.state).toBe("BLOCKED_STALE_READING");
  });
});

describe("runGgsSentinelSmoke — freshness guidance is explanatory only", () => {
  it("a fresh_but_aging metric does NOT demote PASS to BLOCKED_STALE_READING", () => {
    const v = runGgsSentinelSmoke({
      rows: [
        row({ metric: "soil_temp_c", value: 22, captured_at: aging() }),
        row({ metric: "soil_ec", value: 1.8 }),
      ],
      now: NOW,
    });
    expect(v.state).toBe("PASS_LIVE_SENTINEL_READY");
    const ageingMetric = v.freshness.find((f) => f.metric === "soil_temp_c");
    expect(ageingMetric?.state).toBe("fresh_but_aging");
  });

  it("freshness always surfaces both required metrics, even on blocked verdicts", () => {
    const v = runGgsSentinelSmoke({ rows: [], now: NOW });
    expect(v.freshness.map((f) => f.metric).sort()).toEqual([...REQUIRED_METRIC_KEYS].sort());
  });
});

describe("assessMetricFreshness — boundary behavior", () => {
  it("returns 'missing' when no row is provided", () => {
    const a = assessMetricFreshness(null, "soil_ec", NOW);
    expect(a.state).toBe("missing");
    expect(a.ageMs).toBeNull();
    expect(a.capturedAt).toBeNull();
    expect(a.nextAction).toBe("Paste/ingest a real GGS payload");
  });

  it("returns 'fresh' when ageMs <= aging threshold", () => {
    const a = assessMetricFreshness(
      { metric: "soil_temp_c", value: 22, source: SPIDER_FARMER_GGS_PROVIDER, quality: "live", captured_at: fresh(30) },
      "soil_temp_c",
      NOW,
    );
    expect(a.state).toBe("fresh");
  });

  it("returns 'fresh_but_aging' when aging < ageMs <= stale", () => {
    const a = assessMetricFreshness(
      { metric: "soil_temp_c", value: 22, source: SPIDER_FARMER_GGS_PROVIDER, quality: "live", captured_at: aging() },
      "soil_temp_c",
      NOW,
    );
    expect(a.state).toBe("fresh_but_aging");
  });

  it("returns 'stale' when ageMs > stale threshold", () => {
    const a = assessMetricFreshness(
      { metric: "soil_temp_c", value: 22, source: SPIDER_FARMER_GGS_PROVIDER, quality: "live", captured_at: stale() },
      "soil_temp_c",
      NOW,
    );
    expect(a.state).toBe("stale");
  });
});

describe("safety: verdict surface never includes raw_payload", () => {
  it("verdict object has no field even remotely shaped like raw_payload", () => {
    const v = runGgsSentinelSmoke({ rows: freshGgsBaseline(), now: NOW });
    const serialized = JSON.stringify(v);
    expect(serialized).not.toMatch(/raw_payload/i);
    expect(serialized).not.toMatch(/payload/i);
  });
});

describe("static safety scan — ggsSentinelSmokeRunner.ts", () => {
  const src = readFileSync(resolve(process.cwd(), "src/lib/ggsSentinelSmokeRunner.ts"), "utf8");
  const forbidden = [
    "@/integrations/supabase/client",
    'from "react"',
    "from 'react'",
    ".insert(",
    ".update(",
    ".delete(",
    ".upsert(",
    ".from(",
    ".rpc(",
    "functions.invoke",
    "service_role",
    "action_queue",
    "mqtt.connect",
    "publish(",
    "fetch(",
    "axios",
    "ggs_live",
    "ggs_csv",
  ];
  for (const term of forbidden) {
    it(`does not reference \`${term}\``, () => {
      expect(src).not.toContain(term);
    });
  }
  it("does not export any command/control symbols", () => {
    expect(src).not.toMatch(/export\s+(function|const)\s+\w*(command|control|setpoint|write|publish)/i);
  });
  it("does not surface raw_payload as a field on any exported type", () => {
    expect(src).not.toMatch(/raw_payload\s*[:?]/);
  });
});
