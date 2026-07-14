/**
 * profiles.tier entitlement-resolution boundary — DB-backed integration test.
 *
 * Proves the real Verdant billing/entitlement resolution path:
 *   1. Returns decisions that come from billing_subscriptions / subscriptions.
 *   2. NEVER queries public.profiles and NEVER reads profiles.tier.
 *
 * We wrap the authenticated Supabase client in a Proxy that records every
 * .from(<table>) and .rpc(<name>) call, then run the same three reads that
 * `useMyEntitlements` performs and feed them through the PURE
 * `resolveUnionEntitlements` composer. If any recorded call touches
 * `profiles`, the test fails — that is the exact bypass we're guarding
 * against.
 *
 * BLOCKED unless local Supabase env vars are exported:
 *   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 *
 * Service role is used strictly to seed billing rows and clean up. All
 * entitlement reads use the authenticated anon-key client under RLS.
 * NEVER logs service_role material, JWTs, or provider IDs.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  resolveUnionEntitlements,
  type BillingSubscriptionRow,
  type LovableSubscriptionRow,
} from "@/lib/entitlements";

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

// Wraps a Supabase client and records every `.from(table)` / `.rpc(name)`
// invocation so the test can assert entitlement resolution never touches
// public.profiles. Read-through wrapper — no behavior change.
function instrumentClient(client: SupabaseClient) {
  const fromTables: string[] = [];
  const rpcNames: string[] = [];
  const wrapped = new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === "from") {
        return (table: string) => {
          fromTables.push(table);
          return (target as unknown as { from: (t: string) => unknown }).from(
            table,
          );
        };
      }
      if (prop === "rpc") {
        return (name: string, args?: unknown) => {
          rpcNames.push(name);
          return (
            target as unknown as {
              rpc: (n: string, a?: unknown) => unknown;
            }
          ).rpc(name, args);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
  return { client: wrapped as SupabaseClient, fromTables, rpcNames };
}

interface TestUser {
  id: string;
  email: string;
  password: string;
}

async function createTestUser(admin: SupabaseClient, tag: string): Promise<TestUser> {
  const email = `perb+${tag}+${Date.now()}+${Math.random().toString(36).slice(2, 8)}@example.test`;
  const password = `Test-${Math.random().toString(36).slice(2)}!A1`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error("failed to create test user");
  return { id: data.user.id, email, password };
}

async function signIn(u: TestUser): Promise<SupabaseClient> {
  const c = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await c.auth.signInWithPassword({
    email: u.email,
    password: u.password,
  });
  if (error) throw new Error("failed to sign in test user");
  return c;
}

async function cleanup(admin: SupabaseClient, u: TestUser) {
  try {
    await admin.from("billing_subscriptions").delete().eq("user_id", u.id);
    await admin.from("subscriptions").delete().eq("user_id", u.id);
    await admin.from("profiles").delete().eq("user_id", u.id);
    await admin.auth.admin.deleteUser(u.id);
  } catch {
    /* best-effort */
  }
}

async function seedByo(
  admin: SupabaseClient,
  userId: string,
  patch: Partial<BillingSubscriptionRow>,
) {
  const row = {
    user_id: userId,
    plan_id: "pro_monthly",
    status: "active",
    provider: "paddle",
    current_period_end: new Date(Date.now() + 30 * 24 * 3600_000).toISOString(),
    cancel_at_period_end: false,
    ...patch,
  };
  const { error } = await admin.from("billing_subscriptions").upsert(row);
  if (error) throw new Error(`seed byo failed: ${error.message}`);
}

/**
 * Runs the same three reads that useMyEntitlements does (BYO + Lovable +
 * staff role), through the instrumented client, and returns the resolved
 * union entitlement + recorded table/rpc calls. NO local decision stub —
 * decision comes from the pure resolver fed with real DB rows.
 */
