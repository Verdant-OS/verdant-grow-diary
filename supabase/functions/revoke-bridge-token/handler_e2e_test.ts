import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleRequest, type RevokeBridgeTokenClient } from "./index.ts";

const ENDPOINT = "https://example.test/functions/v1/revoke-bridge-token";
const NOW = new Date("2026-08-04T12:00:00.000Z");
const USER_ID = "11111111-1111-4111-8111-111111111111";
const TOKEN_ID = "33333333-3333-4333-8333-333333333333";
const JWT = "ey.test.user.jwt";
const PG_ERROR_TEXT = 'update or delete on table "bridge_tokens" violates secret constraint';

interface FakeState {
  /** True when the (id, user_id) row exists at all. */
  rowExists: boolean;
  /** True when the existing row is already revoked (update filter misses). */
  alreadyRevoked: boolean;
  updateError: { message: string } | null;
  updates: Array<{ payload: Record<string, unknown>; filters: Array<[string, unknown]> }>;
  lookups: number;
  claimsSub: string | null;
}

function makeState(overrides: Partial<FakeState> = {}): FakeState {
  return {
    rowExists: true,
    alreadyRevoked: false,
    updateError: null,
    updates: [],
    lookups: 0,
    claimsSub: USER_ID,
    ...overrides,
  };
}

function makeClient(state: FakeState): RevokeBridgeTokenClient {
  return {
    auth: {
      getClaims: () =>
        Promise.resolve({
          data: state.claimsSub ? { claims: { sub: state.claimsSub } } : { claims: { sub: null } },
          error: null,
        }),
    },
    from(table: string) {
      if (table !== "bridge_tokens") throw new Error(`unexpected table ${table}`);
      const filters: Array<[string, unknown]> = [];
      let mode: "update" | "select" = "select";
      const builder = {
        update(payload: Record<string, unknown>) {
          mode = "update";
          state.updates.push({ payload, filters });
          return builder;
        },
        eq(column: string, value: unknown) {
          filters.push([column, value]);
          return builder;
        },
        is(column: string, value: unknown) {
          filters.push([`${column} IS`, value]);
          return builder;
        },
        select() {
          if (mode !== "update") state.lookups += 1;
          return builder;
        },
        maybeSingle: () => {
          if (state.updateError) return Promise.resolve({ data: null, error: state.updateError });
          if (mode === "update") {
            const matched = state.rowExists && !state.alreadyRevoked;
            return Promise.resolve({ data: matched ? { id: TOKEN_ID } : null, error: null });
          }
          return Promise.resolve({
            data: state.rowExists
              ? {
                  id: TOKEN_ID,
                  revoked_at: state.alreadyRevoked ? "2026-08-01T00:00:00.000Z" : null,
                }
              : null,
            error: null,
          });
        },
      };
      return builder;
    },
  };
}

function post(body: unknown = { id: TOKEN_ID }, headers: Record<string, string> = {}): Request {
  return new Request(ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `Bearer ${JWT}`,
      "content-type": "application/json",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function payload(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

Deno.test("revoke stamps revoked_at for the owner, scoped by server-resolved user_id", async () => {
  const state = makeState();
  const response = await handleRequest(post(), { supabase: makeClient(state), now: () => NOW });

  assertEquals(response.status, 200);
  assertEquals((await payload(response)).ok, true);
  assertEquals(state.updates.length, 1);
  assertEquals(state.updates[0].payload, { revoked_at: NOW.toISOString() });
  // Ownership + one-way scoping: the update filters on the row id, the
  // verified-JWT user id, and revoked_at IS NULL. A caller-supplied user id
  // is never consulted, and an existing revocation is never re-stamped.
  assertEquals(state.updates[0].filters, [
    ["id", TOKEN_ID],
    ["user_id", USER_ID],
    ["revoked_at IS", null],
  ]);
});

Deno.test("revoking a foreign or absent token returns 404 and reveals nothing", async () => {
  const state = makeState({ rowExists: false });
  const response = await handleRequest(post(), { supabase: makeClient(state), now: () => NOW });

  assertEquals(response.status, 404);
  assertEquals((await payload(response)).error, "not_found");
  assertEquals(state.updates[0].filters[1], ["user_id", USER_ID]);
});

Deno.test(
  "re-revoking an already revoked token is a calm idempotent 200, never a re-stamp",
  async () => {
    // The DB guard makes revoked_at one-way for client roles; the handler
    // must therefore never attempt to overwrite an existing revocation —
    // retrying bridges get ok:true instead of an error storm.
    const state = makeState({ alreadyRevoked: true });
    const response = await handleRequest(post(), { supabase: makeClient(state), now: () => NOW });

    assertEquals(response.status, 200);
    const body = await payload(response);
    assertEquals(body.ok, true);
    assertEquals(body.already_revoked, true);
    // The update ran but matched nothing (revoked_at IS NULL filter), so no
    // second revocation timestamp was ever proposed to the database row.
    assertEquals(state.updates.length, 1);
    assertEquals(state.lookups, 1);
  },
);

Deno.test("caller-supplied user_id in the body is ignored", async () => {
  const state = makeState();
  const response = await handleRequest(
    post({ id: TOKEN_ID, user_id: "99999999-9999-4999-8999-999999999999" }),
    { supabase: makeClient(state), now: () => NOW },
  );

  assertEquals(response.status, 200);
  assertEquals(state.updates[0].filters[0], ["id", TOKEN_ID]);
  assertEquals(state.updates[0].filters[1], ["user_id", USER_ID]);
});

Deno.test(
  "missing bearer, unverifiable claims, bad JSON, and bad id are rejected without DB writes",
  async () => {
    const noBearer = await handleRequest(new Request(ENDPOINT, { method: "POST", body: "{}" }), {
      supabase: makeClient(makeState()),
    });
    assertEquals(noBearer.status, 401);

    const noSub = makeState({ claimsSub: null });
    const unauthorized = await handleRequest(post(), { supabase: makeClient(noSub) });
    assertEquals(unauthorized.status, 401);
    assertEquals(noSub.updates.length, 0);

    const badJson = makeState();
    const malformed = await handleRequest(post("{not json"), { supabase: makeClient(badJson) });
    assertEquals(malformed.status, 400);
    assertEquals((await payload(malformed)).error, "invalid_json");
    assertEquals(badJson.updates.length, 0);

    const badId = makeState();
    const invalid = await handleRequest(post({ id: "DROP TABLE bridge_tokens" }), {
      supabase: makeClient(badId),
    });
    assertEquals(invalid.status, 400);
    assertEquals((await payload(invalid)).error, "invalid_id");
    assertEquals(badId.updates.length, 0);
  },
);

Deno.test("a database error returns a terse code and never echoes PG text", async () => {
  const state = makeState({ updateError: { message: PG_ERROR_TEXT } });
  const response = await handleRequest(post(), { supabase: makeClient(state), now: () => NOW });

  assertEquals(response.status, 400);
  const bodyText = JSON.stringify(await payload(response));
  assertEquals(bodyText.includes("update_failed"), true);
  assert(!bodyText.includes(PG_ERROR_TEXT));
  assert(!bodyText.includes("secret constraint"));
  assert(!bodyText.includes(JWT));
});
