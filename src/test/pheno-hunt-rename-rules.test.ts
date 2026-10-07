/**
 * #551 — hunt names were immutable, so rows mangled by the pre-#482 prefill
 * concat bug ("Starter Grow Pheno HuntClaude E2E Pheno Hunt") could not be
 * repaired in-app. Pure validation for the rename control.
 */
import { describe, it, expect } from "vitest";
import {
  PHENO_HUNT_NAME_MAX_LENGTH,
  huntScopedOverrideValue,
  huntNameOverrideValue,
  validatePhenoHuntRename,
} from "@/lib/phenoHuntRenameRules";

describe("validatePhenoHuntRename", () => {
  it("accepts a new name and trims it", () => {
    expect(
      validatePhenoHuntRename(
        "  Claude E2E Pheno Hunt  ",
        "Starter Grow Pheno HuntClaude E2E Pheno Hunt",
      ),
    ).toEqual({
      ok: true,
      name: "Claude E2E Pheno Hunt",
    });
  });
  it("collapses internal whitespace runs", () => {
    expect(validatePhenoHuntRename("Summer   Hunt", "Old")).toEqual({
      ok: true,
      name: "Summer Hunt",
    });
  });
  it("rejects empty or whitespace-only names", () => {
    expect(validatePhenoHuntRename("   ", "Old")).toEqual({ ok: false, reason: "empty" });
    expect(validatePhenoHuntRename(null, "Old")).toEqual({ ok: false, reason: "empty" });
  });
  it("rejects names over the max length", () => {
    const long = "x".repeat(PHENO_HUNT_NAME_MAX_LENGTH + 1);
    expect(validatePhenoHuntRename(long, "Old")).toEqual({ ok: false, reason: "too_long" });
    expect(validatePhenoHuntRename("x".repeat(PHENO_HUNT_NAME_MAX_LENGTH), "Old").ok).toBe(true);
  });
  it("rejects an unchanged name (after trimming)", () => {
    expect(validatePhenoHuntRename(" Summer Hunt ", "Summer Hunt")).toEqual({
      ok: false,
      reason: "unchanged",
    });
  });
  it("is deterministic", () => {
    expect(validatePhenoHuntRename("A", "B")).toEqual(validatePhenoHuntRename("A", "B"));
  });
});

describe("huntScopedOverrideValue (#551 review P2)", () => {
  it("applies an optimistic value only to the hunt it was saved on", () => {
    const override = { huntId: "hunt-a", value: "Renamed A" };
    expect(huntScopedOverrideValue(override, "hunt-a")).toBe("Renamed A");
    expect(huntScopedOverrideValue(override, "hunt-b")).toBeNull();
    expect(huntScopedOverrideValue(override, null)).toBeNull();
    expect(huntScopedOverrideValue(null, "hunt-a")).toBeNull();
  });
});

describe("huntNameOverrideValue (#551 CodeRabbit: reconcile on reload)", () => {
  const override = { huntId: "hunt-a", value: "Renamed A", baseName: "Old A" };
  it("wins while the loaded row still shows the pre-rename name", () => {
    expect(huntNameOverrideValue(override, { id: "hunt-a", name: "Old A" })).toBe("Renamed A");
  });
  it("yields to a reloaded row whose name changed (ours or another session's)", () => {
    expect(huntNameOverrideValue(override, { id: "hunt-a", name: "Renamed A" })).toBeNull();
    expect(huntNameOverrideValue(override, { id: "hunt-a", name: "Elsewhere" })).toBeNull();
  });
  it("never applies to a different hunt, a missing hunt, or no override", () => {
    expect(huntNameOverrideValue(override, { id: "hunt-b", name: "Old A" })).toBeNull();
    expect(huntNameOverrideValue(override, null)).toBeNull();
    expect(huntNameOverrideValue(null, { id: "hunt-a", name: "Old A" })).toBeNull();
  });
});
