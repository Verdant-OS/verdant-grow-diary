/**
 * greenhouseLightRules — null safety, source normalization, DLI
 * aggregation, timezone gating, and review-only dark-cycle leak.
 */
import { describe, it, expect } from "vitest";
import {
  normalizeGreenhouseSource,
  aggregateDli,
  detectDarkCycleLeak,
  type PpfdSample,
} from "@/lib/greenhouseLightRules";

const FORBIDDEN_KEYS = /^(command|device_id|action_queue|control|relay|execute)$/i;

function assertNoForbiddenKeys(obj: unknown, path = "$"): void {
  if (obj === null || typeof obj !== "object") return;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    expect(FORBIDDEN_KEYS.test(k), `${path}.${k} is forbidden`).toBe(false);
    assertNoForbiddenKeys(v, `${path}.${k}`);
  }
}

describe("normalizeGreenhouseSource", () => {
  it("accepts all six canonical labels", () => {
    for (const s of ["live", "manual", "csv", "demo", "stale", "invalid"]) {
      expect(normalizeGreenhouseSource(s)).toBe(s);
    }
  });
  it("treats unknown/noncanonical/null/undefined/numeric as invalid", () => {
    for (const v of [null, undefined, "", "ecowitt", "LIVE_AUTO", 1, {}, []]) {
      expect(normalizeGreenhouseSource(v)).toBe("invalid");
    }
  });
  it("never promotes csv/manual/demo/stale/invalid to live", () => {
    for (const s of ["csv", "manual", "demo", "stale", "invalid"]) {
      expect(normalizeGreenhouseSource(s)).not.toBe("live");
    }
  });
});

