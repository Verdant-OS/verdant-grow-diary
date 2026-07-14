/**
 * Milestone 5 — actionResponseMemoryService read contract.
 *
 * Uses an injected fake client that records every call. Proves: owner/RLS
 * query shape, batched action lookup, no N+1, missing related action,
 * missing photo/sensor objects, query failure, legacy rows, no write
 * methods invoked, and no raw_payload selected.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  loadActionResponseMemories,
  RESPONSE_ROW_LIMIT,
  type AuthenticatedSupabaseClient,
} from "../lib/actionResponseMemoryService";

interface RecordedQuery {
  table: string;
  select: string;
  filters: Array<[string, unknown]>;
  limit: number | null;
}

function makeFakeClient(data: {
  diaryRows?: unknown[];
  actionRows?: unknown[];
  sensorRows?: unknown[];
  failDiary?: boolean;
  failActions?: boolean;
  failSensors?: boolean;
}) {
  const queries: RecordedQuery[] = [];
  const writes: string[] = [];

  function makeBuilder(table: string) {
    const q: RecordedQuery = { table, select: "", filters: [], limit: null };
    queries.push(q);
    const builder: Record<string, unknown> = {
      select(cols: string) {
        q.select = cols;
        return builder;
      },
      eq(col: string, v: unknown) {
        q.filters.push([`eq:${col}`, v]);
        return builder;
      },
      contains(col: string, v: unknown) {
        q.filters.push([`contains:${col}`, v]);
        return builder;
      },
      in(col: string, v: unknown) {
        q.filters.push([`in:${col}`, v]);
        return builder;
      },
      order() {
        return builder;
      },
      limit(n: number) {
        q.limit = n;
        return builder;
      },
      insert() {
        writes.push(`${table}.insert`);
        return builder;
      },
      update() {
        writes.push(`${table}.update`);
        return builder;
      },
      delete() {
        writes.push(`${table}.delete`);
        return builder;
      },
      upsert() {
        writes.push(`${table}.upsert`);
        return builder;
      },
      then(onFulfilled: (v: { data: unknown; error: unknown }) => unknown) {
        let result: { data: unknown; error: unknown };
        if (table === "diary_entries") {
          result = data.failDiary
            ? { data: null, error: { message: "boom" } }
            : { data: data.diaryRows ?? [], error: null };
        } else if (table === "action_queue") {
          result = data.failActions
            ? { data: null, error: { message: "boom" } }
            : { data: data.actionRows ?? [], error: null };
        } else {
          result = data.failSensors
            ? { data: null, error: { message: "boom" } }
            : { data: data.sensorRows ?? [], error: null };
        }
        return Promise.resolve(onFulfilled(result));
      },
    };
    return builder;
  }

  const client = {
    from(table: string) {
      return makeBuilder(table);
    },
  } as unknown as AuthenticatedSupabaseClient;

  return { client, queries, writes };
}

const RESPONSE_ROW = {
  id: "row-1",
  grow_id: "grow-1",
  tent_id: "tent-1",
  plant_id: "plant-1",
  entry_at: "2026-07-02T13:00:00Z",
  details: {
    event_type: "action_followup",
    action_queue_id: "act-1",
    outcome: "improved",
    observed_at: "2026-07-02T12:00:00Z",
    note: "Looking better.",
    photo_reference: "storage://diary-photos/u1/g1/plant-profiles/p1/a.jpg",
    sensor_snapshot_id: "snap-1",
  },
};

const ACTION_ROW = {
  id: "act-1",
  grow_id: "grow-1",
  tent_id: "tent-1",
  plant_id: "plant-1",
  status: "completed",
  suggested_change: "Vent more at night",
  completed_at: "2026-07-01T12:00:00Z",
};

describe("query shape (owner/RLS-scoped)", () => {
  it("1. scopes the diary read by grow (and plant when given) with a bounded limit", async () => {
    const { client, queries } = makeFakeClient({ diaryRows: [RESPONSE_ROW], actionRows: [ACTION_ROW] });
    await loadActionResponseMemories({ growId: "grow-1", plantId: "plant-1" }, { supabase: client });
    const diary = queries.find((q) => q.table === "diary_entries")!;
    expect(diary.filters).toContainEqual(["eq:grow_id", "grow-1"]);
    expect(diary.filters).toContainEqual(["eq:plant_id", "plant-1"]);
    expect(diary.filters.some(([k, v]) =>
      k === "contains:details" && (v as { event_type?: string }).event_type === "action_followup",
    )).toBe(true);
    expect(diary.limit).toBe(RESPONSE_ROW_LIMIT);
    // Owner identity is never a client-supplied filter — RLS owns it.
    expect(diary.filters.some(([k]) => k.includes("user_id"))).toBe(false);
  });

  it("2. batches the action lookup with one .in() query", async () => {
    const rows = [
      RESPONSE_ROW,
      { ...RESPONSE_ROW, id: "row-2", details: { ...RESPONSE_ROW.details, action_queue_id: "act-2", sensor_snapshot_id: null } },
    ];
    const { client, queries } = makeFakeClient({
      diaryRows: rows,
      actionRows: [ACTION_ROW, { ...ACTION_ROW, id: "act-2" }],
    });
    const result = await loadActionResponseMemories({ growId: "grow-1" }, { supabase: client });
    expect(result.status).toBe("ok");
    const actionQueries = queries.filter((q) => q.table === "action_queue");
    expect(actionQueries).toHaveLength(1);
    const inFilter = actionQueries[0].filters.find(([k]) => k === "in:id")![1] as string[];
    expect([...inFilter].sort()).toEqual(["act-1", "act-2"]);
  });

  it("3. no N+1: query count is constant regardless of response count", async () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      ...RESPONSE_ROW,
      id: `row-${i}`,
      details: { ...RESPONSE_ROW.details, action_queue_id: `act-${i}`, sensor_snapshot_id: `snap-${i}` },
    }));
    const actions = Array.from({ length: 20 }, (_, i) => ({ ...ACTION_ROW, id: `act-${i}` }));
    const { client, queries } = makeFakeClient({ diaryRows: many, actionRows: actions, sensorRows: [] });
    await loadActionResponseMemories({ growId: "grow-1" }, { supabase: client });
    // 1 diary + 1 action + 1 sensor — never per-row.
    expect(queries).toHaveLength(3);
  });

  it("4. missing related action → response is excluded, load still ok", async () => {
    const { client } = makeFakeClient({ diaryRows: [RESPONSE_ROW], actionRows: [] });
    const result = await loadActionResponseMemories({ growId: "grow-1" }, { supabase: client });
    expect(result).toEqual({ status: "ok", memories: [] });
  });

  it("5. missing photo object is a rules-layer concern — malformed refs degrade, load ok", async () => {
    const row = {
      ...RESPONSE_ROW,
      details: { ...RESPONSE_ROW.details, photo_reference: "blob:not-durable", sensor_snapshot_id: null },
    };
    const { client } = makeFakeClient({ diaryRows: [row], actionRows: [ACTION_ROW] });
    const result = await loadActionResponseMemories({ growId: "grow-1" }, { supabase: client });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.memories[0].photo.state).toBe("unavailable");
    expect(result.memories[0].response.outcome).toBe("improved");
  });

  it("6. missing sensor snapshot row → unavailable evidence, outcome preserved", async () => {
    const { client } = makeFakeClient({ diaryRows: [RESPONSE_ROW], actionRows: [ACTION_ROW], sensorRows: [] });
    const result = await loadActionResponseMemories({ growId: "grow-1" }, { supabase: client });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.memories[0].sensor.state).toBe("unavailable");
    expect(result.memories[0].response.outcome).toBe("improved");
  });

  it("6b. sensor lookup failure degrades to unavailable without failing the load", async () => {
    const { client } = makeFakeClient({
      diaryRows: [RESPONSE_ROW],
      actionRows: [ACTION_ROW],
      failSensors: true,
    });
    const result = await loadActionResponseMemories({ growId: "grow-1" }, { supabase: client });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.memories[0].sensor.state).toBe("unavailable");
    expect(result.memories[0].limitations).toContain("sensor_lookup_unavailable");
  });

  it("7. diary or action query failure → sanitized failure result", async () => {
    const failed = makeFakeClient({ failDiary: true });
    expect(await loadActionResponseMemories({ growId: "grow-1" }, { supabase: failed.client }))
      .toEqual({ status: "failed", reason: "query_failed" });
    const failedActions = makeFakeClient({ diaryRows: [RESPONSE_ROW], failActions: true });
    expect(await loadActionResponseMemories({ growId: "grow-1" }, { supabase: failedActions.client }))
      .toEqual({ status: "failed", reason: "query_failed" });
  });

  it("8. legacy marker rows load fine and produce no canonical memory", async () => {
    const marker = {
      id: "marker-1",
      grow_id: "grow-1",
      tent_id: "tent-1",
      plant_id: "plant-1",
      entry_at: "2026-07-01T12:05:00Z",
      details: {
        event_type: "action_followup",
        action_queue_id: "act-1",
        followup_kind: "24h_recheck",
      },
    };
    const { client, queries } = makeFakeClient({ diaryRows: [marker], actionRows: [ACTION_ROW] });
    const result = await loadActionResponseMemories({ growId: "grow-1" }, { supabase: client });
    expect(result).toEqual({ status: "ok", memories: [] });
    // Candidate filtering happens before the action batch — no wasted query.
    expect(queries.filter((q) => q.table === "action_queue")).toHaveLength(0);
  });

  it("9. no write methods are ever invoked", async () => {
    const { client, writes } = makeFakeClient({
      diaryRows: [RESPONSE_ROW],
      actionRows: [ACTION_ROW],
      sensorRows: [{ id: "snap-1", tent_id: "tent-1", source: "manual", captured_at: "2026-07-02T11:00:00Z" }],
    });
    await loadActionResponseMemories({ growId: "grow-1" }, { supabase: client });
    expect(writes).toEqual([]);
  });

  it("10. no raw_payload (or any secret column) is selected", async () => {
    const { client, queries } = makeFakeClient({
      diaryRows: [RESPONSE_ROW],
      actionRows: [ACTION_ROW],
      sensorRows: [{ id: "snap-1", tent_id: "tent-1", source: "manual", captured_at: "2026-07-02T11:00:00Z" }],
    });
    await loadActionResponseMemories({ growId: "grow-1" }, { supabase: client });
    for (const q of queries) {
      expect(q.select).not.toContain("raw_payload");
      expect(q.select).not.toContain("*");
      expect(q.select.toLowerCase()).not.toMatch(/token|secret|service_role/);
    }
  });
});

describe("static read-only contract", () => {
  const SRC = readFileSync(
    resolve(__dirname, "../lib/actionResponseMemoryService.ts"),
    "utf8",
  );
  it("contains no write/RPC/storage/Edge/AI surfaces", () => {
    expect(SRC).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\bupsert\(/);
    expect(SRC).not.toMatch(/\.rpc\(/);
    expect(SRC).not.toMatch(/functions\.invoke/);
    expect(SRC).not.toMatch(/storage\.(from|upload)/);
    expect(SRC).not.toMatch(/openai|anthropic|gemini/i);
    expect(SRC).not.toMatch(/service_role/i);
    expect(SRC).not.toMatch(/raw_payload/);
    expect(SRC).not.toMatch(/user_id\s*[:=]/);
  });
});
