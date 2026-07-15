/**
 * Public Quick Log Starter — pure draft rules.
 *
 * Covers validation honesty (stage never fake-defaults, empty numbers stay
 * null), draft build identity stability, parse round-trip + corrupt-input
 * tolerance, attribution allow-listing, and the handoff freshness boundary.
 * Pure module — no storage access here (store behavior is covered by the
 * render test through the page).
 */
import { describe, it, expect } from "vitest";
import {
  PUBLIC_QUICK_LOG_STARTER_DRAFT_KEY,
  PUBLIC_QUICK_LOG_STARTER_HANDOFF_FRESHNESS_MS,
  PUBLIC_QUICK_LOG_STARTER_LOG_TYPES,
  PUBLIC_QUICK_LOG_STARTER_MAX_NICKNAME_LENGTH,
  PUBLIC_QUICK_LOG_STARTER_MAX_NOTE_LENGTH,
  buildPublicQuickLogStarterDraft,
  isPublicQuickLogStarterDraftFresh,
  parsePublicQuickLogStarterDraft,
  sanitizeAttribution,
  serializePublicQuickLogStarterDraft,
  validatePublicQuickLogStarterInput,
  type PublicQuickLogStarterDraft,
} from "@/lib/publicQuickLogStarterRules";

const NOW = new Date("2026-07-15T12:00:00.000Z");

function input(overrides: Partial<Parameters<typeof validatePublicQuickLogStarterInput>[0]> = {}) {
  return {
    plantNickname: "Blue Dream #1",
    stage: "",
    logType: "observation",
    note: "First set of true leaves looking healthy.",
    wateringVolumeRaw: "",
    ...overrides,
  };
}

function validDraft(): PublicQuickLogStarterDraft {
  const result = validatePublicQuickLogStarterInput(input());
  expect(result.fields).not.toBeNull();
  return buildPublicQuickLogStarterDraft({
    fields: result.fields!,
    attribution: { utm_source: "organic_guide" },
    now: NOW,
  });
}

describe("storage key contract", () => {
  it("is the pinned versioned key", () => {
    expect(PUBLIC_QUICK_LOG_STARTER_DRAFT_KEY).toBe("verdant.quickLogStarter.draft.v1");
  });
});

describe("validatePublicQuickLogStarterInput", () => {
  it("accepts a plain observation note", () => {
    const r = validatePublicQuickLogStarterInput(input());
    expect(r.errors).toEqual({});
    expect(r.fields).toMatchObject({
      plantNickname: "Blue Dream #1",
      stage: "",
      logType: "observation",
      wateringVolumeMl: null,
    });
  });

  it("requires a nickname and caps its length", () => {
    expect(
      validatePublicQuickLogStarterInput(input({ plantNickname: "  " })).errors.plantNickname,
    ).toBeTruthy();
    expect(
      validatePublicQuickLogStarterInput(
        input({ plantNickname: "x".repeat(PUBLIC_QUICK_LOG_STARTER_MAX_NICKNAME_LENGTH + 1) }),
      ).errors.plantNickname,
    ).toBeTruthy();
  });

  it("requires a note for every type except watering, and caps its length", () => {
    for (const logType of PUBLIC_QUICK_LOG_STARTER_LOG_TYPES) {
      const r = validatePublicQuickLogStarterInput(
        input({ logType, note: "", wateringVolumeRaw: "500" }),
      );
      if (logType === "watering") {
        expect(r.fields, `${logType} allows empty note`).not.toBeNull();
      } else {
        expect(r.errors.note, `${logType} requires a note`).toBeTruthy();
      }
    }
    expect(
      validatePublicQuickLogStarterInput(
        input({ note: "x".repeat(PUBLIC_QUICK_LOG_STARTER_MAX_NOTE_LENGTH + 1) }),
      ).errors.note,
    ).toBeTruthy();
  });

  it("rejects unknown log types", () => {
    expect(
      validatePublicQuickLogStarterInput(input({ logType: "harvest" })).errors.logType,
    ).toBeTruthy();
    expect(validatePublicQuickLogStarterInput(input({ logType: "" })).errors.logType).toBeTruthy();
  });

  it("normalizes stage through the canonical vocabulary and NEVER fake-defaults", () => {
    expect(validatePublicQuickLogStarterInput(input({ stage: "flower" })).fields?.stage).toBe(
      "flower",
    );
    // Label + alias resolution comes from the shared normalizer.
    expect(validatePublicQuickLogStarterInput(input({ stage: "Flowering" })).fields?.stage).toBe(
      "flower",
    );
    expect(validatePublicQuickLogStarterInput(input({ stage: "cure" })).fields?.stage).toBe(
      "drying",
    );
    // Unknown text stays "" (unknown) — never "veg".
    expect(
      validatePublicQuickLogStarterInput(input({ stage: "totally-unknown" })).fields?.stage,
    ).toBe("");
    expect(validatePublicQuickLogStarterInput(input({ stage: "" })).fields?.stage).toBe("");
  });

  it("watering requires a finite volume above zero (empty stays null, never 0)", () => {
    const watering = (raw: string) =>
      validatePublicQuickLogStarterInput(
        input({ logType: "watering", note: "", wateringVolumeRaw: raw }),
      );
    expect(watering("500").fields?.wateringVolumeMl).toBe(500);
    expect(watering("0").errors.wateringVolumeMl).toBeTruthy();
    expect(watering("-5").errors.wateringVolumeMl).toBeTruthy();
    expect(watering("").errors.wateringVolumeMl).toBeTruthy();
    expect(watering("abc").errors.wateringVolumeMl).toBeTruthy();
    expect(watering("Infinity").errors.wateringVolumeMl).toBeTruthy();
  });

  it("non-watering types never carry a volume", () => {
    const r = validatePublicQuickLogStarterInput(
      input({ logType: "feeding", wateringVolumeRaw: "500" }),
    );
    expect(r.fields?.wateringVolumeMl).toBeNull();
  });
});

