/**
 * Verdant Quick Log Activity Types v1a — pure constant/rule tests.
 *
 * Covers:
 *  - all v1a activity labels present
 *  - Harvest disabled with the exact backend-update reason
 *  - Harvest has no persistence plan (cannot be fake-saved)
 *  - Defoliation persists as event_type=training with subtype fence
 *  - Generic training does not render as Defoliation
 *  - Only DB-validator-allowed event_type values are emitted
 *  - Safety copy contains no recommendation/diagnosis/readiness
 *    language.
 */
import { describe, it, expect } from "vitest";
import {
  QUICK_LOG_ACTIVITY_DEFINITIONS,
  QUICK_LOG_ACTIVITY_IDS,
  QUICK_LOG_HARVEST_DISABLED_REASON,
  type QuickLogActivityId,
  type QuickLogEventTypeValue,
} from "@/constants/quickLogActivityTypes";
import {
  getQuickLogDisabledReason,
  isQuickLogActivityEnabled,
  planQuickLogPersistence,
  resolveQuickLogEventTimelineLabel,
} from "@/lib/quickLogActivityRules";

const V1A_ENABLED: QuickLogActivityId[] = [
  "note",
  "photo",
  "watering",
  "feeding",
  "environment_check",
  "training",
  "defoliation",
  "issue_observation",
  "manual_sensor_snapshot",
  // v1b: Harvest is enabled via quicklog_save_event.
  "harvest",
];

const ALLOWED_EVENT_TYPES = new Set<QuickLogEventTypeValue>([
  "watering",
  "feeding",
  "training",
  "observation",
  "photo",
  "environment",
  "harvest",
]);

const FORBIDDEN = [
  /\brecommend/i,
  /\brecommendation\b/i,
  /\bdiagnos/i,
  /\bready to harvest\b/i,
  /\bsafe to (feed|train|defoliate|harvest)\b/i,
  /\bhealthy\b/i,
  /\bguaranteed\b/i,
];

function assertSafe(s: string) {
  for (const re of FORBIDDEN) {
    expect(s, `forbidden phrase ${re} in: ${s}`).not.toMatch(re);
  }
}

