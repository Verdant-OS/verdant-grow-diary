import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlantStageFollowUp } from "@/lib/plantStageFollowUpRules";

const backend = vi.hoisted(() => ({
  updates: [] as Array<{ table: string; id: string; stage: string }>,
  nextError: null as { message: string } | null,
  throwOnUpdate: false,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      update: (payload: Record<string, unknown>) => ({
        eq: async (_column: string, id: string) => {
          if (backend.throwOnUpdate) throw new Error("network");
          backend.updates.push({ table, id, stage: String(payload.stage) });
          return { error: backend.nextError };
        },
      }),
    }),
  },
}));

import { applyPlantStageFollowUp } from "@/lib/plantStageFollowUpService";

function followUp(partial: Partial<PlantStageFollowUp> = {}): PlantStageFollowUp {
  return {
    stage: "veg",
    tent: { id: "tent-1", name: "Tent", stage: "seedling" },
    grow: { id: "grow-1", name: "Grow", stage: "seedling" },
    message: "msg",
    actionLabel: "Update tent and grow",
    ...partial,
  };
}

beforeEach(() => {
  backend.updates.length = 0;
  backend.nextError = null;
  backend.throwOnUpdate = false;
});

describe("applyPlantStageFollowUp", () => {
  it("writes the plant stage to each accepted holder", async () => {
    const result = await applyPlantStageFollowUp(followUp());
    expect(result).toEqual({ tentUpdated: true, growUpdated: true });
    expect(backend.updates).toEqual([
      { table: "tents", id: "tent-1", stage: "veg" },
      { table: "grows", id: "grow-1", stage: "veg" },
    ]);
  });

  it("skips tables omitted from the follow-up offer", async () => {
    const result = await applyPlantStageFollowUp(followUp({ grow: null }));
    expect(result).toEqual({ tentUpdated: true, growUpdated: null });
    expect(backend.updates).toEqual([{ table: "tents", id: "tent-1", stage: "veg" }]);
  });

  it("reports false when Supabase returns an error", async () => {
    backend.nextError = { message: "rls" };
    const result = await applyPlantStageFollowUp(followUp({ tent: null }));
    expect(result).toEqual({ tentUpdated: null, growUpdated: false });
  });

  it("reports false when the client throws", async () => {
    backend.throwOnUpdate = true;
    const result = await applyPlantStageFollowUp(followUp({ grow: null }));
    expect(result).toEqual({ tentUpdated: false, growUpdated: null });
  });
});
