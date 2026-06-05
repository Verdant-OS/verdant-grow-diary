#!/usr/bin/env -S bun run
/**
 * Runtime RLS harness runner for public.billing_subscriptions.
 *
 * Seeds two real auth.users via the Supabase admin API (service_role), runs
 * supabase/tests/billing_subscriptions_rls.sql via psql (which wraps everything
 * in a transaction that ROLLBACKs), then deletes those users.
 *
 * service_role is used ONLY for seed + teardown. The SQL harness exercises
 * the authenticated / anon roles for every rejected-mutation assertion.
 *
 * Run:
 *   bun run scripts/run-billing-rls-harness.ts
 *
 * Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_URL.
 * Not part of the default Vitest suite.
 */
import { createClient } from "@supabase/supabase-js";
import { spawnSync } from "node:child_process";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DB_URL = process.env.SUPABASE_DB_URL!;
if (!SUPABASE_URL || !SERVICE_KEY || !DB_URL) {
  console.error("missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_DB_URL");
  process.exit(2);
}

const UID_A = "00000000-0000-4000-8000-0000b1110001";
const UID_B = "00000000-0000-4000-8000-0000b1110002";
const EMAIL_A = "rls-harness-a@verdant.test";
const EMAIL_B = "rls-harness-b@verdant.test";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findOrCreate(id: string, email: string) {
  // Best-effort cleanup of any leftover row from a prior aborted run.
  await admin.auth.admin.deleteUser(id).catch(() => {});
  const { data, error } = await admin.auth.admin.createUser({
    id, email, email_confirm: true, password: crypto.randomUUID(),
  });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  if (data.user?.id !== id) throw new Error(`unexpected uid for ${email}: ${data.user?.id}`);
}

async function deleteUser(id: string) {
  await admin.auth.admin.deleteUser(id).catch(() => {});
}

async function main() {
  console.log("→ seeding two auth.users via admin API (service_role)");
  await findOrCreate(UID_A, EMAIL_A);
  await findOrCreate(UID_B, EMAIL_B);

  console.log("→ running supabase/tests/billing_subscriptions_rls.sql");
  const r = spawnSync(
    "psql",
    [
      DB_URL,
      "-v", `uid_a='${UID_A}'`,
      "-v", `uid_b='${UID_B}'`,
      "-f", "supabase/tests/billing_subscriptions_rls.sql",
    ],
    { stdio: "inherit" },
  );

  console.log("→ deleting seeded auth.users");
  await deleteUser(UID_A);
  await deleteUser(UID_B);

  process.exit(r.status ?? 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
