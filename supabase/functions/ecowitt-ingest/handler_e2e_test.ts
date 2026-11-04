// Hermetic handler tests for the direct EcoWitt bridge-only endpoint.
// The injected admin client is an in-memory persistence boundary: no network,
// local Supabase process, or production secret is required.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleEcoWittIngestRequest, type EcoWittIngestAdminClient } from "./index.ts";
import { computeEcoWittPasskeyFingerprint } from "../_shared/ecowittPasskeyFingerprint.ts";
import type { BridgeTokenRow } from "../_shared/sensorIngestAuth.ts";
import type { LovableSubscriptionRow } from "../_shared/lib/lib/entitlements/lovablePaddleAdapter.ts";

const ENDPOINT = "https://example.test/functions/v1/ecowitt-ingest";
const NOW = new Date("2026-07-18T12:00:00.000Z");
const CAPTURED_AT = "2026-07-18T11:55:00.000Z";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const SPOOFED_USER_ID = "99999999-9999-4999-8999-999999999999";
const TENT_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_TENT_ID = "44444444-4444-4444-8444-444444444444";
const TOKEN_ID = "11111111-1111-4111-8111-111111111111";
const VALID_TOKEN = `vbt_${"b".repeat(40)}`;
const PASSKEY = "ecowitt-handler-test-passkey";

interface TentFixtureRow {
  id: string;
  user_id: string;
  is_archived: boolean;
  hardware_config: unknown;
}

interface FakeState {
  bridgeRow: BridgeTokenRow | null;
  tentRows: TentFixtureRow[];
  bridgeLookups: number;
  subscriptionRows: LovableSubscriptionRow[];
  subscriptionError: unknown;
  subscriptionFilters: Array<{ column: string; value: string }>;
  tentQueries: number;
  tentFilters: Array<{ column: string; value: unknown }>;
  persistedRows: Array<Record<string, unknown>>;
  rpcCalls: Array<{ name: string; args: Record<string, unknown> }>;
  insertError: { message: string } | null;
  rpcError: { message: string } | null;
}

function bridgeRow(overrides: Partial<BridgeTokenRow> = {}): BridgeTokenRow {
  return {
    id: TOKEN_ID,
    user_id: USER_ID,
    tent_id: TENT_ID,
    expires_at: "2026-07-18T13:00:00.000Z",
    revoked_at: null,
    ...overrides,
  };
}

function tentRow(id: string, fingerprint: string): TentFixtureRow {
  return {
    id,
    user_id: USER_ID,
    is_archived: false,
    hardware_config: {
      ecowitt: {
        passkey_fingerprint: fingerprint,
        air_channels: [1],
        soil_channels: [1],
      },
    },
  };
}

