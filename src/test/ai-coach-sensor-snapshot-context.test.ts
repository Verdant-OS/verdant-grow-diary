import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildAiCoachSensorSnapshotContext,
  DEFAULT_AI_COACH_STALE_THRESHOLD_MS,
} from "@/lib/aiCoachSensorSnapshotContext";

const NOW = new Date("2026-06-06T12:00:00.000Z");
const FRESH = "2026-06-06T11:55:00.000Z";
const STALE = new Date(NOW.getTime() - (DEFAULT_AI_COACH_STALE_THRESHOLD_MS + 60_000)).toISOString();

describe("buildAiCoachSensorSnapshotContext — source-aware annotation", () => {
  it("returns 'none' line when snapshot is null", () => {
    const r = buildAiCoachSensorSnapshotContext(null, { now: NOW });
    expect(r.line).toBe("LATEST_SENSOR_SNAPSHOT: none");
    expect(r.includesValues).toBe(false);
    expect(r.trust).toBe("low");
    expect(r.missingInformationHints.length).toBeGreaterThan(0);
  });

  it("demo snapshot: trust=low, values omitted, safety + missing-info hints", () => {
    const r = buildAiCoachSensorSnapshotContext(
      { source: "demo", captured_at: FRESH, temperature_c: 24, humidity: 55 },
      { now: NOW },
    );
    expect(r.source).toBe("demo");
    expect(r.trust).toBe("low");
    expect(r.includesValues).toBe(false);
    expect(r.line).toContain("[source=demo");
    expect(r.line).toContain("trust=low");
    expect(r.line).toMatch(/values omitted/);
    expect(r.line).not.toContain("temperature_c=24");
    expect(r.line).not.toContain("humidity=55");
    expect(r.safetyNotes.join(" ")).toMatch(/demo/i);
    expect(r.missingInformationHints.length).toBeGreaterThan(0);
  });

  it("stale snapshot (>30m old) via injectable now: stale=true, trust=low", () => {
    const r = buildAiCoachSensorSnapshotContext(
      { source: "live", captured_at: STALE, temperature_c: 23, humidity: 50 },
      { now: NOW },
    );
    expect(r.stale).toBe(true);
    expect(r.trust).toBe("low");
    expect(r.line).toContain("stale=true");
    expect(r.line).toContain("[source=live"); // provenance preserved
    expect(r.includesValues).toBe(true);
    expect(r.line).toContain("temperature_c=23");
    expect(r.safetyNotes.join(" ")).toMatch(/may not reflect current/i);
  });

  it("explicit source=stale: trust=low, values kept, safety note added", () => {
    const r = buildAiCoachSensorSnapshotContext(
      { source: "stale", captured_at: FRESH, temperature_c: 25 },
      { now: NOW },
    );
    expect(r.source).toBe("stale");
    expect(r.stale).toBe(true);
    expect(r.trust).toBe("low");
    expect(r.includesValues).toBe(true);
    expect(r.safetyNotes.length).toBeGreaterThan(0);
  });

  it("invalid snapshot: values omitted, missing-info hint emitted", () => {
    const r = buildAiCoachSensorSnapshotContext(
      { source: "invalid", captured_at: FRESH, temperature_c: 999, humidity: 200 },
      { now: NOW },
    );
    expect(r.source).toBe("invalid");
    expect(r.trust).toBe("low");
    expect(r.includesValues).toBe(false);
    expect(r.line).not.toContain("temperature_c=999");
    expect(r.missingInformationHints.length).toBeGreaterThan(0);
  });

  it("fresh manual snapshot: source=manual, values present, trust=medium", () => {
    const r = buildAiCoachSensorSnapshotContext(
      { source: "manual", captured_at: FRESH, temperature_c: 24.5, humidity: 55, vpd_kpa: 1.1 },
      { now: NOW },
    );
    expect(r.source).toBe("manual");
    expect(r.stale).toBe(false);
    expect(r.trust).toBe("medium");
    expect(r.includesValues).toBe(true);
    expect(r.line).toContain("temperature_c=24.5");
    expect(r.line).toContain("humidity=55");
    expect(r.line).toContain("vpd_kpa=1.1");
    // manual must not be relabeled as live
    expect(r.line).not.toContain("[source=live");
  });

  it("fresh live snapshot: source=live, values present", () => {
    const r = buildAiCoachSensorSnapshotContext(
      { source: "live", captured_at: FRESH, temperature_c: 24, humidity: 55 },
      { now: NOW },
    );
    expect(r.source).toBe("live");
    expect(r.trust).toBe("medium");
    expect(r.includesValues).toBe(true);
    expect(r.line).toContain("[source=live");
  });

  it("fresh csv snapshot: source=csv, never relabeled live", () => {
    const r = buildAiCoachSensorSnapshotContext(
      { source: "csv", captured_at: FRESH, temperature_c: 24, humidity: 55 },
      { now: NOW },
    );
    expect(r.source).toBe("csv");
    expect(r.trust).toBe("medium");
    expect(r.includesValues).toBe(true);
    expect(r.line).toContain("[source=csv");
    expect(r.line).not.toContain("[source=live");
  });

  it("legacy 'imported' source label normalizes to csv (still not live)", () => {
    const r = buildAiCoachSensorSnapshotContext(
      { source: "imported", captured_at: FRESH, temperature_c: 24 },
      { now: NOW },
    );
    expect(r.source).toBe("csv");
    expect(r.line).not.toContain("[source=live");
  });

  it("unknown/unlabeled snapshot: downgraded to trust=low and clearly annotated", () => {
    const r = buildAiCoachSensorSnapshotContext(
      { captured_at: FRESH, temperature_c: 24, humidity: 55 },
      { now: NOW },
    );
    expect(r.source).toBe("unknown");
    expect(r.trust).toBe("low");
    expect(r.includesValues).toBe(false);
    expect(r.line).toContain("[source=unknown");
    expect(r.missingInformationHints.length).toBeGreaterThan(0);
  });

  it("non-object snapshot: invalid, omitted, safety note", () => {
    const r = buildAiCoachSensorSnapshotContext("oops" as unknown, { now: NOW });
    expect(r.source).toBe("invalid");
    expect(r.includesValues).toBe(false);
    expect(r.safetyNotes.length).toBeGreaterThan(0);
  });

  it("is deterministic — same input + same now → byte-identical output", () => {
    const snap = { source: "manual", captured_at: FRESH, temperature_c: 24, humidity: 55 };
    const a = buildAiCoachSensorSnapshotContext(snap, { now: NOW });
    const b = buildAiCoachSensorSnapshotContext(snap, { now: NOW });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("never emits device-control language", () => {
    const cases = [
      { source: "live", captured_at: FRESH, temperature_c: 24, humidity: 55 },
      { source: "demo", captured_at: FRESH, temperature_c: 24 },
      { source: "invalid", captured_at: FRESH, temperature_c: 999 },
      { source: "stale", captured_at: STALE, temperature_c: 24 },
      null,
      "garbage" as unknown,
    ];
    for (const snap of cases) {
      const r = buildAiCoachSensorSnapshotContext(snap, { now: NOW });
      const blob = JSON.stringify(r).toLowerCase();
      for (const term of [
        "turn on", "turn off", "switch on", "switch off",
        "actuate", "publish_command", "setpoint", "set_fan", "set_light",
        " write_", "command:",
      ]) {
        expect(blob, `should not contain "${term}"`).not.toContain(term);
      }
      // `control` allowed only inside word boundaries we never use
      expect(blob).not.toMatch(/\bcontrol\b/);
    }
  });
});

describe("ai-coach edge function — static safety + wiring scan", () => {
  const indexSrc = readFileSync(
    resolve(process.cwd(), "supabase/functions/ai-coach/index.ts"),
    "utf8",
  );
  const helperSrc = readFileSync(
    resolve(process.cwd(), "supabase/functions/ai-coach/sensorSnapshotContext.ts"),
    "utf8",
  );

  it("plant select includes medium and pot_size", () => {
    expect(indexSrc).toMatch(/\.from\("plants"\)\.select\([^)]*medium[^)]*pot_size/);
  });

  it("no raw sensor_snapshot JSON.stringify forwarded to model", () => {
    expect(indexSrc).not.toMatch(/JSON\.stringify\(\s*latestSnapshot\s*\)/);
  });

  it("imports and uses buildAiCoachSensorSnapshotContext", () => {
    expect(indexSrc).toContain('from "./sensorSnapshotContext.ts"');
    expect(indexSrc).toContain("buildAiCoachSensorSnapshotContext(latestSnapshot");
  });

  it("snapshot helper has no Supabase / fetch / device-control / secret refs", () => {
    for (const term of [
      "createClient(",
      "@supabase/supabase-js",
      "fetch(",
      "service_role",
      "Bearer ",
      "vbt_",
      "Authorization:",
      "api_key",
    ]) {
      expect(helperSrc, `helper should not reference "${term}"`)
        .not.toContain(term);
    }
  });

  it("edge function still sanitizes via client-side diagnosis path (comment preserved)", () => {
    expect(indexSrc).toMatch(/validateAndSanitizeDiagnosis/);
  });
});

describe("ai-doctor-review packet shape — shared annotation helper", () => {
  const packetSrc = readFileSync(
    resolve(process.cwd(), "src/lib/aiDoctorReviewRequestPacket.ts"),
    "utf8",
  );

  it("packet still exposes recentSensorSnapshot with capturedAt / severity / readings", () => {
    expect(packetSrc).toContain("recentSensorSnapshot");
    expect(packetSrc).toContain("capturedAt");
    expect(packetSrc).toContain("severity");
    expect(packetSrc).toContain("readings");
  });

  it("packet builder now consumes the shared ai-coach annotation helper", () => {
    expect(packetSrc).toContain("aiCoachSensorSnapshotContext");
    expect(packetSrc).toContain("buildAiCoachSensorSnapshotContext");
    expect(packetSrc).toContain("recentSensorSnapshotAnnotation");
  });
});

