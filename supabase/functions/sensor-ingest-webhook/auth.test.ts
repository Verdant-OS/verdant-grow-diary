// Deno tests for the bearer-token auth resolver used by sensor-ingest-webhook.
// Covers: valid bridge token, revoked, expired, unknown/malformed, missing
// service key, valid JWT, invalid JWT, and tent scope enforcement.
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  authenticateBearer,
  tentScopeMatches,
  sha256Hex,
  BRIDGE_PREFIX,
  type BridgeTokenRow,
} from "./auth.ts";

const future = () => new Date(Date.now() + 86_400_000).toISOString();
const past = () => new Date(Date.now() - 86_400_000).toISOString();

function makeRow(over: Partial<BridgeTokenRow> = {}): BridgeTokenRow {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    user_id: "22222222-2222-2222-2222-222222222222",
    tent_id: "33333333-3333-3333-3333-333333333333",
    expires_at: future(),
    revoked_at: null,
    ...over,
  };
}

const validToken = BRIDGE_PREFIX + "a".repeat(40);

Deno.test("valid bridge token resolves to bridge auth", async () => {
  const res = await authenticateBearer(validToken, {
    serviceKeyAvailable: true,
    lookupBridgeToken: async () => ({ data: makeRow(), error: null }),
    verifyJwtClaims: async () => ({ sub: null }),
  });
  assert(res.ok);
  if (res.ok) {
    assertEquals(res.auth.kind, "bridge");
    if (res.auth.kind === "bridge") {
      assertEquals(res.auth.tentScope, "33333333-3333-3333-3333-333333333333");
      assertEquals(res.auth.userId, "22222222-2222-2222-2222-222222222222");
    }
  }
});

Deno.test("revoked bridge token is rejected", async () => {
  const res = await authenticateBearer(validToken, {
    serviceKeyAvailable: true,
    lookupBridgeToken: async () => ({
      data: makeRow({ revoked_at: past() }),
      error: null,
    }),
    verifyJwtClaims: async () => ({ sub: null }),
  });
  assert(!res.ok);
  if (!res.ok) assertEquals(res.error, "token_revoked");
});

Deno.test("expired bridge token is rejected", async () => {
  const res = await authenticateBearer(validToken, {
    serviceKeyAvailable: true,
    lookupBridgeToken: async () => ({
      data: makeRow({ expires_at: past() }),
      error: null,
    }),
    verifyJwtClaims: async () => ({ sub: null }),
  });
  assert(!res.ok);
  if (!res.ok) assertEquals(res.error, "token_expired");
});

Deno.test("unknown bridge token is rejected as unauthorized", async () => {
  const res = await authenticateBearer(validToken, {
    serviceKeyAvailable: true,
    lookupBridgeToken: async () => ({ data: null, error: null }),
    verifyJwtClaims: async () => ({ sub: null }),
  });
  assert(!res.ok);
  if (!res.ok) assertEquals(res.error, "unauthorized");
});

Deno.test("malformed bridge token (too short) is rejected without DB call", async () => {
  let called = false;
  const res = await authenticateBearer(BRIDGE_PREFIX + "abc", {
    serviceKeyAvailable: true,
    lookupBridgeToken: async () => { called = true; return { data: null, error: null }; },
    verifyJwtClaims: async () => ({ sub: null }),
  });
  assert(!res.ok);
  if (!res.ok) assertEquals(res.error, "unauthorized");
  assertEquals(called, false);
});

Deno.test("missing service key while presenting bridge token returns server_misconfigured", async () => {
  const res = await authenticateBearer(validToken, {
    serviceKeyAvailable: false,
    lookupBridgeToken: async () => ({ data: makeRow(), error: null }),
    verifyJwtClaims: async () => ({ sub: null }),
  });
  assert(!res.ok);
  if (!res.ok) assertEquals(res.error, "server_misconfigured");
});

Deno.test("bridge token DB lookup error returns auth_lookup_failed", async () => {
  const res = await authenticateBearer(validToken, {
    serviceKeyAvailable: true,
    lookupBridgeToken: async () => ({ data: null, error: { message: "boom" } }),
    verifyJwtClaims: async () => ({ sub: null }),
  });
  assert(!res.ok);
  if (!res.ok) assertEquals(res.error, "auth_lookup_failed");
});

Deno.test("valid JWT (non-bridge) resolves to jwt auth", async () => {
  const res = await authenticateBearer("eyJ.some.jwt", {
    serviceKeyAvailable: true,
    lookupBridgeToken: async () => ({ data: null, error: null }),
    verifyJwtClaims: async () => ({ sub: "user-abc" }),
  });
  assert(res.ok);
  if (res.ok) {
    assertEquals(res.auth.kind, "jwt");
    assertEquals(res.auth.userId, "user-abc");
  }
});

Deno.test("invalid JWT (no sub) is rejected", async () => {
  const res = await authenticateBearer("eyJ.bad.jwt", {
    serviceKeyAvailable: true,
    lookupBridgeToken: async () => ({ data: null, error: null }),
    verifyJwtClaims: async () => ({ sub: null }),
  });
  assert(!res.ok);
  if (!res.ok) assertEquals(res.error, "unauthorized");
});

Deno.test("tentScopeMatches: bridge token must match payload tent_id", () => {
  const auth = { kind: "bridge" as const, userId: "u", tentScope: "tent-a", tokenId: "t" };
  assertEquals(tentScopeMatches(auth, "tent-a"), true);
  assertEquals(tentScopeMatches(auth, "tent-b"), false);
});

Deno.test("tentScopeMatches: JWT always passes (ownership checked separately)", () => {
  const auth = { kind: "jwt" as const, userId: "u" };
  assertEquals(tentScopeMatches(auth, "any-tent"), true);
});

Deno.test("sha256Hex produces stable hex digest", async () => {
  const h = await sha256Hex("hello");
  assertEquals(h, "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
});

Deno.test("empty bearer token is rejected (missing auth surrogate)", async () => {
  // The HTTP handler rejects requests without an `Authorization: Bearer …`
  // header before calling authenticateBearer. This case covers the path
  // where the header is present but the token after `Bearer ` is empty:
  // it must never be treated as a valid JWT or bridge token.
  const res = await authenticateBearer("", {
    serviceKeyAvailable: true,
    lookupBridgeToken: async () => ({ data: makeRow(), error: null }),
    verifyJwtClaims: async () => ({ sub: null }),
  });
  assert(!res.ok);
  if (!res.ok) assertEquals(res.error, "unauthorized");
});