describe("aggregateDli", () => {
  const tz = "America/Los_Angeles";

  it("returns invalid_timezone when tz missing or unknown", () => {
    const r1 = aggregateDli({ samples: [], tzIana: null });
    const r2 = aggregateDli({ samples: [], tzIana: "Not/A_Zone" });
    expect(r1.windowStatus).toBe("invalid_timezone");
    expect(r1.dliMolM2Day).toBeNull();
    expect(r2.windowStatus).toBe("invalid_timezone");
    assertNoForbiddenKeys(r1);
    assertNoForbiddenKeys(r2);
  });

  it("one instantaneous PPFD does NOT become a full DLI", () => {
    const r = aggregateDli({
      samples: [{ ts: "2026-06-11T12:00:00Z", ppfd: 1500, source: "live" }],
      tzIana: tz,
    });
    expect(r.windowStatus).toBe("insufficient_samples");
    expect(r.dliMolM2Day).toBeNull();
  });

  it("aggregates multiple PPFD samples via trapezoidal integration", () => {
    // Constant 1000 µmol/m²/s for 12 hours → DLI = 1000 * 43200 / 1e6 = 43.2
    const samples: PpfdSample[] = [
      { ts: "2026-06-11T06:00:00Z", ppfd: 1000, source: "live" },
      { ts: "2026-06-11T12:00:00Z", ppfd: 1000, source: "live" },
      { ts: "2026-06-11T18:00:00Z", ppfd: 1000, source: "live" },
    ];
    const r = aggregateDli({ samples, tzIana: tz });
    expect(r.windowStatus).toBe("ok");
    expect(r.dliMolM2Day).not.toBeNull();
    expect(r.dliMolM2Day!).toBeCloseTo(43.2, 2);
    expect(r.usedCount).toBe(3);
  });

  it("excludes stale/invalid/unknown sources from healthy totals", () => {
    const samples: PpfdSample[] = [
      { ts: "2026-06-11T06:00:00Z", ppfd: 1000, source: "live" },
      { ts: "2026-06-11T12:00:00Z", ppfd: 9999, source: "stale" },
      { ts: "2026-06-11T13:00:00Z", ppfd: 9999, source: "invalid" },
      { ts: "2026-06-11T14:00:00Z", ppfd: 9999, source: "ecowitt" }, // noncanonical → invalid
      { ts: "2026-06-11T18:00:00Z", ppfd: 1000, source: "manual" },
    ];
    const r = aggregateDli({ samples, tzIana: tz });
    expect(r.windowStatus).toBe("ok");
    expect(r.usedCount).toBe(2);
    expect(r.excludedCount).toBe(3);
    expect(r.sourceBreakdown.invalid).toBe(2); // "invalid" + noncanonical
    expect(r.sourceBreakdown.stale).toBe(1);
    // Integration should ignore the absurd 9999 values.
    expect(r.dliMolM2Day!).toBeCloseTo(43.2, 2);
  });

  it("separates solar vs LED contribution when channel is provided", () => {
    const samples: PpfdSample[] = [
      { ts: "2026-06-11T06:00:00Z", ppfd: 500, source: "live", channel: "solar" },
      { ts: "2026-06-11T12:00:00Z", ppfd: 500, source: "live", channel: "solar" },
      { ts: "2026-06-11T18:00:00Z", ppfd: 200, source: "live", channel: "led" },
      { ts: "2026-06-12T00:00:00Z", ppfd: 200, source: "live", channel: "led" },
    ];
    const r = aggregateDli({ samples, tzIana: tz });
    expect(r.windowStatus).toBe("ok");
    expect(r.solarMolM2Day!).toBeGreaterThan(0);
    expect(r.ledMolM2Day!).toBeGreaterThan(0);
    expect(r.solarMolM2Day! + r.ledMolM2Day!).toBeLessThanOrEqual(r.dliMolM2Day! + 1e-9);
  });

  it("handles null/NaN/invalid ppfd gracefully", () => {
    const samples: PpfdSample[] = [
      { ts: "2026-06-11T06:00:00Z", ppfd: null, source: "live" },
      { ts: "bad-date", ppfd: 500, source: "live" },
      { ts: "2026-06-11T12:00:00Z", ppfd: Number.NaN as unknown as number, source: "live" },
      { ts: "2026-06-11T18:00:00Z", ppfd: -10, source: "live" },
    ];
    const r = aggregateDli({ samples, tzIana: "America/Los_Angeles" });
    expect(r.windowStatus).toBe("no_healthy_samples");
    expect(r.dliMolM2Day).toBeNull();
    assertNoForbiddenKeys(r);
  });

  it("DST spring-forward 24h window returns dst_ambiguous (not silent UTC math)", () => {
    // America/Los_Angeles springs forward on 2026-03-08 02:00 local.
    const samples: PpfdSample[] = [
      { ts: "2026-03-08T08:00:00Z", ppfd: 1000, source: "live" }, // pre-transition (PST)
      { ts: "2026-03-08T14:00:00Z", ppfd: 1000, source: "live" }, // post-transition (PDT)
      { ts: "2026-03-08T20:00:00Z", ppfd: 1000, source: "live" },
    ];
    const r = aggregateDli({ samples, tzIana: "America/Los_Angeles" });
    expect(r.windowStatus).toBe("dst_ambiguous");
    expect(r.dliMolM2Day).toBeNull();
    assertNoForbiddenKeys(r);
  });

  it("DST fall-back 24h window returns dst_ambiguous (not silent UTC math)", () => {
    // America/Los_Angeles falls back on 2026-11-01 02:00 local.
    const samples: PpfdSample[] = [
      { ts: "2026-11-01T07:00:00Z", ppfd: 800, source: "live" }, // pre-transition (PDT)
      { ts: "2026-11-01T13:00:00Z", ppfd: 800, source: "live" },
      { ts: "2026-11-01T19:00:00Z", ppfd: 800, source: "live" }, // post-transition (PST)
    ];
    const r = aggregateDli({ samples, tzIana: "America/Los_Angeles" });
    expect(r.windowStatus).toBe("dst_ambiguous");
    expect(r.dliMolM2Day).toBeNull();
  });

  it("non-DST 24h window still aggregates DLI correctly", () => {
    const samples: PpfdSample[] = [
      { ts: "2026-06-11T06:00:00Z", ppfd: 1000, source: "live" },
      { ts: "2026-06-11T18:00:00Z", ppfd: 1000, source: "live" },
    ];
    const r = aggregateDli({ samples, tzIana: "America/Los_Angeles" });
    expect(r.windowStatus).toBe("ok");
    expect(r.dliMolM2Day!).toBeCloseTo(43.2, 2);
  });
});

