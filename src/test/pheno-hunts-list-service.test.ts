/**
 * listPhenoHuntsForOwner — honest, exact index counts.
 *
 * Pins the single bounded nested-count query: only non-archived candidates
 * count, totals above 5,000 remain exact, and resolved Supabase errors or a
 * missing count reject instead of becoming a false empty list / zero.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

interface RecordedQuery {
  readonly table: string;
  readonly calls: Array<[string, ...unknown[]]>;
}

const recorded: RecordedQuery[] = [];
let result: { data: unknown; error: unknown } = { data: [], error: null };

function makeBuilder(table: string) {
  const query: RecordedQuery = { table, calls: [] };
  recorded.push(query);
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "limit"]) {
    builder[method] = (...args: unknown[]) => {
      query.calls.push([method, ...args]);
      return builder;
    };
  }
  (builder as { then: unknown }).then = (resolve: (value: unknown) => unknown) => resolve(result);
  return builder;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (table: string) => makeBuilder(table) },
}));
vi.mock("@/integrations/supabase/phenoTables", () => ({
  phenoDb: { from: (table: string) => makeBuilder(table) },
}));
vi.mock("@/lib/phenoSexObservationService", () => ({
  listLatestSexObservationsForHunt: vi.fn().mockResolvedValue({}),
}));

import { listPhenoHuntsForOwner } from "@/lib/phenoHuntCandidatesService";

beforeEach(() => {
  recorded.length = 0;
  result = { data: [], error: null };
});

describe("listPhenoHuntsForOwner", () => {
  it("uses one bounded server aggregate filtered to non-archived candidates", async () => {
    result = {
      data: [
        {
          id: "hunt-1",
          name: "Blue Dream F2",
          created_at: "2026-07-01T00:00:00Z",
          setup_completed_at: null,
          plants: [{ count: 5001 }],
        },
        {
          id: "hunt-2",
          name: null,
          created_at: null,
          setup_completed_at: "2026-07-02T00:00:00Z",
          plants: [{ count: 0 }],
        },
      ],
      error: null,
    };

    await expect(listPhenoHuntsForOwner()).resolves.toEqual([
      {
        id: "hunt-1",
        name: "Blue Dream F2",
        createdAt: "2026-07-01T00:00:00Z",
        setupCompletedAt: null,
        candidateCount: 5001,
      },
      {
        id: "hunt-2",
        name: "Untitled hunt",
        createdAt: null,
        setupCompletedAt: "2026-07-02T00:00:00Z",
        candidateCount: 0,
      },
    ]);

    expect(recorded).toHaveLength(1);
    const calls = recorded[0].calls;
    expect(calls.find((call) => call[0] === "select")?.[1]).toBe(
      "id, name, created_at, setup_completed_at, plants(count)",
    );
    expect(calls).toContainEqual(["eq", "plants.is_archived", false]);
    expect(calls).toContainEqual(["order", "created_at", { ascending: false }]);
    expect(calls).toContainEqual(["limit", 200]);
    expect(calls.some((call) => call[0] === "range")).toBe(false);
  });

  it("rejects a normally-resolved Supabase error instead of returning an empty list", async () => {
    result = { data: null, error: { message: "RLS or network failure" } };
    await expect(listPhenoHuntsForOwner()).rejects.toThrow("Could not load pheno hunts");
  });

  it("rejects a missing or invalid aggregate instead of reporting zero candidates", async () => {
    result = {
      data: [
        {
          id: "hunt-1",
          name: "Hunt",
          created_at: null,
          setup_completed_at: null,
          plants: [],
        },
      ],
      error: null,
    };
    await expect(listPhenoHuntsForOwner()).rejects.toThrow(
      "Could not determine pheno hunt candidate counts",
    );
  });
});
