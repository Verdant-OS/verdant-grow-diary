#!/usr/bin/env node
/**
 * Local-only storage bucket policy integration harness runner.
 *
 * See docs/security-regression-tests.md. Same BLOCKED-when-missing
 * semantics as run-pi-ingest-db-security.mjs.
 */
const REQUIRED = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
const missing = REQUIRED.filter((k) => !process.env[k] || process.env[k].trim() === "");

if (missing.length > 0) {
  console.error(
    `BLOCKED: storage-policy DB harness requires local Supabase.\n` +
      `Missing env: ${missing.join(", ")}\n` +
      `Start local Supabase (\`supabase start\`) and export the vars, then re-run.\n` +
      `Never paste service_role into chat.`,
  );
  process.exit(2);
}

import("node:child_process").then(({ spawn }) => {
  const child = spawn(
    process.execPath,
    ["--experimental-vm-modules", "node_modules/vitest/vitest.mjs", "run",
      "src/test/integration/storage-policy-security.integration.test.ts"],
    { stdio: "inherit", env: process.env },
  );
  child.on("exit", (code) => process.exit(code ?? 1));
});
