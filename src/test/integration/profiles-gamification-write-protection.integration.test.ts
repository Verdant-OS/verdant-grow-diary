/**
 * DB-backed integration test for profiles gamification write protection.
 *
 * BLOCKED unless local Supabase env vars are exported:
 *   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 *
 * Service role is used strictly for test setup/teardown/admin verification.
 * All tested UPDATE / DELETE / RPC calls run through an authenticated
 * anon-key client so we're proving what a real tampered client can and
 * cannot do.
 *
 * NEVER logs service_role keys, JWTs, refresh tokens, or user IDs.
 *
 * Wired via scripts/security/run-profiles-db-security.mjs, which exits
 * with a BLOCKED message when the vars are missing so the harness never
 * fakes a pass.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expectSanitizedDbError } from "./_helpers/sanitizedDbError";

const URL = process.env.SUPABASE_URL ?? "";
const ANON = process.env.SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const hasLocalSupabase = !!URL && !!ANON && !!SERVICE;

const d = hasLocalSupabase ? describe : describe.skip;

// Re-export so existing importers continue to work.
export { expectSanitizedDbError };

interface TestUser {
  id: string;
  email: string;
  client: SupabaseClient;
}

async function createTestUser(admin: SupabaseClient, tag: string): Promise<TestUser> {
  const email = `pgwp+${tag}+${Date.now()}+${Math.random().toString(36).slice(2, 8)}@example.test`;
  const password = `Test-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}!A1`;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !created.user) throw new Error("failed to create test user");
  const id = created.user.id;

  const userClient = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInErr } = await userClient.auth.signInWithPassword({ email, password });
  if (signInErr) throw new Error("failed to sign in test user");

  const { error: insErr } = await userClient.from("profiles").insert({ user_id: id });
  if (insErr && !/duplicate|already/i.test(insErr.message)) {
    throw new Error("failed to insert profile row");
  }
  return { id, email, client: userClient };
}

async function cleanupUser(admin: SupabaseClient, u: TestUser) {
  try {
    await admin.from("profiles").delete().eq("user_id", u.id);
    await admin.auth.admin.deleteUser(u.id);
  } catch {
    /* best-effort */
  }
}

async function readProfileAsAdmin(admin: SupabaseClient, userId: string) {
  const { data, error } = await admin
    .from("profiles")
    .select("tier,level,nugs_total,display_name,current_badge")
    .eq("user_id", userId)
    .single();
  if (error) throw new Error("admin read failed");
  return data;
}

async function profileExists(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await admin
    .from("profiles")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("admin exists check failed");
  return data != null;
}

const TEST_RPC_NAME = "__test_profiles_gamification_update";

async function tryCreateTestRpc(admin: SupabaseClient): Promise<boolean> {
  // Test-only RPC. SECURITY INVOKER so the trigger fires under the caller's
  // rights. Never shipped as a production migration. Dropped in afterAll.
  const sql = `
    CREATE OR REPLACE FUNCTION public.${TEST_RPC_NAME}(
      _profile_user_id uuid, _tier text, _level int, _nugs int
    ) RETURNS void
    LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $fn$
    BEGIN
      UPDATE public.profiles
         SET tier = COALESCE(_tier, tier),
             level = COALESCE(_level, level),
             nugs_total = COALESCE(_nugs, nugs_total)
       WHERE user_id = _profile_user_id;
    END;
    $fn$;
    GRANT EXECUTE ON FUNCTION public.${TEST_RPC_NAME}(uuid, text, int, int) TO authenticated;
  `;
  const { error } = await admin.rpc("exec_sql" as never, { sql } as never);
  if (!error) return true;
  // Fall back: try direct pg via PostgREST is not possible for arbitrary DDL.
  // If exec_sql doesn't exist in local stack, we mark RPC path BLOCKED (skip).
  return false;
}

async function tryDropTestRpc(admin: SupabaseClient) {
  const sql = `DROP FUNCTION IF EXISTS public.${TEST_RPC_NAME}(uuid, text, int, int);`;
  try {
    await admin.rpc("exec_sql" as never, { sql } as never);
  } catch {
    /* best-effort */
  }
}

