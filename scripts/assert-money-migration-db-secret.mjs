#!/usr/bin/env node
/**
 * Money-critical migration deploy-gate preflight.
 *
 * Thin wrapper around the shared core in
 * scripts/lib/assertRequiredCiSecret.mjs — kept as its own script so the
 * required-money-migrations workflow (and its contract tests in
 * src/test/assert-money-migration-db-secret.test.ts) can keep calling
 * `node scripts/assert-money-migration-db-secret.mjs` with the two
 * env vars TARGET_ENV + SUPABASE_DB_URL. All other CI workflows should
 * prefer the generic `.github/actions/require-ci-secret` composite
 * action instead.
 *
 * Env inputs:
 *   TARGET_ENV      Required. "sandbox" | "live". Selects the secret.
 *   SUPABASE_DB_URL Required for the configured path. Empty / whitespace
 *                   counts as missing.
 *   REPORT_PATH     Optional. Markdown report path.
 *
 * Exit codes:
 *   0 configured
 *   1 missing
 *   2 misuse (TARGET_ENV missing / unrecognized)
 */
import { assertRequiredCiSecret } from "./lib/assertRequiredCiSecret.mjs";

const TARGET_ENV = (process.env.TARGET_ENV ?? "").trim().toLowerCase();

const SECRET_NAMES = {
  sandbox: "SUPABASE_DB_URL_SANDBOX",
  live: "SUPABASE_DB_URL_LIVE",
};

if (!TARGET_ENV || !(TARGET_ENV in SECRET_NAMES)) {
  console.error(
    `::error::assert-money-migration-db-secret: TARGET_ENV must be "sandbox" or "live" (got: ${JSON.stringify(TARGET_ENV)}).`,
  );
  process.exit(2);
}

const secretName = SECRET_NAMES[TARGET_ENV];
const envLabel = TARGET_ENV.toUpperCase();

const code = assertRequiredCiSecret({
  secretName,
  secretValue: process.env.SUPABASE_DB_URL,
  guardHeading: `Money-critical migration deploy guard — ${envLabel}`,
  fixSteps: [
    "1. Open **Settings → Secrets and variables → Actions** in this repository.",
    `2. Add a repository secret named \`${secretName}\` whose value is the pooled Postgres connection string for the ${envLabel} database (the same URL used by \`supabase db push\`).`,
    `3. Re-run this workflow. The gate will run \`node scripts/assert-required-money-migrations-applied.mjs\` against ${envLabel} and confirm every money-critical migration is applied.`,
  ],
  reasonLines: [
    "Why this is a hard failure: without the DB URL the deploy gate cannot",
    "confirm that money-critical migrations (credit spends, referrals, entitlements)",
    "are actually applied. Merging without this check risks silently shipping",
    "a schema drift into production. Do NOT deploy or merge money-critical",
    "changes until this secret is configured.",
  ],
  reportPath: process.env.REPORT_PATH || undefined,
  logPrefix: "money-migration-preflight",
});

// Preserve the "Do NOT deploy" wording expected by both the CI log
// scanners and the existing contract test — the shared core emits the
// generic "Do NOT proceed" message, so we add the deploy-specific one
// here as an extra annotation before exiting.
if (code === 1) {
  console.error(
    `::error::${secretName} secret is not set. Configure it before ${
      TARGET_ENV === "live"
        ? "deploying money-critical changes to live"
        : "merging money-critical changes"
    }. Do NOT deploy until this is configured.`,
  );
}

process.exit(code);
