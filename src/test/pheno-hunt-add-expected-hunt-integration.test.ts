import { beforeEach, describe, expect, it, vi } from "vitest";

const transport = vi.hoisted(() => ({
  fetch: async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
    throw new Error("The test must install its isolated PostgREST transport");
  },
}));

// Keep both services AND the real PostgREST query builder. Only network I/O is replaced.
vi.mock("@/integrations/supabase/phenoTables", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return {
    phenoDb: createClient("https://pheno-regression.invalid", "test-anon-key", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (input, init) => transport.fetch(input, init) },
    }),
  };
});

import { addPhenoHuntCandidates } from "@/lib/phenoHuntAddCandidatesService";

interface PlantRow {
  id: string;
  user_id: string;
  grow_id: string;
  is_archived: boolean;
  pheno_hunt_id: string | null;
  candidate_number: number | null;
  candidate_label: string | null;
}

function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
}

function isolatedDatabase() {
  const plant: PlantRow = {
    id: "new-plant",
    user_id: "owner",
    grow_id: "grow-A",
    is_archived: false,
    pheno_hunt_id: null,
    candidate_number: null,
    candidate_label: null,
  };
  const rows: PlantRow[] = Array.from({ length: 16 }, (_, i) => ({
    ...plant,
    id: `established-${i + 1}`,
    pheno_hunt_id: "H1",
    candidate_number: i + 1,
    candidate_label: `#${i + 1}`,
  }));
  rows.push(plant);
  const numberRequested = deferred();
  const releaseNumber = deferred();
  const applied: { huntBefore: string | null; patch: Partial<PlantRow> }[] = [];

  transport.fetch = async (input, init) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input : input.url,
    );
    const table = url.pathname.split("/").at(-1);
    const patch =
      init?.method === "PATCH" ? (JSON.parse(String(init.body)) as Partial<PlantRow>) : null;
    if (patch && "candidate_number" in patch) {
      numberRequested.resolve();
      // The row can change AFTER the tag response and BEFORE numbering reaches Postgres.
      await releaseNumber.promise;
    }
    let result: unknown;
    if (table === "pheno_hunts") {
      result = [{ id: "H1", user_id: "owner", grow_id: "grow-A" }];
    } else if (table === "plants") {
      const matched = rows.filter((row) =>
        Array.from(url.searchParams).every(([key, condition]) => {
          if (!(key in row)) return true;
          const actual = row[key as keyof PlantRow];
          if (condition === "is.null") return actual === null;
          return condition.startsWith("eq.") && String(actual) === condition.slice(3);
        }),
      );
      if (patch) {
        for (const row of matched) {
          applied.push({ huntBefore: row.pheno_hunt_id, patch: { ...patch } });
          Object.assign(row, patch);
        }
      }
      result = matched.map((row) => ({ ...row }));
    } else {
      throw new Error(`Unexpected isolated request: ${url.pathname}`);
    }
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  return { plant, numberRequested, releaseNumber, applied };
}

let database: ReturnType<typeof isolatedDatabase>;
beforeEach(() => {
  database = isolatedDatabase();
});

describe("adding candidates keeps the real numbering write in the expected hunt", () => {
  it.each([
    { replacementNumber: null, replacementLabel: "#1", state: "unnumbered" },
    { replacementNumber: 17, replacementLabel: "#17", state: "already carrying the same number" },
  ])(
    "leaves H2 untouched when its plant is $state",
    async ({ replacementNumber, replacementLabel }) => {
      const pending = addPhenoHuntCandidates({ huntId: "H1", plantIds: ["new-plant"] });
      await database.numberRequested.promise;
      // Another tab deletes H1, then creates H2 with this same-owner/same-grow plant.
      // The hunt-change guard clears the old number; H2 may also have numbered it already.
      Object.assign(database.plant, {
        pheno_hunt_id: "H2",
        candidate_number: replacementNumber,
        candidate_label: replacementLabel,
      });
      database.releaseNumber.resolve();
      const result = await pending;

      expect(database.plant).toEqual({
        id: "new-plant",
        user_id: "owner",
        grow_id: "grow-A",
        is_archived: false,
        pheno_hunt_id: "H2",
        candidate_number: replacementNumber,
        candidate_label: replacementLabel,
      });
      expect(result.added).toEqual([]);
      expect(result.failed).toEqual([{ plantId: "new-plant", reason: "cleanup_unconfirmed" }]);
      expect(database.applied.filter((write) => write.huntBefore === "H2")).toEqual([]);
    },
  );

  it("still numbers the plant when it remains in H1", async () => {
    const pending = addPhenoHuntCandidates({ huntId: "H1", plantIds: ["new-plant"] });
    await database.numberRequested.promise;
    database.releaseNumber.resolve();

    expect(await pending).toEqual({
      added: [{ plantId: "new-plant", candidateNumber: 17, candidateLabel: "#17" }],
      failed: [],
    });
    expect(database.plant).toMatchObject({
      pheno_hunt_id: "H1",
      candidate_number: 17,
      candidate_label: "#17",
    });
  });
});
