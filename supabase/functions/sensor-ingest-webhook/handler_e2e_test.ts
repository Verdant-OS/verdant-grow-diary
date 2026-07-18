// Hermetic handler tests for the bridge-only sensor-ingest-webhook boundary.
// A minimal injected admin client captures the exact rows handed to
// persistence; no network or production secrets are used.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleRequest, type SensorWebhookAdminClient } from "./index.ts";
import type { BridgeTokenRow } from "./auth.ts";

const ENDPOINT = "https://example.test/functions/v1/sensor-ingest-webhook";
const NOW = new Date("2026-07-18T12:00:00.000Z");
const CAPTURED_AT = "2026-07-18T11:55:00.000Z";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const SPOOFED_USER_ID = "99999999-9999-4999-8999-999999999999";
const TENT_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_TENT_ID = "44444444-4444-4444-8444-444444444444";
const TOKEN_ID = "11111111-1111-4111-8111-111111111111";
const VALID_TOKEN = `vbt_${"a".repeat(40)}`;

interface FakeState {
  bridgeRow: BridgeTokenRow | null;
  bridgeLookups: number;
  persistedRows: Array<Record<string, unknown>>;
  auditRows: Array<Record<string, unknown>>;
  rpcCalls: Array<{ name: string; args: Record<string, unknown> }>;
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

function makeState(row: BridgeTokenRow | null = bridgeRow()): FakeState {
  return {
    bridgeRow: row,
    bridgeLookups: 0,
    persistedRows: [],
    auditRows: [],
    rpcCalls: [],
  };
}

function makeAdmin(state: FakeState): SensorWebhookAdminClient {
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
      if (table === "sensor_readings") {
        return {
          upsert(rows: Array<Record<string, unknown>>) {
            state.persistedRows.push(...rows);
            return {
              select: async () => ({
                data: rows.map((_, index) => ({ id: `reading-${index + 1}` })),
                error: null,
              }),
            };
          },
        };
      }
      if (table === "sensor_ingest_audit_log") {
        return {
          insert: async (row: Record<string, unknown>) => {
            state.auditRows.push(row);
            return { data: null, error: null };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ name, args });
      return { data: null, error: null };
    },
  };
  return admin as unknown as SensorWebhookAdminClient;
}

function payload(tentId = TENT_ID) {
  return {
    tent_id: tentId,
    source: "ecowitt",
    vendor: "ecowitt_windows_testbench",
    captured_at: CAPTURED_AT,
    user_id: SPOOFED_USER_ID,
    metrics: {
      temp_f: 77,
      humidity_percent: 55,
      soil_moisture_pct: 40,
    },
    metadata: {
      device_id: "GW1200B-test",
      verdant_source: "live",
      confidence: "physical",
      raw_payload: {
        stationtype: "GW1200B-test",
        dateutc: "2026-07-18 11:55:00",
      },
    },
  };
}

function post(token: string, body = payload()): Request {
  return new Request(ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      origin: "https://verdantgrowdiary.com",
      "idempotency-key": "handler-e2e-001",
    },
    body: JSON.stringify(body),
  });
}