function paidSubscription(overrides: Partial<LovableSubscriptionRow> = {}): LovableSubscriptionRow {
  return {
    user_id: USER_ID,
    paddle_subscription_id: "sub_sensor_pro",
    paddle_customer_id: "ctm_sensor_pro",
    product_id: "verdant_pro",
    price_id: "pro_monthly",
    status: "active",
    current_period_start: "2026-07-01T00:00:00.000Z",
    current_period_end: "2026-08-01T00:00:00.000Z",
    cancel_at_period_end: false,
    environment: "live",
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeState(
  input: {
    row?: BridgeTokenRow | null;
    tents?: TentFixtureRow[];
  } = {},
): FakeState {
  return {
    bridgeRow: input.row === undefined ? bridgeRow() : input.row,
    tentRows: input.tents ?? [],
    bridgeLookups: 0,
    subscriptionRows: [paidSubscription()],
    subscriptionError: null,
    subscriptionFilters: [],
    tentQueries: 0,
    tentFilters: [],
    persistedRows: [],
    rpcCalls: [],
    insertError: null,
    rpcError: null,
  };
}

function makeAdmin(state: FakeState): EcoWittIngestAdminClient {
  const admin = {
    from(table: string) {
      if (table === "bridge_tokens") {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => {
                    state.bridgeLookups += 1;
                    return { data: state.bridgeRow, error: null };
                  },
                };
              },
            };
          },
        };
      }
      if (table === "billing_subscriptions") {
        const builder = {
          select() {
            return builder;
          },
          eq(column: string, value: string) {
            state.subscriptionFilters.push({ column, value });
            return builder;
          },
          limit() {
            return builder;
          },
          then(resolve: (result: { data: unknown[]; error: null }) => void) {
            resolve({ data: [], error: null });
          },
        };
        return builder;
      }
      if (table === "subscriptions") {
        const filters: Array<{ column: string; value: string }> = [];
        const builder = {
          select() {
            return builder;
          },
          eq(column: string, value: string) {
            filters.push({ column, value });
            state.subscriptionFilters.push({ column, value });
            return builder;
          },
          order() {
            return builder;
          },
          limit() {
            return builder;
          },
          then(
            resolve: (result: { data: LovableSubscriptionRow[] | null; error: unknown }) => void,
          ) {
            if (state.subscriptionError) {
              resolve({ data: null, error: state.subscriptionError });
              return;
            }
            resolve({
              data: state.subscriptionRows.filter((candidate) =>
                filters.every(
                  ({ column, value }) =>
                    String(candidate[column as keyof LovableSubscriptionRow]) === value,
                ),
              ),
              error: null,
            });
          },
        };
        return builder;
      }
      if (table === "tents") {
        const filters: Array<{ column: string; value: unknown }> = [];
        const query = {
          select() {
            return query;
          },
          eq(column: string, value: unknown) {
            filters.push({ column, value });
            state.tentFilters.push({ column, value });
            return query;
          },
          not() {
            return query;
          },
          then<TResult1 = unknown, TResult2 = never>(
            onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
            onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
          ) {
            state.tentQueries += 1;
            let rows = state.tentRows;
            for (const filter of filters) {
              rows = rows.filter(
                (row) =>
                  (row as unknown as Record<string, unknown>)[filter.column] === filter.value,
              );
            }
            const result = {
              data: rows.map(({ id, hardware_config }) => ({ id, hardware_config })),
              error: null,
            };
            return Promise.resolve(result).then(onfulfilled, onrejected);
          },
        };
        return query;
      }
      if (table === "sensor_readings") {
        return {
          upsert(rows: Array<Record<string, unknown>>) {
            state.persistedRows.push(...rows);
            return {
              select: async () => ({
                data: state.insertError
                  ? null
                  : rows.map((_, index) => ({ id: `ecowitt-reading-${index + 1}` })),
                error: state.insertError,
              }),
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ name, args });
      return { data: null, error: state.rpcError };
    },
  };
  return admin as unknown as EcoWittIngestAdminClient;
}

function payload() {
  return {
    PASSKEY,
    dateutc: "2026-07-18 11:55:00",
    temp1f: "77",
    humidity1: "55",
    soilmoisture1: "40",
    user_id: SPOOFED_USER_ID,
    tent_id: OTHER_TENT_ID,
  };
}

function post(token: string, url = ENDPOINT, body: Record<string, unknown> = payload()): Request {
  return new Request(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-verdant-tent-id": OTHER_TENT_ID,
    },
    body: JSON.stringify(body),
  });
}

