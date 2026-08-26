import { describe, expect, it, vi } from "vitest";
import { reconcilePlantCreateAttempt } from "@/lib/plantCreatePersistence";

const ATTEMPT = {
  plantId: "11111111-1111-4111-8111-111111111111",
  ownerId: "22222222-2222-4222-8222-222222222222",
  growId: "33333333-3333-4333-8333-333333333333",
  tentId: null,
} as const;

describe("plant create persistence", () => {
  it("reconciles one preallocated plant through its exact owner-scoped RLS row", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: ATTEMPT.plantId,
        user_id: ATTEMPT.ownerId,
        grow_id: ATTEMPT.growId,
        tent_id: null,
        name: "Recovered Plant",
        plant_type: "unknown",
        is_archived: false,
      },
      error: null,
    });
    const ownerEq = vi.fn(() => ({ maybeSingle }));
    const idEq = vi.fn(() => ({ eq: ownerEq }));
    const select = vi.fn(() => ({ eq: idEq }));
    const from = vi.fn(() => ({ select }));

    await expect(reconcilePlantCreateAttempt({ from } as never, ATTEMPT)).resolves.toMatchObject({
      status: "confirmed",
      confirmed: { row: { id: ATTEMPT.plantId } },
    });
    expect(from).toHaveBeenCalledWith("plants");
    expect(idEq).toHaveBeenCalledWith("id", ATTEMPT.plantId);
    expect(ownerEq).toHaveBeenCalledWith("user_id", ATTEMPT.ownerId);
  });
});
