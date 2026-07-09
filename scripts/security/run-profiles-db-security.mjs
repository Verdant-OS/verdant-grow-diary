#!/usr/bin/env node
/**
 * Local-only profiles gamification write-protection integration harness.
 *
 * Verifies at runtime, against a real local Supabase, that:
 *   - authenticated users cannot update profiles.tier / .level / .nugs_total
 *   - blocked updates are atomic (no partial mutation of allowed fields)
 *   - legitimate profile edits (display_name, current_badge) still succeed
 *   - cross-user profile writes are blocked by RLS
 *
 * REQUIRES local Supabase (`supabase start`) and:
 *   SUPABASE_URL
 *   SUPABASE_ANON_KEY
 *   SUPABASE_SERVICE_ROLE_KEY   (test setup/teardown only, never logged)
 *
 * If any required var is missing this script exits with code 2 and a
 * BLOCKED message. It does NOT fake a pass. Never wire into required
 * CI unless the workflow first starts local Supabase.
 *
 * NEVER paste SUPABASE_SERVICE_ROLE_KEY, JWTs, or refresh tokens into
 * chat, screenshots, logs, or issue comments.
 */
const REQUIRED = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
const missing = REQUIRED.filter((k) => !process.env[k] || process.env[k].trim() === "");

if (missing.length > 0) {
  console.error(
    `BLOCKED: profiles gamification DB harness requires local Supabase.\n` +
      `Missing env: ${missing.join(", ")}\n` +
      `Start local Supabase (\`supabase start\`) and export the vars, then re-run.\n` +
      `Never paste service_role or auth JWTs into chat.`,
  );
  process.exit(2);
}

import("node:child_process").then(({ spawn }) => {
  const child = spawn(
    process.execPath,
    [
      "--experimental-vm-modules",
      "node_modules/vitest/vitest.mjs",
      "run",
      "src/test/integration/profiles-gamification-write-protection.integration.test.ts",
      "src/test/integration/profiles-entitlement-resolution-boundary.integration.test.ts",
    ],
    { stdio: "inherit", env: process.env },
  );
  child.on("exit", (code) => process.exit(code ?? 1));
});
