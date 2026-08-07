/**
 * Static guardrails for the Plant Detail assign/move tent flow.
 *
 * Source-level only — no rendering. Captures intent so the dialog
 * cannot regress to unsafe writes or cross-grow tent listings, and
 * Plant Detail keeps the assign / move / View Tent affordances.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const DIALOG = read("src/components/AssignTentDialog.tsx");
const PLANT_DETAIL = read("src/pages/PlantDetail.tsx");

describe("AssignTentDialog · same-grow tent assignment", () => {
  it("queries tents scoped to the plant's grow only", () => {
    expect(DIALOG).toMatch(/\.from\(["']tents["']\)/);
    expect(DIALOG).toMatch(/\.eq\(\s*["']grow_id["']\s*,\s*growId/);
    expect(DIALOG).toMatch(/\.eq\(\s*["']is_archived["']\s*,\s*false\s*\)/);
  });

  it("applies the cross-grow filter whenever the plant HAS a grow", () => {
    // The grow filter must stay conditional on growId being present — that
    // is what still prevents cross-grow listing for the normal case. What
    // changed (2026-08) is that a MISSING grow no longer blocks the dialog:
    // previously `enabled: open && hasGrowContext` disabled the fetch and
    // rendered a dead end, so a plant whose grow_id was null (legacy rows,
    // or a server-side grow delete — plants.grow_id is ON DELETE SET NULL)
    // could never be assigned to a tent at all.
    expect(DIALOG).toMatch(
      /if\s*\(\s*growId\s*\)\s*q\s*=\s*q\.eq\(\s*["']grow_id["']\s*,\s*growId/,
    );
  });

  it("never renders the missing-grow dead end (regression: reported prod bug)", () => {
    // Reported symptom: "Unable to load tents because this plant is missing
    // grow context" on the Assign-to-tent quick action, while Edit Plant's
    // tent dropdown worked for the SAME plant (it falls back to the full
    // tent list — EditPlantDialog.tsx). Both the copy and its testid must
    // stay gone, and the fetch must not be gated on grow context again.
    expect(DIALOG).not.toContain("missing grow context");
    expect(DIALOG).not.toContain("assign-tent-no-grow");
    expect(DIALOG).not.toMatch(/hasGrowContext/);
    expect(DIALOG).toMatch(/enabled:\s*open\s*,/);
  });

  it("marks the current tent as disabled / labeled current", () => {
    expect(DIALOG).toContain("Current Tent");
    expect(DIALOG).toMatch(
      /value=\{t\.id\}[\s\S]{0,80}disabled[\s\S]{0,200}assign-tent-option-current/,
    );
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
    expect(DIALOG).not.toMatch(
      /mqtt|home[\s_-]?assistant|relay|actuator|webhook|device_command|service_role/i,
    );
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
