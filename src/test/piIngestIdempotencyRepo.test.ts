/**
 * Unit + static guardrail tests for piIngestIdempotencyRepo.
 *
 * Covers:
 *  - empty-input shortcuts
 *  - RLS-respecting filter shape (user_id eq + idempotency_key in)
 *  - key chunking for both list and insert
 *  - dedupe + order preservation
 *  - error propagation
 *  - static safety guards (only touches pi_ingest_idempotency_keys,
 *    no service_role, no forbidden fields)
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  listExistingPiIngestIdempotencyKeys,
  insertPiIngestIdempotencyKeys,
  type PiIngestIdempotencyInsert,
  type PiIngestIdempotencySupabaseLike,
} from "@/lib/piIngestIdempotencyRepo";

// ----------------------- mock client builder -----------------------

type SelectCall = { user_id?: string; in_values?: readonly string[] };

function makeSelectClient(opts: {
  rows?: Array<{ idempotency_key: string }>;
  rowsPerChunk?: Array<Array<{ idempotency_key: string }>>;
  error?: { message: string };
}) {
  const calls: SelectCall[] = [];
  let chunkIdx = 0;
  const client: PiIngestIdempotencySupabaseLike = {
    from(table) {
      expect(table).toBe("pi_ingest_idempotency_keys");
      return {
        select(columns) {
          expect(columns).toBe("idempotency_key");
          return {
            eq(col, value) {
              expect(col).toBe("user_id");
              const call: SelectCall = { user_id: value };
              calls.push(call);
              return {
                async in(col2, values) {
                  expect(col2).toBe("idempotency_key");
                  call.in_values = values;
                  if (opts.error) return { data: null, error: opts.error };
                  const rows = opts.rowsPerChunk
                    ? opts.rowsPerChunk[chunkIdx++] ?? []
                    : opts.rows ?? [];
                  return { data: rows, error: null };
                },
              };
            },
          };
        },
        insert: vi.fn(),
      } as unknown as ReturnType<PiIngestIdempotencySupabaseLike["from"]>;
    },
  };
  return { client, calls };
}

function makeInsertClient(opts: { error?: { message: string } } = {}) {
  const inserted: PiIngestIdempotencyInsert[][] = [];
  const client: PiIngestIdempotencySupabaseLike = {
    from(table) {
      expect(table).toBe("pi_ingest_idempotency_keys");
      return {
        select: vi.fn(),
        async insert(rows: readonly PiIngestIdempotencyInsert[]) {
          inserted.push(rows.slice());
          if (opts.error) return { error: opts.error };
          return { error: null };
        },
      } as unknown as ReturnType<PiIngestIdempotencySupabaseLike["from"]>;
    },
  };
  return { client, inserted };
}

// ----------------------- listExistingPiIngestIdempotencyKeys -----------------------

describe("listExistingPiIngestIdempotencyKeys", () => {
  it("returns [] on empty keys without touching the client", async () => {
    const from = vi.fn();
    const out = await listExistingPiIngestIdempotencyKeys(
      { from } as unknown as PiIngestIdempotencySupabaseLike,
      { userId: "u1", keys: [] },
    );
    expect(out).toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });

  it("returns [] when all keys are empty/non-string after dedupe", async () => {
    const from = vi.fn();
    const out = await listExistingPiIngestIdempotencyKeys(
      { from } as unknown as PiIngestIdempotencySupabaseLike,
      { userId: "u1", keys: ["", "", ""] },
    );
    expect(out).toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });

  it("throws when userId is missing or empty", async () => {
    const from = vi.fn();
    const client = { from } as unknown as PiIngestIdempotencySupabaseLike;
    await expect(
      listExistingPiIngestIdempotencyKeys(client, {
        userId: "",
        keys: ["a"],
      }),
    ).rejects.toThrow(/userId is required/);
  });

  it("filters by user_id and idempotency_key (RLS-respecting shape)", async () => {
    const { client, calls } = makeSelectClient({
      rows: [{ idempotency_key: "k2" }],
    });
    const out = await listExistingPiIngestIdempotencyKeys(client, {
      userId: "user-xyz",
      keys: ["k1", "k2", "k3"],
    });
    expect(out).toEqual(["k2"]);
    expect(calls).toHaveLength(1);
    expect(calls[0].user_id).toBe("user-xyz");
    expect(calls[0].in_values).toEqual(["k1", "k2", "k3"]);
  });

  it("dedupes input keys and preserves input order in output", async () => {
    const { client, calls } = makeSelectClient({
      rows: [
        { idempotency_key: "b" },
        { idempotency_key: "a" },
      ],
    });
    const out = await listExistingPiIngestIdempotencyKeys(client, {
      userId: "u1",
      keys: ["a", "b", "a", "b", "c"],
    });
    expect(out).toEqual(["a", "b"]);
    expect(calls[0].in_values).toEqual(["a", "b", "c"]);
  });

  it("chunks lookups over 200 keys", async () => {
    const keys = Array.from({ length: 450 }, (_, i) => `k${i}`);
    const { client, calls } = makeSelectClient({
      rowsPerChunk: [
        [{ idempotency_key: "k0" }],
        [{ idempotency_key: "k250" }],
        [{ idempotency_key: "k400" }],
      ],
    });
    const out = await listExistingPiIngestIdempotencyKeys(client, {
      userId: "u1",
      keys,
    });
    expect(calls).toHaveLength(3);
    expect(calls[0].in_values?.length).toBe(200);
    expect(calls[1].in_values?.length).toBe(200);
    expect(calls[2].in_values?.length).toBe(50);
    expect(out).toEqual(["k0", "k250", "k400"]);
  });

  it("propagates select errors with the repo namespace", async () => {
    const { client } = makeSelectClient({ error: { message: "boom" } });
    await expect(
      listExistingPiIngestIdempotencyKeys(client, {
        userId: "u1",
        keys: ["a"],
      }),
    ).rejects.toThrow(
      /piIngestIdempotencyRepo\.listExistingPiIngestIdempotencyKeys: boom/,
    );
  });

  it("tolerates null data from the client", async () => {
    const client: PiIngestIdempotencySupabaseLike = {
      from() {
        return {
          select() {
            return {
              eq() {
                return {
                  async in() {
                    return { data: null, error: null };
                  },
                };
              },
            };
          },
          insert: vi.fn(),
        } as unknown as ReturnType<PiIngestIdempotencySupabaseLike["from"]>;
      },
    };
    const out = await listExistingPiIngestIdempotencyKeys(client, {
      userId: "u1",
      keys: ["a", "b"],
    });
    expect(out).toEqual([]);
  });
});

// ----------------------- insertPiIngestIdempotencyKeys -----------------------

function makeRow(i: number): PiIngestIdempotencyInsert {
  return {
    user_id: "u1",
    tent_id: "11111111-1111-1111-1111-111111111111",
    bridge_id: "bridge-a",
    device_id: `dev-${i}`,
    metric: "temperature_c",
    captured_at: new Date(0).toISOString(),
    idempotency_key: `key-${i}`,
  };
}

describe("insertPiIngestIdempotencyKeys", () => {
  it("returns immediately on empty rows without touching the client", async () => {
    const from = vi.fn();
    await insertPiIngestIdempotencyKeys(
      { from } as unknown as PiIngestIdempotencySupabaseLike,
      [],
    );
    expect(from).not.toHaveBeenCalled();
  });

  it("inserts a single chunk for small batches", async () => {
    const { client, inserted } = makeInsertClient();
    const rows = [makeRow(1), makeRow(2)];
    await insertPiIngestIdempotencyKeys(client, rows);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toEqual(rows);
  });

  it("chunks inserts over 200 rows", async () => {
    const { client, inserted } = makeInsertClient();
    const rows = Array.from({ length: 450 }, (_, i) => makeRow(i));
    await insertPiIngestIdempotencyKeys(client, rows);
    expect(inserted).toHaveLength(3);
    expect(inserted[0]).toHaveLength(200);
    expect(inserted[1]).toHaveLength(200);
    expect(inserted[2]).toHaveLength(50);
  });

  it("propagates insert errors with the repo namespace", async () => {
    const { client } = makeInsertClient({ error: { message: "denied" } });
    await expect(
      insertPiIngestIdempotencyKeys(client, [makeRow(1)]),
    ).rejects.toThrow(
      /piIngestIdempotencyRepo\.insertPiIngestIdempotencyKeys: denied/,
    );
  });
});

// ----------------------- static safety guards -----------------------

describe("piIngestIdempotencyRepo static safety", () => {
  const src = readFileSync(
    resolve(__dirname, "../lib/piIngestIdempotencyRepo.ts"),
    "utf8",
  );

  it("references only the pi_ingest_idempotency_keys table", () => {
    const forbiddenTables = [
      "sensor_readings",
      "alerts",
      "alert_events",
      "action_queue",
      "action_queue_events",
      "grow_events",
      "watering_events",
      "feeding_events",
      "environment_events",
      "plants",
      "tents",
      "grows",
      "profiles",
    ];
    for (const t of forbiddenTables) {
      expect(src.includes(`"${t}"`)).toBe(false);
    }
    expect(src).toContain('"pi_ingest_idempotency_keys"');
  });

  it("does not use service_role, secrets, or raw SQL", () => {
    expect(src).not.toMatch(/service_role/i);
    expect(src).not.toMatch(/SERVICE_ROLE/);
    expect(src).not.toMatch(/\.rpc\(/);
    expect(src).not.toMatch(/raw_payload/);
    expect(src).not.toMatch(/signature/);
    expect(src).not.toMatch(/\bsecret\b/);
  });

  it("does not perform delete or update operations", () => {
    expect(src).not.toMatch(/\.delete\(/);
    expect(src).not.toMatch(/\.update\(/);
    expect(src).not.toMatch(/\.upsert\(/);
  });

  it("does not import the live Supabase client at module scope", () => {
    expect(src).not.toMatch(
      /from\s+["']@\/integrations\/supabase\/client["']/,
    );
  });
});