describe("detectDarkCycleLeak", () => {
  const tz = "America/Los_Angeles";
  const dark = {
    darkStartIso: "2026-06-11T03:00:00Z",
    darkEndIso: "2026-06-11T11:00:00Z",
  };

  it("invalid_window when tz missing", () => {
    const r = detectDarkCycleLeak({ samples: [], tzIana: null, ...dark });
    expect(r.status).toBe("invalid_window");
    expect(r.reason).toMatch(/timezone/);
  });

  it("invalid_window when start/end missing or inverted", () => {
    expect(
      detectDarkCycleLeak({
        samples: [],
        tzIana: tz,
        darkStartIso: null,
        darkEndIso: null,
      }).status,
    ).toBe("invalid_window");
    expect(
      detectDarkCycleLeak({
        samples: [],
        tzIana: tz,
        darkStartIso: dark.darkEndIso,
        darkEndIso: dark.darkStartIso,
      }).status,
    ).toBe("invalid_window");
  });

  it("review (not certainty) when no samples inside window", () => {
    const r = detectDarkCycleLeak({ samples: [], tzIana: tz, ...dark });
    expect(r.status).toBe("review");
    expect(r.suspiciousSampleCount).toBe(0);
  });

  it("review (not certainty) when ppfd above threshold during dark", () => {
    const r = detectDarkCycleLeak({
      tzIana: tz,
      ...dark,
      samples: [
        { ts: "2026-06-11T04:00:00Z", ppfd: 0, source: "live" },
        { ts: "2026-06-11T05:00:00Z", ppfd: 12, source: "live" },
        { ts: "2026-06-11T06:00:00Z", ppfd: 0, source: "manual" },
      ],
    });
    expect(r.status).toBe("review");
    expect(r.suspiciousSampleCount).toBe(1);
    expect(r.reason).toMatch(/review/);
  });

  it("ok when only stale/invalid sources show leak (excluded from healthy)", () => {
    const r = detectDarkCycleLeak({
      tzIana: tz,
      ...dark,
      samples: [
        { ts: "2026-06-11T05:00:00Z", ppfd: 500, source: "stale" },
        { ts: "2026-06-11T06:00:00Z", ppfd: 999, source: "invalid" },
        { ts: "2026-06-11T07:00:00Z", ppfd: 0, source: "live" },
      ],
    });
    expect(r.status).toBe("ok");
    expect(r.suspiciousSampleCount).toBe(0);
  });

  it("emits no forbidden device-command keys", () => {
    const r = detectDarkCycleLeak({
      tzIana: tz,
      ...dark,
      samples: [{ ts: "2026-06-11T05:00:00Z", ppfd: 100, source: "live" }],
    });
    assertNoForbiddenKeys(r);
  });

  it("dark window crossing DST spring-forward returns invalid_window (not certainty)", () => {
    const r = detectDarkCycleLeak({
      tzIana: "America/Los_Angeles",
      darkStartIso: "2026-03-08T08:00:00Z", // pre-transition (PST)
      darkEndIso: "2026-03-08T15:00:00Z", // post-transition (PDT)
      samples: [{ ts: "2026-03-08T10:00:00Z", ppfd: 500, source: "live" }],
    });
    expect(r.status).toBe("invalid_window");
    expect(r.reason).toMatch(/dst/);
    expect(r.suspiciousSampleCount).toBe(0);
  });

  it("dark window crossing DST fall-back returns invalid_window (not certainty)", () => {
    const r = detectDarkCycleLeak({
      tzIana: "America/Los_Angeles",
      darkStartIso: "2026-11-01T07:00:00Z",
      darkEndIso: "2026-11-01T14:00:00Z",
      samples: [{ ts: "2026-11-01T09:00:00Z", ppfd: 500, source: "live" }],
    });
    expect(r.status).toBe("invalid_window");
    expect(r.reason).toMatch(/dst/);
  });
});
