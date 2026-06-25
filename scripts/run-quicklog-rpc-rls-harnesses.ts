#!/usr/bin/env -S bun run
/**
 * CI-safe orchestrator for the Quick Log RPC runtime trust-boundary harnesses.
 *
 * Behavior:
 *   - If SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + SUPABASE_ANON_KEY
 *     (or SUPABASE_PUBLISHABLE_KEY / VITE_SUPABASE_ANON_KEY) are all set:
 *     run both runtime harnesses sequentially and fail on any non-zero exit.
 *   - If any env is missing: print a clear SKIP message and exit 0.
 *
 * Never prints secret values. Never targets production — harness scripts
 * write under temporary @verdant.test accounts and always teardown in finally.
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const REQUIRED = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;
const ANON_VARS = [
  "SUPABASE_ANON_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_ANON_KEY",
] as const;

const missing = REQUIRED.filter((k) => !process.env[k]);
const hasAnon = ANON_VARS.some((k) => Boolean(process.env[k]));
if (missing.length > 0 || !hasAnon) {
  const lacking = [
    ...missing,
    ...(hasAnon ? [] : ["SUPABASE_ANON_KEY (or _PUBLISHABLE_KEY)"]),
  ];
  console.log(
    `[quicklog-rpc] SKIP runtime harnesses — missing env: ${lacking.join(", ")}`,
  );
  process.exit(0);
}

const HARNESSES = [
  "scripts/run-quicklog-save-event-rls-harness.ts",
  "scripts/run-quicklog-save-manual-rls-harness.ts",
];

let failed = false;
for (const rel of HARNESSES) {
  const abs = resolve(process.cwd(), rel);
  console.log(`\n[quicklog-rpc] → ${rel}`);
  const res = spawnSync("bun", ["run", abs], {
    stdio: "inherit",
    env: process.env,
  });
  if (res.status !== 0) failed = true;
}
process.exit(failed ? 1 : 0);