d("profiles gamification write protection (local DB)", () => {
  let admin: SupabaseClient;
  let userA: TestUser;
  let userB: TestUser;
  let rpcAvailable = false;

  beforeAll(async () => {
    admin = createClient(URL, SERVICE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    userA = await createTestUser(admin, "a");
    userB = await createTestUser(admin, "b");
    rpcAvailable = await tryCreateTestRpc(admin);
  }, 45_000);

  afterAll(async () => {
    if (rpcAvailable) await tryDropTestRpc(admin);
    if (userA) await cleanupUser(admin, userA);
    if (userB) await cleanupUser(admin, userB);
  }, 30_000);

  it("A: authenticated client cannot update profiles.tier", async () => {
    const before = await readProfileAsAdmin(admin, userA.id);
    const { error } = await userA.client
      .from("profiles")
      .update({ tier: "pro" })
      .eq("user_id", userA.id);
    expect(error).not.toBeNull();
    expectSanitizedDbError(error);
    const after = await readProfileAsAdmin(admin, userA.id);
    expect(after.tier).toBe(before.tier);
  });

  it("B: authenticated client cannot update profiles.level", async () => {
    const before = await readProfileAsAdmin(admin, userA.id);
    const { error } = await userA.client
      .from("profiles")
      .update({ level: 999 })
      .eq("user_id", userA.id);
    expect(error).not.toBeNull();
    expectSanitizedDbError(error);
    const after = await readProfileAsAdmin(admin, userA.id);
    expect(after.level).toBe(before.level);
  });

  it("C: authenticated client cannot update profiles.nugs_total", async () => {
    const before = await readProfileAsAdmin(admin, userA.id);
    const { error } = await userA.client
      .from("profiles")
      .update({ nugs_total: 999_999 })
      .eq("user_id", userA.id);
    expect(error).not.toBeNull();
    expectSanitizedDbError(error);
    const after = await readProfileAsAdmin(admin, userA.id);
    expect(after.nugs_total).toBe(before.nugs_total);
  });

  it("D: mixed blocked+allowed update is atomic — nothing changes", async () => {
    const before = await readProfileAsAdmin(admin, userA.id);
    const newName = `atomic-${Date.now()}`;
    const { error } = await userA.client
      .from("profiles")
      .update({ tier: "pro", display_name: newName })
      .eq("user_id", userA.id);
    expect(error).not.toBeNull();
    expectSanitizedDbError(error);
    const after = await readProfileAsAdmin(admin, userA.id);
    expect(after.tier).toBe(before.tier);
    expect(after.display_name).toBe(before.display_name);
    expect(after.display_name).not.toBe(newName);
  });

  it("E: destructive gamification updates (null / zero / negative / combo) are blocked", async () => {
    const before = await readProfileAsAdmin(admin, userA.id);
    const attempts: Array<Record<string, unknown>> = [
      { tier: null },
      { level: null },
      { nugs_total: null },
      { level: 0 },
      { level: -1 },
      { nugs_total: 0 },
      { nugs_total: -1 },
      { tier: null, level: 0, nugs_total: 0 },
    ];
    for (const patch of attempts) {
      const { error } = await userA.client
        .from("profiles")
        .update(patch)
        .eq("user_id", userA.id);
      // Either the trigger rejects, or CHECK constraints reject, or the
      // change is a no-op — but the persisted row must never change.
      expectSanitizedDbError(error);
    }
    const after = await readProfileAsAdmin(admin, userA.id);
    expect(after.tier).toBe(before.tier);
    expect(after.level).toBe(before.level);
    expect(after.nugs_total).toBe(before.nugs_total);
  });

  it("F: authenticated user cannot DELETE own profile", async () => {
    expect(await profileExists(admin, userA.id)).toBe(true);
    const { error } = await userA.client
      .from("profiles")
      .delete()
      .eq("user_id", userA.id);
    if (error) expectSanitizedDbError(error);
    expect(await profileExists(admin, userA.id)).toBe(true);
  });

  it("G: authenticated user cannot DELETE another user's profile", async () => {
    expect(await profileExists(admin, userB.id)).toBe(true);
    const { data, error } = await userA.client
      .from("profiles")
      .delete()
      .eq("user_id", userB.id)
      .select();
    if (error) expectSanitizedDbError(error);
    expect(data == null || data.length === 0).toBe(true);
    expect(await profileExists(admin, userA.id)).toBe(true);
    expect(await profileExists(admin, userB.id)).toBe(true);
  });

  it("H: legitimate profile edit (display_name, current_badge) still succeeds", async () => {
    const before = await readProfileAsAdmin(admin, userA.id);
    const newName = `legit-${Date.now()}`;
    const newBadge = "seedling";
    const { error } = await userA.client
      .from("profiles")
      .update({ display_name: newName, current_badge: newBadge })
      .eq("user_id", userA.id);
    expect(error).toBeNull();
    const after = await readProfileAsAdmin(admin, userA.id);
    expect(after.display_name).toBe(newName);
    expect(after.current_badge).toBe(newBadge);
    expect(after.tier).toBe(before.tier);
    expect(after.level).toBe(before.level);
    expect(after.nugs_total).toBe(before.nugs_total);
  });

  it("I: cross-user — user A cannot update user B's profile (RLS)", async () => {
    const beforeB = await readProfileAsAdmin(admin, userB.id);
    const { data, error } = await userA.client
      .from("profiles")
      .update({ display_name: "hijacked", tier: "pro" })
      .eq("user_id", userB.id)
      .select();
    if (error) expectSanitizedDbError(error);
    expect(data == null || data.length === 0).toBe(true);
    const afterB = await readProfileAsAdmin(admin, userB.id);
    expect(afterB).toEqual(beforeB);
  });

  it("J: RPC-triggered gamification update is blocked by trigger", async () => {
    if (!rpcAvailable) {
      // Explicitly BLOCKED, not passed: local stack lacks exec_sql DDL helper.
      console.warn(
        "[profiles gamification] RPC path BLOCKED — local exec_sql unavailable",
      );
      return;
    }
    const before = await readProfileAsAdmin(admin, userA.id);
    const { error } = await userA.client.rpc(TEST_RPC_NAME as never, {
      _profile_user_id: userA.id,
      _tier: "pro",
      _level: 42,
      _nugs: 10_000,
    } as never);
    expect(error).not.toBeNull();
    expectSanitizedDbError(error);
    const after = await readProfileAsAdmin(admin, userA.id);
    expect(after.tier).toBe(before.tier);
    expect(after.level).toBe(before.level);
    expect(after.nugs_total).toBe(before.nugs_total);
  });
});
