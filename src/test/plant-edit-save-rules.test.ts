/**
 * Edit Plant save / tent picker rules — stale tent_id + empty-grow fallback
 * + fail-closed save error surfacing.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildPlantEditGrowIdFromTent,
  formatPlantEditSaveError,
  normalizePlantEditTentSelectValue,
  resolvePlantEditTentOptions,
} from "@/lib/plantEditSaveRules";

const ROOT = resolve(__dirname, "../..");
const EDIT_DIALOG = readFileSync(resolve(ROOT, "src/components/EditPlantDialog.tsx"), "utf8");

const TENTS = [
  { id: "male-tent", name: "Male Tent", grow_id: "banana-cough" },
  { id: "veg-tent", name: "Veg Tent", grow_id: "banana-cough" },
  { id: "orphan-tent", name: "Loose Tent", grow_id: null },
  { id: "archived", name: "Old", grow_id: "banana-cough", is_archived: true },
] as const;

describe("resolvePlantEditTentOptions", () => {
  it("lists all active tents when the plant has no grow", () => {
    const r = resolvePlantEditTentOptions(TENTS, null);
    expect(r.usedGrowFallback).toBe(false);
    expect(r.tents.map((t) => t.id)).toEqual(["male-tent", "veg-tent", "orphan-tent"]);
  });

  it("keeps same-grow fencing when the grow has tents", () => {
    const r = resolvePlantEditTentOptions(TENTS, "banana-cough");
    expect(r.usedGrowFallback).toBe(false);
    expect(r.tents.map((t) => t.id)).toEqual(["male-tent", "veg-tent"]);
  });

  it("falls back to all active tents when the grow has zero tents (orphan re-home)", () => {
    // Measured: plant still grow-scoped after Vegetation2 cleanup, Male Tent
    // lives under Banana Cough — grow-only filter yielded an empty picker.
    const r = resolvePlantEditTentOptions(TENTS, "vegetation2-gone");
    expect(r.usedGrowFallback).toBe(true);
    expect(r.tents.map((t) => t.id)).toEqual(["male-tent", "veg-tent", "orphan-tent"]);
  });
});

describe("normalizePlantEditTentSelectValue", () => {
  it("keeps a tent that is still selectable", () => {
    expect(normalizePlantEditTentSelectValue("male-tent", ["male-tent", "veg-tent"])).toBe(
      "male-tent",
    );
  });

  it("coerces a stale / deleted tent_id to none so save does not re-submit it", () => {
    // Stale tent_id fails plants UPDATE RLS WITH CHECK and blocked stage saves.
    expect(normalizePlantEditTentSelectValue("deleted-tent", ["male-tent"])).toBe("none");
    expect(normalizePlantEditTentSelectValue(null, ["male-tent"])).toBe("none");
    expect(normalizePlantEditTentSelectValue(undefined, [])).toBe("none");
  });
});

describe("formatPlantEditSaveError", () => {
  it("surfaces the PostgREST / trigger message fail-closed", () => {
    expect(
      formatPlantEditSaveError({
        message: 'new row violates row-level security policy for table "plants"',
        code: "42501",
      }),
    ).toBe('new row violates row-level security policy for table "plants"');
  });

  it("never returns an empty string", () => {
    expect(formatPlantEditSaveError({ message: "   " })).toBe(
      "Could not save changes. Please try again.",
    );
    expect(formatPlantEditSaveError(null)).toBe("Could not save changes. Please try again.");
    expect(formatPlantEditSaveError(undefined)).toBe("Could not save changes. Please try again.");
  });
});

describe("buildPlantEditGrowIdFromTent", () => {
  it("copies tent grow_id when empty-grow fallback re-homes the plant", () => {
    expect(
      buildPlantEditGrowIdFromTent({
        selectedTentId: "male-tent",
        selectedTentGrowId: "banana-cough",
        plantGrowId: "vegetation2-gone",
        usedGrowFallback: true,
      }),
    ).toEqual({ grow_id: "banana-cough" });
  });

  it("copies tent grow_id when the plant has no grow yet", () => {
    expect(
      buildPlantEditGrowIdFromTent({
        selectedTentId: "male-tent",
        selectedTentGrowId: "banana-cough",
        plantGrowId: null,
        usedGrowFallback: false,
      }),
    ).toEqual({ grow_id: "banana-cough" });
  });

  it("does not rewrite grow_id on a normal same-grow tent change", () => {
    expect(
      buildPlantEditGrowIdFromTent({
        selectedTentId: "veg-tent",
        selectedTentGrowId: "banana-cough",
        plantGrowId: "banana-cough",
        usedGrowFallback: false,
      }),
    ).toBeNull();
  });

  it("does not clear grow_id when tent is cleared", () => {
    expect(
      buildPlantEditGrowIdFromTent({
        selectedTentId: null,
        selectedTentGrowId: null,
        plantGrowId: "banana-cough",
        usedGrowFallback: true,
      }),
    ).toBeNull();
  });
});

describe("EditPlantDialog · save-error + stale-tent wiring", () => {
  it("uses formatPlantEditSaveError instead of an opaque retry-only toast", () => {
    expect(EDIT_DIALOG).toMatch(/formatPlantEditSaveError\(/);
    expect(EDIT_DIALOG).toMatch(/toast\.error\(\s*formatPlantEditSaveError\(error\)\s*\)/);
    // Opaque hardcoded-only path must not be the sole error toast.
    expect(EDIT_DIALOG).not.toMatch(
      /toast\.error\(\s*["']Could not save changes\. Please try again\.["']\s*\)/,
    );
  });

  it("normalizes stale tent_id before write and resolves tent options via rules", () => {
    expect(EDIT_DIALOG).toMatch(/normalizePlantEditTentSelectValue\(/);
    expect(EDIT_DIALOG).toMatch(/resolvePlantEditTentOptions\(/);
    expect(EDIT_DIALOG).toMatch(/buildPlantEditGrowIdFromTent\(/);
    expect(EDIT_DIALOG).toMatch(/availableTentIds\.includes\(form\.tent_id\)/);
  });

  it("still never writes user_id from the edit payload", () => {
    expect(EDIT_DIALOG).not.toMatch(/payload[\s\S]{0,400}\buser_id\s*:/);
  });
});
