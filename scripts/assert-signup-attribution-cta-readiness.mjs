#!/usr/bin/env node
/**
 * Secret-free pre-deploy gate for attributed marketing signup CTAs.
 *
 * Fail closed before treating `/` and `/welcome` attributed signup CTAs as
 * enabled unless:
 *   - the immutable forward-repair migration is present at the pinned SHA-256
 *   - the failure-safe attribution guard migration is present with EXCEPTION +
 *     RAISE LOG + readiness RPC markers
 *   - ATTRIBUTED_MARKETING_SIGNUP_CTA_ENABLED remains true in source
 *
 * Live ledger / object presence still requires a protected environment with a
 * DB URL — see scripts/assert-signup-attribution-cta-readiness-applied.mjs and
 * .github/workflows/signup-attribution-cta-readiness.yml.
 *
 * Exit codes:
 *   0 = static readiness PASS (marketing CTA may be treated as enabled)
 *   1 = static readiness FAIL (do not treat CTA as enabled / do not deploy)
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  FAILURE_SAFE_MIGRATION_FILENAME,
  FORWARD_REPAIR_MIGRATION_FILENAME,
  evaluateSignupAttributionStaticReadiness,
} from "./lib/signupAttributionCtaReadiness.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function readAttributedCtaFlag(repoRoot) {
  const source = readFileSync(
    join(repoRoot, "src/lib/signupAttributionCtaReadinessRules.ts"),
    "utf8",
  );
  return /export\s+const\s+ATTRIBUTED_MARKETING_SIGNUP_CTA_ENABLED\s*=\s*true\s+as\s+const/.test(
    source,
  );
}

function sha256File(path) {
  const buf = readFileSync(path);
  return createHash("sha256").update(buf).digest("hex");
}

export function collectStaticEvidence(repoRoot = REPO_ROOT) {
  const migrationsDir = join(repoRoot, "supabase", "migrations");
  const forwardPath = join(migrationsDir, FORWARD_REPAIR_MIGRATION_FILENAME);
  const failureSafePath = join(migrationsDir, FAILURE_SAFE_MIGRATION_FILENAME);
  const forwardPresent = existsSync(forwardPath);
  const failureSafePresent = existsSync(failureSafePath);
  return {
    forwardRepairPresent: forwardPresent,
    forwardRepairSha256: forwardPresent ? sha256File(forwardPath) : null,
    failureSafePresent,
    failureSafeSql: failureSafePresent ? readFileSync(failureSafePath, "utf8") : null,
    attributedCtaFlagEnabled: readAttributedCtaFlag(repoRoot),
  };
}

export function runAssertSignupAttributionCtaReadiness({
  repoRoot = REPO_ROOT,
  stdout = console.log,
  stderr = console.error,
} = {}) {
  const evidence = collectStaticEvidence(repoRoot);
  const verdict = evaluateSignupAttributionStaticReadiness(evidence);

  stdout(`Signup attribution CTA static readiness: ${verdict.status}`);
  for (const check of verdict.checks) {
    stdout(`  ${check.pass ? "PASS" : "FAIL"}  ${check.id} — ${check.detail}`);
  }

  if (!verdict.ready) {
    stderr(
      "Attributed marketing signup CTA is NOT ready. Fix the failed checks before treating `/` / `/welcome` CTAs as enabled.",
    );
    stderr(
      "Protected live check (ledger row + live objects) still requires SUPABASE_DB_URL in a GitHub-hosted protected environment — not this secret-free job.",
    );
    return 1;
  }

  stdout(
    "Marketing attributed signup CTA may be treated as enabled for this revision (static contract).",
  );
  stdout(
    "Note: confirming supabase_migrations.schema_migrations for 20260813030000 still requires the protected applied gate.",
  );
  return 0;
}

const isDirect =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirect) {
  process.exitCode = runAssertSignupAttributionCtaReadiness();
}
