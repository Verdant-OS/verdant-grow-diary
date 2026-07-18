/**
 * One-Tent Loop Proof — deterministic telemetry fuzz suite.
 *
 * Bounded, fixed table of malformed `latest_sensor_snapshot` shapes.
 * Purpose: prove the Sensor Snapshot rule and full loop text report
 * never classify malformed / unknown / stale / invalid / demo /
 * untrusted telemetry as `passed`, `direct`, or as any healthy-claim
 * copy — regardless of what garbage flows in from an adapter.
 *
 * Pure. Deterministic. No randomness. No I/O. No React.
 */
import { describe, it, expect } from "vitest";
import {
  evaluateLoop,
  evaluateSensorSnapshot,
  enrichLoopStepRow,
  type LoopEvidence,
  type LoopStepRow,
} from "@/lib/oneTentLoopProofRules";
import {
  buildOneTentLoopLiveProofView,
  buildOneTentLoopLiveProofTextReport,
} from "@/lib/oneTentLoopLiveProofViewModel";

// ---------------------------------------------------------------------------
// Shared never-healthy helper (parallels the one in the rules test file).
// Allows honest negations the rules layer legitimately uses.
// ---------------------------------------------------------------------------
function hasUnsafeHealthyClaim(text: string): boolean {
  let scrubbed = text.toLowerCase();
  const allowedNegations = [
    /not healthy/g,
    /never shown as healthy/g,
    /never healthy/g,
    /excluded from healthy(?: status)?/g,
    /manual reading/g, // safety copy
  ];
  for (const re of allowedNegations) scrubbed = scrubbed.replace(re, "");
  return /\bhealthy\b|\bok\b|\bnormal\b|\bverified\b|\bsuccess\b|all good|no issues detected/.test(
    scrubbed,
  );
}

function collectRowText(row: LoopStepRow): string {
  return [
    row.status,
    row.safety_note,
    ...row.evidence,
    ...row.missing_info,
    row.drilldown?.what_is_missing ?? "",
    row.drilldown?.why_it_matters ?? "",
    row.drilldown?.where_to_record ?? "",
  ].join(" \n ");
}

const NOW_MS = Date.parse("2026-06-09T12:00:00.000Z");
const FRESH_ISO = "2026-06-09T11:58:00.000Z";
const STALE_LIVE_ISO = "2026-06-09T11:30:00.000Z"; // 30 min old
const OLD_ISO = "2026-06-01T00:00:00.000Z"; // >> 24h

// ---------------------------------------------------------------------------
// Helper — assert malformed sensor snapshot input never classifies as clean.
// ---------------------------------------------------------------------------

const ALLOWED_MALFORMED_STATUSES = new Set([
  "missing",
  "invalid",
  "stale",
  "demo_only",
  "needs_review",
  "blocked",
]);

function baseEvidence(snap: unknown): LoopEvidence {
  return {
    grow: { id: "g1", name: "G", stage: "veg", status: "active" },
    tent: { id: "t1", name: "T", grow_id: "g1", has_environment_target: true },
    plant: {
      id: "p1",
      name: "P",
      stage: "veg",
      medium: "coco",
      pot_size: "3 gal",
      tent_id: "t1",
    },
    latest_quick_log: null,
    timeline: null,
    latest_sensor_snapshot: snap as never,
    latest_ai_doctor: null,
    latest_alert: null,
    latest_action_queue: null,
    latest_follow_up: null,
    now_ms: NOW_MS,
  };
}

function assertTelemetryNotClean(input: unknown, caseName: string): void {
  // 1) Evaluator-level assertions.
  const row = evaluateSensorSnapshot(input as never, NOW_MS);
  expect(row.status, `${caseName}: status must not be passed`).not.toBe("passed");
  expect(
    ALLOWED_MALFORMED_STATUSES.has(row.status),
    `${caseName}: status ${row.status} not in safe set`,
  ).toBe(true);
  expect(hasUnsafeHealthyClaim(collectRowText(row)), `${caseName}: row text implies healthy`).toBe(
    false,
  );

  // 2) Enriched row — provenance must NEVER be direct for malformed input.
  const enriched = enrichLoopStepRow(row, baseEvidence(input));
  expect(enriched.provenance, `${caseName}: provenance must not be direct`).not.toBe("direct");
  expect(
    hasUnsafeHealthyClaim(collectRowText(enriched)),
    `${caseName}: enriched row implies healthy`,
  ).toBe(false);

  // 3) Full loop evaluation — sensor step never passed, no healthy wording.
  const rows = evaluateLoop(baseEvidence(input));
  const sensor = rows.find((r) => r.id === "sensor-snapshot")!;
  expect(sensor.status, `${caseName}: loop sensor status`).not.toBe("passed");
  expect(sensor.provenance, `${caseName}: loop sensor provenance`).not.toBe("direct");
  for (const r of rows) {
    expect(
      hasUnsafeHealthyClaim(collectRowText(r)),
      `${caseName}: row ${r.id} text implies healthy`,
    ).toBe(false);
  }

  // 4) View-model text report — must not imply healthy for this snapshot.
  const view = buildOneTentLoopLiveProofView(baseEvidence(input));
  const report = buildOneTentLoopLiveProofTextReport(view);
  expect(hasUnsafeHealthyClaim(report), `${caseName}: text report implies healthy`).toBe(false);
}

