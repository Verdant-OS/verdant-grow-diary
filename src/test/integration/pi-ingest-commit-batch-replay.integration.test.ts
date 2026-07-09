/**
 * DB-backed integration proof for pi_ingest_commit_batch.
 *
 * BLOCKED unless local Supabase env vars are exported:
 *   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 *
 * Contract under test (supabase/migrations — SECURITY DEFINER RPC):
 *   - EXECUTE is granted to service_role ONLY; anon/authenticated are denied.
 *   - Rows replaying an existing (user_id, idempotency_key) are rejected,
 *     not re-inserted.
 *   - A tent that does not belong to the target user hard-fails (42501).
 *   - The batch is atomic: one invalid row aborts the whole batch.
 *
 * Service role is used for admin setup/teardown AND for legitimate commits
 * (that is the production caller — the pi-ingest Edge Function). Denial
 * tests run through anon-key clients to prove what a tampered client can
 * and cannot do.
 *
 * NEVER logs service_role keys, JWTs, refresh tokens, or user IDs.
 *
 * Wired via scripts/security/run-pi-ingest-db-security.mjs, which exits
 * with a BLOCKED message when the vars are missing so the harness never
 * fakes a pass.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL ?? "";
const ANON = process.env.SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
// Safety gate: these suites do REAL service-role setup/teardown (create and
// delete auth users, mutate app tables / storage). They must NEVER run
// against a remote project, even if SUPABASE_* happen to be exported in a
// shell or CI pointed at staging/production and the repo-wide `vitest run`
// discovers this file. Require a LOCAL loopback Supabase URL.
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

// Same leak deny-list philosophy as the profiles suite: rejected DB errors
// must never leak secrets, tokens, headers, or stack frames.
const FORBIDDEN_LEAKS: RegExp[] = [
  /service[_-]?role/i,
  /SUPABASE_SERVICE_ROLE_KEY/i,
  /bearer\s+/i,
  /authorization/i,
  /refresh[_-]?token/i,
  /access[_-]?token/i,
  /eyJ[a-zA-Z0-9_-]+\./,
  /\bat\s+.+:\d+:\d+/,
  /\/(?:home|Users|var|root)\/[^\s'"]+:\d+:\d+/,
];

function expectSanitizedDbError(err: unknown): void {
  if (err == null) return;
  const obj = err as Record<string, unknown>;
  // Coerce EVERY present field to string (including numeric ones like
  // `status`) so the leak scan covers non-string carriers, not just the
  // known text fields.
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

const RPC = "pi_ingest_commit_batch";
const BRIDGE_ID = "e2e-proof-bridge";

function makeRow(key: string, overrides: Record<string, unknown> = {}) {
  return {
    idempotency_key: key,
    device_id: "e2e-device-1",
    metric: "temperature_c",
    value: 23.4,
    captured_at: new Date().toISOString(),
    source: "pi_bridge",
    quality: "ok",
    ...overrides,
  };
}

/** Normalize RETURNS TABLE(inserted, rejected) across PostgREST shapes. */
function counts(data: unknown): { inserted: number; rejected: number } {
  const row = Array.isArray(data) ? data[0] : data;
  return row as { inserted: number; rejected: number };
}

