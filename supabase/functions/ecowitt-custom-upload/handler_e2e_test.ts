// Hermetic handler tests for the customized-upload Edge entrypoint.
// No network and no production secrets. The gateway always receives HTTP 200.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { EcowittCustomUploadEdge, type EcowittCustomUploadAdmin } from "./index.ts";
import { isCustomUploadPacketStale } from "../_shared/ecowittCustomUploadIngestRules.ts";
import type { LovableSubscriptionRow } from "../_shared/lib/lib/entitlements/lovablePaddleAdapter.ts";

const ENDPOINT = "https://example.test/ew";
const NOW = new Date("2026-11-02T18:00:30.000Z");
const PASSKEY = "ab".repeat(16);
const OTHER_PASSKEY = "cd".repeat(16);
const TOKEN = "ef".repeat(24);
const USER_ID = "11111111-1111-4111-8111-111111111111";
const TENT_ID = "22222222-2222-4222-8222-222222222222";
const CLAIM_ID = "44444444-4444-4444-8444-444444444444";

const PLUS_ENCODED_DATEUTC = "dateutc=2026-11-02+18:00:00";
const CHARSET_CONTENT_TYPE = "application/x-www-form-urlencoded; charset=UTF-8";
const UNKNOWN_KEY_BODY_KEY = "firmware_debug";

interface ClaimRow {
  id: string;
  user_id: string;
  tent_id: string;
  passkey_sha256: string | null;
  stationtype: string | null;
  interval_seconds: number | null;
  revoked_at: string | null;
  last_received_at: string | null;
  last_captured_at: string | null;
}

interface State {
  claim: ClaimRow | null;
  inserts: Array<Record<string, unknown>>;
  binds: Array<Record<string, unknown>>;
  reserves: Array<Record<string, unknown>>;
  subscriptionRows: LovableSubscriptionRow[];
}

function paidSubscription(): LovableSubscriptionRow {
  return {
    user_id: USER_ID,
    paddle_subscription_id: "sub_ecowitt_pro",
    paddle_customer_id: "ctm_ecowitt_pro",
    product_id: "verdant_pro",
    price_id: "pro_monthly",
    status: "active",
    current_period_start: "2026-11-01T00:00:00.000Z",
    current_period_end: "2026-12-01T00:00:00.000Z",
    cancel_at_period_end: false,
    environment: "live",
    created_at: "2026-11-01T00:00:00.000Z",
    updated_at: "2026-11-01T00:00:00.000Z",
  };
}

function openClaim(overrides: Partial<ClaimRow> = {}): ClaimRow {
  return {
    id: CLAIM_ID,
    user_id: USER_ID,
    tent_id: TENT_ID,
    passkey_sha256: null,
    stationtype: null,
    interval_seconds: 16,
    revoked_at: null,
    last_received_at: null,
    last_captured_at: null,
    ...overrides,
  };
}

function makeState(claim: ClaimRow | null = openClaim()): State {
  return {
    claim,
    inserts: [],
    binds: [],
    reserves: [],
    subscriptionRows: [paidSubscription()],
  };
}

