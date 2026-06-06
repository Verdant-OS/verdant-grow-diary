import { describe, it, expect } from "vitest";
import {
  buildAiSensorSnapshotContext,
  buildAiSensorSnapshotsContext,
  DEFAULT_AI_SENSOR_STALE_THRESHOLD_MS,
} from "@/lib/aiSensorSnapshotContextRules";

const NOW = new Date("2026-06-06T12:00:00.000Z");
const CAPTURED_FRESH = "2026-06-06T11:55:00.000Z"; // 5 min ago

const baseReadings = {
  temperature_f: 76.4,
  humidity: 58,
  vpd_kpa: 1.12,
};

const make = (extra: Record<string, unknown> = {}) => ({
  captured_at: CAPTURED_FRESH,
  ...baseReadings,
  ...extra,
});

const FORBIDDEN_TOKENS = [
  /\bservice_role\b/i,
  /\bbearer\s/i,
  /\bvbt_/i,
  /\bapi[_-]?key\b/i,
  /\bbridge[_-]?token\b/i,
  /\bturn on\b/i,
  /\bturn off\b/i,
  /\bset fan\b/i,
  /\bset light\b/i,
  /\bexecute\b/i,
  /\bautopilot\b/i,
  /\bactuate\b/i,
];

function assertNoForbidden(text: string) {
  for (const re of FORBIDDEN_TOKENS) expect(text).not.toMatch(re);
}

// =========================================================
// 1. Locked annotationLine format snapshots
// =========================================================

describe("buildAiSensorSnapshotContext — locked annotation format", () => {
  it("live + fresh → trust=high with exact reading string", () => {
    const r = buildAiSensorSnapshotContext(make({ source: "live" }), { now: NOW });
    expect(r.annotationLine).toBe(
      "LATEST_SENSOR_SNAPSHOT [source=live, stale=false, trust=high]: temp=76.4°F, humidity=58%, vpd=1.12kPa",
    );
    expect(r.sourceLabel).toBe("live");
    expect(r.trustLevel).toBe("high");
    expect(r.isTrustedForAi).toBe(true);
    expect(r.valuesForModel).toEqual({
      temperature_f: 76.4,
      humidity: 58,
      vpd_kpa: 1.12,
    });
  });

  it("manual + fresh → trust=medium with exact reading string", () => {
    const r = buildAiSensorSnapshotContext(make({ source: "manual" }), { now: NOW });
    expect(r.annotationLine).toBe(
      "LATEST_SENSOR_SNAPSHOT [source=manual, stale=false, trust=medium]: temp=76.4°F, humidity=58%, vpd=1.12kPa",
    );
    expect(r.trustLevel).toBe("medium");
    expect(r.isTrustedForAi).toBe(true);
  });

  it("csv + fresh → trust=medium with exact reading string", () => {
    const r = buildAiSensorSnapshotContext(make({ source: "csv" }), { now: NOW });
    expect(r.annotationLine).toBe(
      "LATEST_SENSOR_SNAPSHOT [source=csv, stale=false, trust=medium]: temp=76.4°F, humidity=58%, vpd=1.12kPa",
    );
    expect(r.isTrustedForAi).toBe(true);
  });

  it("demo → exact fixed message", () => {
    const r = buildAiSensorSnapshotContext(make({ source: "demo" }), { now: NOW });
    expect(r.annotationLine).toBe(
      "LATEST_SENSOR_SNAPSHOT [source=demo, stale=false, trust=low]: values omitted; demo data is not trusted for diagnosis.",
    );
    expect(r.valuesForModel).toBeNull();
    expect(r.isTrustedForAi).toBe(false);
  });

  it("stale (explicit source) → exact fixed message + stale=true", () => {
    const r = buildAiSensorSnapshotContext(make({ source: "stale" }), { now: NOW });
    expect(r.annotationLine).toBe(
      "LATEST_SENSOR_SNAPSHOT [source=stale, stale=true, trust=low]: readings may not reflect current tent conditions.",
    );
    expect(r.stale).toBe(true);
    expect(r.isTrustedForAi).toBe(false);
  });

  it("invalid → exact fixed message", () => {
    const r = buildAiSensorSnapshotContext(make({ source: "invalid" }), { now: NOW });
    expect(r.annotationLine).toBe(
      "LATEST_SENSOR_SNAPSHOT [source=invalid, stale=false, trust=low]: values omitted; invalid sensor data is not trusted for diagnosis.",
    );
    expect(r.isTrustedForAi).toBe(false);
  });

  it("unknown → exact fixed message", () => {
    const r = buildAiSensorSnapshotContext(make({ source: "weird-thing" }), { now: NOW });
    expect(r.annotationLine).toBe(
      "LATEST_SENSOR_SNAPSHOT [source=unknown, stale=false, trust=low]: values omitted; unknown source data is not trusted for diagnosis.",
    );
    expect(r.isTrustedForAi).toBe(false);
  });
});

