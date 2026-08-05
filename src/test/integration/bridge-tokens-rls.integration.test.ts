/**
 * DB-backed integration proof for bridge_tokens RLS + revocation integrity.
 *
 * BLOCKED unless local Supabase env vars are exported:
 *   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 *
 * Contract under test (supabase/migrations):
 *   - RLS: anon has no bridge_tokens access; authenticated users see and
 *     mutate ONLY their own rows (cross-user SELECT/UPDATE/DELETE denied).
 *   - bridge_tokens_guard_immutables (incl. 20260804213000):
 *       identity/secret columns frozen for everyone;
 *       revoked_at one-way for client roles (set once, never cleared or
 *       moved); usage telemetry (last_used_at / first_used_at /
 *       ingest_count) server-maintained for client roles;
 *       `name` stays owner-mutable.
 *   - Client inserts cannot seed telemetry either: the INSERT validator
 *     rejects nonzero ingest_count / preset first_used_at / last_used_at
 *     from client roles.
 *   - bump_bridge_token_usage: EXECUTE denied to authenticated; still
 *     works for service_role with the new guard in place (regression).
 *   - Effective DELETE privilege for authenticated is MEASURED
 *     behaviorally: the harness attempts the delete and asserts the
 *     outcome is one of the two contractual states (owner-scoped success,
 *     or clean denial with the row intact) — answering the
 *     repo-unverifiable platform-default question from checklist gap G3
 *     with whichever truth the environment gives.
 *
 * NEVER logs service_role keys, JWTs, token material, or user IDs.
 *
 * Wired via scripts/security/run-bridge-tokens-db-security.mjs, which exits
 * BLOCKED when the vars are missing so the harness never fakes a pass.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";

const URL = process.env.SUPABASE_URL ?? "";
const ANON = process.env.SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

function isLocalSupabaseUrl(u: string): boolean {
  try {
    const h = new globalThis.URL(u).hostname.toLowerCase();
    return (
      h === "127.0.0.1" ||
      h === "localhost" ||
      h === "::1" ||
      h === "0.0.0.0" ||
      h.endsWith(".localhost")
    );
  } catch {
    return false;
  }
}
const hasLocalSupabase = !!URL && !!ANON && !!SERVICE && isLocalSupabaseUrl(URL);
const d = hasLocalSupabase ? describe : describe.skip;

// Same leak philosophy as the pi-ingest suite: denied operations must fail
// with sanitized errors, never secrets, headers, or stack frames.
const FORBIDDEN_LEAKS: RegExp[] = [
  /service[_-]?role/i,
  /SUPABASE_SERVICE_ROLE_KEY/i,
  /bearer\s+/i,
  /authorization/i,
  /refresh[_-]?token/i,
  /access[_-]?token/i,
  /eyJ[a-zA-Z0-9_-]+\./,
  /vbt_[A-Za-z0-9_-]{8,}/,
  /\bat\s+.+:\d+:\d+/,
  /\/(?:home|Users|var|root)\/[^\s'"]+:\d+:\d+/,
];

function expectSanitizedDbError(err: unknown): void {
  if (err == null) return;
  const obj = err as Record<string, unknown>;
  const parts = Object.values(obj)
    .filter((v) => v != null && typeof v !== "object" && typeof v !== "function")
    .map((v) => String(v))
    .join("\n");
  for (const rx of FORBIDDEN_LEAKS) {
    expect(parts, `leaked pattern ${rx}`).not.toMatch(rx);
  }
}

interface TestUser {
  id: string;
  email: string;
  client: SupabaseClient;
}

function fakeTokenRow(tentId: string, userId: string) {
  // Hash-only at rest, exactly like mint: plaintext never persisted.
  const plaintext = `vbt_${randomBytes(32).toString("base64url")}`;
  const tokenHash = createHash("sha256").update(plaintext).digest("hex");
  return {
    user_id: userId,
    tent_id: tentId,
    name: "rls-harness-bridge",
    token_prefix: plaintext.slice(0, 12),
    token_hash: tokenHash,
    expires_at: new Date(Date.now() + 30 * 86400_000).toISOString(),
  };
}

d("bridge_tokens RLS + revocation integrity (local DB)", () => {
  const admin: SupabaseClient = hasLocalSupabase
    ? createClient(URL, SERVICE, { auth: { persistSession: false } })
    : (undefined as unknown as SupabaseClient);
  let owner: TestUser;
  let intruder: TestUser;
  let tentId: string;
  let tokenId: string;

  async function createTestUser(tag: string): Promise<TestUser> {
    const email = `bt-rls-${tag}-${Math.random().toString(36).slice(2, 8)}@example.test`;
    const password = `Bt-Rls-${Math.random().toString(36).slice(2, 10)}!`;
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr || !created.user) throw new Error("failed to create test user");
    const client = createClient(URL, ANON, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
    if (signInErr) throw new Error("failed to sign in test user");
    return { id: created.user.id, email, client };
  }

  async function insertOwnerToken(): Promise<string> {
    const { data, error } = await owner.client
      .from("bridge_tokens")
      .insert(fakeTokenRow(tentId, owner.id))
      .select("id")
      .single();
    if (error || !data) throw new Error("failed to insert harness token");
    return data.id as string;
  }

  beforeAll(async () => {
    owner = await createTestUser("owner");
    intruder = await createTestUser("intruder");
    const { data, error } = await owner.client
      .from("tents")
      .insert({ user_id: owner.id, name: "BT RLS Harness Tent" })
      .select("id")
      .single();
    if (error || !data) throw new Error("failed to create harness tent");
    tentId = data.id as string;
    tokenId = await insertOwnerToken();
  }, 45_000);

  afterAll(async () => {
    for (const u of [owner, intruder].filter(Boolean)) {
      await admin.from("bridge_tokens").delete().eq("user_id", u.id);
      await admin.from("tents").delete().eq("user_id", u.id);
      await admin.auth.admin.deleteUser(u.id).catch(() => {});
    }
  }, 30_000);

  it("anon can neither read nor insert bridge_tokens", async () => {
    const anonClient = createClient(URL, ANON, { auth: { persistSession: false } });
    const { data: rows, error: selErr } = await anonClient
      .from("bridge_tokens")
      .select("id")
      .limit(5);
    // Depending on grants this is either an explicit denial or an empty set;
    // both are acceptable — leaking rows is not.
    if (selErr) expectSanitizedDbError(selErr);
    expect(rows ?? []).toHaveLength(0);

    const { error: insErr } = await anonClient
      .from("bridge_tokens")
      .insert(fakeTokenRow(tentId, owner.id));
    expect(insErr, "anon insert must be denied").not.toBeNull();
    expectSanitizedDbError(insErr);
  });

  it("cross-user SELECT and UPDATE are denied by RLS", async () => {
    const { data: rows } = await intruder.client.from("bridge_tokens").select("id");
    expect(rows ?? []).toHaveLength(0);

    const { data: updated, error } = await intruder.client
      .from("bridge_tokens")
      .update({ name: "hijacked" })
      .eq("id", tokenId)
      .select("id");
    if (error) expectSanitizedDbError(error);
    expect(updated ?? []).toHaveLength(0);

    const { data: still } = await admin
      .from("bridge_tokens")
      .select("name")
      .eq("id", tokenId)
      .single();
    expect(still?.name).toBe("rls-harness-bridge");
  });

  it("owner can rename; identity/secret columns stay frozen", async () => {
    const { error: renameErr } = await owner.client
      .from("bridge_tokens")
      .update({ name: "renamed-bridge" })
      .eq("id", tokenId);
    expect(renameErr).toBeNull();

    const { error: freezeErr } = await owner.client
      .from("bridge_tokens")
      .update({ expires_at: new Date(Date.now() + 60 * 86400_000).toISOString() })
      .eq("id", tokenId);
    expect(freezeErr, "expires_at must stay frozen").not.toBeNull();
    expectSanitizedDbError(freezeErr);
  });

  it("a normal mint-shaped insert succeeds and starts with clean telemetry", async () => {
    const cleanId = await insertOwnerToken();
    const { data: row } = await admin
      .from("bridge_tokens")
      .select("ingest_count, first_used_at, last_used_at, revoked_at")
      .eq("id", cleanId)
      .single();
    expect(row?.ingest_count).toBe(0);
    expect(row?.first_used_at).toBeNull();
    expect(row?.last_used_at).toBeNull();
    expect(row?.revoked_at).toBeNull();
  });

  it("owner cannot seed usage telemetry or pre-revoked state at insert time", async () => {
    for (const poisoned of [
      { ingest_count: 999_999 },
      { first_used_at: new Date().toISOString() },
      { last_used_at: new Date().toISOString() },
      { revoked_at: new Date().toISOString() },
    ]) {
      const { error } = await owner.client
        .from("bridge_tokens")
        .insert({ ...fakeTokenRow(tentId, owner.id), ...poisoned });
      expect(
        error,
        `client insert seeding ${Object.keys(poisoned)[0]} must be denied`,
      ).not.toBeNull();
      expectSanitizedDbError(error);
    }
  });

  it("owner cannot rewrite usage telemetry (server-maintained)", async () => {
    for (const payload of [
      { ingest_count: 999_999 },
      { last_used_at: new Date().toISOString() },
      { first_used_at: new Date().toISOString() },
    ]) {
      const { error } = await owner.client.from("bridge_tokens").update(payload).eq("id", tokenId);
      expect(error, `client write of ${Object.keys(payload)[0]} must be denied`).not.toBeNull();
      expectSanitizedDbError(error);
    }
  });

  it("owner can revoke once; revocation is one-way against the client", async () => {
    const { error: revokeErr } = await owner.client
      .from("bridge_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", tokenId)
      .is("revoked_at", null);
    expect(revokeErr, "first revocation must succeed").toBeNull();

    const { error: unrevokeErr } = await owner.client
      .from("bridge_tokens")
      .update({ revoked_at: null })
      .eq("id", tokenId);
    expect(unrevokeErr, "un-revoke must be rejected").not.toBeNull();
    expectSanitizedDbError(unrevokeErr);

    const { error: moveErr } = await owner.client
      .from("bridge_tokens")
      .update({ revoked_at: new Date(Date.now() + 3600_000).toISOString() })
      .eq("id", tokenId);
    expect(moveErr, "moving an existing revocation must be rejected").not.toBeNull();

    const { data: row } = await admin
      .from("bridge_tokens")
      .select("revoked_at")
      .eq("id", tokenId)
      .single();
    expect(row?.revoked_at, "revocation must have survived every attack").not.toBeNull();
  });

  it("bump_bridge_token_usage: denied to authenticated, still functional for service_role", async () => {
    const liveTokenId = await insertOwnerToken();

    const { error: clientRpcErr } = await owner.client.rpc("bump_bridge_token_usage", {
      p_id: liveTokenId,
      p_inserted: 5,
    });
    expect(clientRpcErr, "authenticated EXECUTE must be denied").not.toBeNull();
    expectSanitizedDbError(clientRpcErr);

    const { error: serviceRpcErr } = await admin.rpc("bump_bridge_token_usage", {
      p_id: liveTokenId,
      p_inserted: 5,
    });
    expect(serviceRpcErr, "service_role bump must survive the new guard").toBeNull();

    const { data: bumped } = await admin
      .from("bridge_tokens")
      .select("ingest_count, first_used_at, last_used_at")
      .eq("id", liveTokenId)
      .single();
    expect(bumped?.ingest_count).toBe(5);
    expect(bumped?.first_used_at).not.toBeNull();
    expect(bumped?.last_used_at).not.toBeNull();
  });

  it("measures the effective authenticated DELETE privilege (gap G3) and behavior matches it", async () => {
    // No GRANT DELETE exists in any migration, so whether the owner-scoped
    // DELETE policy from 20260622161805 is live depends on privileges
    // provisioned outside the repo. The attempt itself is the measurement:
    // both outcomes are contractually acceptable, silent cross-user damage
    // is not.
    const disposableId = await insertOwnerToken();
    const { data: deleted, error: delErr } = await owner.client
      .from("bridge_tokens")
      .delete()
      .eq("id", disposableId)
      .select("id");
    if (delErr) {
      // No table-level DELETE privilege: the 20260622161805 policy is dead
      // code on a strict-grants replay. Record via sanitized failure.
      expectSanitizedDbError(delErr);
      const { data: survivor } = await admin
        .from("bridge_tokens")
        .select("id")
        .eq("id", disposableId)
        .maybeSingle();
      expect(survivor?.id, "denied delete must not remove the row").toBe(disposableId);
    } else {
      // Privilege exists (platform default): the owner-scoped DELETE policy
      // is live; the cross-user denial above still bounds it.
      expect((deleted ?? []).map((r) => (r as { id: string }).id)).toContain(disposableId);
    }
    // Cross-user DELETE must be denied either way.
    const secondId = await insertOwnerToken();
    const { data: foreignDeleted, error: foreignErr } = await intruder.client
      .from("bridge_tokens")
      .delete()
      .eq("id", secondId)
      .select("id");
    if (foreignErr) expectSanitizedDbError(foreignErr);
    expect(foreignDeleted ?? []).toHaveLength(0);
    const { data: intact } = await admin
      .from("bridge_tokens")
      .select("id")
      .eq("id", secondId)
      .maybeSingle();
    expect(intact?.id).toBe(secondId);
  });
});