function makeAdmin(state: State): EcowittCustomUploadAdmin {
  return {
    from(table: string) {
      if (table === "subscriptions") {
        const filters: Array<{ column: string; value: string }> = [];
        const builder = {
          select() {
            return builder;
          },
          eq(column: string, value: string) {
            filters.push({ column, value });
            return builder;
          },
          order() {
            return builder;
          },
          limit() {
            return builder;
          },
          then(resolve: (result: { data: LovableSubscriptionRow[]; error: null }) => void) {
            resolve({
              data: state.subscriptionRows.filter((row) =>
                filters.every(
                  ({ column, value }) =>
                    String(row[column as keyof LovableSubscriptionRow]) === value,
                ),
              ),
              error: null,
            });
          },
        };
        return builder;
      }
      if (table === "ecowitt_custom_upload_claims") {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({ data: state.claim, error: null }),
                };
              },
            };
          },
          update(patch: Record<string, unknown>) {
            const chain = {
              eq() {
                return chain;
              },
              is() {
                return chain;
              },
              then(resolve: (result: { error: null }) => void) {
                state.binds.push(patch);
                if (state.claim) {
                  state.claim.passkey_sha256 = String(patch.passkey_sha256);
                  state.claim.stationtype = String(patch.stationtype);
                }
                resolve({ error: null });
              },
            };
            return chain;
          },
        };
      }
      if (table === "sensor_readings") {
        return {
          insert(rows: Array<Record<string, unknown>>) {
            state.inserts.push(...rows);
            return Promise.resolve({ error: null });
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    rpc(_name: string, args: Record<string, unknown>) {
      state.reserves.push(args);
      return Promise.resolve({ data: "ok", error: null });
    },
  };
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function form(fields: Record<string, string>): string {
  return new URLSearchParams(fields).toString();
}

function post(
  body: string,
  contentType = "application/x-www-form-urlencoded",
  token = TOKEN,
): Request {
  return new Request(`${ENDPOINT}/${token}`, {
    method: "POST",
    headers: { "content-type": contentType },
    body,
  });
}

const BASE_FIELDS = {
  PASSKEY,
  stationtype: "GW1200-fixture",
  dateutc: "2026-11-02 18:00:00",
  tempinf: "72",
  humidityin: "55",
  soilmoisture1: "40",
  co2: "800",
};

async function withLogs<T>(run: () => Promise<T>): Promise<{ result: T; logs: string }> {
  const lines: string[] = [];
  const original = console.info;
  console.info = (...args: unknown[]) => {
    lines.push(args.map((arg) => String(arg)).join(" "));
  };
  try {
    const result = await run();
    return { result, logs: lines.join("\n") };
  } finally {
    console.info = original;
  }
}

function assertNoSecrets(logs: string, body: string) {
  assert(!logs.includes(PASSKEY), "log contains PASSKEY");
  assert(!logs.includes(OTHER_PASSKEY), "log contains the other PASSKEY");
  assert(!logs.includes(TOKEN), "log contains the claim token");
  if (body.length > 0) assert(!logs.includes(body), "log contains the raw body");
  assert(!logs.includes("tempinf"), "log contains a body field");
}

Deno.test("stores live rows for a form post and keeps the reason off the wire", async () => {
  const state = makeState();
  const body = form(BASE_FIELDS);
  const { result, logs } = await withLogs(() =>
    EcowittCustomUploadEdge.handle(post(body), {
      admin: makeAdmin(state),
      now: () => NOW,
      expectedBillingEnvironment: "live",
    }),
  );
  assertEquals(result.status, 200);
  const payload = await result.json();
  assertEquals(payload, { accepted: true, stored: 4 });
  assertEquals("reason" in payload, false);
  assertEquals(state.inserts.length, 4);
  assertEquals(state.inserts[0].source, "live");
  assertEquals(state.inserts[0].captured_at, "2026-11-02T18:00:00Z");
  assert(state.inserts[0].ts !== state.inserts[0].captured_at);
  assertEquals(state.binds.length, 1);
  assertEquals("last_received_at" in state.binds[0], false);
  assertEquals("last_captured_at" in state.binds[0], false);
  assert(logs.includes("stored"));
  assertNoSecrets(logs, body);
});

Deno.test("accepts plus-encoded dateutc, a charset suffix, and ignores unknown keys", async () => {
  const plusBody = `PASSKEY=${PASSKEY}&stationtype=GW1200-fixture&${PLUS_ENCODED_DATEUTC}&tempinf=72&humidityin=55`;
  const plusState = makeState();
  const plus = await EcowittCustomUploadEdge.handle(post(plusBody), {
    admin: makeAdmin(plusState),
    now: () => NOW,
    expectedBillingEnvironment: "live",
  });
  assertEquals(plus.status, 200);
  assertEquals(plusState.inserts[0]?.captured_at, "2026-11-02T18:00:00Z");

  const charsetState = makeState();
  const charsetBody = form(BASE_FIELDS);
  const charset = await EcowittCustomUploadEdge.handle(post(charsetBody, CHARSET_CONTENT_TYPE), {
    admin: makeAdmin(charsetState),
    now: () => NOW,
    expectedBillingEnvironment: "live",
  });
  assertEquals(charset.status, 200);
  assertEquals((await charset.json()).stored, 4);

  const unknownState = makeState();
  const unknownBody = form({ ...BASE_FIELDS, [UNKNOWN_KEY_BODY_KEY]: "do-not-store" });
  const unknown = await EcowittCustomUploadEdge.handle(post(unknownBody), {
    admin: makeAdmin(unknownState),
    now: () => NOW,
    expectedBillingEnvironment: "live",
  });
  assertEquals(unknown.status, 200);
  const raw = JSON.stringify(unknownState.inserts);
  assert(!raw.includes(UNKNOWN_KEY_BODY_KEY));
  assert(!raw.includes("do-not-store"));
});

Deno.test("accepts 16s, 60s, and 600s cadences and throttles a faster burst with 200", async () => {
  for (const interval of [16, 60, 600]) {
    const state = makeState(
      openClaim({
        interval_seconds: interval,
        passkey_sha256: await sha256Hex(PASSKEY),
        stationtype: "GW1200-fixture",
        last_received_at: new Date(NOW.getTime() - interval * 1000).toISOString(),
      }),
    );
    const response = await EcowittCustomUploadEdge.handle(post(form(BASE_FIELDS)), {
      admin: makeAdmin(state),
      now: () => NOW,
      expectedBillingEnvironment: "live",
    });
    assertEquals(response.status, 200);
    assertEquals((await response.json()).accepted, true);
    assert(state.inserts.length > 0, `interval ${interval} was rejected`);
  }

  const burst = makeState(
    openClaim({
      interval_seconds: 16,
      passkey_sha256: await sha256Hex(PASSKEY),
      stationtype: "GW1200-fixture",
      last_received_at: new Date(NOW.getTime() - 1000).toISOString(),
    }),
  );
  const { result, logs } = await withLogs(() =>
    EcowittCustomUploadEdge.handle(post(form(BASE_FIELDS)), {
      admin: makeAdmin(burst),
      now: () => NOW,
      expectedBillingEnvironment: "live",
    }),
  );
  assertEquals(result.status, 200);
  assertEquals(await result.json(), { accepted: false, stored: 0 });
  assertEquals(burst.inserts.length, 0);
  assert(logs.includes("rate_limited"));
  assertNoSecrets(logs, form(BASE_FIELDS));

  assertEquals(isCustomUploadPacketStale("2026-11-02T17:58:00.000Z", 16, NOW), true);
  assertEquals(isCustomUploadPacketStale("2026-11-02T18:00:00.000Z", 16, NOW), false);
  assertEquals(isCustomUploadPacketStale(NOW.toISOString(), 60, NOW), false);
  assertEquals(
    isCustomUploadPacketStale(
      new Date(NOW.getTime() - 600 * 3 * 1000 - 1000).toISOString(),
      600,
      NOW,
    ),
    true,
  );
});

Deno.test(
  "invalid passkey, unknown token, revoked token, oversized body, and GET stay 200",
  async () => {
    const mismatch = makeState(
      openClaim({
        passkey_sha256: await sha256Hex(PASSKEY),
        stationtype: "GW1200-fixture",
      }),
    );
    const mismatchBody = form({ ...BASE_FIELDS, PASSKEY: OTHER_PASSKEY });
    const mismatchResult = await withLogs(() =>
      EcowittCustomUploadEdge.handle(post(mismatchBody), {
        admin: makeAdmin(mismatch),
        now: () => NOW,
        expectedBillingEnvironment: "live",
      }),
    );
    assertEquals(mismatchResult.result.status, 200);
    assertEquals(await mismatchResult.result.json(), { accepted: false, stored: 0 });
    assertEquals(mismatch.inserts.length, 0);
    assert(mismatchResult.logs.includes("passkey_mismatch"));
    assertNoSecrets(mismatchResult.logs, mismatchBody);

    const unknown = makeState(null);
    const unknownResult = await withLogs(() =>
      EcowittCustomUploadEdge.handle(post(form(BASE_FIELDS)), {
        admin: makeAdmin(unknown),
        now: () => NOW,
        expectedBillingEnvironment: "live",
      }),
    );
    assertEquals(unknownResult.result.status, 200);
    assert(unknownResult.logs.includes("unknown_claim"));
    assertEquals(unknown.inserts.length, 0);
    assertNoSecrets(unknownResult.logs, form(BASE_FIELDS));

    const revoked = makeState(openClaim({ revoked_at: "2026-11-02T17:00:00.000Z" }));
    const revokedResult = await withLogs(() =>
      EcowittCustomUploadEdge.handle(post(form(BASE_FIELDS)), {
        admin: makeAdmin(revoked),
        now: () => NOW,
        expectedBillingEnvironment: "live",
      }),
    );
    assertEquals(revokedResult.result.status, 200);
    assert(revokedResult.logs.includes("claim_revoked"));
    assertEquals(revoked.inserts.length, 0);

    const oversized = makeState();
    const oversizedResult = await withLogs(() =>
      EcowittCustomUploadEdge.handle(
        new Request(`${ENDPOINT}/${TOKEN}`, {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            "content-length": "70000",
          },
          body: "PASSKEY=abcd",
        }),
        {
          admin: makeAdmin(oversized),
          now: () => NOW,
          expectedBillingEnvironment: "live",
        },
      ),
    );
    assertEquals(oversizedResult.result.status, 200);
    assert(oversizedResult.logs.includes("payload_too_large"));
    assertEquals(oversized.inserts.length, 0);
    assert(!oversizedResult.logs.includes("PASSKEY=abcd"));

    const getState = makeState();
    const getResult = await withLogs(() =>
      EcowittCustomUploadEdge.handle(new Request(`${ENDPOINT}/${TOKEN}`, { method: "GET" }), {
        admin: makeAdmin(getState),
        now: () => NOW,
        expectedBillingEnvironment: "live",
      }),
    );
    assertEquals(getResult.result.status, 200);
    assertEquals(await getResult.result.json(), { accepted: false, stored: 0 });
    assert(getResult.logs.includes("method_not_allowed"));
    assertEquals(getState.inserts.length, 0);
    assertNoSecrets(getResult.logs, "");
  },
);

Deno.test("a claim row with no interval is not treated as a 60 second station", async () => {
  const state = makeState(openClaim({ interval_seconds: null }));
  const response = await EcowittCustomUploadEdge.handle(post(form(BASE_FIELDS)), {
    admin: makeAdmin(state),
    now: () => NOW,
    expectedBillingEnvironment: "live",
  });
  assertEquals(response.status, 200);
  assertEquals(await response.json(), { accepted: false, stored: 0 });
  assertEquals(state.inserts.length, 0);
});
