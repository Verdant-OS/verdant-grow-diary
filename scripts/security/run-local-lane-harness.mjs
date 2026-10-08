#!/usr/bin/env node
/**
 * Loopback-only launcher for the grant-path RLS harnesses in the disposable
 * local Supabase lane (.github/workflows/security-db-local.yml).
 *
 * These five harnesses predate the lane's `--confirm-local-security-lane`
 * convention and carry no target guard of their own: each one seeds auth.users
 * with the service-role key against whatever SUPABASE_URL it is given. This
 * launcher adds that guard without changing the harnesses or how an operator
 * runs them by hand:
 *
 *   - the lane flag is required;
 *   - only the named harnesses below can be launched;
 *   - SUPABASE_URL must parse and point at a loopback host, so a lane run can
 *     never reach the hosted Verdant project or any other remote database.
 *
 * Run (inside the lane, after `supabase db reset`):
 *   node scripts/security/run-local-lane-harness.mjs <name> --confirm-local-security-lane
 *
 * The harness's own exit code is passed through unchanged: 0 only when every
 * check passed, 1 on any failed check, 2 on missing configuration.
 */
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const LOCAL_LANE_FLAG = "--confirm-local-security-lane";

export const LOCAL_LANE_HARNESSES = Object.freeze({
  billing: "scripts/run-billing-rls-harness.ts",
  "ai-credits": "scripts/run-ai-credits-rls-harness.ts",
  "action-queue": "scripts/run-action-queue-rls-harness.ts",
  "staff-role": "scripts/run-staff-role-rls-harness.ts",
  "staff-grant-trigger": "scripts/run-staff-grant-trigger-harness.ts",
});

export function isLoopbackHost(hostname) {
  const normalized = String(hostname).toLowerCase().replace(/\.$/, "");
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]"
  );
}

/**
 * Decide whether a launch may proceed. Pure: reads only its arguments.
 * @param {string[]} args CLI arguments after the script path
 * @param {Record<string, string | undefined>} env
 * @returns {{ ok: true, name: string, harness: string } | { ok: false, exitCode: number, message: string }}
 */
export function planLocalLaneRun(args, env) {
  if (!args.includes(LOCAL_LANE_FLAG)) {
    return {
      ok: false,
      exitCode: 2,
      message: `refusing to run: pass ${LOCAL_LANE_FLAG} (disposable local lane only)`,
    };
  }
  const names = args.filter((arg) => arg !== LOCAL_LANE_FLAG);
  if (names.length !== 1) {
    return { ok: false, exitCode: 2, message: "expected exactly one harness name" };
  }
  const [name] = names;
  if (!Object.hasOwn(LOCAL_LANE_HARNESSES, name)) {
    return {
      ok: false,
      exitCode: 2,
      message: `unknown harness "${name}"; expected one of: ${Object.keys(LOCAL_LANE_HARNESSES).join(", ")}`,
    };
  }
  const supabaseUrl = env.SUPABASE_URL;
  if (!supabaseUrl) {
    return { ok: false, exitCode: 2, message: "missing SUPABASE_URL" };
  }
  let hostname;
  try {
    hostname = new URL(supabaseUrl).hostname;
  } catch {
    return { ok: false, exitCode: 2, message: "database API URL is invalid" };
  }
  if (!isLoopbackHost(hostname)) {
    return {
      ok: false,
      exitCode: 2,
      message: "local security lane requires a loopback database",
    };
  }
  return { ok: true, name, harness: LOCAL_LANE_HARNESSES[name] };
}

function main() {
  const plan = planLocalLaneRun(process.argv.slice(2), process.env);
  if (!plan.ok) {
    console.error(`[local-lane-harness] ${plan.message}`);
    process.exit(plan.exitCode);
  }
  console.log(`[local-lane-harness] ${plan.name}: bun run ${plan.harness}`);
  const result = spawnSync("bun", ["run", plan.harness], { stdio: "inherit", env: process.env });
  if (result.error) {
    console.error(`[local-lane-harness] could not start bun: ${result.error.message}`);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