d("pi_ingest_commit_batch replay + boundary proof (local DB)", () => {
  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
  let owner: TestUser;
  let intruder: TestUser;
  let tentId: string;
  let foreignTentId: string;

  async function createTestUser(tag: string): Promise<TestUser> {
    const email = `pi-e2e-${tag}-${Math.random().toString(36).slice(2, 8)}@example.test`;
    const password = `Pi-E2E-${Math.random().toString(36).slice(2, 10)}!`;
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

  async function createTent(user: TestUser, name: string): Promise<string> {
    const { data, error } = await user.client
      .from("tents")
      .insert({ user_id: user.id, name })
      .select("id")
      .single();
    if (error || !data) throw new Error("failed to create test tent");
    return data.id as string;
  }

  beforeAll(async () => {
    owner = await createTestUser("owner");
    intruder = await createTestUser("intruder");
    tentId = await createTent(owner, "PI E2E Proof Tent");
    foreignTentId = await createTent(intruder, "PI E2E Foreign Tent");
  }, 45_000); // multiple admin round-trips — match the profiles suite budget

  afterAll(async () => {
    // Service-role teardown only; ignore errors so cleanup never masks results.
    for (const u of [owner, intruder].filter(Boolean)) {
      await admin.from("pi_ingest_idempotency_keys").delete().eq("user_id", u.id);
      await admin.from("sensor_readings").delete().eq("user_id", u.id);
      await admin.from("tents").delete().eq("user_id", u.id);
      await admin.auth.admin.deleteUser(u.id).catch(() => {});
    }
  }, 30_000);

  it("anon client cannot execute the commit RPC", async () => {
    const anonClient = createClient(URL, ANON, { auth: { persistSession: false } });
    const { error } = await anonClient.rpc(RPC, {
      p_user_id: owner.id,
      p_bridge_id: BRIDGE_ID,
      p_tent_id: tentId,
      p_rows: [makeRow("anon-attempt-1")],
    });
    expect(error, "anon execution must be denied").not.toBeNull();
    expect(error!.code).toBe("42501");
    expectSanitizedDbError(error);
  });

  it("authenticated client cannot execute the commit RPC", async () => {
    const { error } = await owner.client.rpc(RPC, {
      p_user_id: owner.id,
      p_bridge_id: BRIDGE_ID,
      p_tent_id: tentId,
      p_rows: [makeRow("authed-attempt-1")],
    });
    expect(error, "authenticated execution must be denied").not.toBeNull();
    expect(error!.code).toBe("42501");
    expectSanitizedDbError(error);
  });

  it("service-role commit inserts rows and records idempotency keys", async () => {
    const { data, error } = await admin.rpc(RPC, {
      p_user_id: owner.id,
      p_bridge_id: BRIDGE_ID,
      p_tent_id: tentId,
      p_rows: [makeRow("batch1-key1"), makeRow("batch1-key2", { metric: "humidity_pct", value: 55 })],
    });
    expect(error).toBeNull();
    expect(counts(data)).toEqual({ inserted: 2, rejected: 0 });

    const { count: readings } = await admin
      .from("sensor_readings")
      .select("id", { count: "exact", head: true })
      .eq("user_id", owner.id);
    const { count: keys } = await admin
      .from("pi_ingest_idempotency_keys")
      .select("id", { count: "exact", head: true })
      .eq("user_id", owner.id);
    expect(readings).toBe(2);
    expect(keys).toBe(2);
  });

  it("full batch replay is rejected without duplicate readings", async () => {
    const { data, error } = await admin.rpc(RPC, {
      p_user_id: owner.id,
      p_bridge_id: BRIDGE_ID,
      p_tent_id: tentId,
      p_rows: [makeRow("batch1-key1"), makeRow("batch1-key2")],
    });
    expect(error).toBeNull();
    expect(counts(data)).toEqual({ inserted: 0, rejected: 2 });

    const { count: readings } = await admin
      .from("sensor_readings")
      .select("id", { count: "exact", head: true })
      .eq("user_id", owner.id);
    expect(readings, "replay must not duplicate readings").toBe(2);
  });

  it("partial replay inserts only the new row", async () => {
    const { data, error } = await admin.rpc(RPC, {
      p_user_id: owner.id,
      p_bridge_id: BRIDGE_ID,
      p_tent_id: tentId,
      p_rows: [makeRow("batch1-key1"), makeRow("batch2-key1", { metric: "vpd_kpa", value: 1.1 })],
    });
    expect(error).toBeNull();
    expect(counts(data)).toEqual({ inserted: 1, rejected: 1 });
  });

  it("commit against another user's tent hard-fails and writes nothing", async () => {
    const readingsBefore = async () =>
      (
        await admin
          .from("sensor_readings")
          .select("id", { count: "exact", head: true })
          .eq("user_id", owner.id)
      ).count ?? 0;
    const before = await readingsBefore();

    const { error } = await admin.rpc(RPC, {
      p_user_id: owner.id,
      p_bridge_id: BRIDGE_ID,
      p_tent_id: foreignTentId,
      p_rows: [makeRow("cross-tent-key1")],
    });
    expect(error, "cross-user tent must be rejected").not.toBeNull();
    expect(error!.message).toMatch(/tent does not belong to user/i);
    expectSanitizedDbError(error);

    // Nothing persisted: neither a ledger row nor a sensor_readings row.
    const { count: keyCount } = await admin
      .from("pi_ingest_idempotency_keys")
      .select("id", { count: "exact", head: true })
      .eq("user_id", owner.id)
      .eq("idempotency_key", "cross-tent-key1");
    expect(keyCount).toBe(0);
    expect(await readingsBefore(), "no sensor_readings written on rejection").toBe(before);
  });

  it("one invalid row aborts the whole batch atomically", async () => {
    const badBatch = [
      makeRow("atomic-good-key"),
      { ...makeRow(""), idempotency_key: "" }, // missing idempotency_key -> 22023
    ];
    const { error } = await admin.rpc(RPC, {
      p_user_id: owner.id,
      p_bridge_id: BRIDGE_ID,
      p_tent_id: tentId,
      p_rows: badBatch,
    });
    expect(error, "invalid row must abort the batch").not.toBeNull();
    expectSanitizedDbError(error);

    // The valid row that preceded the invalid one must NOT have persisted.
    const { count } = await admin
      .from("pi_ingest_idempotency_keys")
      .select("id", { count: "exact", head: true })
      .eq("user_id", owner.id)
      .eq("idempotency_key", "atomic-good-key");
    expect(count, "atomicity: partial batch must roll back").toBe(0);
  });

  it("commits never write alerts or action_queue rows", async () => {
    // The RPC's contract (see its COMMENT in the migration): sensor data
    // only — no alert or action-queue side effects, accepted or rejected.
    const { count: alerts } = await admin
      .from("alerts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", owner.id);
    const { count: actions } = await admin
      .from("action_queue")
      .select("id", { count: "exact", head: true })
      .eq("user_id", owner.id);
    expect(alerts).toBe(0);
    expect(actions).toBe(0);
  });

  it("idempotency ledger is owner-scoped; bridge credentials are unreadable", async () => {
    // Schema intent (RLS): "Users view own pi_ingest_idempotency_keys"
    // (auth.uid() = user_id) — owners MAY read their own ledger rows;
    // everyone else's rows must be invisible.
    const { data: ownRows, error: ownErr } = await owner.client
      .from("pi_ingest_idempotency_keys")
      .select("user_id");
    expect(ownErr).toBeNull();
    expect(ownRows!.length).toBeGreaterThan(0);
    expect(
      ownRows!.every((r) => r.user_id === owner.id),
      "owner must only see their own ledger rows",
    ).toBe(true);

    const { data: crossRows, error: crossErr } = await intruder.client
      .from("pi_ingest_idempotency_keys")
      .select("idempotency_key");
    expect(crossErr).toBeNull();
    expect(crossRows, "other users' ledger rows must be invisible").toEqual([]);

    // pi_ingest_bridge_credentials has NO SELECT policy: reads return
    // nothing for any client (secrets never reach the API surface).
    const { data: credRows, error: credErr } = await owner.client
      .from("pi_ingest_bridge_credentials")
      .select("*")
      .limit(5);
    if (credErr) {
      expectSanitizedDbError(credErr);
    } else {
      expect(credRows).toEqual([]);
    }
  });
});