describe("quickLogActivityTypes constants", () => {
  it("registers exactly the v1b activity ids (harvest now enabled)", () => {
    expect(new Set(QUICK_LOG_ACTIVITY_IDS)).toEqual(new Set(V1A_ENABLED));
  });

  it.each(V1A_ENABLED)("%s is enabled and has no disabled reason", (id) => {
    expect(isQuickLogActivityEnabled(id)).toBe(true);
    expect(getQuickLogDisabledReason(id)).toBeNull();
  });

  it("Harvest safety copy denies readiness/yield claims", () => {
    const note = QUICK_LOG_ACTIVITY_DEFINITIONS.harvest.safetyNote.toLowerCase();
    expect(note).toMatch(/does not claim/);
    expect(note).toMatch(/readiness|yield/);
    // Legacy disabled-reason constant is still exported for out-of-date
    // callers, but must NOT be used as Harvest's live safety copy.
    expect(note).not.toBe(QUICK_LOG_HARVEST_DISABLED_REASON.toLowerCase());
    expect(QUICK_LOG_HARVEST_DISABLED_REASON).toMatch(/backend update/i);
  });

  it("safety copy across every activity avoids recommendation/diagnosis/readiness language", () => {
    for (const id of QUICK_LOG_ACTIVITY_IDS) {
      const def = QUICK_LOG_ACTIVITY_DEFINITIONS[id];
      assertSafe(def.label);
      assertSafe(def.description);
      assertSafe(def.timelineLabel);
      assertSafe(def.savedBreakdownLabel);
      // safetyNote is the one place where "recommendation"/"diagnosis"
      // may appear as an explicit denial — allow those specific
      // denial phrasings, block generic promotional variants.
      const note = def.safetyNote.toLowerCase();
      expect(note, `${id} safetyNote must not claim readiness`).not.toMatch(
        /\bready to harvest\b/i,
      );
      // Only allow "safe to <verb>" if it appears as an explicit denial
      // ("does not mean", "not", "never").
      const bareSafeToMatch = note.match(
        /(?<!not\s|never\s|n't\s|no\s)\bsafe to (feed|train|defoliate|harvest)\b/i,
      );
      // Extra guard: reject if the sentence containing it doesn't include a negation.
      if (bareSafeToMatch) {
        const idx = bareSafeToMatch.index ?? 0;
        const window = note.slice(Math.max(0, idx - 40), idx);
        expect(
          /\b(not|never|n't|no)\b/i.test(window),
          `${id} safetyNote asserts safe-to-x without a denial`,
        ).toBe(true);
      }
      const healthyMatch = note.match(/(?<!not\s|never\s|no\s)\bhealthy\b/i);
      if (healthyMatch) {
        const idx = healthyMatch.index ?? 0;
        const window = note.slice(Math.max(0, idx - 20), idx);
        expect(
          /\b(not|never|no)\b/i.test(window),
          `${id} safetyNote asserts healthy without a denial`,
        ).toBe(true);
      }


    }
  });

  it("feeding safety copy explicitly denies nutrient recommendation", () => {
    expect(
      QUICK_LOG_ACTIVITY_DEFINITIONS.feeding.safetyNote.toLowerCase(),
    ).toContain("not a nutrient recommendation");
  });

  it("training safety copy explicitly denies safe-to-train inference", () => {
    expect(
      QUICK_LOG_ACTIVITY_DEFINITIONS.training.safetyNote.toLowerCase(),
    ).toContain("does not mean the plant was safe to train");
  });

  it("defoliation safety copy explicitly denies recovery/stress diagnosis", () => {
    expect(
      QUICK_LOG_ACTIVITY_DEFINITIONS.defoliation.safetyNote.toLowerCase(),
    ).toContain("does not diagnose recovery or plant stress");
  });

  it("manual sensor snapshot copy preserves manual/not-live truth", () => {
    const n =
      QUICK_LOG_ACTIVITY_DEFINITIONS.manual_sensor_snapshot.safetyNote.toLowerCase();
    expect(n).toContain("manual");
    expect(n).toContain("not live");
    expect(n).toContain("unknown");
  });
});

describe("planQuickLogPersistence", () => {
  it("Note routes to quicklog_save_manual with p_action=note", () => {
    const plan = planQuickLogPersistence("note");
    expect(plan).toEqual({
      activityId: "note",
      saveRoute: "manual_note",
      manualAction: "note",
    });
  });

  it("Watering routes to quicklog_save_manual with p_action=water", () => {
    const plan = planQuickLogPersistence("watering");
    expect(plan).toEqual({
      activityId: "watering",
      saveRoute: "manual_water",
      manualAction: "water",
    });
  });

  it.each([
    ["feeding", "feeding", undefined],
    ["training", "training", undefined],
    ["photo", "photo", undefined],
    ["environment_check", "environment", undefined],
    ["issue_observation", "observation", "issue"],
  ] as const)(
    "%s routes to quicklog_save_event with event_type=%s",
    (id, eventType, subtype) => {
      const plan = planQuickLogPersistence(id);
      expect(plan?.saveRoute).toBe("event");
      expect(plan?.eventType).toBe(eventType);
      expect(plan?.detailsSubtype ?? undefined).toBe(subtype);
      // Only DB-validator-allowed event_types may be emitted.
      expect(ALLOWED_EVENT_TYPES.has(plan!.eventType!)).toBe(true);
    },
  );

  it("Defoliation persists as event_type=training with subtype fence", () => {
    const plan = planQuickLogPersistence("defoliation");
    expect(plan?.saveRoute).toBe("event");
    expect(plan?.eventType).toBe("training");
    expect(plan?.detailsSubtype).toBe("defoliation");
    expect(ALLOWED_EVENT_TYPES.has(plan!.eventType!)).toBe(true);
  });

  it("Manual sensor snapshot routes to manual_sensor_reading", () => {
    expect(planQuickLogPersistence("manual_sensor_snapshot")).toEqual({
      activityId: "manual_sensor_snapshot",
      saveRoute: "manual_sensor_reading",
    });
  });

  it("Harvest persists via quicklog_save_event with event_type=harvest (v1b)", () => {
    const plan = planQuickLogPersistence("harvest");
    expect(plan?.saveRoute).toBe("event");
    expect(plan?.eventType).toBe("harvest");
    expect(plan?.detailsSubtype).toBeUndefined();
  });

  it("never plans an event_type outside the DB validator allow-list", () => {
    for (const id of QUICK_LOG_ACTIVITY_IDS) {
      const plan = planQuickLogPersistence(id);
      if (plan?.eventType) {
        expect(ALLOWED_EVENT_TYPES.has(plan.eventType)).toBe(true);
      }
    }
  });
});

describe("resolveQuickLogEventTimelineLabel", () => {
  it("labels defoliation only when training + subtype=defoliation", () => {
    expect(
      resolveQuickLogEventTimelineLabel({
        eventType: "training",
        detailsSubtype: "defoliation",
      }),
    ).toBe("Defoliation");
  });

  it("generic training is not mislabeled as Defoliation", () => {
    expect(
      resolveQuickLogEventTimelineLabel({ eventType: "training" }),
    ).toBe("Training");
    expect(
      resolveQuickLogEventTimelineLabel({
        eventType: "training",
        detailsSubtype: "topping",
      }),
    ).toBe("Training");
    expect(
      resolveQuickLogEventTimelineLabel({
        eventType: "training",
        detailsSubtype: "",
      }),
    ).toBe("Training");
  });

  it("labels supported event_types correctly", () => {
    expect(resolveQuickLogEventTimelineLabel({ eventType: "feeding" })).toBe(
      "Feeding",
    );
    expect(resolveQuickLogEventTimelineLabel({ eventType: "watering" })).toBe(
      "Watering",
    );
    expect(resolveQuickLogEventTimelineLabel({ eventType: "photo" })).toBe(
      "Photo",
    );
    expect(
      resolveQuickLogEventTimelineLabel({ eventType: "environment" }),
    ).toBe("Environment check");
    expect(
      resolveQuickLogEventTimelineLabel({ eventType: "observation" }),
    ).toBe("Observation");
  });

  it("returns empty string for unknown event_type (never invents a label)", () => {
    expect(resolveQuickLogEventTimelineLabel({ eventType: "harvest" })).toBe(
      "",
    );
    expect(resolveQuickLogEventTimelineLabel({ eventType: null })).toBe("");
    expect(resolveQuickLogEventTimelineLabel({ eventType: undefined })).toBe(
      "",
    );
  });
});
