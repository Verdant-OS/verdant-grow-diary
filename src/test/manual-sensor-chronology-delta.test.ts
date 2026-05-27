/**
 * Gate 1B hardening — chronology-aware manual sensor delta helper.
 *
 * Pure-logic tests for src/lib/manualSensorChronologyDeltaRules.ts and the
 * deriveManualSensorLogs projection in
 * src/hooks/usePlantManualSensorHistory.ts. Plus a source-level safety
 * regression that the new helper carries no AI / alert / Action Queue strings.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  computeChronologyDelta,
  buildChronologyDeltas,
  formatTimeContext,
  MANUAL_SOURCE,
  type ManualSensorLog,
} from "@/lib/manualSensorChronologyDeltaRules";
import { deriveManualSensorLogs } from "@/hooks/usePlantManualSensorHistory";

const NOW = "2026-05-27T12:00:00.000Z";
const iso = (offsetHours: number, base = NOW) =>
  new Date(new Date(base).getTime() + offsetHours * 3_600_000).toISOString();

function manualLog(
  capturedAt: string,
  metrics: ManualSensorLog["metrics"],
  id?: string,
): ManualSensorLog {
  return { id, capturedAt, source: MANUAL_SOURCE, metrics };
}

describe("computeChronologyDelta — basic rules", () => {
  it("returns null when current value is not finite", () => {
    expect(computeChronologyDelta("ph", null, NOW, [])).toBeNull();
    expect(
      computeChronologyDelta("ph", Number.NaN, NOW, []),
    ).toBeNull();
  });

  it("first_log when no prior manual reading exists for that metric", () => {
    const d = computeChronologyDelta("ec", 1.4, NOW, []);
    expect(d?.first_log).toBe(true);
    expect(d?.direction).toBe("first_log");
    expect(d?.previousValue).toBeNull();
    expect(d?.delta).toBeNull();
    expect(d?.timeContext).toBeNull();
    expect(d?.label).toBe("first log");
  });

  it("uses the most recent strictly-prior log per metric", () => {
    const history = [
      manualLog(iso(-24), { ph: 5.8 }), // Monday
    ];
    const d = computeChronologyDelta("ph", 6.0, NOW, history);
    expect(d?.first_log).toBe(false);
    expect(d?.previousValue).toBe(5.8);
    expect(d?.delta).toBeCloseTo(0.2, 5);
    expect(d?.direction).toBe("up");
    expect(d?.label.startsWith("+0.2 ")).toBe(true);
  });

  it("stable when delta is below epsilon — emits 'no change since last log'", () => {
    const history = [manualLog(iso(-24), { humidity_percent: 58 })];
    const d = computeChronologyDelta("humidity_percent", 58, NOW, history);
    expect(d?.stable).toBe(true);
    expect(d?.delta).toBe(0);
    expect(d?.direction).toBe("stable");
    expect(d?.label).toBe("no change since last log");
  });
});

describe("time context formatting", () => {
  it("renders 'X hours ago' for hours-old prior log", () => {
    expect(formatTimeContext(NOW, iso(-6))).toBe("6 hours ago");
    expect(formatTimeContext(NOW, iso(-1))).toBe("1 hour ago");
  });

  it("renders 'over X days' between 1 and 6 days", () => {
    expect(formatTimeContext(NOW, iso(-48))).toBe("over 2 days");
    expect(formatTimeContext(NOW, iso(-24))).toBe("over 1 day");
    expect(formatTimeContext(NOW, iso(-24 * 6))).toBe("over 6 days");
  });

  it("renders 'since MMM D' for >=7 day gaps", () => {
    const ctx = formatTimeContext(NOW, iso(-24 * 10));
    expect(ctx).toMatch(/^since [A-Z][a-z]{2} \d{1,2}$/);
  });

  it("embeds the time context in the delta label", () => {
    const history = [manualLog(iso(-48), { humidity_percent: 58 })];
    const d = computeChronologyDelta("humidity_percent", 54, NOW, history);
    expect(d?.label).toBe("-4% over 2 days");
  });

  it("embeds 'X hours ago' in temp delta label", () => {
    const history = [manualLog(iso(-6), { temp_f: 75 })];
    const d = computeChronologyDelta("temp_f", 77, NOW, history);
    expect(d?.label).toBe("+2°F 6 hours ago");
  });
});

describe("partial logs", () => {
  it("only computes deltas for metrics present in current log", () => {
    const history = [manualLog(iso(-24), { ph: 5.8, temp_f: 70 })];
    const out = buildChronologyDeltas({
      currentCapturedAt: NOW,
      currentMetrics: { ph: 6.0 }, // only pH this time
      history,
    });
    expect(Object.keys(out)).toEqual(["ph"]);
    expect(out.ph?.delta).toBeCloseTo(0.2, 5);
  });

  it("skips a prior log that lacks the target metric", () => {
    const history = [
      manualLog(iso(-1), { temp_f: 75 }), // newer, no ph
      manualLog(iso(-48), { ph: 5.8 }), // older, has ph
    ];
    const d = computeChronologyDelta("ph", 6.0, NOW, history);
    expect(d?.previousValue).toBe(5.8);
    expect(d?.timeContext).toBe("over 2 days");
  });

  it("never invents 0 for empty current values", () => {
    const out = buildChronologyDeltas({
      currentCapturedAt: NOW,
      currentMetrics: { ph: undefined, ec: null, temp_f: 77 },
      history: [],
    });
    expect(out.ph).toBeUndefined();
    expect(out.ec).toBeUndefined();
    expect(out.temp_f?.first_log).toBe(true);
  });
});

describe("source isolation", () => {
  it("ignores non-manual sources (live / demo / csv / unknown / missing)", () => {
    const history: ManualSensorLog[] = [
      { capturedAt: iso(-1), source: "live", metrics: { ph: 9.9 } },
      { capturedAt: iso(-2), source: "demo", metrics: { ph: 8.8 } },
      { capturedAt: iso(-3), source: "csv_import", metrics: { ph: 7.7 } },
      { capturedAt: iso(-4), source: undefined, metrics: { ph: 6.6 } },
      manualLog(iso(-48), { ph: 5.8 }),
    ];
    const d = computeChronologyDelta("ph", 6.0, NOW, history);
    expect(d?.previousValue).toBe(5.8);
  });
});

describe("chronology / back-dating", () => {
  it("back-dated inserted log changes derived delta for later entries", () => {
    // Monday pH 5.8, Wednesday pH 6.1 -> baseline delta is vs Monday.
    let history = [
      manualLog(iso(-48), { ph: 5.8 }, "mon"), // Monday
    ];
    const wedCaptured = iso(0); // Wednesday "now"
    const baseline = computeChronologyDelta("ph", 6.1, wedCaptured, history);
    expect(baseline?.previousValue).toBe(5.8);
    expect(baseline?.delta).toBeCloseTo(0.3, 5);

    // User back-dates a Tuesday pH 6.0 entry AFTER the fact.
    history = [
      ...history,
      manualLog(iso(-24), { ph: 6.0 }, "tue"), // back-dated Tuesday
    ];
    const recomputed = computeChronologyDelta("ph", 6.1, wedCaptured, history);
    expect(recomputed?.previousValue).toBe(6.0);
    expect(recomputed?.delta).toBeCloseTo(0.1, 5);
  });

  it("equal captured_at logs are excluded (not 'strictly prior') and tie-break by id", () => {
    // Two logs share capturedAt; neither should be picked as prior for the
    // current snapshot taken at the same instant.
    const sameTs = iso(-24);
    const history = [
      manualLog(sameTs, { ph: 6.0 }, "a"),
      manualLog(sameTs, { ph: 6.4 }, "b"),
    ];
    const tied = computeChronologyDelta("ph", 6.2, sameTs, history);
    expect(tied?.first_log).toBe(true);

    // But a strictly-later "current" sees a deterministic prior:
    // newest-first sort, stable id ASC tie-breaker -> "a" wins.
    const later = computeChronologyDelta("ph", 6.2, NOW, history);
    expect(later?.previousValue).toBe(6.0);
  });

  it("does not depend on input array order (re-sorts by capturedAt DESC)", () => {
    const history = [
      manualLog(iso(-72), { ph: 5.5 }),
      manualLog(iso(-24), { ph: 5.9 }),
      manualLog(iso(-48), { ph: 5.7 }),
    ];
    const d = computeChronologyDelta("ph", 6.0, NOW, history);
    expect(d?.previousValue).toBe(5.9);
  });
});

describe("formatting", () => {
  it("ph delta keeps 1 decimal", () => {
    const history = [manualLog(iso(-2), { ph: 5.8 })];
    const d = computeChronologyDelta("ph", 6.0, NOW, history);
    expect(d?.label).toBe("+0.2 2 hours ago");
  });

  it("ec delta keeps 2 decimals", () => {
    const history = [manualLog(iso(-2), { ec: 1.40 })];
    const d = computeChronologyDelta("ec", 1.65, NOW, history);
    expect(d?.label).toBe("+0.25 2 hours ago");
  });

  it("temp/humidity round to whole numbers", () => {
    const history = [manualLog(iso(-2), { temp_f: 75.3 })];
    const d = computeChronologyDelta("temp_f", 77.1, NOW, history);
    expect(d?.label).toBe("+2°F 2 hours ago");
  });
});

describe("safety: no advice language", () => {
  it("labels never contain good/bad/recommend/warning words", () => {
    const history = [manualLog(iso(-2), { ph: 5.0 })];
    const d = computeChronologyDelta("ph", 6.5, NOW, history);
    expect(d?.label).not.toMatch(
      /good|bad|warn|danger|risk|recommend|nutrient|add\s|reduce|too\s+(high|low)/i,
    );
  });
});

describe("deriveManualSensorLogs", () => {
  const wrap = (snap: Record<string, unknown>) => ({
    id: "x",
    entry_at: iso(-1),
    details: { manual_sensor_snapshot: { source: "manual", ...snap } },
  });

  it("projects manual rows into chronology logs", () => {
    const rows = [
      wrap({ ph: 6.0, ec: 1.4 }),
      {
        id: "y",
        entry_at: iso(-3),
        details: {
          manual_sensor_snapshot: { source: "live", ph: 9.9 },
        },
      },
    ];
    const out = deriveManualSensorLogs(rows);
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe(MANUAL_SOURCE);
    expect(out[0].metrics.ph).toBe(6.0);
    expect(out[0].metrics.ec).toBe(1.4);
  });

  it("maps missing metrics to null (never 0)", () => {
    const out = deriveManualSensorLogs([wrap({ ph: 6.0 })]);
    expect(out[0].metrics.ph).toBe(6.0);
    expect(out[0].metrics.temp_f).toBeNull();
    expect(out[0].metrics.humidity_percent).toBeNull();
    expect(out[0].metrics.ec).toBeNull();
  });
});

// ---------- Source-level safety contract for the new helper ----------
const ROOT = resolve(__dirname, "../..");
const HELPER = readFileSync(
  resolve(ROOT, "src/lib/manualSensorChronologyDeltaRules.ts"),
  "utf8",
);

describe("manualSensorChronologyDeltaRules safety contract", () => {
  it("carries the documented chronology + source comment", () => {
    expect(HELPER).toMatch(
      /Deltas are derived from captured_at chronology\.\s+Manual logs use source='manual'\./,
    );
  });

  it("never imports supabase / fetches / writes / uses service_role", () => {
    expect(HELPER).not.toMatch(/supabase/i);
    expect(HELPER).not.toMatch(/\.insert\(/);
    expect(HELPER).not.toMatch(/\.update\(/);
    expect(HELPER).not.toMatch(/\.delete\(/);
    expect(HELPER).not.toMatch(/\.upsert\(/);
    expect(HELPER).not.toMatch(/service_role/);
    expect(HELPER).not.toMatch(/fetch\(/);
  });

  it("contains no AI / Doctor / automation / alert / action_queue strings", () => {
    expect(HELPER).not.toMatch(
      /openai|anthropic|gpt|ai[-_]?doctor|ai[-_]?coach|mqtt|home[\s_-]?assistant|webhook|relay|actuator|autopilot|auto[-_ ]?execute|action_queue|alerts/i,
    );
  });

  it("emits no nutrient / advice / good-bad language", () => {
    expect(HELPER).not.toMatch(/nutrient|recommend|advice|good|bad|warning|danger/i);
  });
});