// =========================================================
// 2. staleThresholdMs edge cases
// =========================================================

describe("buildAiSensorSnapshotContext — staleThresholdMs edges", () => {
  const capturedAtMsAgo = (ms: number) =>
    new Date(NOW.getTime() - ms).toISOString();

  it("exactly on stale threshold → NOT stale (strict greater-than comparison)", () => {
    const r = buildAiSensorSnapshotContext(
      { source: "live", captured_at: capturedAtMsAgo(60_000), ...baseReadings },
      { now: NOW, staleThresholdMs: 60_000 },
    );
    expect(r.stale).toBe(false);
    expect(r.trustLevel).toBe("high");
    expect(r.isTrustedForAi).toBe(true);
  });

  it("just over stale threshold → stale=true, trust=low", () => {
    const r = buildAiSensorSnapshotContext(
      { source: "live", captured_at: capturedAtMsAgo(60_001), ...baseReadings },
      { now: NOW, staleThresholdMs: 60_000 },
    );
    expect(r.stale).toBe(true);
    expect(r.trustLevel).toBe("low");
    expect(r.isTrustedForAi).toBe(false);
  });

  it("zero threshold → any positive age is stale and untrusted", () => {
    const r = buildAiSensorSnapshotContext(
      { source: "live", captured_at: capturedAtMsAgo(1), ...baseReadings },
      { now: NOW, staleThresholdMs: 0 },
    );
    expect(r.stale).toBe(true);
    expect(r.isTrustedForAi).toBe(false);
    expect(r.trustLevel).toBe("low");
  });

  it("negative threshold → still untrusted (never trusts old data)", () => {
    const r = buildAiSensorSnapshotContext(
      { source: "live", captured_at: capturedAtMsAgo(1000), ...baseReadings },
      { now: NOW, staleThresholdMs: -1 },
    );
    expect(r.isTrustedForAi).toBe(false);
    expect(r.trustLevel).toBe("low");
  });

  it("missing captured_at → low trust + missing-information hint, values omitted", () => {
    const r = buildAiSensorSnapshotContext(
      { source: "manual", ...baseReadings },
      { now: NOW },
    );
    expect(r.trustLevel).toBe("low");
    expect(r.valuesForModel).toBeNull();
    expect(r.isTrustedForAi).toBe(false);
    expect(r.missingInformationHints.some((h) => /captured_at/i.test(h))).toBe(true);
    expect(r.annotationLine).toContain("captured_at missing");
  });

  it("invalid captured_at → low trust + safety note, values omitted", () => {
    const r = buildAiSensorSnapshotContext(
      { source: "live", captured_at: "not-a-real-date", ...baseReadings },
      { now: NOW },
    );
    expect(r.trustLevel).toBe("low");
    expect(r.valuesForModel).toBeNull();
    expect(r.isTrustedForAi).toBe(false);
    expect(r.safetyNotes.some((n) => /invalid/i.test(n))).toBe(true);
    expect(r.annotationLine).toContain("captured_at invalid");
  });

  it("default threshold constant matches 30 minutes", () => {
    expect(DEFAULT_AI_SENSOR_STALE_THRESHOLD_MS).toBe(30 * 60 * 1000);
  });
});

// =========================================================
// 3. General determinism & safety
// =========================================================

describe("buildAiSensorSnapshotContext — determinism & safety", () => {
  it("is deterministic for the same (snapshot, now)", () => {
    const a = buildAiSensorSnapshotContext(make({ source: "live" }), { now: NOW });
    const b = buildAiSensorSnapshotContext(make({ source: "live" }), { now: NOW });
    expect(a).toEqual(b);
  });

  it("emits no device-control language, secrets, or admin tokens across all source kinds", () => {
    const cases: unknown[] = [
      null,
      "string",
      make({ source: "live" }),
      make({ source: "manual" }),
      make({ source: "csv" }),
      make({ source: "demo" }),
      make({ source: "invalid" }),
      make({ source: "unknown" }),
      make({ source: "stale" }),
      { source: "live", captured_at: "2026-06-06T10:00:00Z", ...baseReadings },
      { source: "manual", ...baseReadings },
      { source: "live", captured_at: "broken", ...baseReadings },
    ];
    for (const c of cases) {
      const r = buildAiSensorSnapshotContext(c, { now: NOW });
      assertNoForbidden(JSON.stringify(r));
    }
  });

  it("null snapshot produces 'none' line and is untrusted", () => {
    const r = buildAiSensorSnapshotContext(null, { now: NOW });
    expect(r.annotationLine).toBe("LATEST_SENSOR_SNAPSHOT: none");
    expect(r.isTrustedForAi).toBe(false);
  });

  it("non-object snapshot is reported invalid", () => {
    const r = buildAiSensorSnapshotContext("oops" as unknown, { now: NOW });
    expect(r.sourceLabel).toBe("invalid");
    expect(r.annotationLine).toBe(
      "LATEST_SENSOR_SNAPSHOT [source=invalid, stale=false, trust=low]: values omitted; invalid sensor data is not trusted for diagnosis.",
    );
  });
});

