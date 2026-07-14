#!/usr/bin/env -S bun run
/**
 * Runtime harness: staff-role RLS enforcement.
 *
 * Proves that an authenticated but NON-staff user cannot:
 *   1. read another user's row in public.user_roles
 *   2. insert a `staff` role for themselves (client-side privilege escalation)
 *   3. insert a `staff` role for anyone else
 *   4. update or delete a foreign role row
 *   5. call has_role() and receive `true` for the staff role
 *
 * And that an anonymous (unauthenticated) client cannot:
 *   6. read user_roles at all
 *   7. insert into user_roles at all
 *   8. execute has_role() at all
 *
 * service_role is used ONLY as a privileged setup/teardown driver:
 *   - create/delete auth.users
 *   - seed one legitimate `staff` row for a target user to attempt to read
 *   - final cleanup (delete seeded rows + users)
 *
 * It is NEVER given to the code paths under test. The privilege-escalation
 * attempts use the ANON key + a real signed-in session, exactly like the
 * browser client would.
 *
 * Run:
 *   bun run scripts/run-staff-role-rls-harness.ts
 *
 * Required env:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SUPABASE_ANON_KEY
 *
 * NOT wired into default CI, default `test`, or default vitest. This harness
 * writes to auth.users and user_roles via service_role and MUST be invoked
 * intentionally by an operator.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? "";

for (const [k, v] of [
  ["SUPABASE_URL", SUPABASE_URL],
  ["SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY],
  ["SUPABASE_ANON_KEY", ANON_KEY],
] as const) {
  if (!v) {
    console.error(`missing ${k}`);
    process.exit(2);
  }
}

const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Unique suffix so parallel/repeat runs never collide with real users.
const TAG = `staff-rls-${crypto.randomUUID().slice(0, 8)}`;
const ATTACKER_EMAIL = `attacker-${TAG}@verdant.test`;
const VICTIM_EMAIL = `victim-${TAG}@verdant.test`;
const ATTACKER_PASSWORD = crypto.randomUUID();
const VICTIM_PASSWORD = crypto.randomUUID();

let pass = 0;
let fail = 0;
const createdUsers: string[] = [];
const seededRoleUserIds: string[] = [];

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function deleteByEmail(email: string) {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const prior = data?.users?.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase(),
  );
  if (prior) await admin.auth.admin.deleteUser(prior.id);
}

async function createConfirmedUser(email: string, password: string): Promise<string> {
  await deleteByEmail(email);
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser ${email}: ${error?.message}`);
  createdUsers.push(data.user.id);
  return data.user.id;
}

async function ensureNoStaffRow(userId: string) {
  await admin.from("user_roles").delete().eq("user_id", userId).eq("role", "staff");
}

async function seedStaffRow(userId: string) {
  const { error } = await admin
    .from("user_roles")
    .insert({ user_id: userId, role: "staff" });
  if (error) throw new Error(`seedStaffRow: ${error.message}`);
  seededRoleUserIds.push(userId);
}

async function signedInClient(email: string, password: string): Promise<SupabaseClient> {
  const c = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new Error(`signIn ${email}: ${error?.message ?? "no session"}`);
  }
  return c;
}

async function main() {
  console.log(`→ staff-role RLS harness (tag=${TAG})`);

  // ------------------------------------------------------------------
  // Setup: two confirmed users, seed VICTIM with a real staff row.
  // ATTACKER is a plain authenticated non-staff user.
  // ------------------------------------------------------------------
  const attackerId = await createConfirmedUser(ATTACKER_EMAIL, ATTACKER_PASSWORD);
  const victimId = await createConfirmedUser(VICTIM_EMAIL, VICTIM_PASSWORD);
  await ensureNoStaffRow(attackerId);
  await ensureNoStaffRow(victimId);
  await seedStaffRow(victimId);

  const attacker = await signedInClient(ATTACKER_EMAIL, ATTACKER_PASSWORD);
  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ------------------------------------------------------------------
  // 1. Attacker cannot read victim's user_roles row.
  //    RLS "Users view own roles" scopes SELECT to auth.uid() = user_id
  //    (plus operator override — not applicable here).
  //    Expected: zero rows, no error (silent filter, not 403).
  // ------------------------------------------------------------------
  {
    const { data, error } = await attacker
      .from("user_roles")
      .select("role, user_id")
      .eq("user_id", victimId);
    check(
      "attacker SELECT on victim's user_roles returns no rows",
      !error && (data?.length ?? 0) === 0,
      error?.message ?? `rows=${data?.length}`,
    );
  }

  // 1b. Attacker cannot see the staff row via unfiltered SELECT either.
  {
    const { data, error } = await attacker.from("user_roles").select("*");
    const sawVictim = (data ?? []).some((r: { user_id: string }) => r.user_id === victimId);
    check(
      "attacker unfiltered SELECT does not leak victim's staff row",
      !error && !sawVictim,
      error?.message ?? (sawVictim ? "victim row leaked" : undefined),
    );
  }

  // ------------------------------------------------------------------
  // 2. Attacker cannot insert a `staff` role for themselves.
  //    No INSERT policy on user_roles for `authenticated` → RLS denies.
  // ------------------------------------------------------------------
  {
    const { error } = await attacker
      .from("user_roles")
      .insert({ user_id: attackerId, role: "staff" });
    const denied = !!error;
    check(
      "attacker INSERT staff for self is denied",
      denied,
      denied ? undefined : "insert unexpectedly succeeded",
    );
    // Defence-in-depth: even if the insert somehow slipped, confirm no row exists.
    const { data } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", attackerId)
      .eq("role", "staff");
    check(
      "no `staff` row exists for attacker after attempt",
      (data?.length ?? 0) === 0,
    );
  }

  // ------------------------------------------------------------------
  // 3. Attacker cannot insert a `staff` role for someone else.
  // ------------------------------------------------------------------
  {
    const { error } = await attacker
      .from("user_roles")
      .insert({ user_id: victimId, role: "staff" });
    check(
      "attacker INSERT staff for another user is denied",
      !!error,
      error ? undefined : "insert unexpectedly succeeded",
    );
  }

  // ------------------------------------------------------------------
  // 4. Attacker cannot UPDATE or DELETE the victim's staff row.
  // ------------------------------------------------------------------
  {
    const { data: upd, error: updErr } = await attacker
      .from("user_roles")
      .update({ role: "customer" })
      .eq("user_id", victimId)
      .eq("role", "staff")
      .select();
    check(
      "attacker UPDATE on victim's staff row affects zero rows",
      !updErr && (upd?.length ?? 0) === 0,
      updErr?.message ?? `rows=${upd?.length}`,
    );
    // Verify unchanged from admin view.
    const { data: after } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", victimId)
      .eq("role", "staff");
    check(
      "victim's staff row is unchanged after attacker UPDATE attempt",
      (after?.length ?? 0) === 1,
    );
  }
  {
    const { data: del, error: delErr } = await attacker
      .from("user_roles")
      .delete()
      .eq("user_id", victimId)
      .eq("role", "staff")
      .select();
    check(
      "attacker DELETE on victim's staff row affects zero rows",
      !delErr && (del?.length ?? 0) === 0,
      delErr?.message ?? `rows=${del?.length}`,
    );
    const { data: after } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", victimId)
      .eq("role", "staff");
    check(
      "victim's staff row still present after attacker DELETE attempt",
      (after?.length ?? 0) === 1,
    );
  }

  // ------------------------------------------------------------------
  // 5. has_role() must return false for attacker on `staff`.
  //    (Confirms server-side authority is not fooled by client state.)
  // ------------------------------------------------------------------
  {
    const { data, error } = await attacker.rpc("has_role", {
      _user_id: attackerId,
      _role: "staff",
    });
    check(
      "has_role(attacker,'staff') returns false",
      !error && data === false,
      error?.message ?? `data=${JSON.stringify(data)}`,
    );
  }
  // 5b. Sanity: has_role(victim,'staff') is true (proves the check is real).
  {
    const { data, error } = await admin.rpc("has_role", {
      _user_id: victimId,
      _role: "staff",
    });
    check(
      "has_role(victim,'staff') returns true (sanity via admin)",
      !error && data === true,
      error?.message ?? `data=${JSON.stringify(data)}`,
    );
  }

  // ------------------------------------------------------------------
  // 6. Anon SELECT on user_roles must return no rows (no anon grant).
  // ------------------------------------------------------------------
  {
    const { data, error } = await anon.from("user_roles").select("*");
    // Either an error (permission denied) or zero rows is acceptable — both
    // prove no anon read path exists.
    const safe = !!error || (data?.length ?? 0) === 0;
    check(
      "anon SELECT on user_roles reveals nothing",
      safe,
      error ? undefined : `rows=${data?.length}`,
    );
  }

  // 7. Anon INSERT on user_roles must be denied.
  {
    const { error } = await anon
      .from("user_roles")
      .insert({ user_id: attackerId, role: "staff" });
    check(
      "anon INSERT into user_roles is denied",
      !!error,
      error ? undefined : "insert unexpectedly succeeded",
    );
  }

  // 8. Anon RPC has_role must be denied (EXECUTE revoked from anon).
  {
    const { data, error } = await anon.rpc("has_role", {
      _user_id: attackerId,
      _role: "staff",
    });
    const denied = !!error || data === null;
    check(
      "anon RPC has_role is denied or returns null",
      denied,
      error ? undefined : `data=${JSON.stringify(data)}`,
    );
  }
}

async function teardown() {
  console.log("→ teardown: deleting seeded rows and users");
  for (const uid of seededRoleUserIds) {
    try {
      await admin.from("user_roles").delete().eq("user_id", uid);
    } catch {
      /* ignore */
    }
  }
  for (const uid of createdUsers) {
    try {
      await admin.auth.admin.deleteUser(uid);
    } catch {
      /* ignore */
    }
  }
}

main()
  .then(async () => {
    await teardown();
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail === 0 ? 0 : 1);
  })
  .catch(async (err) => {
    console.error("harness crashed:", err);
    await teardown();
    process.exit(1);
  });
