import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildAiDoctorReadinessSummary,
  type AiDoctorReadinessSummaryInput,
  type ReadinessHold,
} from "@/lib/aiDoctorReadinessSummaryRules";
import {
  AI_DOCTOR_READINESS_SUMMARY_AGE_UNKNOWN,
  AI_DOCTOR_READINESS_SUMMARY_HEADLINES,
  AI_DOCTOR_READINESS_SUMMARY_MISSING_LABELS,
  AI_DOCTOR_READINESS_SUMMARY_NEXT_STEP_LABELS,
  AI_DOCTOR_READINESS_SUMMARY_NO_SENSOR_LINE,
  AI_DOCTOR_READINESS_SUMMARY_UNKNOWN_MISSING_LABEL,
  AI_DOCTOR_READINESS_SUMMARY_UNKNOWN_SOURCE_LABEL,
} from "@/constants/aiDoctorReadinessSummaryCopy";
import type { AiDoctorReviewMode } from "@/lib/aiDoctorReviewEligibilityRules";
import type { AiDoctorContextReadiness } from "@/lib/aiDoctorContextRules";
import type { AiDoctorReadinessState } from "@/lib/aiDoctorReadinessViewModel";

const NOW = new Date("2026-11-03T12:00:00.000Z");

function minutesAgo(minutes: number): string {
  return new Date(NOW.getTime() - minutes * 60_000).toISOString();
}

function input(
  overrides: Partial<AiDoctorReadinessSummaryInput> = {},
): AiDoctorReadinessSummaryInput {
  return {
    hold: "none",
    gate: "standard",
    ctx: "strong",
    view: "ready",
    missing: [],
    sensor: {
      scope: "tent",
      scopeName: "Flower",
      source: "live",
      capturedAt: minutesAgo(5),
      stale: false,
    },
    now: NOW,
    ...overrides,
  };
}

// Deliberately untyped values to exercise the normaliser.
const bogus = "bogus" as unknown as never;