async function responseBody(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

Deno.test(
  "sensor webhook handler rejects an ordinary user JWT before any lookup or write",
  async () => {
    const state = makeState();
    const response = await handleRequest(post("ey.fake.user.jwt"), {
      admin: makeAdmin(state),
      now: () => NOW,
    });

    assertEquals(response.status, 403);
    assertEquals((await responseBody(response)).error, "bridge_required");
    assertEquals(state.bridgeLookups, 0);
    assertEquals(state.persistedRows.length, 0);
  },
);

Deno.test(
  "sensor webhook handler accepts a tent-scoped bridge and persists honest provenance",
  async () => {
    const state = makeState();
    const response = await handleRequest(post(VALID_TOKEN), {
      admin: makeAdmin(state),
      now: () => NOW,
    });
    const body = await responseBody(response);

    assertEquals(response.status, 200);
    assertEquals(body.ok, true);
    assertEquals(body.auth, "bridge");
    assertEquals(body.inserted, 3);
    assertEquals(state.persistedRows.length, 3);
    for (const row of state.persistedRows) {
      assertEquals(row.user_id, USER_ID);
      assertEquals(row.tent_id, TENT_ID);
      assertEquals(row.source, "live");
      assertEquals(row.quality, "ok");
      assertEquals(row.captured_at, CAPTURED_AT);
      const raw = row.raw_payload as Record<string, unknown>;
      assertEquals(raw.vendor, "ecowitt_windows_testbench");
      const metadata = raw.metadata as Record<string, unknown>;
      assertEquals(metadata.transport_source, "ecowitt");
      assertEquals(metadata.verdant_source, "live");
      assertEquals(metadata.reported_verdant_source, "live");
      const serialized = JSON.stringify(row);
      assert(!serialized.includes(SPOOFED_USER_ID));
      assert(!serialized.includes(VALID_TOKEN));
    }
    assertEquals(state.rpcCalls.length, 1);
    assertEquals(state.rpcCalls[0].name, "bump_bridge_token_usage");
    assertEquals(state.auditRows.length, 1);
  },
);

Deno.test(
  "sensor webhook handler cannot duplicate a fresh event when it is replayed stale",
  async () => {
    const state = makeState();
    const admin = makeAdmin(state);

    const freshResponse = await handleRequest(post(VALID_TOKEN), {
      admin,
      now: () => NOW,
    });
    assertEquals(freshResponse.status, 200);
    assertEquals((await responseBody(freshResponse)).inserted, 3);
    assertEquals(state.persistedRows.length, 3);
    assertEquals(state.rpcCalls.length, 1);
    assertEquals(state.auditRows.length, 1);

    const staleResponse = await handleRequest(post(VALID_TOKEN), {
      admin,
      now: () => new Date("2026-07-18T12:26:00.000Z"),
    });
    const staleBody = await responseBody(staleResponse);

    assertEquals(staleResponse.status, 200);
    assertEquals(staleBody.ok, true);
    assertEquals(staleBody.accepted, false);
    assertEquals(staleBody.inserted, 0);
    assertEquals(staleBody.reason, "timestamp_stale");
    assertEquals(staleBody.auth, "bridge");
    // No second persistence, usage bump, or audit write may occur.
    assertEquals(state.persistedRows.length, 3);
    assertEquals(state.rpcCalls.length, 1);
    assertEquals(state.auditRows.length, 1);
  },
);

Deno.test("sensor webhook handler rejects a revoked bridge without writing", async () => {
  const state = makeState(bridgeRow({ revoked_at: "2026-07-18T11:00:00.000Z" }));
  const response = await handleRequest(post(VALID_TOKEN), {
    admin: makeAdmin(state),
    now: () => NOW,
  });

  assertEquals(response.status, 401);
  assertEquals((await responseBody(response)).error, "token_revoked");
  assertEquals(state.persistedRows.length, 0);
});

Deno.test("sensor webhook handler rejects an expired bridge without writing", async () => {
  const state = makeState(bridgeRow({ expires_at: "2026-07-18T11:59:59.999Z" }));
  const response = await handleRequest(post(VALID_TOKEN), {
    admin: makeAdmin(state),
    now: () => NOW,
  });

  assertEquals(response.status, 401);
  assertEquals((await responseBody(response)).error, "token_expired");
  assertEquals(state.persistedRows.length, 0);
});

Deno.test("sensor webhook handler denies a payload for another tent with zero writes", async () => {
  const state = makeState();
  const response = await handleRequest(post(VALID_TOKEN, payload(OTHER_TENT_ID)), {
    admin: makeAdmin(state),
    now: () => NOW,
  });

  assertEquals(response.status, 403);
  assertEquals((await responseBody(response)).error, "forbidden_tent");
  assertEquals(state.persistedRows.length, 0);
  assertEquals(state.rpcCalls.length, 0);
  assertEquals(state.auditRows.length, 0);
});
