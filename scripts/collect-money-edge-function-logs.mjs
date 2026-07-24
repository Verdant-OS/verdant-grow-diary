#!/usr/bin/env node
/**
 * Collect recent Edge Function log excerpts for the money-critical
 * functions (payments-webhook, redeem-referral, ai-doctor-review) and
 * write them into a per-env logs directory for CI artifact upload.
 *
 * Best-effort by design:
 *   - If SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_REF is unset, we
 *     write a short "skipped" marker per function and exit 0. The
 *     workflow uses `|| true` regardless — collection failures never
 *     block the money-migration guard.
 *   - Never echoes the access token or the project ref into logs or
 *     files. Only the target env label (already public) is written to
 *     the header of each excerpt.
 *
 * Uses the pinned Supabase CLI (`npx --yes supabase@1`) so a runner
 * upgrade cannot silently change output shape.
 */
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const FUNCTIONS = ["payments-webhook", "redeem-referral", "ai-doctor-review"];
const CLI_SPEC = "supabase@1";

const LOGS_DIR = process.env.LOGS_DIR;
const TARGET_ENV = process.env.TARGET_ENV ?? "unspecified";
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN ?? "";
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF ?? "";

if (!LOGS_DIR) {
  console.error("LOGS_DIR env var is required.");
  process.exit(0); // best-effort
}
mkdirSync(LOGS_DIR, { recursive: true });

function writeMarker(fn, status, detail) {
  const header =
    `# ${fn} — ${TARGET_ENV}\n` +
    `# Collected at: ${new Date().toISOString()}\n` +
    `# Status: ${status}\n`;
  writeFileSync(join(LOGS_DIR, `${fn}.log`), header + (detail ? detail + "\n" : ""));
}

if (!ACCESS_TOKEN || !PROJECT_REF) {
  const reason = !ACCESS_TOKEN
    ? "SUPABASE_ACCESS_TOKEN secret not set on runner"
    : "SUPABASE_PROJECT_REF secret not set for this env";
  for (const fn of FUNCTIONS) writeMarker(fn, "skipped", `# Reason: ${reason}`);
  console.log(`(skipped) ${reason}. Wrote placeholder log markers.`);
  process.exit(0);
}

for (const fn of FUNCTIONS) {
  const result = spawnSync(
    "npx",
    ["--yes", CLI_SPEC, "functions", "logs", fn, "--project-ref", PROJECT_REF],
    {
      encoding: "utf8",
      env: { ...process.env, SUPABASE_ACCESS_TOKEN: ACCESS_TOKEN },
      timeout: 60_000,
    },
  );
  const header =
    `# ${fn} — ${TARGET_ENV}\n` +
    `# Collected at: ${new Date().toISOString()}\n` +
    `# CLI exit: ${result.status ?? "err"}\n`;
  const body =
    (result.stdout ?? "") +
    (result.stderr ? `\n----- stderr -----\n${result.stderr}` : "");
  writeFileSync(join(LOGS_DIR, `${fn}.log`), header + body);
  if (result.status !== 0) {
    console.error(`(warn) ${fn}: supabase CLI exited ${result.status}. See artifact.`);
  } else {
    console.log(`✓ ${fn}: log excerpt captured.`);
  }
}
