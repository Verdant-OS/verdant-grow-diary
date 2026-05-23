import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  commitPiIngestBatch,
  PI_INGEST_COMMIT_BATCH_RPC,
  type PiIngestCommitBatchClient,
  type PiIngestCommitBatchInput,
  type PiIngestCommitBatchResponse,
  type PiIngestCommitBatchRow,
} from "./commitBatch.ts";

type Call = {
  fn: string;
  args: Record<string, unknown>;
};

function makeClient(
  responses: Array<PiIngestCommitBatchResponse | Error>,
): { client: PiIngestCommitBatchClient; calls: Call[] } {
  const calls: Call[] = [];
  let i = 0;
  const client: PiIngestCommitBatchClient = {
    rpc(fn, args) {
      calls.push({ fn, args: args as unknown as Record<string, unknown> });
      const r = responses[i++];
      if (r instanceof Error) return Promise.reject(r);
      return Promise.resolve(r ?? { data: [{ inserted: 0, rejected: 0 }], error: null });
    },
  };
  return { client, calls };
}

const USER = "user-1";
const BRIDGE = "bridge-1";
const TENT = "tent-1";

function makeRow(overrides: Partial<{
  idempotencyKey: string;
  device_id: string;
  metric: string;
  captured_at: string;
  value: number;
}> = {}): PiIngestCommitBatchRow {
  const idempotencyKey = overrides.idempotencyKey ?? "key-1";
  const device_id = overrides.device_id ?? "dev-1";
  const metric = overrides.metric ?? "temperature_c";
  const captured_at = overrides.captured_at ?? "2026-05-23T00:00:00Z";
  const value = overrides.value ?? 21.5;
  return {
    idempotencyKey,
    sensor: {
      tent_id: TENT,
      metric,
      value,
      source: "pi_bridge",
      quality: "ok",
      device_id,
      captured_at,
      raw_payload: { x: 1 },
    },
    idempotency: {
      tent_id: TENT,
      bridge_id: BRIDGE,
      device_id,
      metric,
      captured_at,
      idempotency_key: idempotencyKey,
    },
  };
}

function makeInput(rows: PiIngestCommitBatchRow[]): PiIngestCommitBatchInput {
  return { userId: USER, bridgeId: BRIDGE, tentId: TENT, rows };
}

Deno.test("missing/invalid ids → missing_input, no RPC call", async () => {
  const { client, calls } = makeClient([]);
  const rows = [makeRow()];

  for (const bad of ["", "   ", null as unknown as string, undefined as unknown as string]) {
    for (const field of ["userId", "bridgeId", "tentId"] as const) {
      const input = makeInput(rows);
      (input as Record<string, unknown>)[field] = bad;
      const res = await commitPiIngestBatch(client, input);
      assertEquals(res.ok, false);
      if (!res.ok) assertEquals(res.reason, "missing_input");
    }
  }
  assertEquals(calls.length, 0);
});

Deno.test("empty rows → missing_input, no RPC call", async () => {
  const { client, calls } = makeClient([]);
  const res = await commitPiIngestBatch(client, makeInput([]));
  assertEquals(res.ok, false);
  if (!res.ok) assertEquals(res.reason, "missing_input");
  assertEquals(calls.length, 0);
});

Deno.test("row tent_id / bridge_id mismatch → missing_input", async () => {
  const { client, calls } = makeClient([]);

  const r1 = makeRow();
  r1.sensor.tent_id = "other-tent";
  let res = await commitPiIngestBatch(client, makeInput([r1]));
  assertEquals(res.ok, false);
  if (!res.ok) assertEquals(res.reason, "missing_input");

  const r2 = makeRow();
  r2.idempotency.tent_id = "other-tent";
  res = await commitPiIngestBatch(client, makeInput([r2]));
  assertEquals(res.ok, false);

  const r3 = makeRow();
  r3.idempotency.bridge_id = "other-bridge";
  res = await commitPiIngestBatch(client, makeInput([r3]));
  assertEquals(res.ok, false);

  assertEquals(calls.length, 0);
});

Deno.test("idempotencyKey must equal idempotency.idempotency_key", async () => {
  const { client, calls } = makeClient([]);
  const row = makeRow();
  row.idempotency.idempotency_key = "different";
  const res = await commitPiIngestBatch(client, makeInput([row]));
  assertEquals(res.ok, false);
  if (!res.ok) assertEquals(res.reason, "missing_input");
  assertEquals(calls.length, 0);
});

Deno.test("non-finite value or wrong source → missing_input", async () => {
  const { client, calls } = makeClient([]);

  const r1 = makeRow();
  (r1.sensor as { value: number }).value = Number.NaN;
  let res = await commitPiIngestBatch(client, makeInput([r1]));
  assertEquals(res.ok, false);

  const r2 = makeRow();
  (r2.sensor as { source: string }).source = "manual" as "pi_bridge";
  res = await commitPiIngestBatch(client, makeInput([r2]));
  assertEquals(res.ok, false);

  assertEquals(calls.length, 0);
});

