/**
 * Diary timeline event-type wiring regression tests.
 *
 * Verifies the diary `event_type` vocabulary stays consistent across:
 *   - UI forms / pickers          (src/lib/diary.ts → EVENT_TYPES)
 *   - Insert payload builders     (Quick Log, legacy QuickLog save)
 *   - Timeline rendering          (getEventType fallback)
 *   - Timeline classification     (timelineEntryClassification)
 *   - Mounted route pages         (APP_ROUTES manifest)
 *
 * Pure. No I/O. No Supabase. No model calls.
 */
import { describe, it, expect } from "vitest";
import { EVENT_TYPES, EVENT_TYPE_MAP, getEventType } from "@/lib/diary";
import { FAST_ADD_ACTIONS } from "@/lib/fastAddActionRules";
import { SUPPORTED_LEGACY_EVENT_TYPES } from "@/lib/legacyQuickLogUnifiedSave";
import { classifyTimelineEntry } from "@/lib/timelineEntryClassification";
import { APP_ROUTES } from "@/lib/appRouteManifest";

const DIARY_VALUES = new Set(EVENT_TYPES.map((e) => e.value));
const MANIFEST_PATHS = new Set(APP_ROUTES.map((r) => r.path));

describe("Form picker ↔ rendering wiring", () => {
  it.each(EVENT_TYPES.map((e) => [e.value, e.label] as const))(
    "EVENT_TYPES entry '%s' (label '%s') round-trips through getEventType",
    (value) => {
      const def = getEventType(value);
      expect(def.value).toBe(value);
      expect(EVENT_TYPE_MAP[value]).toBe(def);
    },
  );

  it("getEventType falls back to 'observation' for unknown values", () => {
    expect(getEventType("definitely-not-a-real-event").value).toBe("observation");
    expect(getEventType(null).value).toBe("observation");
    expect(getEventType(undefined).value).toBe("observation");
  });
});

describe("Insert payload builders ↔ diary EVENT_TYPES alignment", () => {
  it.each(
    FAST_ADD_ACTIONS.filter((a) => a.quickLogEventType !== null).map(
      (a) => [a.id, a.quickLogEventType!] as const,
    ),
  )(
    "Quick Log '%s' produces eventType '%s' which exists in EVENT_TYPES",
    (_id, eventType) => {
      expect(DIARY_VALUES.has(eventType)).toBe(true);
    },
  );

  it.each(
    SUPPORTED_LEGACY_EVENT_TYPES.filter((v) => v !== "note").map(
      (v) => [v] as const,
    ),
  )(
    "Legacy QuickLog save event '%s' is wired to a real EVENT_TYPES entry",
    (eventType) => {
      expect(DIARY_VALUES.has(eventType)).toBe(true);
    },
  );

  it("'note' is a legacy alias and is allowed even though it isn't in EVENT_TYPES (handled by getEventType fallback)", () => {
    // Guard rail: if this ever flips, update the alias mapping intentionally.
    expect(DIARY_VALUES.has("note")).toBe(false);
    expect(getEventType("note").value).toBe("observation");
  });
});

describe("Timeline classification ↔ EVENT_TYPES coverage", () => {
  it.each(EVENT_TYPES.map((e) => [e.value] as const))(
    "classifyTimelineEntry handles '%s' without throwing and returns a known bucket",
    (eventType) => {
      const bucket = classifyTimelineEntry({ eventType });
      expect(typeof bucket).toBe("string");
      expect(bucket.length).toBeGreaterThan(0);
    },
  );

  it("photo event type always classifies as 'photos'", () => {
    expect(classifyTimelineEntry({ eventType: "photo" })).toBe("photos");
  });

  it("watering / feeding event types route to their named buckets", () => {
    expect(classifyTimelineEntry({ eventType: "watering" })).toBe("watering");
    expect(classifyTimelineEntry({ eventType: "feeding" })).toBe("feeding");
  });
});

describe("Diary timeline rendering pages are mounted", () => {
  // Pages that surface the diary timeline / per-scope event feeds.
  const TIMELINE_ROUTES = [
    "/logs",
    "/plants/:id",
    "/tents/:id",
    "/grows/:growId",
  ] as const;

  it.each(TIMELINE_ROUTES.map((p) => [p] as const))(
    "route '%s' is mounted in APP_ROUTES",
    (path) => {
      expect(MANIFEST_PATHS.has(path)).toBe(true);
    },
  );
});
