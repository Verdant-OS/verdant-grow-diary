#!/usr/bin/env node
/**
 * Lovable managed browser session preflight CLI.
 *
 * Exit codes:
 *   0 = ready
 *   2 = blocked (missing/invalid managed session)
 *   1 = unexpected preflight error
 *
 * Never prints tokens, cookies, session JSON, or authorization headers.
 * Never contacts Supabase. Never mutates data.
 *
 * Output contract:
 *   - Human-readable lines first (READY/BLOCKED + safe diagnostics).
 *   - Exactly ONE machine-readable line prefixed
 *     ONE_TENT_PREFLIGHT_JSON= containing the compact, deterministic
 *     schema_version "1" receipt. Same inputs ⇒ byte-identical line.
 *
 * Logic lives in scripts/e2e/one-tent-preflight-core.mjs, parity-locked
 * against e2e/helpers/lovableManagedSupabaseSession.ts by
 * src/test/one-tent-preflight-receipt.test.ts.
 */

import {
  evaluateManagedSession,
  buildManagedSessionPreflightReceipt,
  renderManagedSessionPreflightReceipt,
  readManagedSessionEnv,
} from "./one-tent-preflight-core.mjs";

try {
  const env = readManagedSessionEnv(process.env);
  const result = evaluateManagedSession(env);
  const receipt = buildManagedSessionPreflightReceipt(env, result);

  if (result.status === "ready") {
    console.log("Managed browser session: READY");
    console.log("Authenticated user id resolved: yes");
    console.log(`Storage key resolved: ${receipt.storage_key_present ? "yes" : "no"}`);
    console.log(`Cookies provided: ${receipt.cookies_present ? "yes" : "no"}`);
    console.log(`Restore strategy: ${receipt.restore_strategy}`);
    console.log(renderManagedSessionPreflightReceipt(receipt));
    process.exit(0);
  }

  console.log("Managed browser session: BLOCKED");
  console.log(`Reason: ${result.reason}`);
  console.log(`Missing: ${result.missing.join(", ")}`);
  if (result.reason === "cookie_only_seed_unavailable") {
    console.log("Cookie-only restore capability: yes (browser shell only)");
    console.log(
      "Full proof remains blocked: seed/row assertions need the managed user id + access token.",
    );
  }
  console.log("");
  console.log("No login fabricated. No seed writes performed. No paid AI call made.");
  console.log(renderManagedSessionPreflightReceipt(receipt));
  process.exit(2);
} catch {
  // Never echo the underlying error message — it could contain env-derived
  // strings. Report a stable safe code and exit 1.
  console.error("Managed browser session preflight: UNEXPECTED_ERROR");
  process.exit(1);
}