describe("buildAiDoctorReadinessSummary — verdict rows", () => {
  it("row 1: pending hold is checking with no next step", () => {
    const s = buildAiDoctorReadinessSummary(input({ hold: "pending" }));
    expect(s.row).toBe(1);
    expect(s.verdict).toBe("checking");
    expect(s.headline).toBe("Checking the latest readings…");
    expect(s.nextStep.kind).toBe("none");
  });

  it("row 2: read_error is not_ready with retry", () => {
    const s = buildAiDoctorReadinessSummary(input({ hold: "read_error" }));
    expect(s.row).toBe(2);
    expect(s.verdict).toBe("not_ready");
    expect(s.headline).toBe("Sensor readings couldn't be loaded.");
    expect(s.nextStep).toEqual({ kind: "retry", label: "Try again" });
  });

  it("row 3: recovery is not_ready with recovery step", () => {
    const s = buildAiDoctorReadinessSummary(input({ hold: "recovery" }));
    expect(s.row).toBe(3);
    expect(s.verdict).toBe("not_ready");
    expect(s.headline).toBe("Choose whether to include imported history first.");
    expect(s.nextStep).toEqual({ kind: "recovery", label: "Choose below" });
  });

  it("row 4: historical_review gate is limited with start_review", () => {
    const s = buildAiDoctorReadinessSummary(input({ gate: "historical_review" }));
    expect(s.row).toBe(4);
    expect(s.verdict).toBe("limited");
    expect(s.headline).toBe("Review would use imported history only, not current readings.");
    expect(s.nextStep).toEqual({ kind: "start_review", label: "Start review below" });
  });

  it("row 5: blocked gate is not_ready; next step is first missing item", () => {
    const s = buildAiDoctorReadinessSummary(
      input({ gate: "blocked", missing: ["strain", "recent-manual-sensor-snapshot"] }),
    );
    expect(s.row).toBe(5);
    expect(s.verdict).toBe("not_ready");
    expect(s.headline).toBe("Not enough recent context to review yet.");
    expect(s.nextStep).toEqual({
      kind: "add_missing",
      label: "Add a manual tent reading",
      code: "recent-manual-sensor-snapshot",
    });
  });

  it("row 5: insufficient ctx with no missing items has no next step", () => {
    const s = buildAiDoctorReadinessSummary(input({ ctx: "insufficient", missing: [] }));
    expect(s.row).toBe(5);
    expect(s.verdict).toBe("not_ready");
    expect(s.nextStep.kind).toBe("none");
  });

  it("row 6: demo_only view is limited", () => {
    const s = buildAiDoctorReadinessSummary(input({ view: "demo_only" }));
    expect(s.row).toBe(6);
    expect(s.verdict).toBe("limited");
    expect(s.headline).toBe("Only demo sensor data. A review won't treat it as real readings.");
    expect(s.nextStep).toEqual({ kind: "start_review", label: "Start review below" });
  });

  it("row 6: demo_only with missing items points at the first one", () => {
    const s = buildAiDoctorReadinessSummary(input({ view: "demo_only", missing: ["stage"] }));
    expect(s.row).toBe(6);
    expect(s.nextStep).toEqual({
      kind: "add_missing",
      label: "Set the growth stage",
      code: "stage",
    });
  });

  it("row 7: telemetry_limited view is limited", () => {
    const s = buildAiDoctorReadinessSummary(input({ view: "telemetry_limited" }));
    expect(s.row).toBe(7);
    expect(s.verdict).toBe("limited");
    expect(s.headline).toBe(
      "Sensor readings are stale or invalid. A review can run but can't rely on them.",
    );
    expect(s.nextStep.kind).toBe("start_review");
  });

  it("row 8: all-ready inputs are ready with start_review", () => {
    const s = buildAiDoctorReadinessSummary(input());
    expect(s.row).toBe(8);
    expect(s.verdict).toBe("ready");
    expect(s.headline).toBe("Ready for a cautious review.");
    expect(s.nextStep).toEqual({ kind: "start_review", label: "Start review below" });
  });

  it("row 9: partial ctx falls through to limited", () => {
    const s = buildAiDoctorReadinessSummary(input({ ctx: "partial" }));
    expect(s.row).toBe(9);
    expect(s.verdict).toBe("limited");
    expect(s.headline).toBe("A review can run, with limited confidence.");
    expect(s.nextStep.kind).toBe("start_review");
  });

  it("row 9: needs_more_context view with missing items points at the first one", () => {
    const s = buildAiDoctorReadinessSummary(
      input({ view: "needs_more_context", missing: ["plant-photo"] }),
    );
    expect(s.row).toBe(9);
    expect(s.nextStep).toEqual({
      kind: "add_missing",
      label: "Add a plant photo",
      code: "plant-photo",
    });
  });

  it("first match wins: recovery hold beats historical_review gate", () => {
    const s = buildAiDoctorReadinessSummary(
      input({ hold: "recovery", gate: "historical_review", view: "demo_only" }),
    );
    expect(s.row).toBe(3);
    expect(s.verdict).toBe("not_ready");
  });

  it("first match wins: historical_review beats insufficient ctx and demo view", () => {
    const s = buildAiDoctorReadinessSummary(
      input({ gate: "historical_review", ctx: "insufficient", view: "demo_only" }),
    );
    expect(s.row).toBe(4);
  });

  it("first match wins: blocked gate beats demo_only view", () => {
    const s = buildAiDoctorReadinessSummary(input({ gate: "blocked", view: "demo_only" }));
    expect(s.row).toBe(5);
  });
});

describe("buildAiDoctorReadinessSummary — exhaustive 180 combinations", () => {
  const holds: ReadinessHold[] = ["none", "pending", "recovery", "read_error"];
  const gates: AiDoctorReviewMode[] = ["blocked", "standard", "historical_review"];
  const ctxs: AiDoctorContextReadiness[] = ["strong", "partial", "insufficient"];
  const views: AiDoctorReadinessState[] = [
    "ready",
    "needs_more_context",
    "sensor_missing",
    "telemetry_limited",
    "demo_only",
  ];

  const cases: Array<
    [ReadinessHold, AiDoctorReviewMode, AiDoctorContextReadiness, AiDoctorReadinessState]
  > = [];
  for (const hold of holds)
    for (const gate of gates)
      for (const ctx of ctxs) for (const view of views) cases.push([hold, gate, ctx, view]);

  it("covers exactly 180 cases", () => {
    expect(cases).toHaveLength(180);
  });

  it.each(cases)("hold=%s gate=%s ctx=%s view=%s", (hold, gate, ctx, view) => {
    const s = buildAiDoctorReadinessSummary(input({ hold, gate, ctx, view }));
    if (hold !== "none") expect(["checking", "not_ready"]).toContain(s.verdict);
    if (hold === "none" && gate === "historical_review") expect(s.verdict).toBe("limited");
    if (hold === "none" && gate === "blocked") expect(s.verdict).toBe("not_ready");
    const allReady = hold === "none" && gate === "standard" && ctx === "strong" && view === "ready";
    expect(s.verdict === "ready").toBe(allReady);
    expect(s.row === 8).toBe(allReady);
  });
});

