#!/usr/bin/env node
/**
 * Local-only pi_ingest_commit_batch replay harness runner.
 *
 * Verifies a bridge-token ingest payload:
 *   - succeeds for its own tent
 *   - cannot replay against a tent owned by a different user
 *   - cannot replay against a tent the token is not scoped to
 *   - reused idempotency keys do not cause cross-tent writes
 *   - rejected replays create no sensor_readings and no action_queue rows
 *   - responses do not leak raw bridge tokens
 *
 * REQUIRES local Supabase (`supabase start`) and:
 *   SUPABASE_URL
 *   SUPABASE_ANON_KEY
 *   SUPABASE_SERVICE_ROLE_KEY   (test setup only, never logged)
 *
 * If any required var is missing this script exits with code 2 and a
 * BLOCKED message. It does NOT fake a pass. Do NOT wire into required
 * CI unless the workflow first starts local Supabase.
 */
const REQUIRED = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
const missing = REQUIRED.filter((k) => !process.env[k] || process.env[k].trim() === "");

if (missing.length > 0) {
  console.error(
    `BLOCKED: pi-ingest DB replay harness requires local Supabase.\n` +
      `Missing env: ${missing.join(", ")}\n` +
      `Start local Supabase (\`supabase start\`) and export the vars, then re-run.\n` +
      `Never paste service_role or bridge tokens into chat.`,
  );
  process.exit(2);
}

// When env is present, delegate to the vitest integration spec. Kept
// separate from `test:security-regression` so required CI stays fast
// and does not depend on a local database.
import("node:child_process").then(({ spawn }) => {
  const child = spawn(
    process.execPath,
    ["--experimental-vm-modules", "node_modules/vitest/vitest.mjs", "run",
      "src/test/pi-ingest-commit-batch-replay.integration.test.ts"],
    { stdio: "inherit", env: process.env },
  );
  child.on("exit", (code) => process.exit(code ?? 1));
});
