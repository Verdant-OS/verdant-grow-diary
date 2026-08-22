import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  confirmHierarchyCreateAttemptRow,
  isAmbiguousHierarchyInsertError,
  newHierarchyCreateAttemptId,
  persistHierarchyCreateAttempt,
  reconcileHierarchyCreateAttempt,
} from "@/lib/hierarchyCreatePersistence";

const IDS = {
  grow: "11111111-1111-4111-8111-111111111111",
  tent: "22222222-2222-4222-8222-222222222222",
  plant: "33333333-3333-4333-8333-333333333333",
  owner: "44444444-4444-4444-8444-444444444444",
} as const;

const TENT_ATTEMPT = {
  entity: "tent" as const,
  rowId: IDS.tent,
  ownerId: IDS.owner,
  growId: IDS.grow,
};

describe("hierarchy create persistence", () => {
  beforeEach(() => {
    vi.stubGlobal("crypto", { randomUUID: () => IDS.plant });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("preallocates a secure UUID before a hierarchy insert", () => {
    expect(newHierarchyCreateAttemptId()).toBe(IDS.plant);
  });

  it("recognizes only response-loss and duplicate-key insert errors as ambiguous", () => {
    expect(isAmbiguousHierarchyInsertError({ code: "23505" })).toBe(true);
    expect(isAmbiguousHierarchyInsertError({ code: "", message: "Failed to fetch" })).toBe(true);
    expect(isAmbiguousHierarchyInsertError({ message: "Failed to fetch" })).toBe(true);
    expect(isAmbiguousHierarchyInsertError({ code: "42501", message: "not allowed" })).toBe(false);
  });

  it("confirms a tent only when its preallocated id, owner, and grow all match", () => {
    expect(
      confirmHierarchyCreateAttemptRow(
        { id: IDS.tent, user_id: IDS.owner, grow_id: IDS.grow, name: "Tent A" },
        TENT_ATTEMPT,
      ),
    ).not.toBeNull();

    expect(
      confirmHierarchyCreateAttemptRow(
        { id: IDS.tent, user_id: "other-owner", grow_id: IDS.grow },
        TENT_ATTEMPT,
      ),
    ).toBeNull();
    expect(
      confirmHierarchyCreateAttemptRow(
        { id: IDS.tent, user_id: IDS.owner, grow_id: "other-grow" },
        TENT_ATTEMPT,
      ),
    ).toBeNull();
  });

  it("requires the exact owner and grow/tent context for a plant", () => {
    const attempt = {
      entity: "plant" as const,
      rowId: IDS.plant,
      ownerId: IDS.owner,
      growId: IDS.grow,
      tentId: IDS.tent,
    };

    expect(
      confirmHierarchyCreateAttemptRow(
        {
          id: IDS.plant,
          user_id: IDS.owner,
          grow_id: IDS.grow,
          tent_id: IDS.tent,
        },
        attempt,
      ),
    ).not.toBeNull();
    expect(
      confirmHierarchyCreateAttemptRow(
        {
          id: IDS.plant,
          user_id: IDS.owner,
          grow_id: IDS.grow,
          tent_id: "other-tent",
        },
        attempt,
      ),
    ).toBeNull();
  });

  it("reconciles only the preallocated id through the signed-in RLS client", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: IDS.tent, user_id: IDS.owner, grow_id: IDS.grow, name: "Tent A" },
      error: null,
    });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));

    const result = await reconcileHierarchyCreateAttempt({ from } as never, TENT_ATTEMPT);

    expect(result.status).toBe("confirmed");
    expect(from).toHaveBeenCalledWith("tents");
    expect(select).toHaveBeenCalledWith("id,user_id,grow_id");
    expect(eq).toHaveBeenCalledWith("id", IDS.tent);
  });

  it("keeps an unreadable or mismatched reconciliation unavailable", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: IDS.tent, user_id: IDS.owner, grow_id: "other-grow" },
      error: null,
    });
    const from = vi.fn(() => ({
      select: () => ({ eq: () => ({ maybeSingle }) }),
    }));

    await expect(reconcileHierarchyCreateAttempt({ from } as never, TENT_ATTEMPT)).resolves.toEqual(
      {
        status: "unavailable",
      },
    );
  });

  it("uses reconciliation after a thrown insert that may already have committed", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: IDS.tent, user_id: IDS.owner, grow_id: IDS.grow, name: "Tent A" },
      error: null,
    });
    const from = vi.fn(() => ({
      insert: () => ({
        select: () => ({
          single: async () => {
            throw new TypeError("Failed to fetch");
          },
        }),
      }),
      select: () => ({ eq: () => ({ maybeSingle }) }),
    }));

    await expect(
      persistHierarchyCreateAttempt({ from } as never, TENT_ATTEMPT, {
        id: IDS.tent,
        user_id: IDS.owner,
        grow_id: IDS.grow,
        name: "Tent A",
      }),
    ).resolves.toMatchObject({ status: "confirmed", confirmed: { row: { id: IDS.tent } } });
  });

  it("locks a missing-code transport response loss when its exact row cannot be re-read", async () => {
    const from = vi.fn(() => ({
      insert: () => ({
        select: () => ({
          single: async () => ({ data: null, error: { message: "Failed to fetch" } }),
        }),
      }),
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
      }),
    }));

    await expect(
      persistHierarchyCreateAttempt({ from } as never, TENT_ATTEMPT, {
        id: IDS.tent,
        user_id: IDS.owner,
        grow_id: IDS.grow,
        name: "Tent A",
      }),
    ).resolves.toEqual({ status: "unknown" });
  });
});