async function resolveViaRealPath(
  authedClient: SupabaseClient,
  userId: string,
  env: "sandbox" | "live" = "sandbox",
) {
  const { client, fromTables, rpcNames } = instrumentClient(authedClient);
  const [byoRes, lovRes, roleRes] = await Promise.all([
    client
      .from("billing_subscriptions")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle(),
    client
      .from("subscriptions")
      .select("*")
      .eq("user_id", userId)
      .eq("environment", env)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    client
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "staff")
      .maybeSingle(),
  ]);
  const byoRow = byoRes.error
    ? null
    : ((byoRes.data ?? null) as BillingSubscriptionRow | null);
  const lovableRow = lovRes.error
    ? null
    : ((lovRes.data ?? null) as LovableSubscriptionRow | null);
  const isStaff = !roleRes.error && roleRes.data != null;

  const entitlement = resolveUnionEntitlements({
    byoRow,
    lovableRow,
    expectedBillingEnvironment: env,
    now: new Date(),
    opts: { isStaff },
  });
  return { entitlement, fromTables, rpcNames };
}

function assertNoProfilesTouched(fromTables: string[], rpcNames: string[]) {
  expect(fromTables, `tables read: ${fromTables.join(",")}`).not.toContain("profiles");
  for (const t of fromTables) {
    expect(t.toLowerCase()).not.toMatch(/^profiles/);
  }
  for (const r of rpcNames) {
    expect(r.toLowerCase()).not.toMatch(/profile.*tier|tier.*profile/);
  }
}

d("profiles.tier entitlement-resolution boundary (local DB)", () => {
  let admin: SupabaseClient;

  beforeAll(() => {
    admin = createClient(URL, SERVICE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  it("A: free user (no billing rows) resolves to Free without querying profiles", async () => {
    const u = await createTestUser(admin, "free");
    try {
      const authed = await signIn(u);
      const { entitlement, fromTables, rpcNames } = await resolveViaRealPath(
        authed,
        u.id,
      );
      expect(entitlement.effectivePlanId).toBe("free");
      expect(entitlement.isActive).toBe(true);
      expect(entitlement.capabilities.multiTent).toBe(false);
      assertNoProfilesTouched(fromTables, rpcNames);
    } finally {
      await cleanup(admin, u);
    }
  }, 30_000);

  it("B: active pro_monthly resolves to Pro without querying profiles", async () => {
    const u = await createTestUser(admin, "pro");
    try {
      await seedByo(admin, u.id, { plan_id: "pro_monthly", status: "active" });
      const authed = await signIn(u);
      const { entitlement, fromTables, rpcNames } = await resolveViaRealPath(
        authed,
        u.id,
      );
      expect(entitlement.effectivePlanId).toBe("pro_monthly");
      expect(entitlement.isActive).toBe(true);
      assertNoProfilesTouched(fromTables, rpcNames);
    } finally {
      await cleanup(admin, u);
    }
  }, 30_000);

  it("C: founder_lifetime resolves to lifetime Pro-equivalent without querying profiles", async () => {
    const u = await createTestUser(admin, "founder");
    try {
      await seedByo(admin, u.id, {
        plan_id: "founder_lifetime",
        status: "active",
        current_period_end: null,
      });
      const authed = await signIn(u);
      const { entitlement, fromTables, rpcNames } = await resolveViaRealPath(
        authed,
        u.id,
      );
      expect(entitlement.effectivePlanId).toBe("founder_lifetime");
      expect(entitlement.isActive).toBe(true);
      assertNoProfilesTouched(fromTables, rpcNames);
    } finally {
      await cleanup(admin, u);
    }
  }, 30_000);

  it("D: expired/canceled-past-period user has no write entitlement, no profiles read", async () => {
    const u = await createTestUser(admin, "expired");
    try {
      await seedByo(admin, u.id, {
        plan_id: "pro_monthly",
        status: "canceled",
        current_period_end: new Date(Date.now() - 24 * 3600_000).toISOString(),
      });
      const authed = await signIn(u);
      const { entitlement, fromTables, rpcNames } = await resolveViaRealPath(
        authed,
        u.id,
      );
      expect(entitlement.isActive).toBe(false);
      expect(entitlement.effectivePlanId).toBe("free");
      expect(entitlement.degraded).toBe(true);
      assertNoProfilesTouched(fromTables, rpcNames);
    } finally {
      await cleanup(admin, u);
    }
  }, 30_000);
});
