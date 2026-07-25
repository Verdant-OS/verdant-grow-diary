import { assertEquals, assertFalse, assertStringIncludes } from "jsr:@std/assert@1";
import {
  handleOperatorGgsRealPayloadCommit,
  MAX_OPERATOR_GGS_REQUEST_BODY_BYTES,
  type OperatorGgsBridgeTokenContext,
  type OperatorGgsCommitBatchInput,
  type OperatorGgsRealPayloadCommitDeps,
} from "./handler.ts";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const TENT_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_TENT_ID = "44444444-4444-4444-8444-444444444444";
const BRIDGE_ID = "55555555-5555-4555-8555-555555555555";
const NOW = new Date("2026-07-25T12:00:00.000Z");

function payload(overrides: Record<string, unknown> = {}) {
  return {
    timestamp: "2026-07-25T11:59:00.000Z",
    sensor_id: "GGS-PROBE-001",
    tent_id: TENT_ID,
    soil_moisture_pct: 42.5,
    soil_temp_c: 22.3,
    soil_ec: 1.6,
    ...overrides,
  };
}

function body(overrides: Record<string, unknown> = {}) {
  return {
    tentId: TENT_ID,
    bridgeId: BRIDGE_ID,
    deviceId: "GGS-PROBE-001",
    payload: payload(),
    attested: true,
    ...overrides,
  };
}

function request(requestBody: unknown = body(), authorization = "Bearer valid-user-jwt"): Request {
  return rawRequest(JSON.stringify(requestBody), authorization);
}

function rawRequest(
  rawBody: string,
  authorization = "Bearer valid-user-jwt",
  extraHeaders: Record<string, string> = {},
): Request {
  return new Request("https://example.supabase.co/functions/v1/operator-ggs", {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
      origin: "https://verdantgrowdiary.com",
      ...extraHeaders,
    },
    body: rawBody,
  });
}

function paddedJson(requestBody: unknown, targetBytes: number): string {
  const raw = JSON.stringify(requestBody);
  const byteLength = new TextEncoder().encode(raw).byteLength;
  if (byteLength > targetBytes) {
    throw new Error("test request exceeds target before padding");
  }
  return `${raw}${" ".repeat(targetBytes - byteLength)}`;
}

function bridge(
  overrides: Partial<OperatorGgsBridgeTokenContext> = {},
): OperatorGgsBridgeTokenContext {
  return {
    id: BRIDGE_ID,
    userId: USER_ID,
    tentId: TENT_ID,
    expiresAt: "2026-07-26T12:00:00.000Z",
    revokedAt: null,
    ...overrides,
  };
}

function deps(overrides: Partial<OperatorGgsRealPayloadCommitDeps> = {}): {
  value: OperatorGgsRealPayloadCommitDeps;
  committed: OperatorGgsCommitBatchInput[];
} {
  const committed: OperatorGgsCommitBatchInput[] = [];
  const value: OperatorGgsRealPayloadCommitDeps = {
    now: () => NOW,
    getVerifiedUserId: async () => ({ ok: true, value: USER_ID }),
    hasOperatorRole: async () => ({ ok: true, value: true }),
    loadTentAuthority: async () => ({
      ok: true,
      value: { userId: USER_ID },
    }),
    loadBridgeTokenContext: async () => ({
      ok: true,
      value: bridge(),
    }),
    commitBatch: async (input) => {
      committed.push(input);
      return { ok: true, inserted: input.rows.length, rejected: 0 };
    },
    ...overrides,
  };
  return { value, committed };
}

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

Deno.test("OPTIONS succeeds without auth or database access", async () => {
  let touched = false;
  const d = deps({
    getVerifiedUserId: async () => {
      touched = true;
      return { ok: true, value: null };
    },
  });
  const response = await handleOperatorGgsRealPayloadCommit(
    new Request("https://example.test", { method: "OPTIONS" }),
    d.value,
  );
  assertEquals(response.status, 204);
  assertFalse(touched);
});

Deno.test("missing JWT is rejected before auth dependencies", async () => {
  let touched = false;
  const d = deps({
    getVerifiedUserId: async () => {
      touched = true;
      return { ok: true, value: USER_ID };
    },
  });
  const response = await handleOperatorGgsRealPayloadCommit(request(body(), ""), d.value);
  assertEquals(response.status, 401);
  assertEquals(await responseJson(response), { error: "auth_required" });
  assertFalse(touched);
});