describe("buildAiDoctorReadinessSummary — nulls and unknowns", () => {
  it.each([null, undefined, bogus])("hold %s is treated as pending", (hold) => {
    const s = buildAiDoctorReadinessSummary(input({ hold }));
    expect(s.row).toBe(1);
    expect(s.verdict).toBe("checking");
  });

  it("gate null with otherwise ready inputs is not_ready (row 5)", () => {
    const s = buildAiDoctorReadinessSummary(input({ gate: null }));
    expect(s.row).toBe(5);
    expect(s.verdict).toBe("not_ready");
  });

  it("gate unrecognised is not_ready (row 5)", () => {
    const s = buildAiDoctorReadinessSummary(input({ gate: bogus }));
    expect(s.row).toBe(5);
  });

  it.each([null, undefined, bogus])("view %s with the rest ready is not ready", (view) => {
    const s = buildAiDoctorReadinessSummary(input({ view }));
    expect(s.verdict).not.toBe("ready");
    expect(s.row).toBe(9);
  });

  it.each([null, undefined, bogus])("ctx %s with the rest ready is not ready", (ctx) => {
    const s = buildAiDoctorReadinessSummary(input({ ctx }));
    expect(s.verdict).not.toBe("ready");
    expect(s.row).toBe(9);
  });

  it.each([null, undefined])("missing %s gives an empty list", (missing) => {
    const s = buildAiDoctorReadinessSummary(input({ missing }));
    expect(s.missing).toEqual([]);
  });
});

describe("buildAiDoctorReadinessSummary — demo, stale and invalid", () => {
  it("demo_only and telemetry_limited are never ready", () => {
    for (const view of ["demo_only", "telemetry_limited"] as const) {
      expect(buildAiDoctorReadinessSummary(input({ view })).verdict).not.toBe("ready");
    }
  });

  it("sensor line shows Demo for a demo source", () => {
    const s = buildAiDoctorReadinessSummary(
      input({
        view: "demo_only",
        sensor: {
          scope: "tent",
          scopeName: "Flower",
          source: "demo",
          capturedAt: minutesAgo(5),
          stale: false,
        },
      }),
    );
    expect(s.sensorLine).toBe("Tent readings from Flower · Demo · 5 min ago");
  });

  it("sensor line shows Invalid for an invalid source", () => {
    const s = buildAiDoctorReadinessSummary(
      input({
        sensor: {
          scope: "tent",
          scopeName: "Flower",
          source: "invalid",
          capturedAt: minutesAgo(5),
          stale: null,
        },
      }),
    );
    expect(s.sensorLine).toBe("Tent readings from Flower · Invalid · 5 min ago");
  });

  it("stale=true overrides a live source label", () => {
    const s = buildAiDoctorReadinessSummary(
      input({
        sensor: {
          scope: "tent",
          scopeName: "Flower",
          source: "live",
          capturedAt: minutesAgo(0),
          stale: true,
        },
      }),
    );
    expect(s.sensorLine).toBe("Tent readings from Flower · Stale · just now");
    expect(s.sensorLine).not.toContain("Live");
  });

  it("stale source shows Stale", () => {
    const s = buildAiDoctorReadinessSummary(
      input({
        sensor: {
          scope: "tent",
          scopeName: "Flower",
          source: "stale",
          capturedAt: minutesAgo(180),
          stale: false,
        },
      }),
    );
    expect(s.sensorLine).toBe("Tent readings from Flower · Stale · 3 h ago");
  });

  it("stale, demo and invalid lines never say live or now", () => {
    for (const source of ["stale", "demo", "invalid"] as const) {
      for (const minutes of [0, 5, 180]) {
        const line = buildAiDoctorReadinessSummary(
          input({
            sensor: {
              scope: "tent",
              scopeName: "Flower",
              source,
              capturedAt: minutesAgo(minutes),
              stale: null,
            },
          }),
        ).sensorLine;
        expect(line.toLowerCase()).not.toContain("live");
        expect(line.replace("just now", "")).not.toMatch(/\bnow\b/i);
      }
    }
  });
});