// =========================================================
// 4. Multi-snapshot aggregation
// =========================================================

describe("buildAiSensorSnapshotsContext — aggregation", () => {
  it("preserves per-snapshot source labels (does not upgrade manual to live)", () => {
    const r = buildAiSensorSnapshotsContext(
      [make({ source: "manual" }), make({ source: "live" })],
      { now: NOW },
    );
    expect(r.annotationLines).toHaveLength(2);
    expect(r.annotationLines[0]).toContain("source=manual");
    expect(r.annotationLines[1]).toContain("source=live");
  });

  it("dedupes + sorts safety notes and missing-information hints", () => {
    const r = buildAiSensorSnapshotsContext(
      [
        make({ source: "demo" }),
        make({ source: "demo" }),
        make({ source: "invalid" }),
      ],
      { now: NOW },
    );
    expect(r.safetyNotes).toEqual([...r.safetyNotes].sort());
    expect(new Set(r.safetyNotes).size).toBe(r.safetyNotes.length);
    expect(r.missingInformationHints).toEqual(
      [...r.missingInformationHints].sort(),
    );
    expect(new Set(r.missingInformationHints).size).toBe(
      r.missingInformationHints.length,
    );
  });

  it("reports highest and lowest trust levels across mixed snapshots", () => {
    const r = buildAiSensorSnapshotsContext(
      [make({ source: "live" }), make({ source: "demo" }), make({ source: "manual" })],
      { now: NOW },
    );
    expect(r.highestTrustLevel).toBe("high");
    expect(r.lowestTrustLevel).toBe("low");
    expect(r.hasUntrustedSnapshots).toBe(true);
    expect(r.trustedSnapshotCount).toBe(2);
    expect(r.omittedSnapshotCount).toBe(1);
  });

  it("never hides stale/demo presence in aggregated output", () => {
    const r = buildAiSensorSnapshotsContext(
      [make({ source: "live" }), make({ source: "stale" })],
      { now: NOW },
    );
    expect(r.hasStaleSnapshots).toBe(true);
    expect(r.annotationLines.some((l) => l.includes("source=stale"))).toBe(true);
  });

  it("empty input returns 'none' line and untrusted flags", () => {
    const r = buildAiSensorSnapshotsContext([], { now: NOW });
    expect(r.annotationLines).toEqual(["LATEST_SENSOR_SNAPSHOT: none"]);
    expect(r.hasUntrustedSnapshots).toBe(true);
    expect(r.trustedSnapshotCount).toBe(0);
  });

  it("byte-identical for same input + fixed now", () => {
    const input = [make({ source: "live" }), make({ source: "demo" })];
    const a = buildAiSensorSnapshotsContext(input, { now: NOW });
    const b = buildAiSensorSnapshotsContext(input, { now: NOW });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

// =========================================================
// 5. Raw-blob forwarding regression (rules layer)
// =========================================================

describe("buildAiSensorSnapshotContext — raw blob regression", () => {
  it("annotation output never includes raw 'sensor_snapshot' or 'raw_payload' JSON blob", () => {
    const noisy = make({
      source: "live",
      raw_payload: { secret_token: "vbt_super_secret", inner: { device: "fan_42" } },
      sensor_snapshot: { nested: true },
    });
    const r = buildAiSensorSnapshotContext(noisy, { now: NOW });
    const text = JSON.stringify(r);
    expect(text).not.toMatch(/"raw_payload"/);
    expect(text).not.toMatch(/"sensor_snapshot"/);
    expect(text).not.toMatch(/vbt_super_secret/);
    expect(text).not.toMatch(/fan_42/);
    assertNoForbidden(text);
  });

  it("annotation precedes any reading values in the line", () => {
    const r = buildAiSensorSnapshotContext(make({ source: "live" }), { now: NOW });
    const bracketIdx = r.annotationLine.indexOf("[source=");
    const valueIdx = r.annotationLine.indexOf("temp=");
    expect(bracketIdx).toBeGreaterThanOrEqual(0);
    expect(valueIdx).toBeGreaterThan(bracketIdx);
  });
});
