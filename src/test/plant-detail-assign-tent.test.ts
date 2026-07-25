/**
 * Static guardrails for the Plant Detail assign/move tent flow.
 *
 * Source-level only — no rendering. Captures intent so the dialog
 * cannot regress to unsafe writes, cannot regress to filtering tents
 * by grow when the plant has a grow_id, and cannot regress to
 * dead-ending when the plant is missing grow context (the confirmed
 * prod bug this file guards against). Plant Detail keeps the
 * assign / move / View Tent affordances.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getEligibleTentsForPlantMove } from "@/lib/plantTentRelationshipRules";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const DIALOG = read("src/components/AssignTentDialog.tsx");
const PLANT_DETAIL = read("src/pages/PlantDetail.tsx");

describe("AssignTentDialog · same-grow tent assignment", () => {
  it("scopes tents via the shared getEligibleTentsForPlantMove helper (same one EditPlantDialog's filter mirrors)", () => {
    expect(DIALOG).toMatch(/from\s+["']@\/lib\/plantTentRelationshipRules["']/);
    expect(DIALOG).toContain("getEligibleTentsForPlantMove(");
  });

  it("fetches tents via the shared useTents hook instead of a dialog-local grow_id-filtered query", () => {
    expect(DIALOG).toMatch(/from\s+["']@\/hooks\/use-tents["']/);
    expect(DIALOG).toContain("useTents()");
    // No bespoke `.eq("grow_id", ...)` query — grow scoping is delegated
    // to the pure helper so it degrades gracefully when growId is null.
    expect(DIALOG).not.toMatch(/\.eq\(\s*["']grow_id["']\s*,\s*growId/);
  });

  it("regression: does not hard-block plants missing grow context (prod bug — Assign to tent dead-ended while Edit Plant's tent dropdown worked)", () => {
    expect(DIALOG).not.toMatch(/hasGrowContext/);
    expect(DIALOG).not.toContain("missing grow context");
  });

  it("shared helper falls back to every tent (across grows) when growId is null, matching EditPlantDialog's fallback", () => {
    const tents = [
      { id: "t1", name: "Seedling A", grow_id: "g1" },
      { id: "t2", name: "Flower", grow_id: "g2" },
      { id: "t3", name: "QA Test Tent", grow_id: "g3" },
    ];
    const { others, current } = getEligibleTentsForPlantMove(tents, null, null);
    expect(current).toEqual([]);
    expect(others.map((t) => t.id).sort()).toEqual(["t1", "t2", "t3"]);
  });

  it("marks the current tent as disabled / labeled current", () => {
    expect(DIALOG).toContain("Current Tent");
    expect(DIALOG).toMatch(/value=\{t\.id\}[\s\S]{0,80}disabled[\s\S]{0,200}assign-tent-option-current/);
    expect(DIALOG).toContain("Plant is already in this tent");
  });

  it("only updates plants.tent_id (no user_id/grow_id/strain/stage/notes)", () => {
    const updates = [...DIALOG.matchAll(/\.update\(\s*\{([^}]*)\}\s*\)/g)];
    expect(updates.length).toBeGreaterThan(0);
    for (const m of updates) {
      const payload = m[1];
      expect(payload).toMatch(/tent_id/);
      expect(payload).not.toMatch(/\buser_id\b/);
      expect(payload).not.toMatch(/\bgrow_id\b/);
      expect(payload).not.toMatch(/\bstrain\b/);
      expect(payload).not.toMatch(/\bstage\b/);
      expect(payload).not.toMatch(/\bnotes\b/);
    }
  });

  it("invalidates plant / tent / plants caches after a write", () => {
    expect(DIALOG).toMatch(/invalidateQueries\(\{\s*queryKey:\s*\["plants"\]/);
    expect(DIALOG).toMatch(/invalidateQueries\(\{\s*queryKey:\s*\["grow",\s*"plants"\]/);
    expect(DIALOG).toMatch(/invalidateQueries\(\{\s*queryKey:\s*\["grow",\s*"plant"/);
    expect(DIALOG).toMatch(/invalidateQueries\(\{\s*queryKey:\s*\["tent-detail"\]/);
  });

  it("does not write to sensor / alert / action_queue / pi-ingest tables", () => {
    for (const t of [
      "sensor_readings",
      "alerts",
      "alert_events",
      "action_queue",
      "action_queue_events",
      "pi_ingest_idempotency_keys",
      "pi_ingest_bridge_credentials",
    ]) {
      expect(DIALOG).not.toMatch(new RegExp(`\\.from\\(["']${t}["']\\)`));
    }
  });

  it("contains no automation / device-control / pi-ingest transport strings", () => {
    expect(DIALOG).not.toMatch(/mqtt|home[\s_-]?assistant|relay|actuator|webhook|device_command|service_role/i);
  });
});

describe("PlantDetail wiring · assign / move / view tent", () => {
  it("renders AssignTentDialog for both assigned and unassigned states", () => {
    expect(PLANT_DETAIL).toContain("AssignTentDialog");
    // Used in both branches of the tent block.
    const occurrences = PLANT_DETAIL.match(/AssignTentDialog/g) ?? [];
    // At least the import + two usages.
    expect(occurrences.length).toBeGreaterThanOrEqual(3);
  });

  it("keeps the View Tent link when a tent is assigned", () => {
    expect(PLANT_DETAIL).toContain('data-testid="plant-detail-view-tent"');
    expect(PLANT_DETAIL).toMatch(/tentDetailPath\(/);
  });

  it("still surfaces the 'No tent assigned.' empty state", () => {
    expect(PLANT_DETAIL).toContain("No tent assigned.");
    expect(PLANT_DETAIL).toContain('data-testid="plant-detail-no-tent"');
  });

  it("passes plant grow + current tent context into the dialog", () => {
    expect(PLANT_DETAIL).toMatch(/growId=\{plant\.growId\s*\?\?\s*null\}/);
    expect(PLANT_DETAIL).toMatch(/currentTentId=\{plant\.tentId\s*\?\?\s*null\}/);
    expect(PLANT_DETAIL).toMatch(/currentTentId=\{null\}/);
  });
});