describe("buildAiDoctorReadinessSummary — sensor line", () => {
  const line = (sensor: AiDoctorReadinessSummaryInput["sensor"]) =>
    buildAiDoctorReadinessSummary(input({ sensor })).sensorLine;

  it("tent with name", () => {
    expect(
      line({
        scope: "tent",
        scopeName: "Flower",
        source: "live",
        capturedAt: minutesAgo(5),
        stale: false,
      }),
    ).toBe("Tent readings from Flower · Live · 5 min ago");
  });

  it("plant scope", () => {
    expect(
      line({
        scope: "plant",
        scopeName: "Blue #2",
        source: "manual",
        capturedAt: minutesAgo(5),
        stale: false,
      }),
    ).toBe("Plant readings from Blue #2 · Manual · 5 min ago");
  });

  it("blank name uses generic wording", () => {
    expect(
      line({
        scope: "tent",
        scopeName: "   ",
        source: "csv",
        capturedAt: minutesAgo(5),
        stale: false,
      }),
    ).toBe("Tent readings · CSV / imported · 5 min ago");
    expect(
      line({
        scope: "tent",
        scopeName: null,
        source: "csv",
        capturedAt: minutesAgo(5),
        stale: false,
      }),
    ).toBe("Tent readings · CSV / imported · 5 min ago");
  });

  it("null and undefined sensor", () => {
    expect(line(null)).toBe("No current tent readings.");
    expect(line(undefined)).toBe("No current tent readings.");
  });

  it("unknown or null source with no capturedAt has no readings", () => {
    expect(
      line({ scope: "tent", scopeName: "Flower", source: null, capturedAt: null, stale: null }),
    ).toBe("No current tent readings.");
    expect(
      line({
        scope: "tent",
        scopeName: "Flower",
        source: "unknown",
        capturedAt: null,
        stale: null,
      }),
    ).toBe("No current tent readings.");
  });

  it("unknown source with a capturedAt shows Unknown source", () => {
    expect(
      line({
        scope: "tent",
        scopeName: "Flower",
        source: "unknown",
        capturedAt: minutesAgo(5),
        stale: false,
      }),
    ).toBe("Tent readings from Flower · Unknown source · 5 min ago");
  });

  it.each([
    [0, "just now"],
    [0.5, "just now"],
    [5, "5 min ago"],
    [59, "59 min ago"],
    [60, "1 h ago"],
    [180, "3 h ago"],
    [47 * 60 + 59, "47 h ago"],
    [48 * 60, "2 d ago"],
    [2 * 24 * 60 + 5, "2 d ago"],
  ])("age at %s minutes is %s", (minutes, expected) => {
    expect(
      line({
        scope: "tent",
        scopeName: "Flower",
        source: "live",
        capturedAt: minutesAgo(minutes),
        stale: false,
      }),
    ).toBe(`Tent readings from Flower · Live · ${expected}`);
  });

  it.each([
    ["not-a-date", "invalid"],
    [new Date(NOW.getTime() + 60_000).toISOString(), "future"],
  ])("capturedAt %s (%s) is age unknown", (capturedAt) => {
    expect(
      line({ scope: "tent", scopeName: "Flower", source: "manual", capturedAt, stale: false }),
    ).toBe("Tent readings from Flower · Manual · age unknown");
  });

  it("null capturedAt with a known source is age unknown", () => {
    expect(
      line({
        scope: "tent",
        scopeName: "Flower",
        source: "manual",
        capturedAt: null,
        stale: false,
      }),
    ).toBe("Tent readings from Flower · Manual · age unknown");
  });

  it('never contains " now" except in "just now"', () => {
    const samples = [0, 0.5, 5, 180, 48 * 60].map((m) =>
      line({
        scope: "tent",
        scopeName: "Flower",
        source: "live",
        capturedAt: minutesAgo(m),
        stale: false,
      }),
    );
    for (const s of samples) expect(s.replace("just now", "")).not.toContain(" now");
  });
});

