#!/usr/bin/env node
/**
 * Preflight check for the money-critical migration deploy gate.
 *
 * Purpose: turn the opaque "money-critical gate failed" error that occurs when
 * SUPABASE_DB_URL_SANDBOX / SUPABASE_DB_URL_LIVE is unset into a clear,
 * actionable failure at the very start of the job — before psql install,
 * prefix diff, or any other step runs.
 *
 * Env inputs:
 *   TARGET_ENV      Required. "sandbox" | "live". Selects which secret to check.
 *   SUPABASE_DB_URL Optional. The value of the corresponding secret injected by
 *                   the workflow. When empty, this script fails with an
 *                   actionable message and (when REPORT_PATH is set) writes a
 *                   markdown summary suitable for the PR sticky comment /
 *                   workflow step summary.
 *   REPORT_PATH     Optional. When set, the script writes a markdown report to
 *                   this path on failure so the existing summary/comment steps
 *                   surface the same message operators see in CI logs.
 *
 * Exit codes:
 *   0  Secret is configured (non-empty). Nothing else to do.
 *   1  Secret is missing. A GitHub `::error::` annotation is emitted and, if
 *      REPORT_PATH is set, a markdown report is written before exiting.
 *   2  Misuse (e.g. TARGET_ENV missing / unrecognized).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const TARGET_ENV = (process.env.TARGET_ENV ?? "").trim().toLowerCase();
const RAW_DB_URL = process.env.SUPABASE_DB_URL ?? "";
const DB_URL = RAW_DB_URL.trim();
const REPORT_PATH = process.env.REPORT_PATH ?? "";

const SECRET_NAMES = {
  sandbox: "SUPABASE_DB_URL_SANDBOX",
  live: "SUPABASE_DB_URL_LIVE",
};

function main() {
  if (!TARGET_ENV || !(TARGET_ENV in SECRET_NAMES)) {
    console.error(
      `::error::assert-money-migration-db-secret: TARGET_ENV must be "sandbox" or "live" (got: ${JSON.stringify(TARGET_ENV)}).`,
    );
    process.exit(2);
  }

  const secretName = SECRET_NAMES[TARGET_ENV];
  const envLabel = TARGET_ENV.toUpperCase();

  if (DB_URL.length > 0) {
    console.log(
      `[money-migration-preflight] ${secretName} is configured — proceeding with ${envLabel} deploy gate.`,
    );
    process.exit(0);
  }

  const heading = `Money-critical migration deploy guard — ${envLabel}`;
  const oneLiner = `${secretName} secret is not configured in this repository.`;
  const fixSteps = [
    `1. Open **Settings → Secrets and variables → Actions** in this repository.`,
    `2. Add a repository secret named \`${secretName}\` whose value is the pooled Postgres connection string for the ${envLabel} database (the same URL used by \`supabase db push\`).`,
    `3. Re-run this workflow. The gate will run \`node scripts/assert-required-money-migrations-applied.mjs\` against ${envLabel} and confirm every money-critical migration is applied.`,
  ];

  console.error(`::error title=${secretName} missing::${oneLiner} Do NOT deploy or merge money-critical changes until this is configured.`);
  console.error("");
  console.error(`[money-migration-preflight] ${heading}`);
  console.error(`  Status: FAILED — ${oneLiner}`);
  console.error("  How to fix:");
  for (const line of fixSteps) {
    console.error(`    ${line}`);
  }
  console.error(
    "  Why this is a hard failure: without the DB URL the deploy gate cannot",
  );
  console.error(
    "  confirm that money-critical migrations (credit spends, referrals, entitlements)",
  );
  console.error(
    "  are actually applied. Merging without this check risks silently shipping",
  );
  console.error("  a schema drift into production.");

  if (REPORT_PATH) {
    const body = [
      `### ${heading}`,
      "",
      `**Status:** ❌ ${oneLiner}`,
      "",
      "The deploy gate could not run because the database connection secret is missing.",
      "This is a preflight failure — no psql install, prefix diff, or applied-migration",
      "check has run yet. Configure the secret and re-run the workflow.",
      "",
      "**How to fix:**",
      "",
      ...fixSteps.map((step) => step),
      "",
      "_Do NOT deploy or merge money-critical changes until this check passes._",
      "",
    ].join("\n");
    try {
      mkdirSync(dirname(REPORT_PATH), { recursive: true });
      writeFileSync(REPORT_PATH, body, "utf8");
    } catch (err) {
      console.error(
        `[money-migration-preflight] Failed to write report to ${REPORT_PATH}: ${(err instanceof Error ? err.message : String(err))}`,
      );
    }
  }

  process.exit(1);
}

main();