Deno.test("invalid JWT is rejected", async () => {
  const d = deps({
    getVerifiedUserId: async () => ({ ok: true, value: null }),
  });
  const response = await handleOperatorGgsRealPayloadCommit(request(), d.value);
  assertEquals(response.status, 401);
  assertEquals(await responseJson(response), { error: "auth_required" });
  assertEquals(d.committed.length, 0);
});

Deno.test("auth verification outage fails closed", async () => {
  const d = deps({
    getVerifiedUserId: async () => ({ ok: false }),
  });
  const response = await handleOperatorGgsRealPayloadCommit(request(), d.value);
  assertEquals(response.status, 503);
  assertEquals(await responseJson(response), {
    error: "authorization_unavailable",
  });
});

Deno.test("non-operator is rejected before body authorization", async () => {
  let tentTouched = false;
  const d = deps({
    hasOperatorRole: async () => ({ ok: true, value: false }),
    loadTentAuthority: async () => {
      tentTouched = true;
      return { ok: true, value: { userId: USER_ID } };
    },
  });
  const response = await handleOperatorGgsRealPayloadCommit(request(), d.value);
  assertEquals(response.status, 403);
  assertEquals(await responseJson(response), { error: "operator_required" });
  assertFalse(tentTouched);
});

Deno.test("malformed request JSON is rejected", async () => {
  const d = deps();
  const req = new Request("https://example.test", {
    method: "POST",
    headers: {
      Authorization: "Bearer valid-user-jwt",
      "Content-Type": "application/json",
    },
    body: "{",
  });
  const response = await handleOperatorGgsRealPayloadCommit(req, d.value);
  assertEquals(response.status, 400);
  assertEquals(await responseJson(response), { error: "invalid_json" });
  assertEquals(d.committed.length, 0);
});

Deno.test("declared oversized request fast-fails with a sanitized response", async () => {
  const d = deps();
  const response = await handleOperatorGgsRealPayloadCommit(
    rawRequest(JSON.stringify(body()), "Bearer valid-user-jwt", {
      "Content-Length": String(MAX_OPERATOR_GGS_REQUEST_BODY_BYTES + 1),
    }),
    d.value,
  );
  assertEquals(response.status, 413);
  assertEquals(await responseJson(response), { error: "payload_too_large" });
  assertEquals(d.committed.length, 0);
});

Deno.test("missing content-length cannot bypass the actual byte cap", async () => {
  const d = deps();
  const req = rawRequest(paddedJson(body(), MAX_OPERATOR_GGS_REQUEST_BODY_BYTES + 1));
  assertEquals(req.headers.get("content-length"), null);
  const response = await handleOperatorGgsRealPayloadCommit(req, d.value);
  assertEquals(response.status, 413);
  assertEquals(await responseJson(response), { error: "payload_too_large" });
  assertEquals(d.committed.length, 0);
});

Deno.test("forged smaller content-length cannot bypass the actual byte cap", async () => {
  const d = deps();
  const response = await handleOperatorGgsRealPayloadCommit(
    rawRequest(
      paddedJson(body(), MAX_OPERATOR_GGS_REQUEST_BODY_BYTES + 1),
      "Bearer valid-user-jwt",
      { "Content-Length": "1" },
    ),
    d.value,
  );
  assertEquals(response.status, 413);
  assertEquals(await responseJson(response), { error: "payload_too_large" });
  assertEquals(d.committed.length, 0);
});

Deno.test("an exact-limit request remains valid", async () => {
  const d = deps();
  const response = await handleOperatorGgsRealPayloadCommit(
    rawRequest(paddedJson(body(), MAX_OPERATOR_GGS_REQUEST_BODY_BYTES), "Bearer valid-user-jwt", {
      "Content-Length": String(MAX_OPERATOR_GGS_REQUEST_BODY_BYTES),
    }),
    d.value,
  );
  assertEquals(response.status, 200);
  assertEquals(await responseJson(response), {
    ok: true,
    inserted: 3,
    rejected: 0,
  });
  assertEquals(d.committed.length, 1);
});

Deno.test("attestation is required server-side", async () => {
  const d = deps();
  const response = await handleOperatorGgsRealPayloadCommit(
    request(body({ attested: false })),
    d.value,
  );
  assertEquals(response.status, 400);
  assertEquals(await responseJson(response), {
    error: "attestation_required",
  });
  assertEquals(d.committed.length, 0);
});

