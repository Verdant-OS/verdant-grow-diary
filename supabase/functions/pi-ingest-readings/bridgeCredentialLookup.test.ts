// Deno tests for the server-only bridge credential lookup helper.
// Covers missing/unknown/single/multiple-row paths, DB errors, column
// allowlist, and static guardrails confirming no service_role / client
// construction / src import surface has been added.
import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  BRIDGE_CREDENTIAL_LOOKUP_COLUMNS,
  BRIDGE_CREDENTIAL_TABLE,
  loadBridgeCredentialRow,
  type PiIngestBridgeCredentialLookupClient,
  type PiIngestBridgeCredentialLookupResponse,
} from "./bridgeCredentialLookup.ts";

type SelectCall = { table: string; columns: string; eqColumn: string; eqValue: string; limit: number };

function makeClient(
  response: PiIngestBridgeCredentialLookupResponse,
  calls: SelectCall[] = [],
): PiIngestBridgeCredentialLookupClient {
  return {
    from(table: string) {
      return {
        select(columns: string) {
          return {
            eq(eqColumn: string, eqValue: string) {
              return {
                limit(limit: number) {
                  calls.push({ table, columns, eqColumn, eqValue, limit });
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

function singleRow(overrides: Record<string, unknown> = {}) {
  return {
    bridge_id: "bridge-abc",
    user_id: "user-xyz",
    is_active: true,
    secret_ciphertext: new Uint8Array([1, 2, 3]),
    secret_nonce: new Uint8Array([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]),
    secret_key_version: 1,
    secret_status: "active_encrypted",
    allowed_tent_ids: ["tent-1"],
    last_used_at: "2026-05-23T00:00:00Z",
    ...overrides,
  };
}

// ---------- Input handling ----------

Deno.test("returns null for empty/whitespace bridgeId without calling client", async () => {
  const calls: SelectCall[] = [];
  const client = makeClient({ data: [singleRow()], error: null }, calls);
  assertEquals(await loadBridgeCredentialRow("", client), null);
  assertEquals(await loadBridgeCredentialRow("   ", client), null);
  // deno-lint-ignore no-explicit-any
  assertEquals(await loadBridgeCredentialRow(undefined as any, client), null);
  assertEquals(calls.length, 0);
});

Deno.test("throws when no client is provided", async () => {
  await assertRejects(
    () => loadBridgeCredentialRow("bridge-abc"),
    Error,
    "bridge_credential_lookup_client_required",
  );
});

// ---------- Lookup paths ----------

Deno.test("returns null on missing/unknown bridge (empty result set)", async () => {
  const client = makeClient({ data: [], error: null });
  assertEquals(await loadBridgeCredentialRow("bridge-missing", client), null);
});

Deno.test("returns null when data is null", async () => {
  const client = makeClient({ data: null, error: null });
  assertEquals(await loadBridgeCredentialRow("bridge-abc", client), null);
});

Deno.test("returns the single matched row", async () => {
  const calls: SelectCall[] = [];
  const client = makeClient({ data: [singleRow()], error: null }, calls);
  const row = await loadBridgeCredentialRow("bridge-abc", client);
  assert(row !== null);
  assertEquals(row!.bridge_id, "bridge-abc");
  assertEquals(row!.user_id, "user-xyz");
  assertEquals(row!.is_active, true);
  assertEquals(row!.secret_status, "active_encrypted");
  assertEquals(row!.secret_key_version, 1);
  assertEquals(row!.allowed_tent_ids, ["tent-1"]);
  assertEquals(calls.length, 1);
  assertEquals(calls[0].table, BRIDGE_CREDENTIAL_TABLE);
  assertEquals(calls[0].eqColumn, "bridge_id");
  assertEquals(calls[0].eqValue, "bridge-abc");
  assertEquals(calls[0].limit, 2);
});

Deno.test("throws multiple_rows_unexpected when >1 row returned", async () => {
  const client = makeClient({
    data: [singleRow(), singleRow({ user_id: "user-other" })],
    error: null,
  });
  await assertRejects(
    () => loadBridgeCredentialRow("bridge-abc", client),
    Error,
    "multiple_rows_unexpected",
  );
});

Deno.test("throws bridge_credential_lookup_failed when client returns error", async () => {
  const client = makeClient({ data: null, error: { message: "boom" } });
  await assertRejects(
    () => loadBridgeCredentialRow("bridge-abc", client),
    Error,
    "bridge_credential_lookup_failed",
  );
});

Deno.test("throws bridge_credential_lookup_failed when data is not an array", async () => {
  const client = makeClient({ data: singleRow() as unknown, error: null });
  await assertRejects(
    () => loadBridgeCredentialRow("bridge-abc", client),
    Error,
    "bridge_credential_lookup_failed",
  );
});

Deno.test("throws invalid_secret_status when row carries unknown status", async () => {
  const client = makeClient({
    data: [singleRow({ secret_status: "bogus" })],
    error: null,
  });
  await assertRejects(
    () => loadBridgeCredentialRow("bridge-abc", client),
    Error,
    "invalid_secret_status",
  );
});

// ---------- Column allowlist ----------

Deno.test("SELECT column list matches the contract exactly", () => {
  assertEquals(BRIDGE_CREDENTIAL_LOOKUP_COLUMNS, [
    "bridge_id",
    "user_id",
    "is_active",
    "secret_ciphertext",
    "secret_nonce",
    "secret_key_version",
    "secret_status",
    "allowed_tent_ids",
    "last_used_at",
  ]);
});

Deno.test("SELECT column string never contains forbidden columns", async () => {
  const calls: SelectCall[] = [];
  const client = makeClient({ data: [], error: null }, calls);
  await loadBridgeCredentialRow("bridge-abc", client);
  const cols = calls[0].columns;
  for (const forbidden of [
    "secret_hash",
    "secret_hint",
    "raw_body",
    "raw_payload",
    "x-bridge-signature",
    "temp_c",
    "rh_pct",
    "co2_ppm",
    "vpd_kpa",
    "*",
  ]) {
    assert(!cols.includes(forbidden), `SELECT must not include: ${forbidden}`);
  }
});

// ---------- Static guardrails ----------

Deno.test("lookup source has no service_role / createClient / supabase-js / Deno.env", async () => {
  const src = await Deno.readTextFile(
    new URL("./bridgeCredentialLookup.ts", import.meta.url),
  );
  const forbidden: Array<[string, RegExp]> = [
    ["createClient", /\bcreateClient\s*\(/],
    ["service_role", /service_role/i],
    ["SUPABASE_SERVICE_ROLE_KEY", /SUPABASE_SERVICE_ROLE_KEY/],
    ["supabase-js import", /from\s+["'][^"']*supabase-js[^"']*["']/],
    ["Deno.env access", /\bDeno\.env\.(get|set|delete)\s*\(/],
    ["secret_hash select", /secret_hash/],
    ["raw_body select", /\braw_body\b/],
    ["raw_payload select", /\braw_payload\b/],
    ["sensor_readings table", /\bsensor_readings\b/],
    ["idempotency table", /\bpi_ingest_idempotency_keys\b/],
    ["alerts from()", /from\(\s*["']alerts["']\s*\)/],
    ["action_queue from()", /from\(\s*["']action_queue["']\s*\)/],
    ["React import", /from\s+["']react["']/],
    ["src/ import", /from\s+["'][^"']*\/src\//],
    ["resolveBridgeSecret call", /\bresolveBridgeSecret\s*\(/],
    ["crypto.subtle", /\bcrypto\.subtle\b/],
    ["insert call", /\.insert\s*\(/],
    ["update call", /\.update\s*\(/],
    ["delete call", /\.delete\s*\(/],
    ["upsert call", /\.upsert\s*\(/],
  ];
  for (const [label, re] of forbidden) {
    assert(!re.test(src), `bridgeCredentialLookup.ts contains forbidden surface: ${label}`);
  }
});

Deno.test("lookup source SELECTs the allowlisted columns and only those", async () => {
  const src = await Deno.readTextFile(
    new URL("./bridgeCredentialLookup.ts", import.meta.url),
  );
  for (const col of BRIDGE_CREDENTIAL_LOOKUP_COLUMNS) {
    assertStringIncludes(src, col);
  }
});

Deno.test("index.ts still does not import the lookup and remains fail-closed", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assertStringIncludes(src, "secret_resolver_not_implemented");
  assert(!/from\s+["']\.\/bridgeCredentialLookup(\.ts)?["']/.test(src));
  assert(!/\bloadBridgeCredentialRow\s*\(/.test(src));
  assert(!/ok\s*:\s*true/.test(src));
  assert(!/\bcreateClient\s*\(/.test(src));
});
