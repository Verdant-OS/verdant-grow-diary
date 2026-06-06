#!/usr/bin/env -S bun run
/**
 * Smoke test: verify award_nugs RPC works through the authenticated path.
 *
 * Required env:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  (used ONLY to seed/teardown the test user)
 *   SUPABASE_ANON_KEY          (or SUPABASE_PUBLISHABLE_KEY)
 *
 * If any required env var is missing, the script exits with a neutral
 * "skipped" message and exit code 0 — CI must gate this behind a job-level
 * env presence check so missing-env never silently passes a regression.
 *
 * Safety:
 *   - never run against production unless RLS_SMOKE_ALLOW_PROD=1 is set
 *   - service_role used only for seed/teardown; the actual award_nugs
 *     call goes through an authenticated session (anon key + JWT)
 *   - meta payload is marked source:"rls_smoke_test"
 *   - amount is the lowest valid value (1) under the 'quick_log' kind
 *   - does not print user IDs, tokens, or secrets
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
  console.log(
    "↷ smoke-award-nugs: skipped (missing SUPABASE_URL / SERVICE_ROLE_KEY / ANON_KEY)",
  );
  process.exit(0);
}

// Refuse to run against an obvious production host unless explicitly allowed.
if (
  !process.env.RLS_SMOKE_ALLOW_PROD &&
  /verdantgrowdiary\.com|app\.verdant/i.test(SUPABASE_URL)
) {
  console.error("✗ refusing to run smoke against production URL");
  process.exit(2);
}

const EMAIL = `rls-smoke-award-nugs-${Date.now()}@verdant.test`;
const PASSWORD = crypto.randomUUID();

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let createdUserId: string | null = null;

async function teardown() {
  if (createdUserId) {
    try {
      await admin.auth.admin.deleteUser(createdUserId);
    } catch {
      /* best effort */
    }
  }
}

async function main() {
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  if (createErr || !created?.user) {
    console.error("✗ failed to seed test user:", createErr?.message);
    process.exit(1);
  }
  createdUserId = created.user.id;

  const userClient = createClient(SUPABASE_URL!, ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInErr } = await userClient.auth.signInWithPassword({
    email: EMAIL,
    password: PASSWORD,
  });
  if (signInErr) {
    console.error("✗ test user sign-in failed:", signInErr.message);
    await teardown();
    process.exit(1);
  }

  // Call award_nugs through the authenticated session.
  const { data, error } = await userClient.rpc("award_nugs", {
    _kind: "quick_log",
    _amount: 1,
    _meta: { source: "rls_smoke_test" },
    _quest_key: null,
  });

  if (error) {
    console.error("✗ award_nugs failed:", error.message);
    await teardown();
    process.exit(1);
  }

  const row = data as { awarded?: number; new_total?: number } | null;
  if (!row || row.awarded !== 1) {
    console.error("✗ unexpected award_nugs result shape");
    await teardown();
    process.exit(1);
  }

  console.log(
    `✓ award_nugs ok — awarded=${row.awarded} new_total=${row.new_total}`,
  );
  await teardown();
  process.exit(0);
}

main().catch(async (err) => {
  console.error("✗ smoke failed:", err?.message ?? err);
  await teardown();
  process.exit(1);
});
