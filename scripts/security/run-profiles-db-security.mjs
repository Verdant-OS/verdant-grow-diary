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
 *   SUPABASE_DB_URL             (loopback PostgreSQL fixture setup via psql)
 *
 * If any required var is missing this script exits with code 2 and a
 * BLOCKED message. It does NOT fake a pass. Never wire into required
 * CI unless the workflow first starts local Supabase.
 *
 * NEVER paste SUPABASE_SERVICE_ROLE_KEY, JWTs, or refresh tokens into
 * chat, screenshots, logs, or issue comments.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, unlinkSync, rmdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  requireLocalProfileEnvironment,
  requireExecutedProfileProof,
} from "./profiles-db-proof.mjs";

try {
  requireLocalProfileEnvironment(process.env);
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
const reportDir = mkdtempSync(join(tmpdir(), "verdant-profiles-proof-"));
const reportPath = join(reportDir, "report.json");
try {
  const child = spawnSync(
    process.execPath,
    [
      "--experimental-vm-modules",
      "node_modules/vitest/vitest.mjs",
      "run",
      "src/test/integration/profiles-gamification-write-protection.integration.test.ts",
      "src/test/integration/profiles-entitlement-resolution-boundary.integration.test.ts",
      "--reporter=default",
      "--reporter=json",
      `--outputFile=${reportPath}`,
    ],
    { stdio: "inherit", env: process.env, timeout: 180_000, windowsHide: true },
  );
  if (child.status !== 0) {
    process.exitCode = child.status ?? 1;
  } else {
    requireExecutedProfileProof(JSON.parse(readFileSync(reportPath, "utf8")));
    console.log("Profiles DB proof: 16 passed, 0 failed, 0 skipped; both RPC cases executed.");
  }
} catch {
  console.error("BLOCKED: profiles DB proof did not produce a complete passing execution receipt.");
  process.exitCode = 2;
} finally {
  // Only these two exact temporary paths; no recursive removal.
  if (existsSync(reportPath)) unlinkSync(reportPath);
  rmdirSync(reportDir);
}
