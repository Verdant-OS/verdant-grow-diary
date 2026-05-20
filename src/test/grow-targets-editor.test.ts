/**
 * Tests for the grow_targets schema, hook normalization, editor wiring,
 * and Dashboard Target Comparison integration.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeTargetsRow } from "@/hooks/useGrowTargets";

const ROOT = resolve(__dirname, "../..");
const DASHBOARD = readFileSync(resolve(ROOT, "src/pages/Dashboard.tsx"), "utf8");
const HOOK = readFileSync(resolve(ROOT, "src/hooks/useGrowTargets.ts"), "utf8");
const EDITOR = readFileSync(
  resolve(ROOT, "src/components/GrowTargetsEditor.tsx"),
  "utf8",
);
const TYPES = readFileSync(
  resolve(ROOT, "src/integrations/supabase/types.ts"),
  "utf8",
);

const AI_COACH_CALL = /["'`]ai-coach["'`]|functions\/ai-coach|ai_coach/;
const EXTERNAL_CONTROL =
  /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|\brelay\b|\bactuator\b/i;
const SERVICE_ROLE = /service_role/;

describe("grow_targets schema (generated types)", () => {
  it("exposes a grow_targets table in generated types", () => {
    expect(TYPES).toMatch(/grow_targets:\s*\{/);
  });
  it("contains all min/max columns", () => {
    for (const col of [
      "temp_min",
      "temp_max",
      "rh_min",
      "rh_max",
      "vpd_min",
      "vpd_max",
      "soil_wc_min",
      "soil_wc_max",
      "soil_ec_min",
      "soil_ec_max",
      "soil_temp_min",
      "soil_temp_max",
      "ppfd_min",
      "ppfd_max",
    ]) {
      expect(TYPES).toMatch(new RegExp(`${col}\\??:`));
    }
  });
  it("contains grow_id foreign key to grows", () => {
    expect(TYPES).toMatch(/grow_targets_grow_id_fkey/);
  });
});

describe("normalizeTargetsRow", () => {
  it("returns null for null", () => {
    expect(normalizeTargetsRow(null)).toBeNull();
  });
  it("returns null when all min/max are null", () => {
    expect(
      normalizeTargetsRow({
        temp_min: null,
        temp_max: null,
        rh_min: null,
        rh_max: null,
      }),
    ).toBeNull();
  });
  it("maps DB columns into metric keys", () => {
    const r = normalizeTargetsRow({
      temp_min: 20,
      temp_max: 28,
      rh_min: 40,
      rh_max: 65,
      vpd_min: null,
      vpd_max: 1.5,
      soil_wc_min: 30,
      soil_wc_max: 70,
      soil_ec_min: 1,
      soil_ec_max: 2.5,
      soil_temp_min: 18,
      soil_temp_max: 26,
      ppfd_min: 300,
      ppfd_max: 900,
    });
    expect(r).not.toBeNull();
    expect(r!.temp).toEqual({ min: 20, max: 28 });
    expect(r!.rh).toEqual({ min: 40, max: 65 });
    expect(r!.vpd).toEqual({ min: null, max: 1.5 });
    expect(r!.soil).toEqual({ min: 30, max: 70 });
    expect(r!.soil_ec).toEqual({ min: 1, max: 2.5 });
    expect(r!.soil_temp).toEqual({ min: 18, max: 26 });
    expect(r!.ppfd).toEqual({ min: 300, max: 900 });
  });
  it("ignores non-finite values", () => {
    const r = normalizeTargetsRow({ temp_min: "abc", temp_max: 30 });
    expect(r).toEqual({ temp: { min: null, max: 30 } });
  });
});

describe("useGrowTargets hook contract", () => {
  it("queries grow_targets by grow_id", () => {
    expect(HOOK).toMatch(/\.from\(["']grow_targets["']\)/);
    expect(HOOK).toMatch(/\.eq\(["']grow_id["']/);
    expect(HOOK).toMatch(/maybeSingle/);
  });
  it("exposes a reload function", () => {
    expect(HOOK).toMatch(/reload\s*:\s*load/);
  });
  it("introduces no write paths", () => {
    expect(HOOK).not.toMatch(
      /\.from\([^)]+\)\s*\.(insert|update|delete|upsert)/,
    );
  });
  it("introduces no ai-coach call", () => {
    expect(AI_COACH_CALL.test(HOOK)).toBe(false);
  });
  it("introduces no external-control strings", () => {
    expect(EXTERNAL_CONTROL.test(HOOK)).toBe(false);
  });
  it("introduces no service_role", () => {
    expect(SERVICE_ROLE.test(HOOK)).toBe(false);
  });
});

describe("GrowTargetsEditor contract", () => {
  it("loads existing targets via maybeSingle by grow_id", () => {
    expect(EDITOR).toMatch(/\.from\(["']grow_targets["']\)/);
    expect(EDITOR).toMatch(/\.eq\(["']grow_id["']/);
    expect(EDITOR).toMatch(/maybeSingle/);
  });
  it("saves via upsert on conflict grow_id", () => {
    expect(EDITOR).toMatch(/\.upsert\(/);
    expect(EDITOR).toMatch(/onConflict\s*:\s*["']grow_id["']/);
  });
  it("sets user_id from authenticated user, never trusts client form input", () => {
    expect(EDITOR).toMatch(/user_id\s*:\s*user\.id/);
    expect(EDITOR).not.toMatch(/user_id\s*:\s*form\[/);
  });
  it("does not introduce an ai-coach call", () => {
    expect(AI_COACH_CALL.test(EDITOR)).toBe(false);
  });
  it("does not introduce external-control strings", () => {
    expect(EXTERNAL_CONTROL.test(EDITOR)).toBe(false);
  });
  it("does not introduce service_role", () => {
    expect(SERVICE_ROLE.test(EDITOR)).toBe(false);
  });
  it("does not write to action_queue", () => {
    expect(EDITOR).not.toMatch(/action_queue/);
  });
});

describe("Dashboard Target Comparison editor wiring", () => {
  it("imports GrowTargetsEditor", () => {
    expect(DASHBOARD).toMatch(/GrowTargetsEditor/);
  });
  it("renders an Edit targets button", () => {
    expect(DASHBOARD).toMatch(/Edit targets/);
  });
  it("uses targets from the hook (not hardcoded defaults)", () => {
    expect(DASHBOARD).toMatch(/targetsState\.targets/);
    expect(DASHBOARD).not.toMatch(
      /const\s+\w*[Tt]argets\s*=\s*\{\s*temp\s*:\s*\{\s*min\s*:\s*\d/,
    );
  });
  it("reloads targets after save", () => {
    expect(DASHBOARD).toMatch(/targetsState\.reload\(\)/);
  });
});
