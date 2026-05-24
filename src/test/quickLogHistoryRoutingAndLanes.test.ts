/**
 * Tests for Quick Log → Logs history routing.
 *
 * - Pure rules: lane mapping for every Quick Log event type, handheld
 *   reading parsing, per-lane builders, recent activity newest-first.
 * - Static guardrails: every Quick Log dropdown value has a lane, Logs
 *   page mounts the new history sections, Action Queue is no longer the
 *   first section, and no automation/sensor/edge-function surface was
 *   introduced.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { EVENT_TYPES } from "@/lib/diary";
import {
  QUICK_LOG_EVENT_LANES,
  QUICK_LOG_EVENT_VALUES,
  buildMeasurementHistory,
  buildObservationHistory,
  buildPestDiseaseHistory,
  buildRecentQuickLogActivity,
  buildTrainingHistory,
  hasManualHandheldReadings,
  laneForEventType,
  parseManualHandheldReadings,
} from "@/lib/quickLogHistoryRules";
import {
  appendHardwareReadingsToNote,
  type QuickLogHardwareReadings,
} from "@/lib/quickLogHardwareReadingsRules";
import { normalizeDiaryEntries } from "@/lib/diaryEntryRules";

const ROOT = resolve(__dirname, "../..");
const TIMELINE = readFileSync(resolve(ROOT, "src/pages/Timeline.tsx"), "utf8");
const PANELS = readFileSync(
  resolve(ROOT, "src/components/QuickLogHistoryPanels.tsx"),
  "utf8",
);
const RULES = readFileSync(
  resolve(ROOT, "src/lib/quickLogHistoryRules.ts"),
  "utf8",
);

const FIXED_NOW = Date.parse("2026-05-24T12:00:00Z");
const FIXED_NOW_ISO = new Date(FIXED_NOW).toISOString();

function rawEntry(o: {
  id: string;
  event_type: string;
  note?: string;
  at?: string;
  plant_id?: string | null;
  photo_url?: string | null;
  details?: Record<string, unknown>;
  stage?: string | null;
  grow_id?: string | null;
}) {
  return {
    id: o.id,
    grow_id: o.grow_id ?? "grow-1",
    plant_id: o.plant_id ?? null,
    tent_id: null,
    stage: o.stage ?? "veg",
    entry_at: o.at ?? FIXED_NOW_ISO,
    entry_type: o.event_type,
    note: o.note ?? "",
    photo_url: o.photo_url ?? null,
    details: { event_type: o.event_type, ...(o.details ?? {}) },
  };
}

function normalize(raws: Array<ReturnType<typeof rawEntry>>) {
  return normalizeDiaryEntries({ rawEntries: raws, now: FIXED_NOW });
}

// ---------------------------------------------------------------------------
// Lane mapping audit
// ---------------------------------------------------------------------------

describe("Quick Log lane mapping audit", () => {
  it("every Quick Log dropdown event_type has a defined lane (no silent fallback)", () => {
    for (const t of EVENT_TYPES) {
      expect(
        QUICK_LOG_EVENT_LANES,
        `missing lane for "${t.value}"`,
      ).toHaveProperty(t.value);
    }
  });

  it("QUICK_LOG_EVENT_VALUES mirrors EVENT_TYPES", () => {
    expect(QUICK_LOG_EVENT_VALUES.length).toBe(EVENT_TYPES.length);
    for (const t of EVENT_TYPES) {
      expect(QUICK_LOG_EVENT_VALUES).toContain(t.value);
    }
  });

  it("routes each event_type to the expected lane", () => {
    expect(laneForEventType("watering")).toBe("watering");
    expect(laneForEventType("feeding")).toBe("feeding");
    expect(laneForEventType("pest_disease")).toBe("pest_disease");
    expect(laneForEventType("diagnosis")).toBe("pest_disease");
    expect(laneForEventType("training")).toBe("training");
    expect(laneForEventType("defoliation")).toBe("training");
    expect(laneForEventType("measurement")).toBe("measurement");
    expect(laneForEventType("environment")).toBe("measurement");
    expect(laneForEventType("photo")).toBe("photo");
    expect(laneForEventType("observation")).toBe("observation");
    expect(laneForEventType("other")).toBe("activity");
    expect(laneForEventType(null)).toBe("activity");
    expect(laneForEventType(undefined)).toBe("activity");
  });
});

// ---------------------------------------------------------------------------
// Manual handheld reading parsing
// ---------------------------------------------------------------------------

describe("Manual handheld readings parsing", () => {
  const readings: QuickLogHardwareReadings = {
    inputPh: "6.1",
    inputEc: "1.4",
    runoffPh: "6.0",
    runoffEc: "1.6",
    ppfdCanopy: "665",
    lightDistance: "45 cm",
  };
  const note = appendHardwareReadingsToNote(
    "Placed sticky traps, watered 500ml",
    readings,
  );

  it("hasManualHandheldReadings detects the deterministic block", () => {
    expect(hasManualHandheldReadings(note)).toBe(true);
    expect(hasManualHandheldReadings("just a note")).toBe(false);
    expect(hasManualHandheldReadings(null)).toBe(false);
  });

  it("parses every captured field round-trip", () => {
    const parsed = parseManualHandheldReadings(note);
    expect(parsed).not.toBeNull();
    expect(parsed!.inputPh).toBe("6.1");
    expect(parsed!.inputEc).toBe("1.4");
    expect(parsed!.runoffPh).toBe("6.0");
    expect(parsed!.runoffEc).toBe("1.6");
    expect(parsed!.ppfdCanopy).toBe("665");
    expect(parsed!.lightDistance).toBe("45 cm");
  });
});

// ---------------------------------------------------------------------------
// Per-lane builders
// ---------------------------------------------------------------------------

describe("Quick Log per-lane builders", () => {
  const note = appendHardwareReadingsToNote(
    "Sticky traps + 25% H2O2 mix + 500ml water",
    {
      inputPh: "6.1",
      inputEc: "1.4",
      runoffPh: "6.0",
      runoffEc: "1.6",
      ppfdCanopy: "665",
      lightDistance: "45 cm",
    },
  );
  const entries = normalize([
    rawEntry({ id: "p1", event_type: "pest_disease", note, plant_id: "pl-1" }),
    rawEntry({ id: "t1", event_type: "training", note: "Topped main stem" }),
    rawEntry({ id: "o1", event_type: "observation", note: "Looking healthy" }),
    rawEntry({ id: "m1", event_type: "measurement", note: "Air temp 24C" }),
    rawEntry({
      id: "w1",
      event_type: "watering",
      note: "Watered",
      details: { ph: 6.2, watering_amount_ml: 500 },
    }),
    rawEntry({
      id: "ph1",
      event_type: "photo",
      photo_url: "https://example.com/p.jpg",
      note: "weekly check",
    }),
  ]);

  it("Pest / Disease entry routes to pest_disease lane", () => {
    const rows = buildPestDiseaseHistory(entries);
    expect(rows.map((r) => r.id)).toEqual(["p1"]);
    // Note body strips hardware block but preserves the prose
    expect(rows[0].noteBody).toContain("Sticky traps");
    expect(rows[0].noteBody).not.toContain("Hardware readings");
    // Manual handheld readings flow through
    expect(rows[0].manualHandheld).not.toBeNull();
    expect(rows[0].manualHandheld!.inputPh).toBe("6.1");
  });

  it("Training entry routes to training lane", () => {
    const rows = buildTrainingHistory(entries);
    expect(rows.map((r) => r.id)).toEqual(["t1"]);
  });

  it("Observation entry routes to observation lane", () => {
    const rows = buildObservationHistory(entries);
    expect(rows.map((r) => r.id)).toEqual(["o1"]);
  });

  it("Measurement lane includes measurement event_type + any entry with handheld readings", () => {
    const rows = buildMeasurementHistory(entries);
    const ids = rows.map((r) => r.id).sort();
    expect(ids).toContain("m1");
    expect(ids).toContain("p1"); // p1 carries handheld readings
  });

  it("Recent Quick Log activity is newest-first and capped by limit", () => {
    const dated = normalize([
      rawEntry({ id: "a", event_type: "observation", at: "2026-05-20T12:00:00Z" }),
      rawEntry({ id: "b", event_type: "watering", at: "2026-05-22T12:00:00Z" }),
      rawEntry({ id: "c", event_type: "feeding", at: "2026-05-23T12:00:00Z" }),
    ]);
    const rows = buildRecentQuickLogActivity(dated, 2);
    expect(rows.map((r) => r.id)).toEqual(["c", "b"]);
  });
});

// ---------------------------------------------------------------------------
// Logs page wiring
// ---------------------------------------------------------------------------

describe("Logs page wiring (Timeline.tsx)", () => {
  it("mounts all new Quick Log history panels", () => {
    expect(TIMELINE).toMatch(/RecentQuickLogActivityPanel/);
    expect(TIMELINE).toMatch(/PestDiseaseHistoryPanel/);
    expect(TIMELINE).toMatch(/TrainingHistoryPanel/);
    expect(TIMELINE).toMatch(/MeasurementHistoryPanel/);
  });

  it("renders Recent Quick Logs before Action Queue events", () => {
    const recentIdx = TIMELINE.indexOf("RecentQuickLogActivityPanel");
    const aqIdx = TIMELINE.indexOf("ActionQueueEventsSection events");
    expect(recentIdx).toBeGreaterThan(0);
    expect(aqIdx).toBeGreaterThan(recentIdx);
  });

  it("measurement filter detects handheld readings in note text", () => {
    expect(TIMELINE).toMatch(/hasManualHandheldReadings\(e\.note\)/);
  });

  it("does not introduce automation / device-control / pi-ingest / service_role / edge function surface", () => {
    const surface = `${TIMELINE}\n${PANELS}\n${RULES}`;
    expect(surface).not.toMatch(/mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|webhook|service_role/i);
    expect(surface).not.toMatch(/\bactuator\b|\brelay\b|device[_-]?control/i);
    expect(surface).not.toMatch(/supabase\.functions\.invoke/);
    expect(surface).not.toMatch(/sensor_readings/);
    expect(surface).not.toMatch(/action_queue\.insert|alerts\.insert/);
  });
});

// ---------------------------------------------------------------------------
// Panel copy + safety
// ---------------------------------------------------------------------------

describe("History panels copy + safety", () => {
  it("empty states point growers to Quick Log", () => {
    expect(PANELS).toMatch(/Log a Pest \/ Disease event from Quick Log/);
    expect(PANELS).toMatch(/Log a Training event from Quick Log/);
    expect(PANELS).toMatch(/handheld readings in Quick Log/);
  });

  it("manual readings are labeled as manual handheld (not live sensor data)", () => {
    expect(PANELS).toMatch(/Manual handheld readings \(not live sensor data\)/);
  });
});
