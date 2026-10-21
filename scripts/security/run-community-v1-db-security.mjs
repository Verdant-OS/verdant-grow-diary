#!/usr/bin/env node
/**
 * Local-only Community V1 authority proof (Task 2A RED / Task 2B GREEN).
 *
 * Runs the Community V1 runtime cases against a disposable local Supabase and
 * prints an execution receipt. Every case in COMMUNITY_V1_REQUIRED_CASES must
 * execute exactly once with no skips; otherwise the run is BLOCKED (exit 2).
 * The exit code is Vitest's: 0 only when every case passed. Before the
 * Community V1 migration exists, the expected result is exit 1 with every
 * case failing. `--expect-red` turns that into the RED receipt: exit 0 only
 * when every case executed and failed on a missing community function or
 * relation, so a fixture failure cannot pass for RED.
 *
 * REQUIRES local Supabase and:
 *   SUPABASE_URL, SUPABASE_ANON_KEY,
 *   SUPABASE_SERVICE_ROLE_KEY   (fixture setup/teardown only, never logged)
 *   SUPABASE_DB_URL             (loopback PostgreSQL fixture setup via psql)
 *
 * Refuses any non-loopback URL. Never wire into required CI unless the
 * workflow first starts local Supabase.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, unlinkSync, rmdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  requireLocalCommunityEnvironment,
  requireExecutedCommunityProof,
  requireRedCommunityProof,
} from "./community-v1-db-proof.mjs";

const expectRed = process.argv.includes("--expect-red");
try {
  requireLocalCommunityEnvironment(process.env);
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
const reportDir = mkdtempSync(join(tmpdir(), "verdant-community-v1-proof-"));
const reportPath = join(reportDir, "report.json");
try {
  const child = spawnSync(
    process.execPath,
    [
      "--experimental-vm-modules",
      "node_modules/vitest/vitest.mjs",
      "run",
      "src/test/integration/community-v1-authority.integration.test.ts",
      "--reporter=default",
      "--reporter=json",
      `--outputFile=${reportPath}`,
    ],
    { stdio: "inherit", env: process.env, timeout: 600_000, windowsHide: true },
  );
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  const { passed, failed } = requireExecutedCommunityProof(report);
  console.log(`Community V1 DB proof: ${passed} passed, ${failed} failed, 0 skipped`);
  if (expectRed) {
    requireRedCommunityProof(report);
    console.log("Community V1 RED receipt: every case failed on a missing community object.");
    process.exitCode = 0;
  } else {
    process.exitCode = failed === 0 && child.status === 0 ? 0 : 1;
  }
} catch {
  console.error("BLOCKED: community v1 DB proof did not produce a complete execution receipt.");
  process.exitCode = 2;
} finally {
  // Only these two exact temporary paths; no recursive removal.
  if (existsSync(reportPath)) unlinkSync(reportPath);
  try {
    rmdirSync(reportDir);
  } catch {
    console.error("Community V1 DB proof left a non-empty temporary report directory.");
    process.exitCode = 2;
  }
}
