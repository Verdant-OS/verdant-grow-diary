/**
 * DB-backed integration test for profiles gamification write protection.
 *
 * BLOCKED unless local Supabase env vars are exported:
 *   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 *
 * Service role is used strictly for test setup/teardown (creating test
 * users, seeding a baseline profile row, cleanup). All tested UPDATEs run
 * through an authenticated anon-key client so we're proving what a real
 * tampered client can and cannot do.
 *
 * NEVER logs service_role keys, JWTs, refresh tokens, or user IDs.
 *
 * Wired via scripts/security/run-profiles-db-security.mjs, which exits
 * with a BLOCKED message when the vars are missing so the harness never
 * fakes a pass.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL ?? "";
const ANON = process.env.SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const hasLocalSupabase = !!URL && !!ANON && !!SERVICE;

const d = hasLocalSupabase ? describe : describe.skip;

// Sanitized error assertion: no provider/customer/payment identifiers,
// no service role, no private env leakage.
const FORBIDDEN_LEAKS = [
  /service[_-]?role/i,
  /sk_live_/i,
  /sk_test_/i,
  /cus_/i,
  /sub_/i,
  /pdl_/i,
  /paddle/i,
  /stripe/i,
  /SUPABASE_SERVICE_ROLE_KEY/i,
];

function assertSanitized(msg: string | null | undefined) {
  const m = msg ?? "";
  for (const rx of FORBIDDEN_LEAKS) {
    expect(m).not.toMatch(rx);
  }
}

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

  // Ensure profile row exists (INSERT policy allows own row).
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

d("profiles gamification write protection (local DB)", () => {
  let admin: SupabaseClient;
  let userA: TestUser;
  let userB: TestUser;

  beforeAll(async () => {
    admin = createClient(URL, SERVICE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    userA = await createTestUser(admin, "a");
    userB = await createTestUser(admin, "b");
  }, 30_000);

  afterAll(async () => {
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
    assertSanitized(error?.message);
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
    assertSanitized(error?.message);
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
    assertSanitized(error?.message);
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
    assertSanitized(error?.message);
    const after = await readProfileAsAdmin(admin, userA.id);
    expect(after.tier).toBe(before.tier);
    expect(after.display_name).toBe(before.display_name);
    expect(after.display_name).not.toBe(newName);
  });

  it("E: legitimate profile edit (display_name, current_badge) succeeds", async () => {
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

  it("F: cross-user — user A cannot update user B's profile (RLS)", async () => {
    const beforeB = await readProfileAsAdmin(admin, userB.id);
    const { data, error } = await userA.client
      .from("profiles")
      .update({ display_name: "hijacked", tier: "pro" })
      .eq("user_id", userB.id)
      .select();
    // RLS silently filters — either an error or zero rows affected.
    if (error) assertSanitized(error.message);
    expect(data == null || data.length === 0).toBe(true);
    const afterB = await readProfileAsAdmin(admin, userB.id);
    expect(afterB).toEqual(beforeB);
  });
});