async function responseBody(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

Deno.test(
  "direct EcoWitt handler rejects an ordinary user JWT before any lookup or write",
  async () => {
    const state = makeState();
    const response = await handleEcoWittIngestRequest(post("ey.fake.user.jwt"), {
      admin: makeAdmin(state),
      now: () => NOW,
      expectedBillingEnvironment: "live",
    });

    assertEquals(response.status, 403);
    assertEquals((await responseBody(response)).error, "bridge_required");
    assertEquals(state.bridgeLookups, 0);
    assertEquals(state.tentQueries, 0);
    assertEquals(state.persistedRows.length, 0);
  },
);

Deno.test(
  "direct EcoWitt handler accepts a tent-scoped bridge and persists honest provenance",
  async () => {
    const fingerprint = await computeEcoWittPasskeyFingerprint(PASSKEY);
    assert(fingerprint);
    const state = makeState({ tents: [tentRow(TENT_ID, fingerprint)] });
    const response = await handleEcoWittIngestRequest(post(VALID_TOKEN), {
      admin: makeAdmin(state),
      now: () => NOW,
      expectedBillingEnvironment: "live",
    });
    const body = await responseBody(response);

    assertEquals(response.status, 200);
    assertEquals(body.ok, true);
    assertEquals(body.accepted, true);
    assertEquals(body.auth, "bridge");
    assertEquals(body.inserted, state.persistedRows.length);
    assert(state.persistedRows.length > 0);
    for (const row of state.persistedRows) {
      assertEquals(row.user_id, USER_ID);
      assertEquals(row.tent_id, TENT_ID);
      assertEquals(row.source, "live");
      assertEquals(row.quality, "ok");
      assertEquals(row.captured_at, CAPTURED_AT);
      const raw = row.raw_payload as Record<string, unknown>;
      assertEquals(raw.provider, "ecowitt");
      assertEquals(raw.vendor, "ecowitt");
      assertEquals(raw.timestamp_source, "ecowitt_dateutc");
      assertEquals(raw.passkey_fingerprint, fingerprint);
      assertEquals(raw.metadata, {
        transport_source: "ecowitt",
        verdant_source: "live",
      });
      const serialized = JSON.stringify(row);
      assert(!serialized.includes(PASSKEY));
      assert(!serialized.includes(SPOOFED_USER_ID));
      assert(!serialized.includes(VALID_TOKEN));
    }
    assertEquals(state.rpcCalls.length, 1);
    assertEquals(state.rpcCalls[0].name, "bump_bridge_token_usage");
    assert(
      state.subscriptionFilters.some(
        (filter) => filter.column === "user_id" && filter.value === USER_ID,
      ),
    );
    assert(state.tentFilters.some((filter) => filter.column === "id" && filter.value === TENT_ID));
  },
);

Deno.test(
  "direct EcoWitt handler rejects an already-stale packet and never persists it as live",
  async () => {
    const fingerprint = await computeEcoWittPasskeyFingerprint(PASSKEY);
    assert(fingerprint);
    const state = makeState({ tents: [tentRow(TENT_ID, fingerprint)] });
    const stalePayload = {
      ...payload(),
      // One second beyond the canonical 30-minute freshness window.
      dateutc: "2026-07-18 11:29:59",
    };
    const response = await handleEcoWittIngestRequest(post(VALID_TOKEN, ENDPOINT, stalePayload), {
      admin: makeAdmin(state),
      now: () => NOW,
      expectedBillingEnvironment: "live",
    });
    const body = await responseBody(response);

    assertEquals(response.status, 200);
    assertEquals(body.accepted, false);
    assertEquals(body.inserted, 0);
    assertEquals(body.reason, "timestamp_stale");
    assertEquals(state.persistedRows.length, 0);
    assertEquals(state.rpcCalls.length, 0);
  },
);

Deno.test("direct EcoWitt handler rejects a revoked bridge without writing", async () => {
  const state = makeState({
    row: bridgeRow({ revoked_at: "2026-07-18T11:00:00.000Z" }),
  });
  const response = await handleEcoWittIngestRequest(post(VALID_TOKEN), {
    admin: makeAdmin(state),
    now: () => NOW,
    expectedBillingEnvironment: "live",
  });

  assertEquals(response.status, 401);
  assertEquals((await responseBody(response)).error, "token_revoked");
  assertEquals(state.tentQueries, 0);
  assertEquals(state.persistedRows.length, 0);
});

Deno.test("direct EcoWitt handler rejects an expired bridge without writing", async () => {
  const state = makeState({
    row: bridgeRow({ expires_at: "2026-07-18T11:59:59.999Z" }),
  });
  const response = await handleEcoWittIngestRequest(post(VALID_TOKEN), {
    admin: makeAdmin(state),
    now: () => NOW,
    expectedBillingEnvironment: "live",
  });

  assertEquals(response.status, 401);
  assertEquals((await responseBody(response)).error, "token_expired");
  assertEquals(state.tentQueries, 0);
  assertEquals(state.persistedRows.length, 0);
});

Deno.test(
  "direct EcoWitt handler cannot widen a bridge to another tent and writes nothing",
  async () => {
    const fingerprint = await computeEcoWittPasskeyFingerprint(PASSKEY);
    assert(fingerprint);
    // The matching gateway exists only under another tent. The fake applies the
    // handler's `.eq("id", bridgeTent)` filter exactly as PostgREST would.
    const state = makeState({ tents: [tentRow(OTHER_TENT_ID, fingerprint)] });
    const response = await handleEcoWittIngestRequest(
      post(VALID_TOKEN, `${ENDPOINT}?tent_id=${OTHER_TENT_ID}`),
      {
        admin: makeAdmin(state),
        now: () => NOW,
        expectedBillingEnvironment: "live",
      },
    );
    const body = await responseBody(response);

    assertEquals(response.status, 200);
    assertEquals(body.accepted, false);
    assertEquals(body.inserted, 0);
    assertEquals(state.persistedRows.length, 0);
    assertEquals(state.rpcCalls.length, 0);
    assert(state.tentFilters.some((filter) => filter.column === "id" && filter.value === TENT_ID));
    assert(
      !state.tentFilters.some((filter) => filter.column === "id" && filter.value === OTHER_TENT_ID),
    );
  },
);

Deno.test("direct EcoWitt handler denies a Free token owner before tent lookup", async () => {
  const state = makeState();
  state.subscriptionRows = [];

  const response = await handleEcoWittIngestRequest(post(VALID_TOKEN), {
    admin: makeAdmin(state),
    now: () => NOW,
    expectedBillingEnvironment: "live",
  });

  assertEquals(response.status, 403);
  assertEquals((await responseBody(response)).error, "upgrade_required");
  assertEquals(state.tentQueries, 0);
  assertEquals(state.persistedRows.length, 0);
});

Deno.test("direct EcoWitt handler denies a degraded paid token owner", async () => {
  const state = makeState();
  state.subscriptionRows = [
    paidSubscription({
      status: "canceled",
      current_period_end: "2026-07-17T12:00:00.000Z",
    }),
  ];

  const response = await handleEcoWittIngestRequest(post(VALID_TOKEN), {
    admin: makeAdmin(state),
    now: () => NOW,
    expectedBillingEnvironment: "live",
  });

  assertEquals(response.status, 403);
  assertEquals((await responseBody(response)).error, "upgrade_required");
  assertEquals(state.tentQueries, 0);
  assertEquals(state.persistedRows.length, 0);
});

Deno.test("direct EcoWitt handler fails closed when entitlement is unverifiable", async () => {
  const state = makeState();
  state.subscriptionError = { message: "database unavailable" };

  const response = await handleEcoWittIngestRequest(post(VALID_TOKEN), {
    admin: makeAdmin(state),
    now: () => NOW,
    expectedBillingEnvironment: "live",
  });

  assertEquals(response.status, 503);
  assertEquals((await responseBody(response)).error, "entitlement_lookup_failed");
  assertEquals(state.tentQueries, 0);
  assertEquals(state.persistedRows.length, 0);
});

Deno.test("direct EcoWitt handler returns 500 when the reading insert fails", async () => {
  const fingerprint = await computeEcoWittPasskeyFingerprint(PASSKEY);
  assert(fingerprint);
  const state = makeState({ tents: [tentRow(TENT_ID, fingerprint)] });
  state.insertError = { message: "duplicate key" };
  const errors: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(args.map((arg) => String(arg)).join(" "));
  };
  try {
    const response = await handleEcoWittIngestRequest(post(VALID_TOKEN), {
      admin: makeAdmin(state),
      now: () => NOW,
      expectedBillingEnvironment: "live",
    });
    assertEquals(response.status, 500);
    assertEquals((await responseBody(response)).error, "insert_failed");
    assert(errors.some((line) => line.includes("insert_failed")));
    assertEquals(state.rpcCalls.length, 0);
  } finally {
    console.error = original;
  }
});

