import { describe, expect, it, vi } from "vitest";
import {
  recoverPreviousRuntimeHierarchyCreateAttempt,
  type HierarchyCreateVisibleListReceipt,
} from "@/hooks/useHierarchyCreateOutcomeRecoveryCoordinator";
import type { HierarchyCreateAttempt } from "@/lib/hierarchyCreatePersistence";

const IDS = {
  owner: "11111111-1111-4111-8111-111111111111",
  grow: "22222222-2222-4222-8222-222222222222",
  tent: "33333333-3333-4333-8333-333333333333",
  plant: "44444444-4444-4444-8444-444444444444",
} as const;

const ATTEMPTS: readonly HierarchyCreateAttempt[] = [
  { entity: "grow", ownerId: IDS.owner, rowId: IDS.grow },
  { entity: "tent", ownerId: IDS.owner, rowId: IDS.tent, growId: IDS.grow },
  {
    entity: "plant",
    ownerId: IDS.owner,
    rowId: IDS.plant,
    growId: IDS.grow,
    tentId: IDS.tent,
  },
];

function visibleReceipt(): HierarchyCreateVisibleListReceipt {
  return { status: "visible" };
}

describe("hierarchy create outcome recovery coordinator", () => {
  it.each(ATTEMPTS)(
    "clears a prior-runtime $entity attempt only after its visual receipt",
    async (attempt) => {
      const order: string[] = [];
      const clear = vi.fn(() => {
        order.push("clear");
        return true;
      });

      await expect(
        recoverPreviousRuntimeHierarchyCreateAttempt({
          attempt,
          ownerId: IDS.owner,
          isCurrentOwner: () => true,
          reconcile: async () => {
            order.push("reconcile");
            return {
              status: "confirmed",
              confirmed: { row: { id: attempt.rowId, user_id: IDS.owner } },
            };
          },
          refreshVisibleList: async (receivedAttempt) => {
            expect(receivedAttempt).toEqual(attempt);
            order.push("visible-list");
            return visibleReceipt();
          },
          clear,
        }),
      ).resolves.toBe(true);

      expect(order).toEqual(["reconcile", "visible-list", "clear"]);
      expect(clear).toHaveBeenCalledWith(attempt);
    },
  );

  it("retains the fence when exact reconciliation cannot confirm the row", async () => {
    const refreshVisibleList = vi.fn(async (): Promise<HierarchyCreateVisibleListReceipt> =>
      visibleReceipt(),
    );
    const clear = vi.fn(() => true);

    await expect(
      recoverPreviousRuntimeHierarchyCreateAttempt({
        attempt: ATTEMPTS[1],
        ownerId: IDS.owner,
        isCurrentOwner: () => true,
        reconcile: async () => ({ status: "not_found" }),
        refreshVisibleList,
        clear,
      }),
    ).resolves.toBe(false);

    expect(refreshVisibleList).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });

  it.each<HierarchyCreateVisibleListReceipt>([
    { status: "unavailable" },
    { status: "not_visible" },
  ])("retains the fence when the post-confirmation list receipt is $status", async (receipt) => {
    const clear = vi.fn(() => true);

    await expect(
      recoverPreviousRuntimeHierarchyCreateAttempt({
        attempt: ATTEMPTS[2],
        ownerId: IDS.owner,
        isCurrentOwner: () => true,
        reconcile: async () => ({
          status: "confirmed",
          confirmed: { row: { id: IDS.plant, user_id: IDS.owner } },
        }),
        refreshVisibleList: async () => receipt,
        clear,
      }),
    ).resolves.toBe(false);

    expect(clear).not.toHaveBeenCalled();
  });

  it("retains the fence when the authenticated owner changes while reconciliation is in flight", async () => {
    let ownerCurrent = true;
    const refreshVisibleList = vi.fn(async (): Promise<HierarchyCreateVisibleListReceipt> =>
      visibleReceipt(),
    );
    const clear = vi.fn(() => true);

    await expect(
      recoverPreviousRuntimeHierarchyCreateAttempt({
        attempt: ATTEMPTS[0],
        ownerId: IDS.owner,
        isCurrentOwner: () => ownerCurrent,
        reconcile: async () => {
          ownerCurrent = false;
          return {
            status: "confirmed",
            confirmed: { row: { id: IDS.grow, user_id: IDS.owner } },
          };
        },
        refreshVisibleList,
        clear,
      }),
    ).resolves.toBe(false);

    expect(refreshVisibleList).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });
});
