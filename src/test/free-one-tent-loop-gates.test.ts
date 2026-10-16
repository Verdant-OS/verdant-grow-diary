/**
 * Verified free one-tent loop gates.
 *
 * The single-dialog helpers fail open while capabilities are unresolved.
 * The verified wrappers used by multi-row setup fail closed: an unknown,
 * missing, or errored plan or entitlement read must deny before any grow
 * or tent row is created. A settled Free plan allows exactly one new active
 * grow and one new tent.
 */
import { describe, expect, it } from "vitest";
import { FREE_CAPABILITIES } from "@/lib/entitlements/capabilities";
import {
  CREATION_ENTITLEMENT_UNAVAILABLE_COPY,
  evaluateVerifiedGrowCreationGate,
  evaluateVerifiedTentCreationGate,
  FREE_GROW_LIMIT_BLOCKED_COPY,
  FREE_TENT_LIMIT_BLOCKED_COPY,
  type CreationGateResult,
} from "@/lib/entitlements/freeTierGates";
import { PLAN_CATALOG } from "@/lib/entitlements/planCatalog";
import type { Capabilities } from "@/lib/entitlements/types";

const PRO = PLAN_CATALOG.pro_monthly;
const FOUNDER = PLAN_CATALOG.founder_lifetime;

function roomPreflight(
  capabilities: Capabilities | null | undefined,
  activeGrowCount: number,
  activeTentCount: number,
  growVerificationReady: boolean,
  tentVerificationReady: boolean,
): CreationGateResult {
  const growGate = evaluateVerifiedGrowCreationGate(
    capabilities,
    activeGrowCount,
    growVerificationReady,
  );
  if (!growGate.allowed) return growGate;
  return evaluateVerifiedTentCreationGate(capabilities, activeTentCount, tentVerificationReady);
}

describe("verified creation gates fail closed", () => {
  it.each([
    ["missing null capabilities", null, true],
    ["missing undefined capabilities", undefined, true],
    ["errored plan check", FREE_CAPABILITIES, false],
    ["unknown unsettled entitlement", undefined, false],
  ] as const)("grow: %s denies", (_label, capabilities, verificationReady) => {
    const result = evaluateVerifiedGrowCreationGate(capabilities, 0, verificationReady);
    expect(result.allowed).toBe(false);
    expect(result.limit).toBeNull();
    expect(result.blockedCopy).toBe(CREATION_ENTITLEMENT_UNAVAILABLE_COPY);
  });

  it.each([
    ["missing null capabilities", null, true],
    ["missing undefined capabilities", undefined, true],
    ["errored plan check", FREE_CAPABILITIES, false],
    ["unknown unsettled entitlement", undefined, false],
  ] as const)("tent: %s denies", (_label, capabilities, verificationReady) => {
    const result = evaluateVerifiedTentCreationGate(capabilities, 0, verificationReady);
    expect(result.allowed).toBe(false);
    expect(result.limit).toBeNull();
    expect(result.blockedCopy).toBe(CREATION_ENTITLEMENT_UNAVAILABLE_COPY);
  });

  it("denies a new room when either verified read has not settled", () => {
    expect(roomPreflight(FREE_CAPABILITIES, 0, 0, false, true).allowed).toBe(false);
    expect(roomPreflight(FREE_CAPABILITIES, 0, 0, true, false).allowed).toBe(false);
    expect(roomPreflight(null, 0, 0, true, true).blockedCopy).toBe(
      CREATION_ENTITLEMENT_UNAVAILABLE_COPY,
    );
  });
});

describe("free one-tent loop allowances", () => {
  it("allows exactly one new grow and one new tent when Free is verified", () => {
    const grow = evaluateVerifiedGrowCreationGate(FREE_CAPABILITIES, 0, true);
    const tent = evaluateVerifiedTentCreationGate(FREE_CAPABILITIES, 0, true);
    expect(grow).toEqual({ allowed: true, limit: 1, blockedCopy: null });
    expect(tent).toEqual({ allowed: true, limit: 1, blockedCopy: null });
    expect(roomPreflight(FREE_CAPABILITIES, 0, 0, true, true).allowed).toBe(true);
  });

  it("blocks a second grow and a second tent, and still blocks when already over the limit", () => {
    const secondGrow = evaluateVerifiedGrowCreationGate(FREE_CAPABILITIES, 1, true);
    const overGrow = evaluateVerifiedGrowCreationGate(FREE_CAPABILITIES, 3, true);
    const secondTent = evaluateVerifiedTentCreationGate(FREE_CAPABILITIES, 1, true);
    const overTent = evaluateVerifiedTentCreationGate(FREE_CAPABILITIES, 4, true);

    expect(secondGrow).toEqual({
      allowed: false,
      limit: 1,
      blockedCopy: FREE_GROW_LIMIT_BLOCKED_COPY,
    });
    expect(overGrow.allowed).toBe(false);
    expect(overGrow.blockedCopy).toBe(FREE_GROW_LIMIT_BLOCKED_COPY);
    expect(secondTent).toEqual({
      allowed: false,
      limit: 1,
      blockedCopy: FREE_TENT_LIMIT_BLOCKED_COPY,
    });
    expect(overTent.allowed).toBe(false);
    expect(overTent.blockedCopy).toBe(FREE_TENT_LIMIT_BLOCKED_COPY);
  });

  it("allows the missing half of the loop and denies the half already at the Free cap", () => {
    expect(evaluateVerifiedGrowCreationGate(FREE_CAPABILITIES, 0, true).allowed).toBe(true);
    expect(evaluateVerifiedTentCreationGate(FREE_CAPABILITIES, 1, true).allowed).toBe(false);
    expect(roomPreflight(FREE_CAPABILITIES, 0, 1, true, true).allowed).toBe(false);

    expect(evaluateVerifiedGrowCreationGate(FREE_CAPABILITIES, 1, true).allowed).toBe(false);
    expect(evaluateVerifiedTentCreationGate(FREE_CAPABILITIES, 0, true).allowed).toBe(true);
    expect(roomPreflight(FREE_CAPABILITIES, 1, 0, true, true).blockedCopy).toBe(
      FREE_GROW_LIMIT_BLOCKED_COPY,
    );
  });

  it("allows further grows and tents once a verified paid plan is unlimited and multi-tent", () => {
    for (const capabilities of [
      PRO,
      FOUNDER,
      PLAN_CATALOG.pro_annual,
      PLAN_CATALOG.craft_monthly,
    ]) {
      expect(evaluateVerifiedGrowCreationGate(capabilities, 50, true)).toEqual({
        allowed: true,
        limit: null,
        blockedCopy: null,
      });
      expect(evaluateVerifiedTentCreationGate(capabilities, 50, true)).toEqual({
        allowed: true,
        limit: null,
        blockedCopy: null,
      });
      expect(roomPreflight(capabilities, 50, 50, true, true).allowed).toBe(true);
      expect(evaluateVerifiedGrowCreationGate(capabilities, 0, false).allowed).toBe(false);
      expect(evaluateVerifiedTentCreationGate(capabilities, 0, false).allowed).toBe(false);
    }
  });
});
