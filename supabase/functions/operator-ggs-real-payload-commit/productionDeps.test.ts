import { assertEquals, assertFalse } from "jsr:@std/assert@1";
import { buildOperatorGgsRealPayloadCommitDeps } from "./productionDeps.ts";
import type { GgsRealPayloadCommitRow } from "../_shared/lib/lib/ggsRealPayloadIngestRules.ts";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const TENT_ID = "33333333-3333-4333-8333-333333333333";
const BRIDGE_ID = "55555555-5555-4555-8555-555555555555";

function row(): GgsRealPayloadCommitRow {
  return {
    idempotency_key: "ggs:device:timestamp:ec",
    device_id: "device",
    metric: "ec",
    value: 1.2,
    captured_at: "2026-07-25T11:59:00.000Z",
    source: "live",
    quality: "ok",
    raw_payload: {
      source_app: "spider_farmer_ggs",
      sensor_id: "device",
      captured_at: "2026-07-25T11:59:00.000Z",
      payload: {},
    },
  };
}

Deno.test("production deps derive identity through auth.getUser", async () => {
  let getUserCalls = 0;
  const authed = {
    auth: {
      getUser: async () => {
        getUserCalls += 1;
        return { data: { user: { id: USER_ID } }, error: null };
      },
    },
  };
  const admin = {
    from: () => {
      throw new Error("unused");
    },
    rpc: async () => ({ data: null, error: null }),
  };
  const deps = buildOperatorGgsRealPayloadCommitDeps(authed, admin);
  assertEquals(await deps.getVerifiedUserId("Bearer ignored-by-adapter"), {
    ok: true,
    value: USER_ID,
  });
  assertEquals(getUserCalls, 1);
});

Deno.test("production deps query exact tent and bridge-token context columns", async () => {
  const calls: Array<{
    table: string;
    columns: string;
    column: string;
    value: string;
    limit: number;
  }> = [];
  const rows: Record<string, unknown> = {
    tents: [{ user_id: USER_ID }],
    bridge_tokens: [
      {
        id: BRIDGE_ID,
        user_id: USER_ID,
        tent_id: TENT_ID,
        expires_at: "2026-07-26T00:00:00.000Z",
        revoked_at: null,
      },
    ],
  };
  const admin = {
    from(table: string) {
      return {
        select(columns: string) {
          return {
            eq(column: string, value: string) {
              return {
                async limit(limit: number) {
                  calls.push({ table, columns, column, value, limit });
                  return { data: rows[table], error: null };
                },
              };
            },
          };
        },
      };
    },
    rpc: async () => ({ data: null, error: null }),
  };
  const deps = buildOperatorGgsRealPayloadCommitDeps(
    {
      auth: {
        getUser: async () => ({
          data: { user: { id: USER_ID } },
          error: null,
        }),
      },
    },
    admin,
  );
  assertEquals(await deps.loadTentAuthority(TENT_ID), {
    ok: true,
    value: { userId: USER_ID },
  });
  assertEquals(await deps.loadBridgeTokenContext(BRIDGE_ID), {
    ok: true,
    value: {
      id: BRIDGE_ID,
      userId: USER_ID,
      tentId: TENT_ID,
      expiresAt: "2026-07-26T00:00:00.000Z",
      revokedAt: null,
    },
  });
  assertEquals(calls, [
    {
      table: "tents",
      columns: "user_id",
      column: "id",
      value: TENT_ID,
      limit: 2,
    },
    {
      table: "bridge_tokens",
      columns: "id,user_id,tent_id,expires_at,revoked_at",
      column: "id",
      value: BRIDGE_ID,
      limit: 2,
    },
  ]);
});

Deno.test("production deps call the private RPC exactly once with server input", async () => {
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const admin = {
    from: () => {
      throw new Error("unused");
    },
    async rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({ name, args });
      return { data: [{ inserted: 1, rejected: 0 }], error: null };
    },
  };
  const deps = buildOperatorGgsRealPayloadCommitDeps(
    {
      auth: {
        getUser: async () => ({
          data: { user: { id: USER_ID } },
          error: null,
        }),
      },
    },
    admin,
  );
  const result = await deps.commitBatch({
    userId: USER_ID,
    bridgeId: BRIDGE_ID,
    tentId: TENT_ID,
    rows: [row()],
  });
  assertEquals(result, { ok: true, inserted: 1, rejected: 0 });
  assertEquals(rpcCalls.length, 1);
  assertEquals(rpcCalls[0], {
    name: "pi_ingest_commit_batch",
    args: {
      p_user_id: USER_ID,
      p_bridge_id: BRIDGE_ID,
      p_tent_id: TENT_ID,
      p_rows: [row()],
    },
  });
});

Deno.test("production deps sanitize private RPC errors", async () => {
  const admin = {
    from: () => {
      throw new Error("unused");
    },
    rpc: async () => ({
      data: null,
      error: { message: "secret table detail" },
    }),
  };
  const deps = buildOperatorGgsRealPayloadCommitDeps(
    {
      auth: {
        getUser: async () => ({
          data: { user: { id: USER_ID } },
          error: null,
        }),
      },
    },
    admin,
  );
  const result = await deps.commitBatch({
    userId: USER_ID,
    bridgeId: BRIDGE_ID,
    tentId: TENT_ID,
    rows: [row()],
  });
  assertEquals(result, { ok: false });
  assertFalse(JSON.stringify(result).includes("secret table detail"));
});