Deno.test("foreign tent is rejected", async () => {
  const d = deps({
    loadTentAuthority: async () => ({
      ok: true,
      value: { userId: OTHER_USER_ID },
    }),
  });
  const response = await handleOperatorGgsRealPayloadCommit(request(), d.value);
  assertEquals(response.status, 403);
  assertEquals(await responseJson(response), { error: "tent_forbidden" });
  assertEquals(d.committed.length, 0);
});

for (const [name, authority] of [
  ["missing", null],
  ["foreign owner", bridge({ userId: OTHER_USER_ID })],
  ["foreign tent", bridge({ tentId: OTHER_TENT_ID })],
  ["revoked", bridge({ revokedAt: "2026-07-24T00:00:00.000Z" })],
  ["expired", bridge({ expiresAt: NOW.toISOString() })],
  ["malformed expiry", bridge({ expiresAt: "not-a-date" })],
] as const) {
  Deno.test(`bridge-token context rejects ${name}`, async () => {
    const d = deps({
      loadBridgeTokenContext: async () => ({
        ok: true,
        value: authority,
      }),
    });
    const response = await handleOperatorGgsRealPayloadCommit(request(), d.value);
    assertEquals(response.status, 403);
    assertEquals(await responseJson(response), { error: "bridge_forbidden" });
    assertEquals(d.committed.length, 0);
  });
}

Deno.test("malformed payload is rejected with zero writes", async () => {
  const d = deps();
  const response = await handleOperatorGgsRealPayloadCommit(
    request(body({ payload: { invented: true } })),
    d.value,
  );
  assertEquals(response.status, 400);
  assertEquals(await responseJson(response), { error: "payload_rejected" });
  assertEquals(d.committed.length, 0);
});

Deno.test("stale payload is rejected with zero writes", async () => {
  const d = deps();
  const response = await handleOperatorGgsRealPayloadCommit(
    request(
      body({
        payload: payload({ timestamp: "2026-07-25T10:00:00.000Z" }),
      }),
    ),
    d.value,
  );
  assertEquals(response.status, 400);
  assertEquals(await responseJson(response), { error: "payload_rejected" });
  assertEquals(d.committed.length, 0);
});

Deno.test("degraded payload is rejected with zero writes", async () => {
  const d = deps();
  const response = await handleOperatorGgsRealPayloadCommit(
    request(
      body({
        payload: payload({
          soil_temp_c: undefined,
          soil_ec: undefined,
        }),
      }),
    ),
    d.value,
  );
  assertEquals(response.status, 400);
  assertEquals(await responseJson(response), { error: "payload_rejected" });
  assertEquals(d.committed.length, 0);
});

Deno.test("declared non-live payload is rejected with zero writes", async () => {
  const d = deps();
  const response = await handleOperatorGgsRealPayloadCommit(
    request(body({ payload: payload({ source: "manual" }) })),
    d.value,
  );
  assertEquals(response.status, 400);
  assertEquals(await responseJson(response), { error: "payload_rejected" });
  assertEquals(d.committed.length, 0);
});

Deno.test(
  "verified UID overrides client userId and private commit occurs exactly once",
  async () => {
    const d = deps();
    const response = await handleOperatorGgsRealPayloadCommit(
      request(body({ userId: OTHER_USER_ID, rows: [{ source: "live" }] })),
      d.value,
    );
    assertEquals(response.status, 200);
    assertEquals(await responseJson(response), {
      ok: true,
      inserted: 3,
      rejected: 0,
    });
    assertEquals(d.committed.length, 1);
    assertEquals(d.committed[0].userId, USER_ID);
    assertEquals(d.committed[0].bridgeId, BRIDGE_ID);
    assertEquals(d.committed[0].tentId, TENT_ID);
    assertEquals(
      d.committed[0].rows.map((row) => row.metric),
      ["soil_moisture_pct", "ec", "soil_temp_c"],
    );
    assertEquals(
      d.committed[0].rows.every(
        (row) =>
          row.source === "live" &&
          row.quality === "ok" &&
          row.raw_payload.source_app === "spider_farmer_ggs",
      ),
      true,
    );
  },
);

Deno.test("commit failures are sanitized", async () => {
  const secret = "service-role-secret-should-never-leak";
  const d = deps({
    commitBatch: async () => {
      throw new Error(secret);
    },
  });
  const response = await handleOperatorGgsRealPayloadCommit(request(), d.value);
  assertEquals(response.status, 500);
  const text = await response.text();
  assertStringIncludes(text, "internal_error");
  assertFalse(text.includes(secret));
  assertFalse(text.includes("pi_ingest_commit_batch"));
  assertFalse(text.includes("sensor_readings"));
});
