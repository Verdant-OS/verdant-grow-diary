// Deno tests for the server-only tent-owner lookup helper.
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  loadTentOwnerUserId,
  TENT_OWNER_LOOKUP_COLUMNS,
  TENT_OWNER_LOOKUP_TABLE,
  type PiIngestTentOwnerLookupClient,
  type PiIngestTentOwnerLookupResponse,
} from "./tentOwnerLookup.ts";

type SelectCall = {
  table: string;
  columns: string;
  eqColumn: string;
  eqValue: string;
  limit: number;
};

function makeClient(
  response: PiIngestTentOwnerLookupResponse | (() => never),
  calls: SelectCall[] = [],
): PiIngestTentOwnerLookupClient {
  return {
    from(table: string) {
      return {
        select(columns: string) {
          return {
            eq(eqColumn: string, eqValue: string) {
              return {
                limit(limit: number) {
                  calls.push({ table, columns, eqColumn, eqValue, limit });
                  if (typeof response === "function") {
                    return Promise.resolve().then(() => response());
                  }
                  return Promise.resolve(response);
                },
              };
            },
          };
        },
      };
    },
  };
}

// ---------- Input handling ----------

Deno.test("missing/empty/whitespace tentId → missing_tent_id without calling client", async () => {
  const calls: SelectCall[] = [];
  const client = makeClient({ data: [{ user_id: "u1" }], error: null }, calls);
  for (const bad of ["", "   ", undefined as unknown as string, null as unknown as string]) {
    const result = await loadTentOwnerUserId(bad, client);
    assertEquals(result.ok, false);
    if (!result.ok) assertEquals(result.reason, "missing_tent_id");
  }
  assertEquals(calls.length, 0);
});

Deno.test("missing client → tent_owner_lookup_failed", async () => {
  const result = await loadTentOwnerUserId(
    "tent-1",
    undefined as unknown as PiIngestTentOwnerLookupClient,
  );
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.reason, "tent_owner_lookup_failed");
});

// ---------- Lookup paths ----------

Deno.test("returns owner for matched tent", async () => {
  const calls: SelectCall[] = [];
  const client = makeClient({ data: [{ user_id: "owner-1" }], error: null }, calls);
  const result = await loadTentOwnerUserId("tent-1", client);
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.tentId, "tent-1");
    assertEquals(result.tentOwnerUserId, "owner-1");
  }
  assertEquals(calls.length, 1);
  assertEquals(calls[0].table, TENT_OWNER_LOOKUP_TABLE);
  assertEquals(calls[0].columns, "user_id");
  assertEquals(calls[0].eqColumn, "id");
  assertEquals(calls[0].eqValue, "tent-1");
  assertEquals(calls[0].limit, 2);
});

Deno.test("empty result → unknown_tent", async () => {
  const client = makeClient({ data: [], error: null });
  const result = await loadTentOwnerUserId("tent-missing", client);
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.reason, "unknown_tent");
});

Deno.test("null data → unknown_tent", async () => {
  const client = makeClient({ data: null, error: null });
  const result = await loadTentOwnerUserId("tent-1", client);
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.reason, "unknown_tent");
});

Deno.test("row without user_id → tent_without_owner", async () => {
  const client = makeClient({ data: [{ user_id: null }], error: null });
  const result = await loadTentOwnerUserId("tent-1", client);
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.reason, "tent_without_owner");
});

Deno.test("row with empty user_id → tent_without_owner", async () => {
  const client = makeClient({ data: [{ user_id: "   " }], error: null });
  const result = await loadTentOwnerUserId("tent-1", client);
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.reason, "tent_without_owner");
});

Deno.test("client error → tent_owner_lookup_failed", async () => {
  const client = makeClient({ data: null, error: { message: "boom" } });
  const result = await loadTentOwnerUserId("tent-1", client);
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.reason, "tent_owner_lookup_failed");
});

Deno.test("non-array data → tent_owner_lookup_failed", async () => {
  const client = makeClient({ data: { user_id: "owner-1" } as unknown, error: null });
  const result = await loadTentOwnerUserId("tent-1", client);
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.reason, "tent_owner_lookup_failed");
});

Deno.test(">1 row → tent_owner_lookup_failed (defense in depth)", async () => {
  const client = makeClient({
    data: [{ user_id: "owner-1" }, { user_id: "owner-2" }],
    error: null,
  });
  const result = await loadTentOwnerUserId("tent-1", client);
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.reason, "tent_owner_lookup_failed");
});

Deno.test("client throw → tent_owner_lookup_failed (never escapes as exception)", async () => {
  const client = makeClient(() => {
    throw new Error("network down");
  });
  const result = await loadTentOwnerUserId("tent-1", client);
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.reason, "tent_owner_lookup_failed");
});

// ---------- Failure result invariants ----------

Deno.test("failure result never leaks another user's owner id or sensor data", async () => {
  const client = makeClient({ data: [], error: null });
  const result = await loadTentOwnerUserId("tent-1", client);
  const serialized = JSON.stringify(result);
  for (const forbidden of [
    /tentOwnerUserId/,
    /secret/i,
    /ciphertext/i,
    /nonce/i,
    /signature/i,
    /raw_body/i,
    /raw_payload/i,
    /service[_-]?role/i,
  ]) {
    assert(
      !forbidden.test(serialized),
      `failure result leaked forbidden token matching ${forbidden}`,
    );
  }
});

// ---------- Static guardrails ----------

Deno.test("tent-owner lookup source has no forbidden surfaces", async () => {
  const src = await Deno.readTextFile(
    new URL("./tentOwnerLookup.ts", import.meta.url),
  );
  // Strip comments so contract prose doesn't trigger forbidden-token checks.
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  const forbidden: Array<[string, RegExp]> = [
    ["createClient", /\bcreateClient\s*\(/],
    ["service_role", /service_role/i],
    ["SUPABASE_SERVICE_ROLE_KEY", /SUPABASE_SERVICE_ROLE_KEY/],
    ["supabase-js import", /from\s+["'][^"']*supabase-js[^"']*["']/],
    ["Deno.env access", /\bDeno\.env\.(get|set|delete)\s*\(/],
    ["sensor_readings table", /\bsensor_readings\b/],
    ["idempotency table", /\bpi_ingest_idempotency_keys\b/],
    ["alerts from()", /from\(\s*["']alerts["']\s*\)/],
    ["action_queue from()", /from\(\s*["']action_queue["']\s*\)/],
    ["React import", /from\s+["']react["']/],
    ["src/ import", /from\s+["'][^"']*\/src\//],
    ["insert call", /\.insert\s*\(/],
    ["update call", /\.update\s*\(/],
    ["delete call", /\.delete\s*\(/],
    ["upsert call", /\.upsert\s*\(/],
    ["rpc call", /\.rpc\s*\(/],
  ];
  for (const [label, re] of forbidden) {
    assert(!re.test(code), `tentOwnerLookup.ts contains forbidden surface: ${label}`);
  }
});

Deno.test("tent-owner lookup SELECTs only user_id from tents", () => {
  assertEquals(TENT_OWNER_LOOKUP_TABLE, "tents");
  assertEquals(TENT_OWNER_LOOKUP_COLUMNS, ["user_id"]);
});

Deno.test("index.ts wires the tent-owner lookup after HMAC verification", async () => {
  const raw = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assert(
    /\bloadTentOwnerUserId\s*\(/.test(raw),
    "index.ts must call loadTentOwnerUserId after HMAC verification",
  );
});