Deno.test("happy path calls RPC with correct args and returns counts", async () => {
  const { client, calls } = makeClient([
    { data: [{ inserted: 2, rejected: 1 }], error: null },
  ]);
  const rows = [
    makeRow({ idempotencyKey: "k-a", device_id: "d-a" }),
    makeRow({ idempotencyKey: "k-b", device_id: "d-b", metric: "humidity_pct", value: 55 }),
    makeRow({ idempotencyKey: "k-c", device_id: "d-c", metric: "vpd_kpa", value: 1.1 }),
  ];

  const res = await commitPiIngestBatch(client, makeInput(rows));
  assert(res.ok);
  if (res.ok) {
    assertEquals(res.inserted, 2);
    assertEquals(res.rejected, 1);
  }

  assertEquals(calls.length, 1);
  const call = calls[0];
  assertEquals(call.fn, PI_INGEST_COMMIT_BATCH_RPC);
  assertEquals(call.args.p_user_id, USER);
  assertEquals(call.args.p_bridge_id, BRIDGE);
  assertEquals(call.args.p_tent_id, TENT);
  const pRows = call.args.p_rows as Array<Record<string, unknown>>;
  assertEquals(pRows.length, 3);
  assertEquals(pRows[0].idempotency_key, "k-a");
  assertEquals(pRows[0].device_id, "d-a");
  assertEquals(pRows[0].metric, "temperature_c");
  assertEquals(pRows[0].source, "pi_bridge");
  assertEquals(pRows[0].quality, "ok");
  assertEquals(pRows[0].captured_at, "2026-05-23T00:00:00Z");
  assertEquals(pRows[0].value, 21.5);
  assertEquals(pRows[1].metric, "humidity_pct");
  assertEquals(pRows[2].metric, "vpd_kpa");
});

Deno.test("defaults quality to 'ok' and raw_payload to null when omitted", async () => {
  const { client, calls } = makeClient([
    { data: [{ inserted: 1, rejected: 0 }], error: null },
  ]);
  const row = makeRow();
  delete (row.sensor as { quality?: string | null }).quality;
  delete (row.sensor as { raw_payload?: unknown }).raw_payload;
  const res = await commitPiIngestBatch(client, makeInput([row]));
  assert(res.ok);
  const pRows = calls[0].args.p_rows as Array<Record<string, unknown>>;
  assertEquals(pRows[0].quality, "ok");
  assertEquals(pRows[0].raw_payload, null);
});

Deno.test("RPC error → commit_failed with generic message (no raw text leak)", async () => {
  const secret = "PG-ERROR-SECRET-XYZ";
  const { client } = makeClient([
    { data: null, error: { message: secret } },
  ]);
  const res = await commitPiIngestBatch(client, makeInput([makeRow()]));
  assertEquals(res.ok, false);
  if (!res.ok) {
    assertEquals(res.reason, "commit_failed");
    assert(!res.message.includes(secret));
  }
});

Deno.test("thrown error → commit_failed (no leak)", async () => {
  const { client } = makeClient([new Error("boom-secret")]);
  const res = await commitPiIngestBatch(client, makeInput([makeRow()]));
  assertEquals(res.ok, false);
  if (!res.ok) {
    assertEquals(res.reason, "commit_failed");
    assert(!res.message.includes("boom-secret"));
  }
});

Deno.test("malformed RPC response shapes → commit_failed", async () => {
  for (const bad of [
    { data: null, error: null },
    { data: "nope", error: null },
    { data: [], error: null },
    { data: [{ inserted: "x", rejected: 0 }], error: null },
    { data: [{ inserted: -1, rejected: 0 }], error: null },
    { data: [{ inserted: 1 }], error: null },
    { data: [{ inserted: 1, rejected: 0 }, { inserted: 1, rejected: 0 }], error: null },
  ] as PiIngestCommitBatchResponse[]) {
    const { client } = makeClient([bad]);
    const res = await commitPiIngestBatch(client, makeInput([makeRow()]));
    assertEquals(res.ok, false);
    if (!res.ok) assertEquals(res.reason, "commit_failed");
  }
});

Deno.test("accepts single-object data shape (not wrapped in array)", async () => {
  const { client } = makeClient([
    { data: { inserted: 3, rejected: 0 }, error: null },
  ]);
  const res = await commitPiIngestBatch(client, makeInput([makeRow()]));
  assert(res.ok);
  if (res.ok) {
    assertEquals(res.inserted, 3);
    assertEquals(res.rejected, 0);
  }
});

Deno.test("missing client → commit_failed, no throw", async () => {
  const res = await commitPiIngestBatch(
    null as unknown as PiIngestCommitBatchClient,
    makeInput([makeRow()]),
  );
  assertEquals(res.ok, false);
  if (!res.ok) assertEquals(res.reason, "commit_failed");
});
