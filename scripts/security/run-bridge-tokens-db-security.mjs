#!/usr/bin/env node
/**
 * Local-only bridge_tokens RLS + revocation-integrity harness runner.
 *
 * Proves at runtime, against a real local Postgres:
 *   - anon has no access to bridge_tokens at all
 *   - cross-user SELECT / UPDATE / DELETE are denied by RLS
 *   - owners can rename and revoke, but revocation is one-way
 *     (bridge_tokens_guard_immutables) and usage telemetry is
 *     server-maintained
 *   - the identity/secret columns stay frozen
 *   - bump_bridge_token_usage still works for service_role and is denied
 *     to authenticated
 *   - the effective DELETE privilege is measured, answering the
 *     platform-default question recorded as checklist gap G3
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
/**
 * Strict CI mode: BRIDGE_TOKENS_DB_SECURITY_REQUIRED=1 turns every
 * "cannot run" outcome into a hard FAIL (exit 1) and, after the suite,
 * verifies vitest's JSON results show actual executed DB assertions:
 * passed > 0, failed = 0, skipped = 0. Skipping can never count as proof
 * in the authoritative security-db-local lane.
 */
const STRICT = process.env.BRIDGE_TOKENS_DB_SECURITY_REQUIRED === "1";

function unavailable(message) {
  if (STRICT) {
    console.error(`FAIL (strict mode): ${message}`);
    process.exit(1);
  }
  console.error(`BLOCKED: ${message}`);
  process.exit(2);
}

const REQUIRED = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
const missing = REQUIRED.filter((k) => !process.env[k] || process.env[k].trim() === "");

if (missing.length > 0) {
  unavailable(
    `bridge_tokens DB security harness requires local Supabase.\n` +
      `Missing env: ${missing.join(", ")}\n` +
      `Start local Supabase (\`supabase start\`) and export the vars, then re-run.\n` +
      `Never paste service_role or bridge tokens into chat.`,
  );
}

// Refuse to run mutating service-role setup against a non-local project.
function isLocalSupabaseUrl(u) {
  try {
    const h = new URL(u).hostname.toLowerCase();
    return ["127.0.0.1", "localhost", "::1", "0.0.0.0"].includes(h) || h.endsWith(".localhost");
  } catch {
    return false;
  }
}
if (!isLocalSupabaseUrl(process.env.SUPABASE_URL)) {
  unavailable(
    `SUPABASE_URL is not a local loopback host.\n` +
      `This harness creates/deletes auth users, tents, and bridge_tokens rows;\n` +
      `it must only run against a local \`supabase start\` stack.`,
  );
}

Promise.all([import("node:child_process"), import("node:fs")]).then(([{ spawn }, fs]) => {
  const resultsDir = "artifacts/security-db";
  const resultsFile = `${resultsDir}/bridge-tokens-vitest.json`;
  fs.mkdirSync(resultsDir, { recursive: true });
  const child = spawn(
    process.execPath,
    [
      "--experimental-vm-modules",
      "node_modules/vitest/vitest.mjs",
      "run",
      "src/test/integration/bridge-tokens-rls.integration.test.ts",
      "--reporter=default",
      "--reporter=json",
      "--outputFile",
      resultsFile,
    ],
    { stdio: "inherit", env: process.env },
  );
  child.on("exit", (code) => {
    if (!STRICT) process.exit(code ?? 1);
    let results;
    try {
      results = JSON.parse(fs.readFileSync(resultsFile, "utf8"));
    } catch {
      console.error("FAIL (strict mode): could not read vitest JSON results.");
      process.exit(1);
    }
    const passed = results.numPassedTests ?? 0;
    const failed = results.numFailedTests ?? 0;
    const skipped = (results.numPendingTests ?? 0) + (results.numTodoTests ?? 0);
    console.log(
      `bridge-tokens DB harness (strict): passed=${passed} failed=${failed} skipped=${skipped}`,
    );
    if ((code ?? 1) !== 0 || failed > 0 || skipped > 0 || passed === 0) {
      console.error(
        "FAIL (strict mode): actual DB assertions are required — nonzero passes, zero failures, zero skips.",
      );
      process.exit(1);
    }
    process.exit(0);
  });
});
