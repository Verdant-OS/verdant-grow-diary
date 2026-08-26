import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HIERARCHY_CREATE_OUTCOME_RECOVERY_STORAGE_KEY,
  adoptLegacyHierarchyCreateOutcomeRecoveryAttempts,
  clearHierarchyCreateOutcomeRecoveryAttempt,
  getHierarchyCreateOutcomeRecoveryAttempts,
  getHierarchyCreateOutcomeRecoveryRuntimeEpoch,
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
const RECOVERY_RUNTIME_EPOCH_SLOT = "__verdantHierarchyCreateOutcomeRecoveryRuntimeEpoch";

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
  delete (globalThis as Record<string, unknown>)[RECOVERY_RUNTIME_EPOCH_SLOT];
  window.sessionStorage.removeItem(HIERARCHY_CREATE_OUTCOME_RECOVERY_STORAGE_KEY);
});

describe("hierarchy create outcome recovery", () => {
  it("makes every unresolved owner attempt visible to every hierarchy creator in the same runtime", () => {
    recordHierarchyCreateOutcomeRecoveryAttempt(GROW_ATTEMPT);
    recordHierarchyCreateOutcomeRecoveryAttempt(TENT_ATTEMPT);

    const epoch = getHierarchyCreateOutcomeRecoveryRuntimeEpoch();
    expect(getHierarchyCreateOutcomeRecoveryAttempts(IDS.ownerA)).toEqual([
      { attempt: GROW_ATTEMPT, runtimeEpoch: epoch },
      { attempt: TENT_ATTEMPT, runtimeEpoch: epoch },
    ]);
    expect(getHierarchyCreateOutcomeRecoveryAttempts(IDS.ownerB)).toEqual([]);
  });

  it("clears only the exact attempt while retaining the owner-wide fence for sibling attempts", () => {
    recordHierarchyCreateOutcomeRecoveryAttempt(GROW_ATTEMPT);
    recordHierarchyCreateOutcomeRecoveryAttempt(TENT_ATTEMPT);

    expect(clearHierarchyCreateOutcomeRecoveryAttempt(GROW_ATTEMPT)).toBe(true);

    expect(getHierarchyCreateOutcomeRecoveryAttempts(IDS.ownerA)).toEqual([
      { attempt: TENT_ATTEMPT, runtimeEpoch: getHierarchyCreateOutcomeRecoveryRuntimeEpoch() },
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
      {
        attempt: GROW_ATTEMPT,
        runtimeEpoch: getHierarchyCreateOutcomeRecoveryRuntimeEpoch(),
      },
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

describe("hierarchy create outcome recovery runtime epoch (CF Workers global-scope safety)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete (globalThis as Record<string, unknown>)[RECOVERY_RUNTIME_EPOCH_SLOT];
    delete (globalThis as Record<string, unknown>)[RECOVERY_RUNTIME_STATE_SLOT];
  });

  it("can be imported in a worker-like context without Date.now / random / timer / fetch at module eval", async () => {
    vi.resetModules();
    delete (globalThis as Record<string, unknown>)[RECOVERY_RUNTIME_EPOCH_SLOT];
    delete (globalThis as Record<string, unknown>)[RECOVERY_RUNTIME_STATE_SLOT];

    const dateNow = vi.spyOn(Date, "now");
    const mathRandom = vi.spyOn(Math, "random");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const randomUUID = vi.fn(() => "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
    const performanceNow = vi.fn(() => 1.5);
    vi.stubGlobal("crypto", { randomUUID });
    vi.stubGlobal("performance", { now: performanceNow });

    await import("@/lib/hierarchyCreateOutcomeRecovery");

    // mintRuntimeEpoch uses crypto.randomUUID or Date.now + performance.now only;
    // none of those (nor Math.random / fetch / timers) may run at module eval.
    expect(dateNow).not.toHaveBeenCalled();
    expect(mathRandom).not.toHaveBeenCalled();
    expect(randomUUID).not.toHaveBeenCalled();
    expect(performanceNow).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns a usable runtime epoch when called after import", async () => {
    vi.resetModules();
    delete (globalThis as Record<string, unknown>)[RECOVERY_RUNTIME_EPOCH_SLOT];
    delete (globalThis as Record<string, unknown>)[RECOVERY_RUNTIME_STATE_SLOT];

    const randomUUID = vi.fn(() => "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
    vi.stubGlobal("crypto", { randomUUID });

    const { getHierarchyCreateOutcomeRecoveryRuntimeEpoch: getEpoch } = await import(
      "@/lib/hierarchyCreateOutcomeRecovery"
    );

    expect(randomUUID).not.toHaveBeenCalled();

    const epoch = getEpoch();
    expect(epoch).toBe("runtime:aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
    expect(randomUUID).toHaveBeenCalledTimes(1);
    expect(getEpoch()).toBe(epoch);
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });
});