// ---------------------------------------------------------------------------
// Fixed fuzz table
// ---------------------------------------------------------------------------

interface FuzzCase {
  name: string;
  input: unknown;
}

const MISSING_FIELDS: FuzzCase[] = [
  { name: "empty object", input: {} },
  { name: "null snapshot", input: null },
  { name: "missing source (captured_at only)", input: { captured_at: FRESH_ISO } },
  { name: "missing captured_at (live)", input: { source: "live" } },
  { name: "missing captured_at (manual)", input: { source: "manual" } },
  // Note: `missing confidence on a fresh live snapshot` is intentionally
  // NOT in the never-clean table — confidence is optional and its
  // absence must not fabricate untrusted-ness. See helper self-checks.
  {
    name: "extra unknown fields around missing source",
    input: { foo: "bar", baz: 1, captured_at: FRESH_ISO },
  },
  {
    name: "extra unknown fields around invalid source",
    input: {
      source: "unknown",
      captured_at: FRESH_ISO,
      raw_payload: { bridge_token: "REDACT" },
      service_role: "REDACT",
    },
  },
];

const BAD_TYPES: FuzzCase[] = [
  { name: "source as number", input: { source: 42, captured_at: FRESH_ISO } },
  { name: "source as boolean", input: { source: true, captured_at: FRESH_ISO } },
  { name: "source as object", input: { source: { k: 1 }, captured_at: FRESH_ISO } },
  { name: "source as array", input: { source: ["live"], captured_at: FRESH_ISO } },
  { name: "captured_at as number", input: { source: "live", captured_at: 12345 } },
  { name: "captured_at as boolean", input: { source: "live", captured_at: false } },
  { name: "captured_at as object", input: { source: "live", captured_at: {} } },
  { name: "captured_at as array", input: { source: "live", captured_at: [] } },
  { name: "captured_at as empty string", input: { source: "live", captured_at: "" } },
  {
    name: "captured_at as invalid date string",
    input: { source: "live", captured_at: "not-a-date" },
  },
  {
    name: "confidence as string 'high'",
    input: { source: "live", captured_at: FRESH_ISO, confidence: "high" as unknown },
  },
  {
    name: "confidence as string 'trusted'",
    input: { source: "live", captured_at: FRESH_ISO, confidence: "trusted" as unknown },
  },
  {
    name: "confidence as string 'verified'",
    input: { source: "live", captured_at: FRESH_ISO, confidence: "verified" as unknown },
  },
  {
    name: "confidence outside range (999)",
    input: { source: "live", captured_at: FRESH_ISO, confidence: 999 },
  },
  {
    name: "confidence negative (-1)",
    input: { source: "live", captured_at: FRESH_ISO, confidence: -1 },
  },
  {
    name: "confidence as object",
    input: { source: "live", captured_at: FRESH_ISO, confidence: {} as unknown },
  },
  {
    name: "confidence as array",
    input: { source: "live", captured_at: FRESH_ISO, confidence: [] as unknown },
  },
  {
    name: "metric as number",
    input: { source: "live", captured_at: FRESH_ISO, metric: 3 as unknown },
  },
  {
    name: "metric as object",
    input: { source: "live", captured_at: FRESH_ISO, metric: {} as unknown },
  },
];

const UNEXPECTED_SOURCES: FuzzCase[] = [
  { name: "source 'unknown'", input: { source: "unknown", captured_at: FRESH_ISO } },
  { name: "source 'healthy'", input: { source: "healthy", captured_at: FRESH_ISO } },
  { name: "source 'ok'", input: { source: "ok", captured_at: FRESH_ISO } },
  { name: "source 'success'", input: { source: "success", captured_at: FRESH_ISO } },
  { name: "source 'verified'", input: { source: "verified", captured_at: FRESH_ISO } },
  { name: "source 'sensor'", input: { source: "sensor", captured_at: FRESH_ISO } },
  { name: "source 'ecowitt'", input: { source: "ecowitt", captured_at: FRESH_ISO } },
  {
    name: "source 'live ' with trailing whitespace",
    input: { source: "live ", captured_at: FRESH_ISO },
  },
  {
    name: "source 'LIVE' uppercase",
    input: { source: "LIVE", captured_at: FRESH_ISO },
  },
  { name: "source 'Manual' mixed case", input: { source: "Manual", captured_at: FRESH_ISO } },
  { name: "source empty string", input: { source: "", captured_at: FRESH_ISO } },
];

