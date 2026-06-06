import { describe, it, expect } from "vitest";
import {
  buildAiSensorSnapshotContext,
} from "@/lib/aiSensorSnapshotContextRules";

const NOW = new Date("2026-06-06T12:00:00.000Z");
const fresh = (extra: Record<string, unknown> = {}) => ({
  captured_at: "2026-06-06T11:55:00.000Z",
  temperature_c: 24.5,
  humidity: 58,
  vpd_kpa: 1.12,
  ...extra,
});

describe("buildAiSensorSnapshotContext (shared)", () => {
  it("returns a low-trust untrusted result when snapshot is null", () => {
    const r = buildAiSensorSnapshotContext(null, { now: NOW });
    expect(r.sourceLabel).toBe("unknown");
    expect(r.trustLevel).toBe("low");
    expect(r.isTrustedForAi).toBe(false);
    expect(r.valuesForModel).toBeNull();
    expect(r.annotationLine).toContain("LATEST_SENSOR_SNAPSHOT");
    expect(r.missingInformationHints.length).toBeGreaterThan(0);
  });

  it("treats a non-object snapshot as invalid and omits values", () => {
    const r = buildAiSensorSnapshotContext("oops" as unknown, { now: NOW });
    expect(r.sourceLabel).toBe("invalid");
    expect(r.isTrustedForAi).toBe(false);
    expect(r.valuesForModel).toBeNull();
    expect(r.safetyNotes.join(" ")).toMatch(/not.*structured|invalid/i);
  });

  it("annotates fresh manual snapshots as medium trust and trusted", () => {
    const r = buildAiSensorSnapshotContext(fresh({ source: "manual" }), { now: NOW });
    expect(r.sourceLabel).toBe("manual");
    expect(r.stale).toBe(false);
    expect(r.trustLevel).toBe("medium");
    expect(r.isTrustedForAi).toBe(true);
    expect(r.annotationLine).toMatch(/source=manual.*stale=false.*trust=medium/);
    expect(r.valuesForModel).toEqual({
      temperature_c: 24.5,
      humidity: 58,
      vpd_kpa: 1.12,
    });
  });

  it("annotates fresh live snapshots as trusted", () => {
    const r = buildAiSensorSnapshotContext(fresh({ source: "live" }), { now: NOW });
    expect(r.sourceLabel).toBe("live");
    expect(r.isTrustedForAi).toBe(true);
    expect(r.trustLevel).toBe("medium");
  });

  it("normalizes csv-ish aliases (imported) to csv", () => {
    const r = buildAiSensorSnapshotContext(fresh({ source: "imported" }), { now: NOW });
    expect(r.sourceLabel).toBe("csv");
    expect(r.isTrustedForAi).toBe(true);
  });

  it("flags demo snapshots and omits values + downgrades trust", () => {
    const r = buildAiSensorSnapshotContext(fresh({ source: "demo" }), { now: NOW });
    expect(r.sourceLabel).toBe("demo");
    expect(r.trustLevel).toBe("low");
    expect(r.isTrustedForAi).toBe(false);
    expect(r.valuesForModel).toBeNull();
    expect(r.annotationLine).toMatch(/source=demo/);
    expect(r.safetyNotes.join(" ")).toMatch(/demo/i);
  });

  it("flags invalid snapshots and omits values", () => {
    const r = buildAiSensorSnapshotContext(fresh({ source: "invalid" }), { now: NOW });
    expect(r.sourceLabel).toBe("invalid");
    expect(r.isTrustedForAi).toBe(false);
    expect(r.valuesForModel).toBeNull();
  });

  it("flags unknown source and omits values", () => {
    const r = buildAiSensorSnapshotContext(fresh({ source: "weird-source" }), {
      now: NOW,
    });
    expect(r.sourceLabel).toBe("unknown");
    expect(r.isTrustedForAi).toBe(false);
    expect(r.valuesForModel).toBeNull();
    expect(r.missingInformationHints.join(" ")).toMatch(/source-labeled/i);
  });

  it("demotes live snapshots older than the freshness window to stale + low trust", () => {
    const r = buildAiSensorSnapshotContext(
      fresh({ source: "live", captured_at: "2026-06-06T11:00:00.000Z" }),
      { now: NOW },
    );
    expect(r.sourceLabel).toBe("live"); // provenance preserved
    expect(r.stale).toBe(true);
    expect(r.trustLevel).toBe("low");
    expect(r.isTrustedForAi).toBe(false);
    expect(r.annotationLine).toMatch(/source=live.*stale=true/);
  });

  it("treats missing captured_at on live/manual as stale", () => {
    const r = buildAiSensorSnapshotContext(
      { source: "manual", temperature_c: 22 },
      { now: NOW },
    );
    expect(r.stale).toBe(true);
    expect(r.isTrustedForAi).toBe(false);
  });

  it("is deterministic for the same (snapshot, now)", () => {
    const a = buildAiSensorSnapshotContext(fresh({ source: "live" }), { now: NOW });
    const b = buildAiSensorSnapshotContext(fresh({ source: "live" }), { now: NOW });
    expect(a).toEqual(b);
  });

  it("emits no device-control language, secrets, or admin tokens", () => {
    const snapshots: unknown[] = [
      null,
      "string",
      fresh({ source: "live" }),
      fresh({ source: "manual" }),
      fresh({ source: "demo" }),
      fresh({ source: "invalid" }),
      fresh({ source: "unknown" }),
      fresh({ source: "live", captured_at: "2026-06-06T10:00:00Z" }),
    ];
    const FORBIDDEN = [
      /\bturn on\b/i,
      /\bturn off\b/i,
      /\bactuate\b/i,
      /\bcontrol\b/i,
      /\bservice_role\b/i,
      /\bvbt_/i,
      /\bbearer\s/i,
      /\bapi[_-]?key\b/i,
    ];
    for (const s of snapshots) {
      const r = buildAiSensorSnapshotContext(s, { now: NOW });
      const text = JSON.stringify(r);
      for (const re of FORBIDDEN) expect(text).not.toMatch(re);
    }
  });
});
