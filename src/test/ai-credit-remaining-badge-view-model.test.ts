/**
 * aiCreditRemainingBadgeViewModel — unit tests (S3.1).
 */
import { describe, it, expect } from "vitest";
import { buildAiCreditRemainingBadgeViewModel } from "@/lib/aiCreditRemainingBadgeViewModel";
import { paywallCtaHasBannedWords } from "@/lib/paywallCtaViewModel";

describe("buildAiCreditRemainingBadgeViewModel — pack balance", () => {
  it("surfaces remaining pack credits so a pack-funded review doesn't read '0 left'", () => {
    // Monthly exhausted (remaining 0) but 49 purchased pack credits remain.
    const vm = buildAiCreditRemainingBadgeViewModel({
      remaining: 0,
      scope: "per_month",
      scope_limit: 100,
      pack_balance: 49,
    });
    expect(vm.visible).toBe(true);
    expect(vm.packBalance).toBe(49);
    expect(vm.label).toContain("0 of 100");
    expect(vm.label).toContain("49 pack credits available");
  });

  it("uses singular 'credit' for a pack balance of 1", () => {
    const vm = buildAiCreditRemainingBadgeViewModel({
      remaining: 0,
      scope: "per_month",
      scope_limit: 100,
      pack_balance: 1,
    });
    expect(vm.label).toContain("1 pack credit available");
  });

  it("omits pack copy when the pack balance is zero / absent / free scope", () => {
    const noPack = buildAiCreditRemainingBadgeViewModel({
      remaining: 5,
      scope: "per_month",
      scope_limit: 100,
      pack_balance: 0,
    });
    expect(noPack.label).not.toContain("pack");
    expect(noPack.packBalance).toBeUndefined();
    // Packs are paid per-month only — never surfaced on the Free per-grow scope.
    const freeScope = buildAiCreditRemainingBadgeViewModel({
      remaining: 1,
      scope: "per_grow",
      scope_limit: 3,
      pack_balance: 20,
    });
    expect(freeScope.label).not.toContain("pack");
    expect(freeScope.packBalance).toBeUndefined();
  });
});

describe("buildAiCreditRemainingBadgeViewModel", () => {
  it("hidden on null/undefined input", () => {
    expect(buildAiCreditRemainingBadgeViewModel(null).visible).toBe(false);
    expect(buildAiCreditRemainingBadgeViewModel(undefined).visible).toBe(false);
  });

  it("hidden on malformed input (missing remaining)", () => {
    expect(
      buildAiCreditRemainingBadgeViewModel({
        scope: "per_grow",
        scope_limit: 3,
      } as unknown as Parameters<typeof buildAiCreditRemainingBadgeViewModel>[0]).visible,
    ).toBe(false);
  });

  it("hidden on missing/invalid scope_limit", () => {
    expect(
      buildAiCreditRemainingBadgeViewModel({
        remaining: 2,
        scope: "per_grow",
      }).visible,
    ).toBe(false);
    expect(
      buildAiCreditRemainingBadgeViewModel({
        remaining: 2,
        scope: "per_grow",
        scope_limit: 0,
      }).visible,
    ).toBe(false);
  });

  it("hidden on unknown scope", () => {
    const vm = buildAiCreditRemainingBadgeViewModel({
      remaining: 5,
      scope: "per_lifetime",
      scope_limit: 10,
    });
    expect(vm.visible).toBe(false);
  });

  it("per_grow label is correct", () => {
    const vm = buildAiCreditRemainingBadgeViewModel({
      remaining: 2,
      scope: "per_grow",
      scope_limit: 3,
    });
    expect(vm.visible).toBe(true);
    expect(vm.label).toBe("2 of 3 AI Doctor credits left for this grow");
    expect(vm.helper).toBeUndefined();
    expect(vm.scope).toBe("per_grow");
  });

  it("per_month label + reset helper are correct", () => {
    const vm = buildAiCreditRemainingBadgeViewModel({
      remaining: 97,
      scope: "per_month",
      scope_limit: 100,
      period_key: "2026-06",
    });
    expect(vm.visible).toBe(true);
    expect(vm.label).toBe("97 of 100 AI Doctor credits left this month");
    expect(vm.helper).toBe("Resets on the 1st of the month (UTC).");
    expect(vm.scope).toBe("per_month");
  });

  it("clamps negative remaining to 0", () => {
    const vm = buildAiCreditRemainingBadgeViewModel({
      remaining: -5,
      scope: "per_month",
      scope_limit: 100,
    });
    expect(vm.label).toBe("0 of 100 AI Doctor credits left this month");
  });

  it("copy passes banned-word scan", () => {
    for (const scope of ["per_grow", "per_month"] as const) {
      const vm = buildAiCreditRemainingBadgeViewModel({
        remaining: 1,
        scope,
        scope_limit: 3,
      });
      expect(paywallCtaHasBannedWords(vm.label)).toBe(false);
      if (vm.helper) expect(paywallCtaHasBannedWords(vm.helper)).toBe(false);
    }
  });

  it("never asserts AI results are guaranteed/certain", () => {
    const vm = buildAiCreditRemainingBadgeViewModel({
      remaining: 5,
      scope: "per_month",
      scope_limit: 100,
    });
    const text = `${vm.label} ${vm.helper ?? ""}`.toLowerCase();
    for (const word of ["guaranteed", "guarantee", "certain", "confirmed", "act now", "hurry"]) {
      expect(text).not.toContain(word);
    }
  });
});
