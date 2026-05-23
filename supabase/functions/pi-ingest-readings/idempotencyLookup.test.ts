import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  loadExistingPiIngestIdempotencyKeys,
  PI_INGEST_IDEMPOTENCY_LOOKUP_CHUNK_SIZE,
  PI_INGEST_IDEMPOTENCY_LOOKUP_COLUMNS,
  PI_INGEST_IDEMPOTENCY_LOOKUP_TABLE,
  type PiIngestIdempotencyLookupClient,
  type PiIngestIdempotencyLookupResponse,
} from "./idempotencyLookup.ts";

type Call = {
  table: string;
  columns: string;
  eqColumn: string;
  eqValue: string;
  inColumn: string;
  inValues: readonly string[];
};

function makeClient(
  responses: Array<PiIngestIdempotencyLookupResponse | Error>,
): { client: PiIngestIdempotencyLookupClient; calls: Call[] } {
  const calls: Call[] = [];
  let i = 0;
  const client: PiIngestIdempotencyLookupClient = {
    from(table) {
      return {
        select(columns) {
          return {
            eq(eqColumn, eqValue) {
              return {
                in(inColumn, inValues) {
                  calls.push({
                    table,
                    columns,
                    eqColumn,
                    eqValue,
                    inColumn,
                    inValues: [...inValues],
                  });
                  const r = responses[i++];
                  if (r instanceof Error) return Promise.reject(r);
                  return Promise.resolve(
                    r ?? { data: [], error: null },
                  );
                },
              };
            },
          };
        },
      };
    },
  };
  return { client, calls };
}

Deno.test("missing bridgeId → missing_bridge_id, no client call", async () => {
  const { client, calls } = makeClient([]);
  for (const bad of ["", "   ", null as unknown as string, undefined as unknown as string]) {
    const res = await loadExistingPiIngestIdempotencyKeys(client, {
      bridgeId: bad,
      candidateKeys: ["k1"],
    });
    assertEquals(res.ok, false);
    if (!res.ok) assertEquals(res.reason, "missing_bridge_id");
  }
  assertEquals(calls.length, 0);
});

Deno.test("empty candidateKeys short-circuits to empty set, no client call", async () => {
  const { client, calls } = makeClient([]);
  const res = await loadExistingPiIngestIdempotencyKeys(client, {
    bridgeId: "bridge-1",
    candidateKeys: [],
  });
  assert(res.ok);
  if (res.ok) assertEquals(res.existingKeys.size, 0);
  assertEquals(calls.length, 0);
});

Deno.test("only-blank candidateKeys short-circuit to empty set", async () => {
  const { client, calls } = makeClient([]);
  const res = await loadExistingPiIngestIdempotencyKeys(client, {
    bridgeId: "bridge-1",
    candidateKeys: ["", ""],
  });
  assert(res.ok);
  if (res.ok) assertEquals(res.existingKeys.size, 0);
  assertEquals(calls.length, 0);
});

Deno.test("returns matched subset; uses correct table/columns/filters", async () => {
  const { client, calls } = makeClient([
    { data: [{ idempotency_key: "k1" }, { idempotency_key: "k3" }], error: null },
  ]);
  const res = await loadExistingPiIngestIdempotencyKeys(client, {
    bridgeId: "bridge-1",
    candidateKeys: ["k1", "k2", "k3"],
  });
  assert(res.ok);
  if (res.ok) {
    assertEquals(res.existingKeys.has("k1"), true);
    assertEquals(res.existingKeys.has("k2"), false);
    assertEquals(res.existingKeys.has("k3"), true);
    assertEquals(res.existingKeys.size, 2);
  }
  assertEquals(calls.length, 1);
  assertEquals(calls[0].table, PI_INGEST_IDEMPOTENCY_LOOKUP_TABLE);
  assertEquals(calls[0].columns, PI_INGEST_IDEMPOTENCY_LOOKUP_COLUMNS.join(","));
  assertEquals(calls[0].eqColumn, "bridge_id");
  assertEquals(calls[0].eqValue, "bridge-1");
  assertEquals(calls[0].inColumn, "idempotency_key");
  assertEquals(calls[0].inValues, ["k1", "k2", "k3"]);
});

Deno.test("dedupes candidateKeys before querying", async () => {
  const { client, calls } = makeClient([
    { data: [], error: null },
  ]);
  await loadExistingPiIngestIdempotencyKeys(client, {
    bridgeId: "bridge-1",
    candidateKeys: ["k1", "k1", "k2", "", "k2"],
  });
  assertEquals(calls[0].inValues, ["k1", "k2"]);
});

