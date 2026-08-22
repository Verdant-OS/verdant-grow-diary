import { beforeEach, describe, expect, it } from "vitest";
import {
  HIERARCHY_CREATE_OUTCOME_RECOVERY_RUNTIME_EPOCH,
  HIERARCHY_CREATE_OUTCOME_RECOVERY_STORAGE_KEY,
  adoptLegacyHierarchyCreateOutcomeRecoveryAttempts,
  clearHierarchyCreateOutcomeRecoveryAttempt,
  getHierarchyCreateOutcomeRecoveryAttempts,
  recordHierarchyCreateOutcomeRecoveryAttempt,
} from "@/lib/hierarchyCreateOutcomeRecovery";

const IDS = {
  ownerA: "11111111-1111-4111-8111-111111111111",
  ownerB: "22222222-2222-4222-8222-222222222222",
  grow: "33333333-3333-4333-8333-333333333333",
  tent: "44444444-4444-4444-8444-444444444444",
  plant: "55555555-5555-4555-8555-555555555555",
} as const;

const RECOVERY_RUNTIME_STATE_SLOT = "__verdantHierarchyCreateOutcomeRecoveryRuntimeState";

const GROW_ATTEMPT = {
  entity: "grow" as const,
  rowId: IDS.grow,
  ownerId: IDS.ownerA,
};

const TENT_ATTEMPT = {
  entity: "tent" as const,
  rowId: IDS.tent,
  ownerId: IDS.ownerA,
  growId: IDS.grow,
};

beforeEach(() => {
  delete (globalThis as Record<string, unknown>)[RECOVERY_RUNTIME_STATE_SLOT];
  window.sessionStorage.removeItem(HIERARCHY_CREATE_OUTCOME_RECOVERY_STORAGE_KEY);
});

describe("hierarchy create outcome recovery", () => {
  it("makes every unresolved owner attempt visible to every hierarchy creator in the same runtime", () => {
    recordHierarchyCreateOutcomeRecoveryAttempt(GROW_ATTEMPT);
    recordHierarchyCreateOutcomeRecoveryAttempt(TENT_ATTEMPT);

    expect(getHierarchyCreateOutcomeRecoveryAttempts(IDS.ownerA)).toEqual([
      { attempt: GROW_ATTEMPT, runtimeEpoch: HIERARCHY_CREATE_OUTCOME_RECOVERY_RUNTIME_EPOCH },
      { attempt: TENT_ATTEMPT, runtimeEpoch: HIERARCHY_CREATE_OUTCOME_RECOVERY_RUNTIME_EPOCH },
    ]);
    expect(getHierarchyCreateOutcomeRecoveryAttempts(IDS.ownerB)).toEqual([]);
  });

  it("clears only the exact attempt while retaining the owner-wide fence for sibling attempts", () => {
    recordHierarchyCreateOutcomeRecoveryAttempt(GROW_ATTEMPT);
    recordHierarchyCreateOutcomeRecoveryAttempt(TENT_ATTEMPT);

    expect(clearHierarchyCreateOutcomeRecoveryAttempt(GROW_ATTEMPT)).toBe(true);

    expect(getHierarchyCreateOutcomeRecoveryAttempts(IDS.ownerA)).toEqual([
      { attempt: TENT_ATTEMPT, runtimeEpoch: HIERARCHY_CREATE_OUTCOME_RECOVERY_RUNTIME_EPOCH },
    ]);
  });

  it("adopts a legacy no-epoch record into the current runtime instead of dropping or auto-clearing it", () => {
    window.sessionStorage.setItem(
      HIERARCHY_CREATE_OUTCOME_RECOVERY_STORAGE_KEY,
      JSON.stringify({ version: 1, attempts: [GROW_ATTEMPT] }),
    );

    expect(getHierarchyCreateOutcomeRecoveryAttempts(IDS.ownerA)).toEqual([
      { attempt: GROW_ATTEMPT, runtimeEpoch: null },
    ]);
    expect(adoptLegacyHierarchyCreateOutcomeRecoveryAttempts(IDS.ownerA)).toBe(true);
    expect(getHierarchyCreateOutcomeRecoveryAttempts(IDS.ownerA)).toEqual([
      { attempt: GROW_ATTEMPT, runtimeEpoch: HIERARCHY_CREATE_OUTCOME_RECOVERY_RUNTIME_EPOCH },
    ]);
  });

  it("rejects a malformed non-null plant tent id instead of treating it as tentless", () => {
    window.sessionStorage.setItem(
      HIERARCHY_CREATE_OUTCOME_RECOVERY_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        attempts: [
          {
            entity: "plant",
            rowId: IDS.plant,
            ownerId: IDS.ownerA,
            growId: IDS.grow,
            tentId: "not-a-uuid",
          },
        ],
      }),
    );

    expect(getHierarchyCreateOutcomeRecoveryAttempts(IDS.ownerA)).toEqual([]);
  });
});
