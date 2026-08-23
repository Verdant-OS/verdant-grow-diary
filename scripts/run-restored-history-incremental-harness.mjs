#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { prepareReplayWorkspace } from "./prepare-local-supabase-replay.mjs";

const REPO_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const PRODUCTION_PROJECT_REF = "knkwiiywfkbqznbxwqfh";
const RESTORED_MIGRATIONS = [
  "20260710003624_pheno_hunt_guided_setup_onboarding.sql",
  "20260710003638_pheno_hunt_setup_backfill.sql",
  "20260710005819_ai_credit_spend_union_hardening.sql",
  "20260710012854_lovable_paddle_sink_subscriptions_and_events.sql",
  "20260710012950_app_role_add_staff_value.sql",
  "20260710013213_pheno_tracker_pro_entitlement_enforcement.sql",
  "20260710013235_pheno_entitlement_anti_oracle_guard.sql",
  "20260710013255_staff_role_grant_trigger_and_backfill.sql",
  "20260725033124_core_schema_forward_repair.sql",
  "20260728230229_ai_doctor_receipts_server_only_deny_marker.sql",
];
const REPAIR_MIGRATION = "20260823120000_restored_history_ai_credit_pheno_quicklog_repair.sql";
const SQL_HARNESS = resolve(
  REPO_ROOT,
  "supabase/tests/restored_history_incremental_forward_repair.sql",
);
const RAW_BACKFILL_CONTROL = resolve(
  REPO_ROOT,
  "supabase/tests/restored_history_raw_setup_backfill_control.sql",
);

let tempRoot;
let replayWorkdir;
let lateApplyWorkdir;
let stackStartAttempted = false;
let cleanupAttempted = false;

function log(message) {
  process.stdout.write(`[restored-history-incremental] ${message}\n`);
}