describe("buildAiDoctorReadinessSummary — missing items", () => {
  it("orders by priority, keeps max 3", () => {
    const s = buildAiDoctorReadinessSummary(
      input({
        ctx: "partial",
        missing: [
          "plant-photo",
          "strain",
          "stage",
          "recent-watering-or-feeding",
          "recent-manual-sensor-snapshot",
          "root-zone-history",
        ],
      }),
    );
    expect(s.missing).toEqual([
      { code: "recent-manual-sensor-snapshot", label: "Add a manual tent reading" },
      { code: "root-zone-history", label: "Log a root-zone check" },
      { code: "recent-watering-or-feeding", label: "Log the last watering or feed" },
    ]);
  });

  it("full priority order across all known codes", () => {
    const order = [
      "recent-manual-sensor-snapshot",
      "root-zone-history",
      "recent-watering-or-feeding",
      "recent-timeline-activity",
      "plant-profile",
      "stage",
      "plant-type",
      "strain",
      "medium",
      "plant-photo",
    ];
    const reversed = [...order].reverse();
    for (let i = 0; i < order.length; i += 1) {
      const subset = reversed.slice(0, order.length - i);
      const s = buildAiDoctorReadinessSummary(input({ missing: subset }));
      expect(s.missing.map((m) => m.code)).toEqual(order.slice(i, i + 3));
    }
  });

  it("drops duplicates, blanks and non-strings", () => {
    const s = buildAiDoctorReadinessSummary(
      input({
        missing: ["stage", "", "  ", "stage", 42, null, "medium"] as unknown as string[],
      }),
    );
    expect(s.missing).toEqual([
      { code: "stage", label: "Set the growth stage" },
      { code: "medium", label: "Add the growing medium" },
    ]);
  });

  it("sorts unknown codes after known ones, ascending", () => {
    const s = buildAiDoctorReadinessSummary(
      input({ missing: ["zeta-thing", "alpha-thing", "medium"] }),
    );
    expect(s.missing).toEqual([
      { code: "medium", label: "Add the growing medium" },
      { code: "alpha-thing", label: "Add missing context" },
      { code: "zeta-thing", label: "Add missing context" },
    ]);
  });

  it("labels every known code", () => {
    const expected: Record<string, string> = {
      "recent-manual-sensor-snapshot": "Add a manual tent reading",
      "root-zone-history": "Log a root-zone check",
      "recent-watering-or-feeding": "Log the last watering or feed",
      "recent-timeline-activity": "Add a recent note or check",
      "plant-profile": "Complete the plant profile",
      stage: "Set the growth stage",
      "plant-type": "Set autoflower or photoperiod",
      strain: "Add the strain",
      medium: "Add the growing medium",
      "plant-photo": "Add a plant photo",
    };
    for (const [code, label] of Object.entries(expected)) {
      expect(buildAiDoctorReadinessSummary(input({ missing: [code] })).missing).toEqual([
        { code, label },
      ]);
    }
  });
});

describe("buildAiDoctorReadinessSummary — determinism", () => {
  it("same input twice gives deep-equal output and the frozen input is not mutated", () => {
    const sensor = Object.freeze({
      scope: "tent" as const,
      scopeName: "Flower",
      source: "live" as const,
      capturedAt: minutesAgo(5),
      stale: false,
    });
    const missing = Object.freeze(["plant-photo", "stage", "unknown-z", "unknown-a"]);
    const frozen = Object.freeze(input({ ctx: "partial", missing, sensor }));
    const snapshot = JSON.stringify(frozen);
    const a = buildAiDoctorReadinessSummary(frozen);
    const b = buildAiDoctorReadinessSummary(frozen);
    expect(a).toEqual(b);
    expect(JSON.stringify(frozen)).toBe(snapshot);
    expect(frozen.now.getTime()).toBe(NOW.getTime());
  });
});