Deno.test("chunks large IN-lists into multiple queries", async () => {
  const chunkSize = PI_INGEST_IDEMPOTENCY_LOOKUP_CHUNK_SIZE;
  const total = chunkSize * 2 + 5;
  const keys = Array.from({ length: total }, (_, i) => `k${i}`);
  const responses: PiIngestIdempotencyLookupResponse[] = [
    { data: [{ idempotency_key: "k0" }], error: null },
    { data: [{ idempotency_key: `k${chunkSize}` }], error: null },
    { data: [{ idempotency_key: `k${chunkSize * 2}` }], error: null },
  ];
  const { client, calls } = makeClient(responses);
  const res = await loadExistingPiIngestIdempotencyKeys(client, {
    bridgeId: "bridge-1",
    candidateKeys: keys,
  });
  assert(res.ok);
  assertEquals(calls.length, 3);
  assertEquals(calls[0].inValues.length, chunkSize);
  assertEquals(calls[1].inValues.length, chunkSize);
  assertEquals(calls[2].inValues.length, 5);
  if (res.ok) assertEquals(res.existingKeys.size, 3);
});

Deno.test("response.error → lookup_failed", async () => {
  const { client } = makeClient([{ data: null, error: { message: "boom" } }]);
  const res = await loadExistingPiIngestIdempotencyKeys(client, {
    bridgeId: "bridge-1",
    candidateKeys: ["k1"],
  });
  assertEquals(res.ok, false);
  if (!res.ok) assertEquals(res.reason, "lookup_failed");
});

Deno.test("thrown client error → lookup_failed", async () => {
  const { client } = makeClient([new Error("network")]);
  const res = await loadExistingPiIngestIdempotencyKeys(client, {
    bridgeId: "bridge-1",
    candidateKeys: ["k1"],
  });
  assertEquals(res.ok, false);
  if (!res.ok) assertEquals(res.reason, "lookup_failed");
});

Deno.test("non-array data → lookup_failed", async () => {
  const { client } = makeClient([
    { data: { idempotency_key: "k1" } as unknown, error: null },
  ]);
  const res = await loadExistingPiIngestIdempotencyKeys(client, {
    bridgeId: "bridge-1",
    candidateKeys: ["k1"],
  });
  assertEquals(res.ok, false);
  if (!res.ok) assertEquals(res.reason, "lookup_failed");
});

Deno.test("null data → treated as empty (no matches)", async () => {
  const { client } = makeClient([{ data: null, error: null }]);
  const res = await loadExistingPiIngestIdempotencyKeys(client, {
    bridgeId: "bridge-1",
    candidateKeys: ["k1"],
  });
  assert(res.ok);
  if (res.ok) assertEquals(res.existingKeys.size, 0);
});

Deno.test("malformed row → lookup_failed", async () => {
  const { client } = makeClient([
    { data: ["not-an-object"] as unknown[], error: null },
  ]);
  const res = await loadExistingPiIngestIdempotencyKeys(client, {
    bridgeId: "bridge-1",
    candidateKeys: ["k1"],
  });
  assertEquals(res.ok, false);
  if (!res.ok) assertEquals(res.reason, "lookup_failed");
});

Deno.test("ignores rows with non-string idempotency_key", async () => {
  const { client } = makeClient([
    {
      data: [
        { idempotency_key: "k1" },
        { idempotency_key: 42 },
        { idempotency_key: null },
        { idempotency_key: "" },
      ],
      error: null,
    },
  ]);
  const res = await loadExistingPiIngestIdempotencyKeys(client, {
    bridgeId: "bridge-1",
    candidateKeys: ["k1", "k2"],
  });
  assert(res.ok);
  if (res.ok) {
    assertEquals(res.existingKeys.size, 1);
    assertEquals(res.existingKeys.has("k1"), true);
  }
});

Deno.test("missing client → lookup_failed", async () => {
  const res = await loadExistingPiIngestIdempotencyKeys(
    undefined as unknown as PiIngestIdempotencyLookupClient,
    { bridgeId: "bridge-1", candidateKeys: ["k1"] },
  );
  assertEquals(res.ok, false);
  if (!res.ok) assertEquals(res.reason, "lookup_failed");
});

Deno.test("helper file is SELECT-only (no insert/update/delete/rpc)", async () => {
  const src = await Deno.readTextFile(
    new URL("./idempotencyLookup.ts", import.meta.url),
  );
  for (const forbidden of [".insert(", ".upsert(", ".update(", ".delete(", ".rpc("]) {
    assertEquals(src.includes(forbidden), false, `must not contain ${forbidden}`);
  }
  // No console logging of key material.
  assertEquals(/console\./.test(src), false);
});
