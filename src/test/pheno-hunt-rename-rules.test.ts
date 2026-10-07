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
  nextHuntNameOverride,
  retireConfirmedHuntNameOverride,
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
  const override = { huntId: "hunt-a", value: "Renamed A", staleNames: ["Old A"] };
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

describe("nextHuntNameOverride (#551 Codex P2: repeated renames)", () => {
  it("a first rename treats the loaded row name as stale", () => {
    const o = nextHuntNameOverride(null, "hunt-a", "Old A", "First");
    expect(o).toEqual({ huntId: "hunt-a", value: "First", staleNames: ["Old A"] });
  });

  it("a second rename before any reload keeps every replaced name stale", () => {
    const first = nextHuntNameOverride(null, "hunt-a", "Old A", "First");
    const second = nextHuntNameOverride(first, "hunt-a", "Old A", "Second");
    expect(second.value).toBe("Second");
    // A reload that returns the first persisted name must not revert the second.
    expect(huntNameOverrideValue(second, { id: "hunt-a", name: "First" })).toBe("Second");
    expect(huntNameOverrideValue(second, { id: "hunt-a", name: "Old A" })).toBe("Second");
    // The row catching up, or any other name, is authoritative again.
    expect(huntNameOverrideValue(second, { id: "hunt-a", name: "Second" })).toBeNull();
    expect(huntNameOverrideValue(second, { id: "hunt-a", name: "Elsewhere" })).toBeNull();
  });

  it("an override for another hunt is not carried over", () => {
    const a = nextHuntNameOverride(null, "hunt-a", "Old A", "First");
    expect(nextHuntNameOverride(a, "hunt-b", "Old B", "B")).toEqual({
      huntId: "hunt-b",
      value: "B",
      staleNames: ["Old B"],
    });
  });

  it("is deterministic and never lists the new value as stale", () => {
    const first = nextHuntNameOverride(null, "hunt-a", "Old A", "First");
    const back = nextHuntNameOverride(first, "hunt-a", "Old A", "Old A");
    expect(back.staleNames).not.toContain("Old A");
    expect(nextHuntNameOverride(first, "hunt-a", "Old A", "Second")).toEqual(
      nextHuntNameOverride(first, "hunt-a", "Old A", "Second"),
    );
  });
});

describe("retireConfirmedHuntNameOverride (#551 Codex P2: retire once confirmed)", () => {
  const a = nextHuntNameOverride(null, "hunt-a", "Old A", "First");
  const b = nextHuntNameOverride(null, "hunt-b", "Old B", "B");
  const map = { "hunt-a": a, "hunt-b": b };

  it("drops the override once the row shows its value", () => {
    const next = retireConfirmedHuntNameOverride(map, { id: "hunt-a", name: "First" });
    expect(next).toEqual({ "hunt-b": b });
  });

  it("keeps the override while the row still shows a stale name", () => {
    expect(retireConfirmedHuntNameOverride(map, { id: "hunt-a", name: "Old A" })).toBe(map);
  });

  it("returns the same map when there is nothing to retire", () => {
    expect(retireConfirmedHuntNameOverride(map, { id: "hunt-c", name: "C" })).toBe(map);
    expect(retireConfirmedHuntNameOverride(map, null)).toBe(map);
  });
});
