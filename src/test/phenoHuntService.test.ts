import { describe, it, expect, vi } from "vitest";
import {
  createPhenoHunt,
  defaultCandidateLabel,
  defaultHuntName,
  validatePhenoHuntDraft,
  PhenoHuntError,
} from "@/lib/phenoHuntService";

function makeClient(opts: {
  huntInsertError?: { message: string } | null;
  plantUpdateErrorAt?: number; // index of plant that fails
  huntId?: string;
}) {
  const huntInsert = vi.fn();
  const plantUpdates: { id: string; values: unknown }[] = [];
  const huntDelete = vi.fn();
  let plantIdx = 0;

  const client = {
    from(table: string) {
      if (table === "pheno_hunts") {
        return {
          insert: (row: unknown) => {
            huntInsert(row);
            return {
              select: () => ({
                single: async () => ({
                  data: opts.huntInsertError ? null : { id: opts.huntId ?? "hunt-1" },
                  error: opts.huntInsertError ?? null,
                }),
              }),
            };
          },
          delete: () => ({
            eq: async (col: string, val: string) => {
              huntDelete({ col, val });
              return { error: null };
            },
          }),
        };
      }
      if (table === "plants") {
        return {
          update: (values: unknown) => ({
            eq: async (_col: string, val: string) => {
              const at = plantIdx++;
              plantUpdates.push({ id: val, values });
              const fail = opts.plantUpdateErrorAt === at;
              return { error: fail ? { message: "rls" } : null };
            },
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as never;

  return { client, huntInsert, plantUpdates, huntDelete };
}

describe("phenoHuntService", () => {
  describe("defaultCandidateLabel", () => {
    it("returns #1, #2, ...", () => {
      expect(defaultCandidateLabel(0)).toBe("#1");
      expect(defaultCandidateLabel(4)).toBe("#5");
    });
  });

  describe("defaultHuntName", () => {
    it("appends 'Pheno Hunt' to the grow name", () => {
      expect(defaultHuntName("Tent A")).toBe("Tent A Pheno Hunt");
    });
    it("falls back when the grow name is missing", () => {
      expect(defaultHuntName(null)).toBe("Pheno Hunt");
      expect(defaultHuntName("   ")).toBe("Pheno Hunt");
    });
  });

  describe("validatePhenoHuntDraft", () => {
    it("accepts a valid draft", () => {
      expect(validatePhenoHuntDraft({ name: "Hunt", plantIds: ["p1"] }, "g1")).toEqual([]);
    });
    it("flags missing name, grow, candidates", () => {
      const errs = validatePhenoHuntDraft({ name: "  ", plantIds: [] }, null);
      expect(errs).toEqual(
        expect.arrayContaining(["name_required", "grow_required", "no_candidates"]),
      );
    });
  });

  describe("createPhenoHunt", () => {
    it("inserts hunt then tags each plant with default labels", async () => {
      const { client, huntInsert, plantUpdates } = makeClient({ huntId: "h1" });
      const res = await createPhenoHunt(
        { growId: "g1", tentId: "t1", name: "Hunt", plantIds: ["p1", "p2"] },
        client,
      );
      expect(res).toEqual({ huntId: "h1", taggedPlantIds: ["p1", "p2"] });
      expect(huntInsert).toHaveBeenCalledWith({
        grow_id: "g1",
        tent_id: "t1",
        name: "Hunt",
      });
      expect(plantUpdates).toEqual([
        { id: "p1", values: { pheno_hunt_id: "h1", candidate_label: "#1" } },
        { id: "p2", values: { pheno_hunt_id: "h1", candidate_label: "#2" } },
      ]);
    });

    it("honors label overrides when provided", async () => {
      const { client, plantUpdates } = makeClient({ huntId: "h1" });
      await createPhenoHunt(
        {
          growId: "g1",
          name: "Hunt",
          plantIds: ["p1", "p2"],
          labels: { p1: "BB-A", p2: "  " },
        },
        client,
      );
      expect(plantUpdates[0].values).toMatchObject({ candidate_label: "BB-A" });
      // Blank override falls back to default.
      expect(plantUpdates[1].values).toMatchObject({ candidate_label: "#2" });
    });

    it("does not send client-supplied user_id (trigger fills it)", async () => {
      const { client, huntInsert } = makeClient({});
      await createPhenoHunt(
        { growId: "g1", name: "Hunt", plantIds: ["p1"] },
        client,
      );
      expect(Object.keys(huntInsert.mock.calls[0][0])).not.toContain("user_id");
    });

    it("rejects when hunt insert fails and skips plant updates", async () => {
      const { client, plantUpdates } = makeClient({
        huntInsertError: { message: "denied" },
      });
      await expect(
        createPhenoHunt({ growId: "g1", name: "Hunt", plantIds: ["p1"] }, client),
      ).rejects.toBeInstanceOf(PhenoHuntError);
      expect(plantUpdates).toHaveLength(0);
    });

    it("rolls back the hunt when a plant update fails", async () => {
      const { client, huntDelete } = makeClient({
        huntId: "h1",
        plantUpdateErrorAt: 1,
      });
      await expect(
        createPhenoHunt(
          { growId: "g1", name: "Hunt", plantIds: ["p1", "p2"] },
          client,
        ),
      ).rejects.toThrow(/Could not tag candidate plant/);
      expect(huntDelete).toHaveBeenCalledWith({ col: "id", val: "h1" });
    });

    it("rejects empty name / grow / plant list", async () => {
      const { client } = makeClient({});
      await expect(
        createPhenoHunt({ growId: "g1", name: "  ", plantIds: ["p1"] }, client),
      ).rejects.toThrow(/Hunt name/);
      await expect(
        createPhenoHunt({ growId: "", name: "Hunt", plantIds: ["p1"] }, client),
      ).rejects.toThrow(/Grow/);
      await expect(
        createPhenoHunt({ growId: "g1", name: "Hunt", plantIds: [] }, client),
      ).rejects.toThrow(/candidate/);
    });
  });
});
