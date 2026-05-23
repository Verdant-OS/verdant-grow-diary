/**
 * Plant Detail → Recent Plant Activity panel tests.
 *
 * Pure helper coverage + static source-level guardrails. Asserts:
 *  - builder is scoped to the current plantId
 *  - entries render newest first, capped at the limit
 *  - empty state when no plant logs exist
 *  - snapshot presence, source label (only if stored), stale flag
 *  - no invented telemetry, no fake zeroes
 *  - no writes, no schema, no edge / pi-ingest / automation / device strings
 *  - existing plant-detail surfaces still wired
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildPlantRecentActivity,
} from "@/lib/plantRecentActivityRules";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const NOW = Date.parse("2026-05-23T12:00:00Z");

function entry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "e1",
    grow_id: "g1",
    plant_id: "p1",
    tent_id: "t1",
    stage: "veg",
    event_type: "observation",
    note: "leaves look great",
    photo_url: null,
    entry_at: "2026-05-23T10:00:00Z",
    details: {},
    ...overrides,
  };
}

describe("buildPlantRecentActivity (pure)", () => {
  it("returns [] when plantId is missing", () => {
    expect(buildPlantRecentActivity([entry()], { plantId: null })).toEqual([]);
    expect(buildPlantRecentActivity([entry()], { plantId: undefined })).toEqual([]);
  });

  it("returns [] when no rows", () => {
    expect(buildPlantRecentActivity([], { plantId: "p1" })).toEqual([]);
    expect(buildPlantRecentActivity(null, { plantId: "p1" })).toEqual([]);
  });

  it("filters to the current plant only — never leaks other plants", () => {
    const rows = buildPlantRecentActivity(
      [entry({ id: "a", plant_id: "p1" }), entry({ id: "b", plant_id: "p2" })],
      { plantId: "p1", now: NOW },
    );
    expect(rows.map((r) => r.id)).toEqual(["a"]);
  });

  it("orders newest first by entry_at, with stable tiebreak by id", () => {
    const rows = buildPlantRecentActivity(
      [
        entry({ id: "old", entry_at: "2026-05-20T00:00:00Z" }),
        entry({ id: "new", entry_at: "2026-05-22T00:00:00Z" }),
        entry({ id: "mid", entry_at: "2026-05-21T00:00:00Z" }),
      ],
      { plantId: "p1", now: NOW },
    );
    expect(rows.map((r) => r.id)).toEqual(["new", "mid", "old"]);
  });

  it("caps at limit (default 10)", () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      entry({ id: `e${i}`, entry_at: `2026-05-${10 + (i % 10)}T00:00:00Z` }),
    );
    const rows = buildPlantRecentActivity(many, { plantId: "p1", now: NOW });
    expect(rows.length).toBe(10);
  });

  it("respects custom limit", () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      entry({ id: `e${i}`, entry_at: `2026-05-${10 + i}T00:00:00Z` }),
    );
    const rows = buildPlantRecentActivity(many, { plantId: "p1", limit: 5, now: NOW });
    expect(rows.length).toBe(5);
  });

  it("exposes event type, timestamp, and note preview", () => {
    const [row] = buildPlantRecentActivity(
      [entry({ event_type: "watering", note: "  poured 1L  " })],
      { plantId: "p1", now: NOW },
    );
    expect(row.eventType).toBe("watering");
    expect(row.occurredAt).toBe("2026-05-23T10:00:00.000Z");
    expect(row.notePreview).toBe("poured 1L");
  });

  it("flags photo presence when photo_url is set", () => {
    const [row] = buildPlantRecentActivity(
      [entry({ photo_url: "user/x.jpg" })],
      { plantId: "p1", now: NOW },
    );
    expect(row.hasPhoto).toBe(true);
  });

  it("marks snapshot attached when sensor_snapshot stored, fresh", () => {
    const [row] = buildPlantRecentActivity(
      [
        entry({
          details: {
            sensor_snapshot: { at: "2026-05-23T11:55:00Z", temp: 24, rh: 55 },
          },
        }),
      ],
      { plantId: "p1", now: NOW },
    );
    expect(row.hasSnapshot).toBe(true);
    expect(row.snapshotAt).toBe("2026-05-23T11:55:00.000Z");
    expect(row.snapshotStale).toBe(false);
  });

  it("marks snapshot stale when stored timestamp is older than threshold", () => {
    const [row] = buildPlantRecentActivity(
      [
        entry({
          details: {
            sensor_snapshot: { at: "2026-05-22T00:00:00Z", temp: 24 },
          },
        }),
      ],
      { plantId: "p1", now: NOW },
    );
    expect(row.hasSnapshot).toBe(true);
    expect(row.snapshotStale).toBe(true);
  });

  it("does not invent a snapshot source label (QuickLog does not persist one today)", () => {
    const [row] = buildPlantRecentActivity(
      [
        entry({
          details: {
            sensor_snapshot: { at: "2026-05-23T11:55:00Z", temp: 24 },
          },
        }),
      ],
      { plantId: "p1", now: NOW },
    );
    expect(row.snapshotSourceLabel).toBeNull();
  });

  it("does not invent telemetry — snapshot fields are NOT copied into the row", () => {
    const [row] = buildPlantRecentActivity(
      [
        entry({
          details: {
            sensor_snapshot: { at: "2026-05-23T11:55:00Z", temp: 24, rh: 55, vpd: 1.1 },
          },
        }),
      ],
      { plantId: "p1", now: NOW },
    );
    const json = JSON.stringify(row);
    for (const k of ["temp", "rh", "vpd", "co2", "soil", "temperature_c", "humidity_pct"]) {
      expect(json).not.toContain(`"${k}"`);
    }
  });

  it("does not show unknown telemetry as healthy — no zero fallbacks for missing sensors", () => {
    const [row] = buildPlantRecentActivity(
      [entry({ details: {} })],
      { plantId: "p1", now: NOW },
    );
    expect(row.hasSnapshot).toBe(false);
    expect(row.snapshotAt).toBeNull();
    expect(row.snapshotStale).toBe(false);
    // Row fields stay null/false rather than fabricating zeros.
    expect((row as unknown as Record<string, unknown>).temp).toBeUndefined();
  });
});

// ---------- Static source-level guardrails ----------
const PANEL = read("src/components/PlantRecentActivityPanel.tsx");
const HOOK = read("src/hooks/usePlantRecentActivity.ts");
const RULES = read("src/lib/plantRecentActivityRules.ts");
const PLANT_DETAIL = read("src/pages/PlantDetail.tsx");

describe("Plant Detail wiring", () => {
  it("PlantDetail renders the Recent Plant Activity panel with plant context", () => {
    expect(PLANT_DETAIL).toContain("PlantRecentActivityPanel");
    expect(PLANT_DETAIL).toMatch(/PlantRecentActivityPanel[\s\S]{0,120}plantId=\{plant\.id\}/);
  });

  it("panel exposes empty state copy and a Timeline link", () => {
    expect(PANEL).toContain("No activity logged for this plant yet.");
    expect(PANEL).toContain('to="/timeline"');
    expect(PANEL).toContain("plant-recent-activity-panel");
    expect(PANEL).toContain("plant-recent-activity-empty");
  });

  it("hook queries diary_entries scoped to plant_id and orders newest-first", () => {
    expect(HOOK).toMatch(/\.from\(["']diary_entries["']\)/);
    expect(HOOK).toMatch(/\.eq\(["']plant_id["']/);
    expect(HOOK).toMatch(/\.order\(["']entry_at["'],\s*\{\s*ascending:\s*false/);
    expect(HOOK).toMatch(/\.limit\(/);
    expect(HOOK).toMatch(/enabled:\s*!!plantId/);
  });
});

describe("Recent Plant Activity safety", () => {
  const ALL = [PANEL, HOOK, RULES].join("\n");

  it("never writes from the panel / hook / rules", () => {
    for (const src of [PANEL, HOOK, RULES]) {
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.delete\(/);
      expect(src).not.toMatch(/\.upsert\(/);
    }
  });

  it("does not touch sensor_readings / alerts / action_queue / tents / plants writes", () => {
    for (const src of [PANEL, HOOK, RULES]) {
      for (const t of [
        "sensor_readings",
        "alerts",
        "alert_events",
        "action_queue",
        "action_queue_events",
        "tents",
        "plants",
        "pi_ingest_idempotency_keys",
        "pi_ingest_bridge_credentials",
      ]) {
        expect(src).not.toMatch(new RegExp(`\\.from\\(["']${t}["']\\)`));
      }
    }
  });

  it("contains no service_role / automation / device-control / pi-ingest transport strings", () => {
    expect(ALL).not.toMatch(
      /service_role|mqtt|home[\s_-]?assistant|relay|actuator|webhook|device_command/i,
    );
  });

  it("rules file has no React, no Supabase, no I/O", () => {
    expect(RULES).not.toMatch(/from\s+["']@\/integrations\/supabase\/client["']/);
    expect(RULES).not.toMatch(/from\s+["']react["']/);
    expect(RULES).not.toMatch(/fetch\(/);
  });
});

describe("Existing Plant Detail surfaces remain intact", () => {
  it("AssignTentDialog still rendered on Plant Detail", () => {
    expect(PLANT_DETAIL).toContain("AssignTentDialog");
  });
  it("PlantTentEnvironmentPanel still rendered on Plant Detail", () => {
    expect(PLANT_DETAIL).toContain("PlantTentEnvironmentPanel");
  });
});
