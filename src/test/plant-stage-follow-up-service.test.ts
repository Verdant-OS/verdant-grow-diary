/**
 * Regression guard for plantStageFollowUpService: RLS or deleted rows must not
 * read as a successful stage write when select returns zero rows (#2363 review).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlantStageFollowUp } from "@/lib/plantStageFollowUpRules";

const backend = vi.hoisted(() => ({
  updates: [] as Array<{ table: string; id: string; stage: string }>,
  /** Per-table Supabase errors or empty select results. */
  tentRows: [{ id: "tent-a" }] as Array<{ id: string }> | null,
  growRows: [{ id: "grow-a" }] as Array<{ id: string }> | null,
  tentError: null as { message: string } | null,
  growError: null as { message: string } | null,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      update: (payload: Record<string, unknown>) => ({
        eq: (_column: string, id: string) => {
          backend.updates.push({
            table,
            id,
            stage: String(payload.stage),
          });
          const rows =
            table === "tents"
              ? backend.tentError
                ? null
                : backend.tentRows
              : backend.growError
                ? null
                : backend.growRows;
          const error = table === "tents" ? backend.tentError : backend.growError;
          return Object.assign(Promise.resolve({ error }), {
            select: async () => ({ data: rows, error }),
          });
        },
      }),
    }),
  },
}));

import { applyPlantStageFollowUp } from "@/lib/plantStageFollowUpService";

function followUp(overrides: Partial<PlantStageFollowUp> = {}): PlantStageFollowUp {
  return {
    stage: "veg",
    tent: { id: "tent-a", name: "Tent A", stage: "seedling" },
    grow: { id: "grow-a", name: "Grow A", stage: "seedling" },
    message: "msg",
    actionLabel: "Update tent and grow",
    ...overrides,
  };
}

beforeEach(() => {
  backend.updates.length = 0;
  backend.tentRows = [{ id: "tent-a" }];
  backend.growRows = [{ id: "grow-a" }];
  backend.tentError = null;
  backend.growError = null;
});

describe("applyPlantStageFollowUp", () => {
  it("updates tent and grow and reports success when select returns rows", async () => {
    const result = await applyPlantStageFollowUp(followUp());
    expect(backend.updates).toEqual([
      { table: "tents", id: "tent-a", stage: "veg" },
      { table: "grows", id: "grow-a", stage: "veg" },
    ]);
    expect(result).toEqual({ tentUpdated: true, growUpdated: true });
  });

  it("treats zero matching rows as a failed write", async () => {
    backend.tentRows = [];
    const result = await applyPlantStageFollowUp(followUp());
    expect(result.tentUpdated).toBe(false);
    expect(result.growUpdated).toBe(true);
  });

  it("treats Supabase errors as failed writes", async () => {
    backend.growError = { message: "rls" };
    backend.growRows = null;
    const result = await applyPlantStageFollowUp(followUp());
    expect(result.growUpdated).toBe(false);
    expect(result.tentUpdated).toBe(true);
  });

  it("skips tables omitted from the follow-up payload", async () => {
    const result = await applyPlantStageFollowUp(
      followUp({ tent: null, actionLabel: "Update grow" }),
    );
    expect(backend.updates).toEqual([{ table: "grows", id: "grow-a", stage: "veg" }]);
    expect(result).toEqual({ tentUpdated: null, growUpdated: true });
  });
});