const STALE_INVALID_DEMO: FuzzCase[] = [
  {
    name: "live source with stale captured_at (30 min old)",
    input: { source: "live", captured_at: STALE_LIVE_ISO, confidence: 0.9 },
  },
  {
    name: "manual source with very old captured_at (>>24h)",
    input: { source: "manual", captured_at: OLD_ISO, confidence: 0.9 },
  },
  {
    name: "csv source with very old captured_at",
    input: { source: "csv", captured_at: OLD_ISO, confidence: 0.9 },
  },
  {
    name: "invalid source label",
    input: { source: "invalid", captured_at: FRESH_ISO },
  },
  {
    name: "demo source is demo_only, never passed",
    input: { source: "demo", captured_at: FRESH_ISO },
  },
  {
    name: "stale source label with fresh captured_at",
    input: { source: "stale", captured_at: FRESH_ISO },
  },
];

// Nested / NaN / Infinity / hostile-string-in-nested-shape cases. All of
// these must be rejected as invalid because the strict-shape guard
// forbids unknown top-level keys AND the type guards force malformed
// `metric` shapes to invalid. This proves nested raw values (whether
// NaN/Infinity strings, hostile literals like "healthy", or arbitrary
// vendor blobs) cannot flow into the derived proof text.
const NESTED_AND_NUMERIC: FuzzCase[] = [
  {
    name: "metric as nested object with name key",
    input: { source: "live", captured_at: FRESH_ISO, metric: { name: "humidity" } },
  },
  {
    name: "metric as nested object with hostile value 'healthy'",
    input: { source: "live", captured_at: FRESH_ISO, metric: { value: "healthy" } },
  },
  {
    name: "metric as array",
    input: { source: "live", captured_at: FRESH_ISO, metric: ["humidity"] },
  },
  {
    name: "metrics (plural, unknown key) present",
    input: { source: "live", captured_at: FRESH_ISO, metrics: { vpd_kpa: { value: 1.2 } } },
  },
  {
    name: "unknown key readings with NaN string",
    input: { source: "live", captured_at: FRESH_ISO, readings: { temp_f: "NaN" } },
  },
  {
    name: "unknown key readings with Infinity string",
    input: { source: "live", captured_at: FRESH_ISO, readings: { humidity_pct: "Infinity" } },
  },
  {
    name: "unknown key readings with -Infinity string",
    input: { source: "live", captured_at: FRESH_ISO, readings: { vpd_kpa: "-Infinity" } },
  },
  {
    name: "unknown key readings with 'not-a-number'",
    input: {
      source: "live",
      captured_at: FRESH_ISO,
      readings: { soil_moisture_pct: "not-a-number" },
    },
  },
  {
    name: "unknown key readings with nested numeric object",
    input: { source: "live", captured_at: FRESH_ISO, readings: { ec: { value: "1.4" } } },
  },
  {
    name: "unknown key readings with array value",
    input: { source: "live", captured_at: FRESH_ISO, readings: { ph: ["6.2"] } },
  },
  {
    name: "unknown key with nested hostile 'verified'",
    input: { source: "live", captured_at: FRESH_ISO, meta: { status: "verified" } },
  },
  {
    name: "unknown key with nested hostile 'success'",
    input: { source: "live", captured_at: FRESH_ISO, meta: { note: "success" } },
  },
  {
    name: "unknown key with nested hostile 'ok'",
    input: { source: "live", captured_at: FRESH_ISO, meta: { flag: "ok" } },
  },
  {
    name: "unknown key raw_payload with bridge_token",
    input: { source: "live", captured_at: FRESH_ISO, raw_payload: { bridge_token: "REDACT-ME" } },
  },
  {
    name: "unknown key service_role",
    input: { source: "live", captured_at: FRESH_ISO, service_role: "REDACT-ME" },
  },
];

const ALL_CASES: FuzzCase[] = [
  ...MISSING_FIELDS,
  ...BAD_TYPES,
  ...UNEXPECTED_SOURCES,
  ...STALE_INVALID_DEMO,
  ...NESTED_AND_NUMERIC,
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("One-Tent Loop Proof — telemetry fuzz (deterministic table)", () => {
  it("fuzz table is non-trivial", () => {
    expect(ALL_CASES.length).toBeGreaterThanOrEqual(30);
  });

  for (const c of ALL_CASES) {
    it(`malformed telemetry — ${c.name} — never classifies clean`, () => {
      assertTelemetryNotClean(c.input, c.name);
    });
  }
});

describe("assertTelemetryNotClean helper — self-checks", () => {
  it("a genuinely fresh live snapshot is allowed to pass (guardrail sanity)", () => {
    // The helper must NOT flag legitimate healthy live data. That's the
    // job of the fuzz table above; here we prove the helper isn't a
    // blanket "always fail" trap.
    const row = evaluateSensorSnapshot(
      { source: "live", quality: "ok", captured_at: FRESH_ISO, confidence: 0.9 },
      NOW_MS,
    );
    expect(row.status).toBe("passed");
    // Sensor step for fresh live is legitimately "direct".
    const enriched = enrichLoopStepRow(
      row,
      baseEvidence({
        source: "live",
        quality: "ok",
        captured_at: FRESH_ISO,
      }),
    );
    expect(enriched.provenance).toBe("direct");
  });
});
