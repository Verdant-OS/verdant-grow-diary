/**
 * Quick Log stage persistence (app-audit fix #2).
 *
 * The stage resolved in the Quick Log dialog used to be dropped before
 * persistence — the RPC had no stage parameter, so the stage-progression
 * widget honestly showed "0 stage-tagged logs". These tests pin the whole
 * path: migration contract, payload builders, and normalization.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildQuickLogV2SavePayload } from "@/lib/quickLogV2SavePayload";
import { buildLegacyQuickLogUnifiedPayload } from "@/lib/legacyQuickLogUnifiedSave";

const MIGRATION = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260722100000_quicklog_save_manual_stage.sql",
  ),
  "utf8",
);

describe("quicklog_save_manual stage migration contract", () => {
  it("appends p_stage with a NULL default (legacy bundles keep saving)", () => {
    expect(MIGRATION).toMatch(/p_stage text DEFAULT NULL::text/);
  });

  it("drops the exact prior signature (no ambiguous overload pair)", () => {
    expect(MIGRATION).toMatch(
      /DROP FUNCTION IF EXISTS public\.quicklog_save_manual\(\s*text, uuid, text, numeric, text, numeric, numeric, numeric, timestamptz, jsonb, text\s*\)/,
    );
  });

  it("soft-validates against the canonical vocabulary — bad stages never block", () => {
    expect(MIGRATION).toMatch(
      /p_stage IN \('seedling','veg','flower','flush','harvest','drying'\)/,
    );
    // Validation assigns v_stage; there is no failure return for a bad stage.
    expect(MIGRATION).not.toMatch(/invalid_stage/);
  });

  it("a stage tag earns the diary companion even without structured details", () => {
    expect(MIGRATION).toMatch(/IF p_details IS NOT NULL OR v_stage IS NOT NULL THEN/);
    expect(MIGRATION).toMatch(/COALESCE\(p_details, '\{\}'::jsonb\)/);
  });

  it("persists the stage onto the diary row", () => {
    expect(MIGRATION).toMatch(/note, details, entry_at, stage\)/);
    expect(MIGRATION).toMatch(/v_diary_note, v_safe_details, v_occurred, v_stage\)/);
  });

  it("grants cover the new 12-arg signature only", () => {
    expect(MIGRATION).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.quicklog_save_manual\(\s*text, uuid, text, numeric, text, numeric, numeric, numeric, timestamptz, jsonb, text, text\s*\) TO authenticated/,
    );
  });
});

describe("payload builders carry the stage tag", () => {
  const resolved = { ok: true, targetType: "plant", targetId: "p1" } as never;
  const base = {
    resolved,
    action: "note" as const,
    volumeMl: "",
    note: "leaf check",
    temperatureC: "",
    humidityPct: "",
    vpdKpa: "",
    idempotencyKey: "k".repeat(12),
  };

  it("v2 builder normalizes and includes p_stage", () => {
    const r = buildQuickLogV2SavePayload({ ...base, stage: " Veg " });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload.p_stage).toBe("veg");
  });

  it("v2 builder omits p_stage for unknown or blank stages", () => {
    for (const stage of ["", "  ", "germinating-maybe", null, undefined]) {
      const r = buildQuickLogV2SavePayload({ ...base, stage });
      expect(r.ok).toBe(true);
      if (r.ok) expect("p_stage" in r.payload).toBe(false);
    }
  });

  it("legacy builder emits p_stage on the note branch (aliases normalized)", () => {
    const r = buildLegacyQuickLogUnifiedPayload({
      eventType: "note",
      idempotencyKey: "k".repeat(12),
      noteWithHardware: "note body",
      plantId: "p1",
      plantTentId: "t1",
      details: {},
      stage: "cure",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload.p_stage).toBe("drying");
  });

  it("legacy builder emits p_stage on the watering branch and null for junk", () => {
    const r = buildLegacyQuickLogUnifiedPayload({
      eventType: "watering",
      idempotencyKey: "k".repeat(12),
      noteWithHardware: "",
      plantId: "p1",
      plantTentId: "t1",
      details: { watering: "500" },
      stage: "flower",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload.p_stage).toBe("flower");

    const junk = buildLegacyQuickLogUnifiedPayload({
      eventType: "watering",
      idempotencyKey: "k".repeat(12),
      noteWithHardware: "",
      plantId: "p1",
      plantTentId: "t1",
      details: { watering: "500" },
      stage: "not-a-stage",
    });
    expect(junk.ok).toBe(true);
    if (junk.ok) expect(junk.payload.p_stage).toBeNull();
  });
});
