import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyPlantStageFollowUp } from "@/lib/plantStageFollowUpService";
import type { PlantStageFollowUp } from "@/lib/plantStageFollowUpRules";

type StageFilter = { kind: "eq" | "is"; column: string; value: string | null };

const supabaseState = vi.hoisted(() => ({
  stages: {
    tents: {} as Record<string, string | null>,
    grows: {} as Record<string, string | null>,
  },
  filters: [] as StageFilter[],
  throwOnUpdate: false,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: "tents" | "grows") => ({
      update: (payload: Record<string, unknown>) => {
        let id = "";
        const filters: StageFilter[] = [];
        const builder = {
          eq: (column: string, value: string) => {
            if (column === "id") id = value;
            else filters.push({ kind: "eq", column, value });
            return builder;
          },
          is: (column: string, value: null) => {
            filters.push({ kind: "is", column, value });
            return builder;
          },
          select: async () => {
            if (supabaseState.throwOnUpdate) throw new Error("network");
            supabaseState.filters.push(...filters);
            const stored = supabaseState.stages[table][id];
            const stageFilter = filters.find((f) => f.column === "stage");
            if (stageFilter) {
              const expected = stageFilter.kind === "is" ? null : (stageFilter.value as string);
              if ((stored ?? null) !== expected) return { data: [], error: null };
            }
            supabaseState.stages[table][id] = payload.stage as string;
            return { data: [{ id }], error: null };
          },
        };
        return builder;
      },
    }),
  },
}));

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
  supabaseState.stages = { tents: { "tent-a": "seedling" }, grows: { "grow-a": "seedling" } };
  supabaseState.filters.length = 0;
  supabaseState.throwOnUpdate = false;
});

describe("applyPlantStageFollowUp", () => {
  it("updates tent and grow only when the stored stage still matches the prompt snapshot", async () => {
    const result = await applyPlantStageFollowUp(followUp());
    expect(result).toEqual({ tentUpdated: true, growUpdated: true });
    expect(supabaseState.stages.tents["tent-a"]).toBe("veg");
    expect(supabaseState.stages.grows["grow-a"]).toBe("veg");
    expect(supabaseState.filters).toEqual(
      expect.arrayContaining([
        { kind: "eq", column: "stage", value: "seedling" },
        { kind: "eq", column: "stage", value: "seedling" },
      ]),
    );
  });

  it("uses a null-stage guard when the holder had no stage at prompt time", async () => {
    await applyPlantStageFollowUp(
      followUp({
        tent: { id: "tent-a", name: "Tent A", stage: null },
        grow: null,
      }),
    );
    expect(supabaseState.filters).toContainEqual({ kind: "is", column: "stage", value: null });
  });

  it("reports a failed tent write when the holder stage changed after the prompt", async () => {
    supabaseState.stages.tents["tent-a"] = "flower";
    const result = await applyPlantStageFollowUp(
      followUp({ grow: null, actionLabel: "Update tent" }),
    );
    expect(result).toEqual({ tentUpdated: false, growUpdated: null });
    expect(supabaseState.stages.tents["tent-a"]).toBe("flower");
  });

  it("returns false when the client throws instead of returning rows", async () => {
    supabaseState.throwOnUpdate = true;
    const result = await applyPlantStageFollowUp(
      followUp({ grow: null, actionLabel: "Update tent" }),
    );
    expect(result).toEqual({ tentUpdated: false, growUpdated: null });
  });
});
