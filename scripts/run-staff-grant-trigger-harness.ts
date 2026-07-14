#!/usr/bin/env -S bun run
/**
 * Runtime harness for the staff-grant trigger.
 *
 * Verifies that public.grant_staff_role_for_verified_allowlist grants the
 * `staff` role ONLY when BOTH conditions hold:
 *   1. auth.users.email_confirmed_at IS NOT NULL
 *   2. lower(auth.users.email) is in the exact allow-list
 *      ('matt@verdantgrowdiary.com', 'cheekhimself@gmail.com')
 *
 * service_role is used ONLY to:
 *   - create/delete auth.users
 *   - flip email_confirmed_at via the admin API
 *   - read back public.user_roles to assert trigger behavior
 *
 * Run:
 *   bun run scripts/run-staff-grant-trigger-harness.ts
 *
 * Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * NOT part of the default Vitest suite — invoke separately.
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
for (const [k, v] of [
  ["SUPABASE_URL", SUPABASE_URL],
  ["SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY],
]) {
  if (!v) {
    console.error(`missing ${k}`);
    process.exit(2);
  }
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Unique suffix so parallel/repeat runs never collide with real users.
const TAG = `staff-harness-${crypto.randomUUID().slice(0, 8)}`;

// Allow-list emails — must be granted when confirmed.
const ALLOW_MATT = `matt+${TAG}@verdantgrowdiary.com`; // NOT allow-list (plus alias)
const ALLOW_CHEEK = `cheekhimself+${TAG}@gmail.com`;   // NOT allow-list (plus alias)
// Exact allow-list — we can only test these once per DB unless we clean up first.
const EXACT_MATT = "matt@verdantgrowdiary.com";
const EXACT_CHEEK = "cheekhimself@gmail.com";
// Non-allow-list emails.
const OTHER_EMAIL = `other-${TAG}@verdant.test`;
const LOOKALIKE_EMAIL = `mattx@verdantgrowdiary.com`; // near-miss, not exact

let pass = 0,
  fail = 0;
const created: string[] = [];

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
  const prior = data?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (prior) await admin.auth.admin.deleteUser(prior.id);
}

async function createUser(email: string, confirm: boolean): Promise<string> {
  await deleteByEmail(email);
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: crypto.randomUUID(),
    email_confirm: confirm,
  });
  if (error || !data.user) throw new Error(`createUser ${email}: ${error?.message}`);
  created.push(data.user.id);
  return data.user.id;
}

async function hasStaffRole(userId: string): Promise<boolean> {
  const { data, error } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "staff");
  if (error) throw new Error(`user_roles select: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

async function main() {
  console.log(`→ staff-grant trigger harness (tag=${TAG})`);

  // 1. Non-allow-list email, confirmed → NO staff role.
  {
    const uid = await createUser(OTHER_EMAIL, true);
    check("non-allow-list confirmed user does NOT get staff", !(await hasStaffRole(uid)));
  }

  // 2. Near-miss email (mattx@…), confirmed → NO staff role (exact match required).
  {
    const uid = await createUser(LOOKALIKE_EMAIL, true);
    check("near-miss lookalike email does NOT get staff", !(await hasStaffRole(uid)));
  }

  // 3. Plus-alias of allow-list email, confirmed → NO staff role (exact match).
  {
    const uid = await createUser(ALLOW_MATT, true);
    check("plus-alias matt+…@verdantgrowdiary.com does NOT get staff", !(await hasStaffRole(uid)));
  }
  {
    const uid = await createUser(ALLOW_CHEEK, true);
    check("plus-alias cheekhimself+…@gmail.com does NOT get staff", !(await hasStaffRole(uid)));
  }

  // 4. Exact allow-list, UNCONFIRMED → NO staff role yet.
  //    Then confirm via admin update → staff role granted by UPDATE trigger.
  for (const email of [EXACT_MATT, EXACT_CHEEK]) {
    await deleteByEmail(email); // ensure clean slate
    const uid = await createUser(email, false);
    // Clean any pre-existing staff row (shouldn't be, but be defensive).
    await admin.from("user_roles").delete().eq("user_id", uid).eq("role", "staff");

    check(
      `${email} unconfirmed does NOT get staff`,
      !(await hasStaffRole(uid)),
    );

    // Confirm email via admin API — should fire UPDATE trigger.
    const { error: updErr } = await admin.auth.admin.updateUserById(uid, {
      email_confirm: true,
    });
    if (updErr) {
      check(`${email} confirm via admin API succeeds`, false, updErr.message);
    } else {
      check(`${email} confirm via admin API succeeds`, true);
      check(
        `${email} gets staff after email_confirmed_at set`,
        await hasStaffRole(uid),
      );
    }
  }

  // 5. Exact allow-list created ALREADY confirmed → staff role granted by INSERT trigger.
  //    Re-create the two allow-list users to exercise the INSERT path.
  for (const email of [EXACT_MATT, EXACT_CHEEK]) {
    await deleteByEmail(email);
    const uid = await createUser(email, true);
    check(
      `${email} created already-confirmed gets staff on INSERT`,
      await hasStaffRole(uid),
    );
  }

  // 6. Uppercase/mixed-case allow-list email, confirmed → staff (case-insensitive match).
  {
    const mixed = "Matt@VerdantGrowDiary.com";
    await deleteByEmail(EXACT_MATT);
    const uid = await createUser(mixed, true);
    check(
      `mixed-case ${mixed} gets staff (lower() match)`,
      await hasStaffRole(uid),
    );
  }
}

async function teardown() {
  console.log("→ teardown: deleting seeded users");
  for (const uid of created) {
    try {
      await admin.auth.admin.deleteUser(uid);
    } catch {
      // ignore
    }
  }
  // Also ensure real allow-list rows we created during the harness are gone,
  // so we don't leave a synthesized "staff" for the real email in place.
  for (const email of [EXACT_MATT, EXACT_CHEEK, "Matt@VerdantGrowDiary.com"]) {
    await deleteByEmail(email);
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
