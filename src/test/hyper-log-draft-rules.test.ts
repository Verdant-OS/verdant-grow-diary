/**
 * Tests for hyperLogDraftRules — pure HyperLog → Quick Log prefill mapping.
 *
 * Verifies action→eventType mapping, note composition, null-safety, and
 * the safety invariants: no demo sensor snapshot values leak into the
 * prefill, photos are not transferred.
 */
import { describe, it, expect } from "vitest";
import {
  buildHyperLogQuickLogPrefill,
  composeHyperLogNote,
  mapHyperLogActionToEventType,
  HYPERLOG_QUICKLOG_EVENT_NAME,
} from "@/lib/hyperLogDraftRules";
import type { HyperLogDemoFormState } from "@/components/HyperLogModal";

const EMPTY: HyperLogDemoFormState = {
  waterAmount: "",
  waterUnit: "ml",
  waterNote: "",
  feedAmount: "",
  feedNutrient: "",
  feedNote: "",
  defoliateIntensity: "",
  defoliateNote: "",
  freeformNote: "",
};

const CTX = {
  plantId: "p-1",
  plantName: "Plant A",
  growId: "g-1",
  tentId: "t-1",
  tentName: "Tent A",
};

describe("mapHyperLogActionToEventType", () => {
  it("maps each action to the existing Quick Log event_type", () => {
    expect(mapHyperLogActionToEventType("water")).toBe("watering");
    expect(mapHyperLogActionToEventType("feed")).toBe("feeding");
    expect(mapHyperLogActionToEventType("defoliate")).toBe("training");
    expect(mapHyperLogActionToEventType("note")).toBe("observation");
  });
});

describe("composeHyperLogNote", () => {
  it("composes a water note", () => {
    expect(
      composeHyperLogNote("water", {
        ...EMPTY,
        waterAmount: "250",
        waterUnit: "ml",
        waterNote: "runoff clear",
      }),
    ).toBe("Watered 250 ml · runoff clear");
  });

  it("composes a feed note with nutrient", () => {
    expect(
      composeHyperLogNote("feed", {
        ...EMPTY,
        feedAmount: "1L",
        feedNutrient: "FloraNova",
        feedNote: "ec ok",
      }),
    ).toBe("Fed 1L (FloraNova) · ec ok");
  });

  it("composes a defoliate note", () => {
    expect(
      composeHyperLogNote("defoliate", { ...EMPTY, defoliateIntensity: "light" }),
    ).toBe("Defoliated — light");
  });

  it("returns empty for a blank free-form note", () => {
    expect(composeHyperLogNote("note", EMPTY)).toBe("");
  });

  it("appends photo hint when photoCount > 0", () => {
    const out = composeHyperLogNote("note", { ...EMPTY, freeformNote: "hi" }, 2);
    expect(out).toContain("hi");
    expect(out).toContain("2 HyperLog photos kept locally");
  });
});

describe("buildHyperLogQuickLogPrefill", () => {
  it("produces a full prefill from a water draft with context", () => {
    const prefill = buildHyperLogQuickLogPrefill({
      action: "water",
      form: { ...EMPTY, waterAmount: "300", waterUnit: "ml" },
      context: CTX,
    });
    expect(prefill).toEqual({
      plantId: "p-1",
      plantName: "Plant A",
      growId: "g-1",
      tentId: "t-1",
      eventType: "watering",
      suggestSnapshot: true,
      note: "Watered 300 ml",
    });
  });

  it("falls back to nulls when no context provided", () => {
    const prefill = buildHyperLogQuickLogPrefill({
      action: "note",
      form: { ...EMPTY, freeformNote: "leaf curl" },
    });
    expect(prefill).toMatchObject({
      plantId: null,
      growId: null,
      tentId: null,
      eventType: "observation",
      suggestSnapshot: false,
      note: "leaf curl",
    });
  });

  it("never carries HyperLog demo sensor snapshot values (24.6 / 58 / 1.12) into prefill", () => {
    const prefill = buildHyperLogQuickLogPrefill({
      action: "water",
      form: { ...EMPTY, waterAmount: "100" },
      context: CTX,
    });
    const json = JSON.stringify(prefill);
    expect(json).not.toMatch(/24\.6/);
    expect(json).not.toMatch(/1\.12/);
    expect(json).not.toMatch(/"58"/);
    expect(json).not.toMatch(/temperature_c|humidity_pct|vpd_kpa/);
  });

  it("emits null note when nothing was entered", () => {
    const prefill = buildHyperLogQuickLogPrefill({
      action: "note",
      form: EMPTY,
      context: CTX,
    });
    expect(prefill?.note).toBeNull();
  });

  it("returns null on bogus input", () => {
    expect(buildHyperLogQuickLogPrefill(null as never)).toBeNull();
    expect(buildHyperLogQuickLogPrefill({} as never)).toBeNull();
  });

  it("uses the existing window event name (no new write path)", () => {
    expect(HYPERLOG_QUICKLOG_EVENT_NAME).toBe("verdant:open-quicklog");
  });
});
