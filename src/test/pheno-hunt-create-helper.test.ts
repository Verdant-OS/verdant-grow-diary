import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCreatePhenoHunt } from "@/hooks/useCreatePhenoHunt";

function makeClient(opts: {
  huntInsertError?: { message: string } | null;
  candidateInsertError?: { message: string } | null;
  huntId?: string;
}) {
  const huntInsert = vi.fn();
  const candidateInsert = vi.fn();
  const huntDelete = vi.fn();

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
      if (table === "pheno_hunt_candidates") {
        return {
          insert: async (rows: unknown) => {
            candidateInsert(rows);
            return { error: opts.candidateInsertError ?? null };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as never;

  return { client, huntInsert, candidateInsert, huntDelete };
}

const draft = {
  huntName: "Hunt A",
  cultivar: "Blue Berry",
  projectGoal: "keeper_selection" as const,
  startDate: "2026-06-01",
  growId: "g1",
  tentId: "t1",
};

describe("useCreatePhenoHunt", () => {
  it("inserts hunt row then candidate rows on success", async () => {
    const { client, huntInsert, candidateInsert } = makeClient({ huntId: "hunt-xyz" });
    const { result } = renderHook(() => useCreatePhenoHunt(client));

    let res: Awaited<ReturnType<typeof result.current.create>> | undefined;
    await act(async () => {
      res = await result.current.create({
        userId: "u1",
        draft,
        selections: [
          { plantId: "p1", label: "BB-01" },
          { plantId: "p2", label: "BB-02" },
        ],
      });
    });

    expect(res?.ok).toBe(true);
    expect(res?.huntId).toBe("hunt-xyz");
    expect(huntInsert).toHaveBeenCalledTimes(1);
    expect(huntInsert.mock.calls[0][0]).toMatchObject({
      user_id: "u1",
      grow_id: "g1",
      tent_id: "t1",
      hunt_name: "Hunt A",
      cultivar: "Blue Berry",
      project_goal: "keeper_selection",
      candidate_count: 2,
    });
    expect(candidateInsert).toHaveBeenCalledTimes(1);
    expect(candidateInsert.mock.calls[0][0]).toEqual([
      { hunt_id: "hunt-xyz", plant_id: "p1", label: "BB-01" },
      { hunt_id: "hunt-xyz", plant_id: "p2", label: "BB-02" },
    ]);
    expect(result.current.status).toBe("saved");
  });

  it("dedupes candidate rows by plant_id before insert", async () => {
    const { client, candidateInsert } = makeClient({});
    const { result } = renderHook(() => useCreatePhenoHunt(client));

    await act(async () => {
      await result.current.create({
        userId: "u1",
        draft,
        selections: [
          { plantId: "p1", label: "BB-01" },
          { plantId: "p1", label: "BB-01-dup" },
        ],
      });
    });

    expect(candidateInsert.mock.calls[0][0]).toHaveLength(1);
  });

  it("returns hunt_insert_failed without touching candidates when hunt insert fails", async () => {
    const { client, candidateInsert, huntDelete } = makeClient({
      huntInsertError: { message: "rls" },
    });
    const { result } = renderHook(() => useCreatePhenoHunt(client));

    let res: Awaited<ReturnType<typeof result.current.create>> | undefined;
    await act(async () => {
      res = await result.current.create({
        userId: "u1",
        draft,
        selections: [{ plantId: "p1", label: "BB-01" }],
      });
    });

    expect(res?.ok).toBe(false);
    expect(res?.errorCode).toBe("hunt_insert_failed");
    expect(candidateInsert).not.toHaveBeenCalled();
    expect(huntDelete).not.toHaveBeenCalled();
    expect(result.current.status).toBe("error");
  });

  it("rolls back hunt when candidate insert fails", async () => {
    const { client, huntDelete } = makeClient({
      huntId: "hunt-1",
      candidateInsertError: { message: "fk fail" },
    });
    const { result } = renderHook(() => useCreatePhenoHunt(client));

    let res: Awaited<ReturnType<typeof result.current.create>> | undefined;
    await act(async () => {
      res = await result.current.create({
        userId: "u1",
        draft,
        selections: [{ plantId: "p1", label: "BB-01" }],
      });
    });

    expect(res?.ok).toBe(false);
    expect(res?.errorCode).toBe("candidate_insert_failed");
    expect(huntDelete).toHaveBeenCalledWith({ col: "id", val: "hunt-1" });
  });

  it("rejects unauthenticated calls", async () => {
    const { client } = makeClient({});
    const { result } = renderHook(() => useCreatePhenoHunt(client));

    let res: Awaited<ReturnType<typeof result.current.create>> | undefined;
    await act(async () => {
      res = await result.current.create({
        userId: "",
        draft,
        selections: [{ plantId: "p1", label: "BB-01" }],
      });
    });

    expect(res?.ok).toBe(false);
    expect(res?.errorCode).toBe("not_authenticated");
  });
});
