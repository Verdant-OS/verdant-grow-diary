#!/usr/bin/env node
/**
 * verify-edge-shared-in-sync.mjs
 *
 * Thin wrapper around scripts/sync-edge-shared.mjs.
 *
 * Behavior:
 *   1. Run `sync-edge-shared.mjs --check` (read-only drift detector).
 *   2. If it exits 0 → no drift, done.
 *   3. If it exits non-zero AND auto-fix is allowed (local dev), run
 *      `sync-edge-shared.mjs` to regenerate the mirror, then re-run --check
 *      to confirm the tree is now clean.
 *   4. If auto-fix is disabled (CI, or `--check-only`) → exit with the
 *      original drift code so the build fails loudly.
 *
 * Auto-fix is DISABLED when any of these are true (fail-closed):
 *   - process.env.CI is truthy (GitHub Actions sets CI=true)
 *   - process.env.VERIFY_EDGE_SHARED_CHECK_ONLY is truthy
 *   - --check-only is passed on the command line
 *
 * Rationale: locally we want `bun run build` to just work when the mirror
 * drifts; in CI we still want a hard stop-ship signal so drift can't be
 * papered over by a re-run.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as path from "node:path";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const SYNC = path.join(ROOT, "scripts", "sync-edge-shared.mjs");

const CHECK_ONLY =
  process.argv.includes("--check-only") ||
  Boolean(process.env.CI) ||
  Boolean(process.env.VERIFY_EDGE_SHARED_CHECK_ONLY);

function run(args, label) {
  const result = spawnSync(process.execPath, [SYNC, ...args], {
    stdio: "inherit",
  });
  if (result.error) {
    console.error(`[verify-edge-shared] failed to spawn ${label}:`, result.error);
    process.exit(1);
  }
  return result.status ?? 1;
}

// Step 1: drift check.
const checkCode = run(["--check"], "sync-edge-shared --check");
if (checkCode === 0) {
  process.exit(0);
}

if (CHECK_ONLY) {
  console.error(
    "\n[verify-edge-shared] Drift detected and auto-fix is disabled " +
      "(CI / --check-only). Run `bun run sync-edge-shared` locally and commit the result.",
  );
  process.exit(checkCode);
}

// Step 2: auto-regenerate.
console.error(
  "\n[verify-edge-shared] Drift detected — regenerating edge shared-lib mirror " +
    "(`sync-edge-shared`). Set CI=1 or pass --check-only to disable auto-fix.",
);
const writeCode = run([], "sync-edge-shared");
if (writeCode !== 0) {
  console.error("[verify-edge-shared] Auto-regeneration failed.");
  process.exit(writeCode);
}

// Step 3: re-verify.
const reCheckCode = run(["--check"], "sync-edge-shared --check (post-regen)");
if (reCheckCode !== 0) {
  console.error(
    "[verify-edge-shared] Mirror still drifts after regeneration — inspect " +
      "the sync script output above.",
  );
  process.exit(reCheckCode);
}

console.error(
  "[verify-edge-shared] Mirror regenerated successfully. Remember to commit " +
    "the updated files under supabase/functions/_shared/lib and .sync-manifest.json.",
);
process.exit(0);