describe("aiDoctorReadinessSummaryCopy — rules return the copy constants", () => {
  it("headlines match the copy file", () => {
    const H = AI_DOCTOR_READINESS_SUMMARY_HEADLINES;
    expect(buildAiDoctorReadinessSummary(input({ hold: "pending" })).headline).toBe(H.checking);
    expect(buildAiDoctorReadinessSummary(input({ hold: "read_error" })).headline).toBe(H.readError);
    expect(buildAiDoctorReadinessSummary(input({ hold: "recovery" })).headline).toBe(H.recovery);
    expect(buildAiDoctorReadinessSummary(input({ gate: "historical_review" })).headline).toBe(
      H.historicalReview,
    );
    expect(buildAiDoctorReadinessSummary(input({ gate: "blocked" })).headline).toBe(
      H.notEnoughContext,
    );
    expect(buildAiDoctorReadinessSummary(input({ view: "demo_only" })).headline).toBe(H.demoOnly);
    expect(buildAiDoctorReadinessSummary(input({ view: "telemetry_limited" })).headline).toBe(
      H.telemetryLimited,
    );
    expect(buildAiDoctorReadinessSummary(input()).headline).toBe(H.ready);
    expect(buildAiDoctorReadinessSummary(input({ ctx: "partial" })).headline).toBe(H.limited);
  });

  it("next-step labels match the copy file", () => {
    const L = AI_DOCTOR_READINESS_SUMMARY_NEXT_STEP_LABELS;
    expect(buildAiDoctorReadinessSummary(input({ hold: "read_error" })).nextStep).toEqual({
      kind: "retry",
      label: L.retry,
    });
    expect(buildAiDoctorReadinessSummary(input({ hold: "recovery" })).nextStep).toEqual({
      kind: "recovery",
      label: L.recovery,
    });
    expect(buildAiDoctorReadinessSummary(input()).nextStep).toEqual({
      kind: "start_review",
      label: L.startReview,
    });
  });

  it("missing labels and sensor copy match the copy file", () => {
    for (const [code, label] of Object.entries(AI_DOCTOR_READINESS_SUMMARY_MISSING_LABELS)) {
      expect(buildAiDoctorReadinessSummary(input({ missing: [code] })).missing[0]?.label).toBe(
        label,
      );
    }
    expect(buildAiDoctorReadinessSummary(input({ missing: ["nope"] })).missing[0]?.label).toBe(
      AI_DOCTOR_READINESS_SUMMARY_UNKNOWN_MISSING_LABEL,
    );
    expect(buildAiDoctorReadinessSummary(input({ sensor: null })).sensorLine).toBe(
      AI_DOCTOR_READINESS_SUMMARY_NO_SENSOR_LINE,
    );
    expect(
      buildAiDoctorReadinessSummary(
        input({
          sensor: {
            scope: "tent",
            scopeName: "F",
            source: "unknown",
            capturedAt: "x",
            stale: false,
          },
        }),
      ).sensorLine,
    ).toBe(
      `Tent readings from F · ${AI_DOCTOR_READINESS_SUMMARY_UNKNOWN_SOURCE_LABEL} · ${AI_DOCTOR_READINESS_SUMMARY_AGE_UNKNOWN}`,
    );
  });
});

describe("aiDoctorReadinessSummaryRules — import fence", () => {
  // @source-scan-justified: an import fence asserts what the module source does NOT import or call
  // (React, Supabase, wall clock, randomness); that is a static property of the file text and cannot
  // be resolved from the module's runtime exports.
  const source = readFileSync(
    resolve(__dirname, "../lib/aiDoctorReadinessSummaryRules.ts"),
    "utf8",
  );

  it("does not import React or Supabase", () => {
    expect(source).not.toContain('from "react"');
    expect(source).not.toContain("@/integrations/supabase");
  });

  it("does not read the wall clock or randomness", () => {
    expect(source).not.toContain("Date.now(");
    expect(source).not.toContain("Math.random(");
    expect(source).not.toMatch(/new Date\(\s*\)/);
  });
});
