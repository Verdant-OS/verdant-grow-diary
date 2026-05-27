/**
 * Vitest tests for the bridge token auth module used by sensor-ingest-webhook.
 *
 * Covers: valid token, revoked token, expired token, wrong tent, malformed
 * token, missing auth, and existing JWT behavior.
 *
 * The auth module is pure (deps injected) so it runs without network/Deno.
 */
import { describe, it, expect } from "vitest";
import {
  authenticateBearer,
  tentScopeMatches,
  sha256Hex,
  BRIDGE_PREFIX,
  type BridgeTokenRow,
} from "../../supabase/functions/sensor-ingest-webhook/auth";

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

describe("sensor-ingest-webhook bridge token auth", () => {
  it("valid bridge token resolves to bridge auth with user_id and tent_id", async () => {
    const res = await authenticateBearer(validToken, {
      serviceKeyAvailable: true,
      lookupBridgeToken: async () => ({ data: makeRow(), error: null }),
      verifyJwtClaims: async () => ({ sub: null }),
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.auth.kind).toBe("bridge");
      if (res.auth.kind === "bridge") {
        expect(res.auth.userId).toBe("22222222-2222-2222-2222-222222222222");
        expect(res.auth.tentScope).toBe("33333333-3333-3333-3333-333333333333");
        expect(res.auth.tokenId).toBe("11111111-1111-1111-1111-111111111111");
      }
    }
  });

  it("revoked bridge token is rejected with token_revoked", async () => {
    const res = await authenticateBearer(validToken, {
      serviceKeyAvailable: true,
      lookupBridgeToken: async () => ({
        data: makeRow({ revoked_at: past() }),
        error: null,
      }),
      verifyJwtClaims: async () => ({ sub: null }),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect((res as Extract<typeof res, { ok: false }>).error).toBe("token_revoked");
  });

  it("expired bridge token is rejected with token_expired", async () => {
    const res = await authenticateBearer(validToken, {
      serviceKeyAvailable: true,
      lookupBridgeToken: async () => ({
        data: makeRow({ expires_at: past() }),
        error: null,
      }),
      verifyJwtClaims: async () => ({ sub: null }),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect((res as Extract<typeof res, { ok: false }>).error).toBe("token_expired");
  });

  it("unknown bridge token (not in DB) is rejected as unauthorized", async () => {
    const res = await authenticateBearer(validToken, {
      serviceKeyAvailable: true,
      lookupBridgeToken: async () => ({ data: null, error: null }),
      verifyJwtClaims: async () => ({ sub: null }),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect((res as Extract<typeof res, { ok: false }>).error).toBe("unauthorized");
  });

  it("malformed bridge token (too short) is rejected without DB call", async () => {
    let dbCalled = false;
    const res = await authenticateBearer(BRIDGE_PREFIX + "abc", {
      serviceKeyAvailable: true,
      lookupBridgeToken: async () => {
        dbCalled = true;
        return { data: null, error: null };
      },
      verifyJwtClaims: async () => ({ sub: null }),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect((res as Extract<typeof res, { ok: false }>).error).toBe("unauthorized");
    expect(dbCalled).toBe(false);
  });

  it("missing auth (no Authorization header) handled by caller — auth module rejects empty token", async () => {
    // The edge function returns 401 before calling authenticateBearer when
    // no Authorization header is present. We verify that the module itself
    // rejects an empty string as unauthorized via JWT path.
    const res = await authenticateBearer("", {
      serviceKeyAvailable: true,
      lookupBridgeToken: async () => ({ data: null, error: null }),
      verifyJwtClaims: async () => ({ sub: null }),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect((res as Extract<typeof res, { ok: false }>).error).toBe("unauthorized");
  });

  it("valid JWT (non-bridge bearer) resolves to jwt auth", async () => {
    const res = await authenticateBearer("eyJ.some.jwt", {
      serviceKeyAvailable: true,
      lookupBridgeToken: async () => ({ data: null, error: null }),
      verifyJwtClaims: async () => ({ sub: "user-abc-123" }),
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.auth.kind).toBe("jwt");
      expect(res.auth.userId).toBe("user-abc-123");
    }
  });

  it("invalid JWT (no sub claim) is rejected as unauthorized", async () => {
    const res = await authenticateBearer("eyJ.bad.jwt", {
      serviceKeyAvailable: true,
      lookupBridgeToken: async () => ({ data: null, error: null }),
      verifyJwtClaims: async () => ({ sub: null }),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect((res as Extract<typeof res, { ok: false }>).error).toBe("unauthorized");
  });
});

describe("sensor-ingest-webhook tent scope enforcement", () => {
  it("bridge token must match payload tent_id", () => {
    const auth = {
      kind: "bridge" as const,
      userId: "u",
      tentScope: "tent-a",
      tokenId: "t",
    };
    expect(tentScopeMatches(auth, "tent-a")).toBe(true);
    expect(tentScopeMatches(auth, "tent-b")).toBe(false);
  });

  it("JWT auth always passes tent scope check (ownership checked separately)", () => {
    const auth = { kind: "jwt" as const, userId: "u" };
    expect(tentScopeMatches(auth, "any-tent")).toBe(true);
  });
});

describe("sensor-ingest-webhook token hashing", () => {
  it("sha256Hex produces correct hex digest", async () => {
    const h = await sha256Hex("hello");
    expect(h).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
  });

  it("different tokens produce different hashes (lookup isolation)", async () => {
    const h1 = await sha256Hex(BRIDGE_PREFIX + "token_one_xxxxxxxxx");
    const h2 = await sha256Hex(BRIDGE_PREFIX + "token_two_xxxxxxxxx");
    expect(h1).not.toBe(h2);
  });
});
