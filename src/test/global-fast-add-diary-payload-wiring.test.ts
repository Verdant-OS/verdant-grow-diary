/**
 * Global Fast Add → diary payload wiring regression tests.
 *
 * Pure unit tests. Verifies every menu action resolves to the right
 * handler shape (navigate vs open-quicklog) and that every logging
 * action's `eventType` is a real diary EVENT_TYPES value, so the
 * existing Quick Log form/insert path can consume it.
 *
 * No I/O. No Supabase. No model calls. No automation.
 */
import { describe, it, expect } from "vitest";
import {
  FAST_ADD_ACTIONS,
  resolveFastAddIntent,
  type FastAddActionId,
} from "@/lib/fastAddActionRules";
import { EVENT_TYPE_MAP, EVENT_TYPES } from "@/lib/diary";
import { PLANT_QUICKLOG_PREFILL_EVENT } from "@/lib/plantQuickLogPrefillRules";

const FIXED = new Date("2026-06-04T10:00:00.000Z");
const now = () => FIXED;
const ctx = { plantId: "p1", tentId: "t1", growId: "g1" } as const;

const PAYLOAD_KEYS = [
  "captured_at",
  "eventType",
  "growId",
  "occurred_at",
  "plantId",
  "plantName",
  "tentId",
  "tentName",
] as const;

describe("Fast Add action → handler wiring", () => {
  it("diagnosis is navigation-only (never opens Quick Log, never calls a model)", () => {
    const intent = resolveFastAddIntent("diagnosis", ctx);
    expect(intent.kind).toBe("navigate");
  });

  it.each(
    FAST_ADD_ACTIONS.filter((a) => a.id !== "diagnosis").map(
      (a) => [a.id, a.quickLogEventType!] as const,
    ),
  )(
    "%s opens the Quick Log via the existing window event with eventType=%s",
    (actionId, expectedEventType) => {
      const intent = resolveFastAddIntent(actionId, ctx, { now });
      expect(intent.kind).toBe("open-quicklog");
      if (intent.kind !== "open-quicklog") return;
      expect(intent.eventName).toBe(PLANT_QUICKLOG_PREFILL_EVENT);
      expect(intent.prefill.eventType).toBe(expectedEventType);
      expect(intent.prefill.plantId).toBe("p1");
      expect(intent.prefill.tentId).toBe("t1");
      expect(intent.prefill.growId).toBe("g1");
    },
  );
});

describe("Fast Add payload → diary EVENT_TYPES alignment", () => {
  it.each(
    FAST_ADD_ACTIONS.filter((a) => a.quickLogEventType !== null).map(
      (a) => [a.id, a.quickLogEventType!] as const,
    ),
  )(
    "%s payload eventType '%s' is a registered diary EVENT_TYPES value",
    (_id, eventType) => {
      expect(EVENT_TYPE_MAP[eventType]).toBeDefined();
      expect(EVENT_TYPES.some((e) => e.value === eventType)).toBe(true);
    },
  );

  it("payload key shape is stable (snapshot to catch silent drift)", () => {
    const intent = resolveFastAddIntent("environment", ctx, { now });
    if (intent.kind !== "open-quicklog") throw new Error("expected open-quicklog");
    const keys = Object.keys(intent.prefill).sort();
    // Environment is the only action that sets both occurred_at + captured_at.
    expect(keys).toEqual([...PAYLOAD_KEYS].sort());
  });

  it("watering payload sets occurred_at only (no captured_at)", () => {
    const intent = resolveFastAddIntent("watering", ctx, { now });
    if (intent.kind !== "open-quicklog") throw new Error("expected open-quicklog");
    expect(intent.prefill.occurred_at).toBe(FIXED.toISOString());
    expect(intent.prefill.captured_at).toBeUndefined();
  });
});

describe("Fast Add action surface — stable id set", () => {
  it("every menu action id resolves to a non-needs-context intent when context is present", () => {
    for (const a of FAST_ADD_ACTIONS) {
      const intent = resolveFastAddIntent(a.id as FastAddActionId, ctx);
      expect(intent.kind).not.toBe("needs-context");
    }
  });
});
