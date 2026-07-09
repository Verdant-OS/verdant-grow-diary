#!/usr/bin/env node
/**
 * Local-only Customer Mode ↔ Operator isolation harness.
 *
 * The static audit portion always runs. The live-DB probe requires local
 * Supabase and:
 *   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 *
 * Exits with code 2 + BLOCKED message when the live vars are missing so
 * the harness never fakes a pass. Never wire into required CI.
 *
 * NEVER paste service_role or JWTs into chat, logs, or issue comments.
 */
const REQUIRED = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
const missing = REQUIRED.filter((k) => !process.env[k] || process.env[k].trim() === "");

if (missing.length > 0) {
  console.error(
    `BLOCKED: customer-mode isolation harness requires local Supabase.\n` +
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
      "src/test/integration/customer-mode-operator-isolation.integration.test.ts",
    ],
    { stdio: "inherit", env: process.env },
  );
  child.on("exit", (code) => process.exit(code ?? 1));
});
