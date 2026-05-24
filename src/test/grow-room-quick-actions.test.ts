/**
 * Grow-Room Mode quick actions — pure rule + static-safety coverage.
 *
 * Verifies:
 *  - Quick action set is complete and renders on the tent card
 *  - Quick Log / Watering / Feeding / Photo preselect tent + event type
 *  - Plant-scoped actions preselect the primary plant when present
 *  - Daily Check links to existing /daily-check area
 *  - Empty states cover "no tents" and "no plants in tent"
 *  - Source honesty: sim / stale / missing labels remain on the page
 *  - No new write / Action Queue / Edge Function / device-control / service_role
 *    paths introduced.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildGrowRoomQuickActionLinks,
  canOpenPlantScopedAction,
  getGrowRoomEmptyState,
  getPrimaryPlantForTent,
  type QuickActionPlantLite,
} from "@/lib/growRoomQuickActionRules";

const ROOT = resolve(__dirname, "../..");
const PAGE = readFileSync(resolve(ROOT, "src/pages/GrowRoomMode.tsx"), "utf8");
const RULES = readFileSync(
  resolve(ROOT, "src/lib/growRoomQuickActionRules.ts"),
  "utf8",
);

const tent = { id: "tent-1", name: "Veg Tent", grow_id: "grow-1" };

function plant(
  overrides: Partial<QuickActionPlantLite> & Pick<QuickActionPlantLite, "id">,
): QuickActionPlantLite {
  return {
    name: "P",
    tent_id: tent.id,
    is_archived: false,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("getPrimaryPlantForTent", () => {
  it("returns null when no plants are in the tent", () => {
    expect(getPrimaryPlantForTent(tent.id, [])).toBeNull();
  });

  it("ignores archived plants", () => {
    const result = getPrimaryPlantForTent(tent.id, [
      plant({ id: "a", is_archived: true }),
    ]);
    expect(result).toBeNull();
  });

  it("ignores plants attached to other tents", () => {
    const result = getPrimaryPlantForTent(tent.id, [
      plant({ id: "a", tent_id: "tent-other" }),
    ]);
    expect(result).toBeNull();
  });

  it("returns earliest created_at, then id as tie-break", () => {
    const result = getPrimaryPlantForTent(tent.id, [
      plant({ id: "z", created_at: "2026-02-01T00:00:00Z" }),
      plant({ id: "a", created_at: "2026-01-15T00:00:00Z" }),
      plant({ id: "b", created_at: "2026-01-15T00:00:00Z" }),
    ]);
    expect(result?.id).toBe("a");
  });
});

describe("canOpenPlantScopedAction", () => {
  it("rejects null / archived / empty id", () => {
    expect(canOpenPlantScopedAction(null)).toBe(false);
    expect(canOpenPlantScopedAction(plant({ id: "" }))).toBe(false);
    expect(canOpenPlantScopedAction(plant({ id: "x", is_archived: true }))).toBe(false);
  });
  it("accepts a real, non-archived plant", () => {
    expect(canOpenPlantScopedAction(plant({ id: "x" }))).toBe(true);
  });
});

describe("buildGrowRoomQuickActionLinks", () => {
  const links = buildGrowRoomQuickActionLinks({ tent, plantId: "plant-1" });
  const byKind = Object.fromEntries(links.map((l) => [l.kind, l]));

  it("includes all six required quick actions", () => {
    for (const kind of [
      "quick_log",
      "watering",
      "feeding",
      "photo",
      "daily_check",
      "view_tent",
    ] as const) {
      expect(byKind[kind]).toBeTruthy();
    }
  });

  it("Quick Log preselects tent and grow", () => {
    expect(byKind.quick_log.quickLogPrefill).toEqual({
      tentId: "tent-1",
      growId: "grow-1",
      plantId: "plant-1",
      eventType: "observation",
    });
  });

  it("Watering preselects watering event type", () => {
    expect(byKind.watering.quickLogPrefill?.eventType).toBe("watering");
    expect(byKind.watering.quickLogPrefill?.tentId).toBe("tent-1");
  });

  it("Feeding preselects feeding event type", () => {
    expect(byKind.feeding.quickLogPrefill?.eventType).toBe("feeding");
  });

  it("Add Photo preselects photo event type", () => {
    expect(byKind.photo.quickLogPrefill?.eventType).toBe("photo");
  });

  it("Daily Check links to plant-scoped /daily-check when plant context exists", () => {
    expect(byKind.daily_check.href).toBe("/daily-check?plantId=plant-1");
  });

  it("Daily Check falls back to /daily-check when no plant context", () => {
    const noPlant = buildGrowRoomQuickActionLinks({ tent, plantId: null });
    const dc = noPlant.find((l) => l.kind === "daily_check")!;
    expect(dc.href).toBe("/daily-check");
  });

  it("View Tent links to existing tent detail page", () => {
    expect(byKind.view_tent.href).toBe("/tents/tent-1");
  });

  it("Plant-scoped prefill is null when no plant context exists", () => {
    const noPlant = buildGrowRoomQuickActionLinks({ tent, plantId: null });
    expect(noPlant.find((l) => l.kind === "quick_log")!.quickLogPrefill?.plantId).toBe(
      null,
    );
  });

  it("never returns an executable device-command surface", () => {
    for (const l of links) {
      const json = JSON.stringify(l);
      for (const forbidden of ["device_command", "execute", "actuator", "relay"]) {
        expect(json).not.toContain(forbidden);
      }
    }
  });
});

describe("getGrowRoomEmptyState", () => {
  it("no tents → create-a-tent CTA", () => {
    const s = getGrowRoomEmptyState({ tentCount: 0 });
    expect(s.kind).toBe("no_tents");
    expect(s.ctaHref).toBe("/tents");
    expect(s.title.toLowerCase()).toContain("no tents");
  });
  it("tent with no plants → Add Plant to This Tent CTA", () => {
    const s = getGrowRoomEmptyState({
      tentCount: 1,
      tentId: "tent-1",
      plantsInTent: 0,
    });
    expect(s.kind).toBe("no_plants_in_tent");
    expect(s.ctaLabel).toBe("Add Plant to This Tent");
    expect(s.ctaHref).toBe("/tents/tent-1");
  });
  it("populated → ok", () => {
    const s = getGrowRoomEmptyState({
      tentCount: 1,
      tentId: "tent-1",
      plantsInTent: 2,
    });
    expect(s.kind).toBe("ok");
  });
});

describe("GrowRoomMode page · quick action wiring", () => {
  it("renders Quick Log, Watering, Feeding, Add Photo, Daily Check, View Tent buttons", () => {
    expect(PAGE).toMatch(/grow-room-action-quick_log/);
    expect(PAGE).toMatch(/grow-room-action-watering/);
    expect(PAGE).toMatch(/grow-room-action-feeding/);
    expect(PAGE).toMatch(/grow-room-action-photo/);
    expect(PAGE).toMatch(/grow-room-action-daily_check/);
    expect(PAGE).toMatch(/grow-room-action-view_tent/);
  });

  it("wires QuickLog dialog with prefill from quick-action click", () => {
    expect(PAGE).toMatch(/from\s+"@\/components\/QuickLog"/);
    expect(PAGE).toMatch(/openQuickLog\(/);
    expect(PAGE).toMatch(/<QuickLog\b/);
  });

  it("uses pure helpers (logic outside JSX)", () => {
    expect(PAGE).toMatch(/buildGrowRoomQuickActionLinks/);
    expect(PAGE).toMatch(/getPrimaryPlantForTent/);
  });

  it("renders 'No plants in this tent yet.' + Add Plant CTA", () => {
    expect(PAGE).toContain("No plants in this tent yet.");
    expect(PAGE).toContain("Add Plant to This Tent");
  });

  it("keeps simulated / stale / missing source labels visible", () => {
    expect(PAGE).toMatch(/grow-room-simulated-badge/);
    expect(PAGE).toMatch(/grow-room-stale-warning/);
    expect(PAGE).toMatch(/grow-room-source/);
  });
});

describe("GrowRoomMode page · static safety", () => {
  it("introduces no write paths via quick actions", () => {
    expect(PAGE).not.toMatch(/\.insert\(/);
    expect(PAGE).not.toMatch(/\.update\(/);
    expect(PAGE).not.toMatch(/\.delete\(/);
    expect(PAGE).not.toMatch(/\.upsert\(/);
    expect(PAGE).not.toMatch(/\.rpc\(/);
  });

  it("introduces no Action Queue writes", () => {
    expect(PAGE).not.toMatch(
      /\.from\(\s*["']action_queue["']\s*\)\s*\.(insert|update|delete|upsert)\(/,
    );
  });

  it("introduces no alert persistence writes", () => {
    expect(PAGE).not.toMatch(/usePersistEnvironmentAlerts/);
    expect(PAGE).not.toMatch(
      /\.from\(\s*["']alerts["']\s*\)\s*\.(insert|update|delete|upsert)\(/,
    );
  });

  it("does not reference pi-ingest / Edge Functions / service_role", () => {
    expect(PAGE).not.toMatch(/pi-ingest/i);
    expect(PAGE).not.toMatch(/functions\.invoke/);
    expect(PAGE).not.toMatch(/service_role/i);
  });

  it("rules module is pure: no react / supabase / fetch / service_role", () => {
    expect(RULES).not.toMatch(/from\s+["']react["']/);
    expect(RULES).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(RULES).not.toMatch(/\bfetch\(/);
    expect(RULES).not.toMatch(/service_role/i);
  });

  it("rules module contains no device-control / automation strings", () => {
    for (const re of [
      /mqtt/i,
      /home[\s_-]?assistant/i,
      /\brelay\b/i,
      /\bactuator\b/i,
      /device[_-]?command/i,
      /auto[_-]?(approve|execute|create)/i,
    ]) {
      expect(RULES).not.toMatch(re);
    }
  });
});
