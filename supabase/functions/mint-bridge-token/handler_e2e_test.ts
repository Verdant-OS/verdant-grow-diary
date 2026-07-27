import { assert, assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleRequest, type MintBridgeTokenClient } from "./index.ts";
import type { LovableSubscriptionRow } from "../_shared/lib/lib/entitlements/lovablePaddleAdapter.ts";

const ENDPOINT = "https://example.test/functions/v1/mint-bridge-token";
const NOW = new Date("2026-07-25T12:00:00.000Z");
const USER_ID = "11111111-1111-4111-8111-111111111111";
const TENT_ID = "22222222-2222-4222-8222-222222222222";
const JWT = "ey.test.user.jwt";

interface FakeState {
  subscriptionRows: LovableSubscriptionRow[];
  subscriptionError: unknown;
  subscriptionFilters: Array<{ column: string; value: string }>;
  insertedTokens: Array<Record<string, unknown>>;
  tentOwnerId: string | null;
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

function makeState(): FakeState {
  return {
    subscriptionRows: [paidSubscription()],
    subscriptionError: null,
    subscriptionFilters: [],
    insertedTokens: [],
    tentOwnerId: USER_ID,
  };
}

function makeClient(state: FakeState): MintBridgeTokenClient {
  return {
    auth: {
      getClaims: () =>
        Promise.resolve({
          data: { claims: { sub: USER_ID } },
          error: null,
        }),
    },
    from(table: string) {
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
        const builder = {
          select() {
            return builder;
          },
          eq() {
            return builder;
          },
          maybeSingle: () =>
            Promise.resolve({
              data: state.tentOwnerId ? { id: TENT_ID, user_id: state.tentOwnerId } : null,
              error: null,
            }),
        };
        return builder;
      }
      if (table === "bridge_tokens") {
        return {
          insert(row: Record<string, unknown>) {
            state.insertedTokens.push(row);
            return {
              select() {
                return {
                  single: () =>
                    Promise.resolve({
                      data: {
                        id: "33333333-3333-4333-8333-333333333333",
                        name: row.name,
                        token_prefix: row.token_prefix,
                        expires_at: row.expires_at,
                        created_at: NOW.toISOString(),
                      },
                      error: null,
                    }),
                };
              },
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

function post(body: Record<string, unknown> = {}): Request {
  return new Request(ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `Bearer ${JWT}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      tent_id: TENT_ID,
      name: "test bridge",
      ttl_days: 30,
      // Poison values prove billing input is ignored.
      plan_id: "founder_lifetime",
      capabilities: { liveSensors: true },
      ...body,
    }),
  });
}

async function body(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

Deno.test("mint bridge token allows a paid owner and preserves tent ownership", async () => {
  const state = makeState();
  const response = await handleRequest(post(), {
    supabase: makeClient(state),
    now: () => NOW,
    expectedBillingEnvironment: "live",
  });
  const payload = await body(response);

  assertEquals(response.status, 200);
  assertEquals(payload.ok, true);
  assertMatch(String(payload.token), /^vbt_[A-Za-z0-9_-]{40,}$/);
  assertEquals(state.insertedTokens.length, 1);
  assertEquals(state.insertedTokens[0].user_id, USER_ID);
  assertEquals(state.insertedTokens[0].tent_id, TENT_ID);
  assert(!JSON.stringify(state.insertedTokens[0]).includes(JWT));
  assertEquals(
    state.subscriptionFilters.some(
      (filter) => filter.column === "user_id" && filter.value === USER_ID,
    ),
    true,
  );
});

Deno.test("mint bridge token denies Free before ownership lookup or insert", async () => {
  const state = makeState();
  state.subscriptionRows = [];

  const response = await handleRequest(post(), {
    supabase: makeClient(state),
    now: () => NOW,
    expectedBillingEnvironment: "live",
  });

  assertEquals(response.status, 403);
  assertEquals((await body(response)).error, "upgrade_required");
  assertEquals(state.insertedTokens.length, 0);
});

Deno.test("mint bridge token denies a degraded paid row", async () => {
  const state = makeState();
  state.subscriptionRows = [
    paidSubscription({
      status: "canceled",
      current_period_end: "2026-07-24T12:00:00.000Z",
    }),
  ];

  const response = await handleRequest(post(), {
    supabase: makeClient(state),
    now: () => NOW,
    expectedBillingEnvironment: "live",
  });

  assertEquals(response.status, 403);
  assertEquals((await body(response)).error, "upgrade_required");
  assertEquals(state.insertedTokens.length, 0);
});

Deno.test("mint bridge token fails closed when entitlement lookup degrades", async () => {
  const state = makeState();
  state.subscriptionError = { message: "database unavailable" };

  const response = await handleRequest(post(), {
    supabase: makeClient(state),
    now: () => NOW,
    expectedBillingEnvironment: "live",
  });

  assertEquals(response.status, 503);
  assertEquals((await body(response)).error, "entitlement_lookup_failed");
  assertEquals(state.insertedTokens.length, 0);
});