describe("buildPublicQuickLogStarterDraft", () => {
  it("mints id/createdAt on first save and keeps them stable on re-save", () => {
    const first = validDraft();
    expect(first.id.length).toBeGreaterThan(0);
    expect(first.createdAt).toBe(NOW.toISOString());
    const later = new Date(NOW.getTime() + 60_000);
    const result = validatePublicQuickLogStarterInput(input({ note: "Edited note." }));
    const second = buildPublicQuickLogStarterDraft({
      fields: result.fields!,
      attribution: {},
      now: later,
      previous: first,
    });
    expect(second.id).toBe(first.id);
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.updatedAt).toBe(later.toISOString());
    expect(second.note).toBe("Edited note.");
  });
});

describe("sanitizeAttribution", () => {
  it("keeps only allow-listed UTM keys with capped string values", () => {
    const out = sanitizeAttribution({
      utm_source: "organic_guide",
      utm_medium: "owned",
      ref: "evil",
      session: "tok",
      utm_campaign: "x".repeat(400),
      utm_term: 42,
      utm_content: "",
    });
    expect(out).toEqual({
      utm_source: "organic_guide",
      utm_medium: "owned",
      utm_campaign: "x".repeat(256),
    });
  });

  it("tolerates junk input", () => {
    expect(sanitizeAttribution(null)).toEqual({});
    expect(sanitizeAttribution("nope")).toEqual({});
    expect(sanitizeAttribution(42)).toEqual({});
  });
});

describe("parse / serialize round-trip", () => {
  it("round-trips a valid draft byte-for-byte", () => {
    const draft = validDraft();
    const raw = serializePublicQuickLogStarterDraft(draft);
    expect(parsePublicQuickLogStarterDraft(raw)).toEqual(draft);
  });

  it("returns null for corrupt or foreign payloads without throwing", () => {
    for (const raw of [
      null,
      undefined,
      "",
      "not json",
      "42",
      '"a string"',
      "{}",
      JSON.stringify({ v: 2 }),
      JSON.stringify({ v: 1, id: "" }),
      JSON.stringify({ v: 1, id: "x", createdAt: "nope", updatedAt: "nope" }),
    ]) {
      expect(parsePublicQuickLogStarterDraft(raw as string | null | undefined)).toBeNull();
    }
  });

  it("rejects unknown log types and empty nicknames; degrades unknown stage to unknown", () => {
    const base = JSON.parse(serializePublicQuickLogStarterDraft(validDraft()));
    expect(
      parsePublicQuickLogStarterDraft(JSON.stringify({ ...base, logType: "harvest" })),
    ).toBeNull();
    expect(
      parsePublicQuickLogStarterDraft(JSON.stringify({ ...base, plantNickname: "   " })),
    ).toBeNull();
    const weirdStage = parsePublicQuickLogStarterDraft(
      JSON.stringify({ ...base, stage: "banana" }),
    );
    expect(weirdStage?.stage).toBe("");
  });

  it("truncates overlong text instead of losing the draft, and drops bad volumes", () => {
    const base = JSON.parse(serializePublicQuickLogStarterDraft(validDraft()));
    const parsed = parsePublicQuickLogStarterDraft(
      JSON.stringify({
        ...base,
        note: "n".repeat(2_000),
        wateringVolumeMl: -3,
        attribution: { utm_source: "ok", nope: "drop" },
      }),
    );
    expect(parsed?.note.length).toBe(PUBLIC_QUICK_LOG_STARTER_MAX_NOTE_LENGTH);
    expect(parsed?.wateringVolumeMl).toBeNull();
    expect(parsed?.attribution).toEqual({ utm_source: "ok" });
  });
});

describe("handoff freshness (expiry gate for the FUTURE authed import)", () => {
  it("is fresh just inside the cap and stale just past it", () => {
    const draft = validDraft();
    const justInside = new Date(
      NOW.getTime() + PUBLIC_QUICK_LOG_STARTER_HANDOFF_FRESHNESS_MS - 1_000,
    );
    const justPast = new Date(
      NOW.getTime() + PUBLIC_QUICK_LOG_STARTER_HANDOFF_FRESHNESS_MS + 1_000,
    );
    expect(isPublicQuickLogStarterDraftFresh(draft, justInside)).toBe(true);
    expect(isPublicQuickLogStarterDraftFresh(draft, justPast)).toBe(false);
  });

  it("treats clock-skewed (future) drafts and bad timestamps as stale", () => {
    const draft = validDraft();
    expect(isPublicQuickLogStarterDraftFresh(draft, new Date(NOW.getTime() - 60_000))).toBe(false);
    expect(isPublicQuickLogStarterDraftFresh({ ...draft, updatedAt: "garbage" }, NOW)).toBe(false);
  });
});