function run(command, args, { capture = false, env = process.env, sensitive = false } = {}) {
  log(`$ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    env,
    encoding: "utf8",
    shell: false,
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = sensitive
      ? "credential-bearing output suppressed"
      : `${result.stderr || ""}\n${result.stdout || ""}`.trim();
    throw new Error(
      `${command} exited ${result.status}${detail ? `: ${detail.slice(0, 1200)}` : ""}`,
    );
  }
  return result;
}

function requireBinary(binary) {
  const result = spawnSync(binary, ["--version"], {
    stdio: "ignore",
    shell: false,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`required binary not found on PATH: ${binary}`);
  }
}

function parseSupabaseEnv(output) {
  return Object.fromEntries(
    output
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Z0-9_]+)="?(.*?)"?$/))
      .filter(Boolean)
      .map((match) => [match[1], match[2]]),
  );
}

function assertLoopbackUrl(value, label) {
  const host = new URL(value).hostname.toLowerCase();
  const loopback = host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  if (!loopback || value.includes(PRODUCTION_PROJECT_REF)) {
    throw new Error(`${label} is not a disposable loopback URL: ${host}`);
  }
}

function postgresEnvFromUrl(value) {
  const parsed = new URL(value);
  return {
    ...process.env,
    PGHOST: parsed.hostname === "[::1]" ? "::1" : parsed.hostname,
    PGPORT: parsed.port || "5432",
    PGUSER: decodeURIComponent(parsed.username),
    PGPASSWORD: decodeURIComponent(parsed.password),
    PGDATABASE: decodeURIComponent(parsed.pathname.replace(/^\//, "")),
    PGSSLMODE: "disable",
  };
}

function removeBaselineMigration(filename) {
  const migrationsDir = resolve(replayWorkdir, "supabase", "migrations");
  const candidate = resolve(migrationsDir, filename);
  if (!candidate.startsWith(`${migrationsDir}${sep}`) || basename(candidate) !== filename) {
    throw new Error(`refusing to remove unbounded baseline path: ${candidate}`);
  }
  if (!existsSync(candidate))
    throw new Error(`baseline migration missing before removal: ${filename}`);
  rmSync(candidate, { force: false });
}

function cleanup() {
  if (cleanupAttempted) return !tempRoot;
  cleanupAttempted = true;
  if (stackStartAttempted && replayWorkdir) {
    const stop = spawnSync("supabase", ["stop", "--workdir", replayWorkdir, "--no-backup"], {
      cwd: REPO_ROOT,
      stdio: "ignore",
      shell: false,
    });
    if (stop.error || stop.status !== 0) {
      console.error(
        `[restored-history-incremental] cleanup failed: local stack did not stop; preserved ${tempRoot}`,
      );
      stackStartAttempted = false;
      return false;
    }
    stackStartAttempted = false;
  }
  if (!tempRoot) return true;
  const resolvedTemp = resolve(tmpdir());
  const resolvedRoot = resolve(tempRoot);
  const bounded =
    resolvedRoot.startsWith(`${resolvedTemp}${sep}`) &&
    basename(resolvedRoot).startsWith("verdant-restored-history-");
  if (!bounded) {
    console.error(
      `[restored-history-incremental] refusing cleanup outside bounded temp: ${resolvedRoot}`,
    );
    return false;
  }
  try {
    rmSync(resolvedRoot, { recursive: true, force: true });
  } catch (error) {
    console.error(`[restored-history-incremental] cleanup failed: ${error.message}`);
    return false;
  }
  tempRoot = undefined;
  replayWorkdir = undefined;
  lateApplyWorkdir = undefined;
  return true;
}

function handleSignal(signal, exitCode) {
  console.error(`[restored-history-incremental] interrupted by ${signal}; cleaning up`);
  process.exit(cleanup() ? exitCode : 1);
}

process.once("SIGINT", () => handleSignal("SIGINT", 130));
process.once("SIGTERM", () => handleSignal("SIGTERM", 143));

async function main() {
  for (const binary of ["node", "supabase", "psql"]) requireBinary(binary);
  if (!existsSync(SQL_HARNESS)) throw new Error(`missing SQL harness: ${SQL_HARNESS}`);
  if (!existsSync(RAW_BACKFILL_CONTROL)) {
    throw new Error(`missing raw backfill control: ${RAW_BACKFILL_CONTROL}`);
  }

  tempRoot = mkdtempSync(join(tmpdir(), "verdant-restored-history-"));
  replayWorkdir = join(tempRoot, "target-baseline");
  lateApplyWorkdir = join(tempRoot, "prepared-late-apply");

  const baselineReport = prepareReplayWorkspace({
    sourceRoot: REPO_ROOT,
    outputRoot: replayWorkdir,
  });
  const lateApplyReport = prepareReplayWorkspace({
    sourceRoot: REPO_ROOT,
    outputRoot: lateApplyWorkdir,
  });
  if (
    baselineReport.mode !== "prepared" ||
    baselineReport.source_migrations_unchanged !== true ||
    lateApplyReport.mode !== "prepared" ||
    lateApplyReport.source_migrations_unchanged !== true ||
    baselineReport.source_migration_tree_sha256 !== lateApplyReport.source_migration_tree_sha256 ||
    baselineReport.prepared_migration_tree_sha256 !== lateApplyReport.prepared_migration_tree_sha256
  ) {
    throw new Error("replay preparer did not prove immutable source migrations");
  }
  const preparedSqlHarness = resolve(
    lateApplyWorkdir,
    "supabase/tests/restored_history_incremental_forward_repair.sql",
  );
  if (!existsSync(preparedSqlHarness)) {
    throw new Error(`prepared SQL harness missing: ${preparedSqlHarness}`);
  }

  // The disposable baseline must match the target branch: the restored
  // historical files and their additive repair are absent before reset.
  for (const filename of [...RESTORED_MIGRATIONS, REPAIR_MIGRATION]) {
    removeBaselineMigration(filename);
  }

  stackStartAttempted = true;
  run(
    "supabase",
    [
      "start",
      "--workdir",
      replayWorkdir,
      "--exclude",
      "studio,inbucket,imgproxy,pgadmin-schema-diff,pgbouncer,realtime,edge-runtime,logflare,vector",
    ],
    { capture: true, sensitive: true },
  );

  const status = run("supabase", ["status", "--workdir", replayWorkdir, "-o", "env"], {
    capture: true,
    sensitive: true,
  });
  const localEnv = parseSupabaseEnv(status.stdout || "");
  if (!localEnv.DB_URL || !localEnv.API_URL) {
    throw new Error(`Supabase status omitted loopback URLs: ${Object.keys(localEnv).join(",")}`);
  }
  assertLoopbackUrl(localEnv.DB_URL, "DB_URL");
  assertLoopbackUrl(localEnv.API_URL, "API_URL");
  const postgresEnv = postgresEnvFromUrl(localEnv.DB_URL);

  run("supabase", ["db", "reset", "--workdir", replayWorkdir, "--local"]);

  // First prove why the raw duplicate backfill is unsafe. This source-tree
  // control is transactionally rolled back and never represents a supported
  // apply path.
  run("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-f", RAW_BACKFILL_CONTROL], {
    env: postgresEnv,
  });

  // Then exercise the supported path: every restored file is read from a
  // second SHA-verified compatibility workspace, so duplicate history is
  // no-op'd before the additive repair converges the remaining late effects.
  run("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-f", preparedSqlHarness], {
    env: postgresEnv,
  });

  log(`PASS: ${RESTORED_MIGRATIONS.length} late historical migrations plus additive repair`);
}

try {
  await main();
} catch (error) {
  console.error(`[restored-history-incremental] FAIL: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (!cleanup()) process.exitCode = 1;
}
