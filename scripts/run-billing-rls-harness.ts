#!/usr/bin/env -S bun run
/**
 * Runtime RLS harness for public.billing_subscriptions — real signed-in
 * Supabase clients hitting PostgREST, no `SET ROLE` shortcuts.
 *
 * service_role is used ONLY to:
 *   - create two auth.users (seed)
 *   - insert two billing_subscriptions rows (seed)
 *   - read-back rows after rejected mutations (verification)
 *   - delete the seeded users (teardown)
 *
 * Every rejected-mutation assertion runs through an authenticated (anon-key
 * + JWT session) or anon (anon-key, no session) client.
 *
 * Run:
 *   bun run scripts/run-billing-rls-harness.ts
 *
 * Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY.
 * NOT part of the default Vitest suite — invoke separately.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!;
for (const [k, v] of [["SUPABASE_URL", SUPABASE_URL], ["SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY], ["SUPABASE_ANON_KEY", ANON_KEY]]) {
  if (!v) { console.error(`missing ${k}`); process.exit(2); }
}

const EMAIL_A = "rls-harness-a@verdant.test";
const EMAIL_B = "rls-harness-b@verdant.test";
const PASS_A = crypto.randomUUID();
const PASS_B = crypto.randomUUID();

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let pass = 0, fail = 0;
const results: { name: string; ok: boolean; detail?: string }[] = [];
function check(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail });
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
}

async function adminCreateUser(email: string, password: string): Promise<string> {
  // Wipe any leftover from prior runs.
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const prior = list?.users?.find((u) => u.email === email);
  if (prior) await admin.auth.admin.deleteUser(prior.id);
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser ${email}: ${error?.message}`);
  return data.user.id;
}

async function signedInClient(email: string, password: string): Promise<SupabaseClient> {
  const c = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn ${email}: ${error.message}`);
  return c;
}

async function main() {
  console.log("→ seeding two auth.users via admin API (service_role)");
  const uidA = await adminCreateUser(EMAIL_A, PASS_A);
  const uidB = await adminCreateUser(EMAIL_B, PASS_B);

  // Seed billing_subscriptions rows with service_role.
  await admin.from("billing_subscriptions").delete().in("user_id", [uidA, uidB]);
  const { error: seedErr } = await admin.from("billing_subscriptions").insert([
    { user_id: uidA, plan_id: "free", status: "active" },
    { user_id: uidB, plan_id: "free", status: "active" },
  ]);
  if (seedErr) { console.error("seed insert failed:", seedErr); process.exit(1); }

  try {
    console.log("→ signing in user A + user B as real authenticated clients");
    const a = await signedInClient(EMAIL_A, PASS_A);
    const b = await signedInClient(EMAIL_B, PASS_B);
    const anon = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    console.log("→ assertions");

    // 1. A reads own row → exactly one row, matches uidA.
    {
      const { data, error } = await a.from("billing_subscriptions").select("user_id,plan_id");
      check("1. A SELECT own → 1 row, matches uidA",
        !error && Array.isArray(data) && data.length === 1 && data[0].user_id === uidA,
        error?.message ?? `rows=${data?.length} first=${data?.[0]?.user_id}`);
    }

    // 2. A reads B's row → 0 rows (silent RLS filter).
    {
      const { data, error } = await a.from("billing_subscriptions")
        .select("user_id").eq("user_id", uidB);
      check("2. A SELECT where user_id=B → 0 rows (RLS filters silently)",
        !error && Array.isArray(data) && data.length === 0,
        error?.message ?? `rows=${data?.length}`);
    }

    // 3a. A INSERT claiming own user_id → rejected.
    {
      const { data, error } = await a.from("billing_subscriptions")
        .insert({ user_id: uidA, plan_id: "founder_lifetime", status: "active" })
        .select();
      check("3a. A INSERT own user_id → rejected",
        !!error || (Array.isArray(data) && data.length === 0),
        error ? `code=${error.code} msg=${error.message}` : `data=${JSON.stringify(data)}`);
    }
    // 3b. A INSERT claiming B's user_id (self-grant exploit) → rejected.
    {
      const { data, error } = await a.from("billing_subscriptions")
        .insert({ user_id: uidB, plan_id: "founder_lifetime", status: "active" })
        .select();
      check("3b. A INSERT arbitrary user_id → rejected",
        !!error || (Array.isArray(data) && data.length === 0),
        error ? `code=${error.code}` : `data=${JSON.stringify(data)}`);
    }

    // 4. A UPDATE own row → rejected (no rows changed).
    {
      const { data, error } = await a.from("billing_subscriptions")
        .update({ plan_id: "founder_lifetime" }).eq("user_id", uidA).select();
      const noChange = !error && Array.isArray(data) && data.length === 0;
      check("4a. A UPDATE own → rejected or 0 rows affected",
        !!error || noChange,
        error?.message ?? `data=${JSON.stringify(data)}`);
      // Verify row content unchanged (read as service_role).
      const { data: verify } = await admin.from("billing_subscriptions")
        .select("plan_id").eq("user_id", uidA).single();
      check("4b. row plan_id unchanged after UPDATE attempt",
        verify?.plan_id === "free", `plan_id=${verify?.plan_id}`);
    }

    // 5. A DELETE own row → rejected.
    {
      const { data, error } = await a.from("billing_subscriptions")
        .delete().eq("user_id", uidA).select();
      const noChange = !error && Array.isArray(data) && data.length === 0;
      check("5a. A DELETE own → rejected or 0 rows affected",
        !!error || noChange,
        error?.message ?? `data=${JSON.stringify(data)}`);
      const { count } = await admin.from("billing_subscriptions")
        .select("*", { count: "exact", head: true }).eq("user_id", uidA);
      check("5b. row still present after DELETE attempt", count === 1, `count=${count}`);
    }

    // 6. anon SELECT / INSERT / UPDATE / DELETE.
    {
      const { data, error } = await anon.from("billing_subscriptions").select("user_id");
      const denied = !!error;
      const empty = !error && Array.isArray(data) && data.length === 0;
      check("6a. anon SELECT → denied or 0 rows (no leak)", denied || empty,
        error?.message ?? `rows=${data?.length}`);
    }
    {
      const { data, error } = await anon.from("billing_subscriptions")
        .insert({ user_id: uidA, plan_id: "founder_lifetime", status: "active" }).select();
      check("6b. anon INSERT → rejected",
        !!error || (Array.isArray(data) && data.length === 0),
        error?.message);
    }
    {
      const { data, error } = await anon.from("billing_subscriptions")
        .update({ plan_id: "founder_lifetime" }).eq("user_id", uidA).select();
      check("6c. anon UPDATE → rejected or 0 rows",
        !!error || (Array.isArray(data) && data.length === 0),
        error?.message);
    }
    {
      const { data, error } = await anon.from("billing_subscriptions")
        .delete().eq("user_id", uidA).select();
      check("6d. anon DELETE → rejected or 0 rows",
        !!error || (Array.isArray(data) && data.length === 0),
        error?.message);
    }

    // 7. B unaffected; both rows still 'free' (verified as service_role).
    {
      const { data } = await admin.from("billing_subscriptions")
        .select("user_id,plan_id").in("user_id", [uidA, uidB]);
      const allFree = Array.isArray(data) && data.length === 2 &&
        data.every((r) => r.plan_id === "free");
      check("7. final verification: both seeded rows still plan_id='free'", allFree,
        JSON.stringify(data));
    }

  } finally {
    console.log("→ teardown: deleting seeded billing_subscriptions + auth.users");
    await admin.from("billing_subscriptions").delete().in("user_id", [uidA, uidB]);
    await admin.auth.admin.deleteUser(uidA).catch(() => {});
    await admin.auth.admin.deleteUser(uidB).catch(() => {});
  }

  console.log(`\nresult: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
