/**
 * Timeline → AI Doctor context handoff — second-layer regression coverage.
 *
 * The existing pipeline (TimelineMemoryItem → buildAiDoctorContextInput
 * → evaluateAiDoctorContext) is correct (see
 * `timeline-ai-doctor-context-handoff.test.ts`). This file adds
 * focused regressions for the bits that loop iteration risks:
 *
 *  - Quick Log–shaped diary + manual snapshot items reach the context
 *    pipeline with honest "Manual" labeling and never as "live".
 *  - Deterministic ordering with timestamp tie-break (no reliance on
 *    object insertion order).
 *  - Invalid / no-telemetry snapshots never count as healthy evidence.
 *  - One lonely Quick Log note never makes AI Doctor strong-ready.
 *  - Coach + Plant Detail AI Doctor context panels still consume the
 *    shared view-model (no duplicated readiness-label table inside JSX,
 *    no client-side service_role, no live/model HTTP, no automation).
 *
 * Pure: no Supabase, no model calls, no React rendering.
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

function quickLogNote(at: number, key = `note-${at}`): TimelineMemoryItem {
  return {
    kind: "diary",
    key,
    occurredAt: new Date(at).toISOString(),
    eventType: "observation",
    hasPhoto: false,
    note: "Top dressed with worm castings.",
  };
}

function quickLogWatering(
  at: number,
  key = `water-${at}`,
): TimelineMemoryItem {
  return {
    kind: "diary",
    key,
    occurredAt: new Date(at).toISOString(),
    eventType: "watering",
    hasPhoto: false,
    note: null,
  };
}

function manualSnap(
  at: number,
  severity: ManualSnapshotTimelineCard["severity"] = "ok",
  key = `snap-${at}`,
): TimelineMemoryItem {
  const card = {
    severity,
    headline: severity === "invalid" ? "Invalid reading" : "Snapshot",
    sourceLabel: "Manual",
  } as unknown as ManualSnapshotTimelineCard;
  return { kind: "manual_sensor_snapshot", key, occurredAt: new Date(at).toISOString(), card };
}

// ---------------------------------------------------------------------------
// 1. Quick Log entries reach AI Doctor context with honest labeling
// ---------------------------------------------------------------------------

describe("Quick Log → AI Doctor context handoff", () => {
  it("observation note + watering both surface as recent evidence", () => {
    const result = evaluateAiDoctorContextFromSources({
      plant: PLANT,
      timelineItems: [quickLogNote(HOURS(2)), quickLogWatering(HOURS(3))],
      now: NOW,
    });
    expect(result.evidence).toContain("recent-timeline-activity");
    expect(result.evidence).toContain("recent-watering-or-feeding");
    expect(result.counts.recentEvents).toBeGreaterThanOrEqual(2);
    expect(result.counts.recentWateringOrFeeding).toBe(1);
  });

  it("manual snapshot surfaces with Manual labeling — never live/synced/connected/imported", () => {
    const { events, snapshots } = timelineItemsToAiDoctorContextSources([
      manualSnap(HOURS(1), "ok"),
    ]);
    expect(snapshots).toHaveLength(1);
    const all = JSON.stringify({ events, snapshots });
    expect(all).not.toMatch(/\blive\b/i);
    expect(all).not.toMatch(/\bsynced\b/i);
    expect(all).not.toMatch(/\bconnected\b/i);
    expect(all).not.toMatch(/\bimported\b/i);
    // Source labels are not blended into the rules schema (rules
    // intentionally carry no source field) — the only label the UI
    // ever shows is the timeline card's, which says "Manual".
  });

  it("invalid-severity snapshot counts as a warning, not as clean sensor evidence", () => {
    const result = evaluateAiDoctorContextFromSources({
      plant: PLANT,
      timelineItems: [manualSnap(HOURS(1), "invalid")],
      now: NOW,
    });
    expect(result.evidence).toContain("recent-warnings");
    expect(result.counts.recentWarnings).toBeGreaterThanOrEqual(1);
  });

  it("empty timeline keeps missing context explicit", () => {
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

  it("one Quick Log note alone never produces strong readiness", () => {
    const result = evaluateAiDoctorContextFromSources({
      plant: PLANT,
      timelineItems: [quickLogNote(HOURS(1))],
      now: NOW,
    });
    expect(result.readiness).not.toBe("strong");
    expect(result.missing).toContain("recent-manual-sensor-snapshot");
  });
});

// ---------------------------------------------------------------------------
// 2. Deterministic ordering / tie-breaker behavior
// ---------------------------------------------------------------------------

describe("Quick Log → AI Doctor context: deterministic ordering", () => {
  it("identical occurred_at across categories yields stable, repeatable adapter output", () => {
    const t = HOURS(2);
    const inputA: TimelineMemoryItem[] = [
      quickLogNote(t, "k-note-a"),
      quickLogWatering(t, "k-water-a"),
      manualSnap(t, "ok", "k-snap-a"),
    ];
    // Re-shuffled input order — adapter output must be reproducible
    // from the SAME items (no insertion-order dependence in the rules
    // pipeline) and identical across runs.
    const inputB: TimelineMemoryItem[] = [
      manualSnap(t, "ok", "k-snap-a"),
      quickLogWatering(t, "k-water-a"),
      quickLogNote(t, "k-note-a"),
    ];

    const a1 = buildAiDoctorContextInput({
      plant: PLANT,
      timelineItems: inputA,
      now: NOW,
    });
    const a2 = buildAiDoctorContextInput({
      plant: PLANT,
      timelineItems: inputA,
      now: NOW,
    });
    // Same input → identical output across two runs (no randomness).
    expect(JSON.stringify(a1)).toEqual(JSON.stringify(a2));

    // Different physical order, same semantics → the evaluated result
    // (counts + evidence + readiness) is order-invariant.
    const r1 = evaluateAiDoctorContextFromSources({
      plant: PLANT,
      timelineItems: inputA,
      now: NOW,
    });
    const r2 = evaluateAiDoctorContextFromSources({
      plant: PLANT,
      timelineItems: inputB,
      now: NOW,
    });
    expect(r1.readiness).toBe(r2.readiness);
    expect(r1.counts).toEqual(r2.counts);
    expect([...r1.evidence].sort()).toEqual([...r2.evidence].sort());
    expect([...r1.missing].sort()).toEqual([...r2.missing].sort());
  });

  it("invalid timestamps are dropped from recent counts without throwing", () => {
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
      timelineItems: [broken, quickLogNote(HOURS(1))],
      now: NOW,
    });
    expect(result.counts.recentEvents).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 3. Coach + Plant Detail AI Doctor context panels: structural safety
// ---------------------------------------------------------------------------

describe("AI Doctor context panels — static safety", () => {
  const root = process.cwd();
  const stripComments = (s: string): string =>
    s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  const load = (rel: string): string =>
    stripComments(readFileSync(join(root, rel), "utf8"));

  const COACH = "src/components/CoachAiDoctorContextPanel.tsx";
  const PLANT_DETAIL = "src/components/PlantDetailAiDoctorContextPanel.tsx";

  const files: Record<string, string> = {
    coach: load(COACH),
    plantDetail: load(PLANT_DETAIL),
  };

  it("both panels consume the shared view-model labels (no inline mapping table)", () => {
    for (const [name, src] of Object.entries(files)) {
      expect(src, name).toMatch(/labelEvidence/);
      expect(src, name).toMatch(/labelMissing/);
      // No inline `{ "recent-manual-sensor-snapshot": "…" }`-style maps
      // duplicating the readiness vocabulary inside the presenter.
      expect(src, name).not.toMatch(
        /["']recent-manual-sensor-snapshot["']\s*:\s*["']/,
      );
      expect(src, name).not.toMatch(
        /["']recent-watering-or-feeding["']\s*:\s*["']/,
      );
    }
  });

  it("panels never reference service_role, model APIs, or raw fetch", () => {
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

  it("panels never include automation/device-control or *_executed strings", () => {
    const banned = [
      /autopilot/i,
      /[a-zA-Z_]+_executed\b/,
      /device\.execute/i,
      /relay\.set/i,
      /\b(pump_on|pump_off|fan_on|fan_off|relay_on|relay_off)\b/i,
    ];
    for (const [name, src] of Object.entries(files)) {
      for (const re of banned) {
        expect(src, name).not.toMatch(re);
      }
    }
  });

  it("panels never claim 'Live' or 'Synced' as a source-fallback label", () => {
    for (const [name, src] of Object.entries(files)) {
      expect(src, name).not.toMatch(/["']Live["']/);
      expect(src, name).not.toMatch(/["']Synced["']/);
    }
  });

  it("panels do no client-side Supabase writes", () => {
    const banned = [
      /\.insert\s*\(/,
      /\.update\s*\(/,
      /\.upsert\s*\(/,
      /\.delete\s*\(/,
      /supabase\.rpc\(/,
    ];
    for (const [name, src] of Object.entries(files)) {
      for (const re of banned) {
        expect(src, name).not.toMatch(re);
      }
    }
  });
});
