/**
 * Timeline → AI Doctor context handoff regression.
 *
 * Proves that the existing pure pipeline (TimelineMemoryItem →
 * buildAiDoctorContextInput → evaluateAiDoctorContext) faithfully
 * surfaces Quick Log notes, watering actions, and manual sensor
 * snapshots as AI Doctor context evidence, and that missing pieces
 * remain explicit in `missing[]` without ever being relabeled as
 * "live", "synced", or "healthy".
 *
 * Pure: no Supabase, no model calls, no React.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildAiDoctorContextInput,
  evaluateAiDoctorContextFromSources,
  timelineItemsToAiDoctorContextSources,
  type AiDoctorContextPlantSource,
} from "@/lib/aiDoctorContextViewModel";
import type { TimelineMemoryItem } from "@/lib/timelineFilterRules";
import type { ManualSnapshotTimelineCard } from "@/lib/manualSensorSnapshotViewModel";

const NOW = Date.parse("2026-06-03T12:00:00.000Z");
const HOURS = (h: number) => NOW - h * 60 * 60 * 1000;

const PLANT: AiDoctorContextPlantSource = {
  id: "plant-1",
  name: "Blue Dream #1",
  strain: "Blue Dream",
  stage: "veg",
  medium: "coco",
  photo: "https://example/photo.jpg",
};

function note(at: number, eventType: string | null = "observation"): TimelineMemoryItem {
  return {
    kind: "diary",
    key: `note-${at}`,
    occurredAt: new Date(at).toISOString(),
    eventType,
    hasPhoto: false,
    note: "Leaves perked up.",
  };
}

function water(at: number): TimelineMemoryItem {
  return {
    kind: "diary",
    key: `water-${at}`,
    occurredAt: new Date(at).toISOString(),
    eventType: "watering",
    hasPhoto: false,
    note: null,
  };
}

function manualSnap(
  at: number,
  severity: ManualSnapshotTimelineCard["severity"] = "ok",
): TimelineMemoryItem {
  const card = {
    severity,
    headline: severity === "invalid" ? "Invalid reading" : "Snapshot",
    sourceLabel: "Manual",
  } as unknown as ManualSnapshotTimelineCard;
  return {
    kind: "manual_sensor_snapshot",
    key: `snap-${at}`,
    occurredAt: new Date(at).toISOString(),
    card,
  };
}

describe("timeline → AI Doctor context: evidence surfacing", () => {
  it("recent Quick Log observation note is counted as recent timeline activity", () => {
    const items = [note(HOURS(2)), note(HOURS(20))];
    const result = evaluateAiDoctorContextFromSources({
      plant: PLANT,
      timelineItems: items,
      now: NOW,
    });
    expect(result.evidence).toContain("recent-timeline-activity");
    expect(result.counts.recentEvents).toBe(2);
  });

  it("recent watering action surfaces as 'recent-watering-or-feeding' evidence", () => {
    const result = evaluateAiDoctorContextFromSources({
      plant: PLANT,
      timelineItems: [water(HOURS(3)), note(HOURS(5))],
      now: NOW,
    });
    expect(result.evidence).toContain("recent-watering-or-feeding");
    expect(result.counts.recentWateringOrFeeding).toBe(1);
  });

  it("manual sensor snapshot surfaces as manual snapshot evidence (never 'live')", () => {
    const result = evaluateAiDoctorContextFromSources({
      plant: PLANT,
      timelineItems: [water(HOURS(2)), manualSnap(HOURS(1), "ok")],
      now: NOW,
    });
    expect(result.evidence).toContain("recent-manual-sensor-snapshot");
    expect(result.evidence).toContain("fresh-manual-sensor-snapshot");
    expect(result.counts.recentManualSnapshots).toBe(1);
    for (const code of [...result.evidence, ...result.missing]) {
      expect(code).not.toMatch(/\blive\b/i);
      expect(code).not.toMatch(/\bsynced\b/i);
      expect(code).not.toMatch(/\bimported\b/i);
    }
  });

  it("invalid-severity snapshot is counted as a warning, not as clean evidence", () => {
    const result = evaluateAiDoctorContextFromSources({
      plant: PLANT,
      timelineItems: [manualSnap(HOURS(1), "invalid")],
      now: NOW,
    });
    expect(result.counts.recentWarnings).toBeGreaterThanOrEqual(1);
    expect(result.evidence).toContain("recent-warnings");
  });
});

describe("timeline → AI Doctor context: missing-info honesty", () => {
  it("empty timeline yields 'insufficient' readiness with explicit missing codes", () => {
    const result = evaluateAiDoctorContextFromSources({
      plant: PLANT,
      timelineItems: [],
      now: NOW,
    });
    expect(result.readiness).toBe("insufficient");
    expect(result.missing).toEqual(
      expect.arrayContaining([
        "recent-timeline-activity",
        "recent-watering-or-feeding",
        "recent-manual-sensor-snapshot",
      ]),
    );
  });

  it("one lonely note does NOT make AI Doctor strong-ready", () => {
    const result = evaluateAiDoctorContextFromSources({
      plant: PLANT,
      timelineItems: [note(HOURS(1))],
      now: NOW,
    });
    expect(result.readiness).not.toBe("strong");
    // Still missing a recent sensor snapshot.
    expect(result.missing).toContain("recent-manual-sensor-snapshot");
  });

  it("null plant profile reports 'plant-profile' missing and never strong", () => {
    const result = evaluateAiDoctorContextFromSources({
      plant: null,
      timelineItems: [water(HOURS(1)), manualSnap(HOURS(1))],
      now: NOW,
    });
    expect(result.missing).toContain("plant-profile");
    expect(result.readiness).not.toBe("strong");
  });
});

describe("timeline → AI Doctor context: source-truth and adapter shape", () => {
  it("adapter emits one snapshot entry per manual snapshot item and tags category 'manual_sensor_snapshot'", () => {
    const { events, snapshots } = timelineItemsToAiDoctorContextSources([
      manualSnap(HOURS(1), "ok"),
      note(HOURS(2)),
      water(HOURS(3)),
    ]);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].severity).toBe("ok");
    const categories = events.map((e) => e.category);
    expect(categories).toContain("manual_sensor_snapshot");
    expect(categories).toContain("notes");
    expect(categories).toContain("watering");
    // Honest labels: nothing claims live/synced/imported.
    for (const e of events) {
      expect(String(e.category)).not.toMatch(/\blive\b/i);
    }
  });

  it("buildAiDoctorContextInput is pure & deterministic for identical inputs (stable ordering)", () => {
    const items = [
      manualSnap(HOURS(2), "ok"),
      note(HOURS(2)),
      water(HOURS(2)),
    ];
    const a = buildAiDoctorContextInput({
      plant: PLANT,
      timelineItems: items,
      now: NOW,
    });
    const b = buildAiDoctorContextInput({
      plant: PLANT,
      timelineItems: items,
      now: NOW,
    });
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it("missing/invalid timestamp on a timeline item is dropped from the recent window safely", () => {
    const broken: TimelineMemoryItem = {
      kind: "diary",
      key: "broken",
      occurredAt: "not-a-date",
      eventType: "observation",
      hasPhoto: false,
      note: null,
    };
    const result = evaluateAiDoctorContextFromSources({
      plant: PLANT,
      timelineItems: [broken, note(HOURS(1))],
      now: NOW,
    });
    // Only the valid one counts toward "recent".
    expect(result.counts.recentEvents).toBe(1);
  });
});

describe("timeline → AI Doctor context: static safety", () => {
  const root = process.cwd();
  const stripComments = (s: string): string =>
    s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  const load = (rel: string): string =>
    stripComments(readFileSync(join(root, rel), "utf8"));
  const files: Record<string, string> = {
    rules: load("src/lib/aiDoctorContextRules.ts"),
    vm: load("src/lib/aiDoctorContextViewModel.ts"),
  };

  it("AI Doctor context pipeline never references service_role or model APIs", () => {
    const banned = [
      /service_role/i,
      /SUPABASE_SERVICE_ROLE/,
      /openai\.com/i,
      /anthropic\.com/i,
      /functions\.invoke/i,
      /\bfetch\s*\(/,
    ];
    for (const [name, src] of Object.entries(files)) {
      for (const re of banned) {
        expect(src, name).not.toMatch(re);
      }
    }
  });

  it("AI Doctor context pipeline never emits live/synced/connected/imported wording or autopilot/executed strings", () => {
    const banned = [
      /\blive\b/i,
      /\bsynced\b/i,
      /\bconnected\b/i,
      /\bimported\b/i,
      /autopilot/i,
      /_executed\b/i,
      /device\.execute/i,
      /relay\.set/i,
    ];
    for (const [name, src] of Object.entries(files)) {
      for (const re of banned) {
        expect(src, name).not.toMatch(re);
      }
    }
  });
});