Deno.test("direct EcoWitt handler returns 200 when bump_bridge_token_usage fails", async () => {
  const fingerprint = await computeEcoWittPasskeyFingerprint(PASSKEY);
  assert(fingerprint);
  const state = makeState({ tents: [tentRow(TENT_ID, fingerprint)] });
  state.rpcError = { message: "rpc failed" };
  const warnings: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map((arg) => String(arg)).join(" "));
  };
  try {
    const response = await handleEcoWittIngestRequest(post(VALID_TOKEN), {
      admin: makeAdmin(state),
      now: () => NOW,
      expectedBillingEnvironment: "live",
    });
    const body = await responseBody(response);
    assertEquals(response.status, 200);
    assertEquals(body.ok, true);
    assertEquals(body.accepted, true);
    assertEquals(state.rpcCalls.length, 2);
    assertEquals(state.rpcCalls[0].name, "bump_bridge_token_usage");
    assertEquals(state.rpcCalls[0].args.p_inserted, state.rpcCalls[1].args.p_inserted);
    assert(warnings.some((line) => line.includes("bump_bridge_token_usage_failed")));
  } finally {
    console.warn = original;
  }
});

Deno.test("direct EcoWitt handler records usage once when the bump retry succeeds", async () => {
  const fingerprint = await computeEcoWittPasskeyFingerprint(PASSKEY);
  assert(fingerprint);
  const state = makeState({ tents: [tentRow(TENT_ID, fingerprint)] });
  let attempts = 0;
  const admin = makeAdmin(state);
  const originalRpc = admin.rpc.bind(admin);
  admin.rpc = (name: string, args: Record<string, unknown>) => {
    attempts += 1;
    if (attempts === 1) return Promise.resolve({ data: null, error: { message: "transient" } });
    state.rpcError = null;
    return originalRpc(name, args);
  };
  const response = await handleEcoWittIngestRequest(post(VALID_TOKEN), {
    admin,
    now: () => NOW,
    expectedBillingEnvironment: "live",
  });
  const body = await responseBody(response);
  assertEquals(response.status, 200);
  assertEquals(body.accepted, true);
  assertEquals(attempts, 2);
  assertEquals(state.rpcCalls.length, 1);
  assertEquals(state.rpcCalls[0].args.p_inserted, body.inserted);
});
