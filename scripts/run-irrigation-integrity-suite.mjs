#!/usr/bin/env node
/**
 * One-shot orchestrator for the irrigation evidence integrity suite.
 *
 * Steps (fail-closed, per-step reported):
 *   1. supabase start           — boot the disposable local stack
 *   2. supabase db reset        — apply migrations + seed.sql (prod-parity ACL)
 *   3. runtime harness          — scripts/run-irrigation-evidence-rls-harness.ts
 *                                 against the disposable stack (loopback only)
 *   4. pgTAP feeding            — supabase/tests/create_feeding_event.sql
 *   5. pgTAP watering           — supabase/tests/create_watering_event.sql
 *   6. static safety pins       — vitest run of the two irrigation static-safety
 *                                 files that encode the pinned contract
 *
 * At the end, prints a comparison table: each step's pass/fail alongside the
 * static pins it is meant to satisfy. Any red row is a real drift signal.
 *
 * Refuses to run against anything that is not a loopback Supabase stack.
 * Never touches the linked production project.
 *
 * Windows / macOS / Linux friendly. Requires: node, bun, supabase CLI, psql.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const PRODUCTION_PROJECT_REF = "knkwiiywfkbqznbxwqfh";

const STATIC_PIN_FILES = [
  "src/test/irrigation-evidence-rls-harness-static-safety.test.ts",
  "src/test/irrigation-evidence-static-safety.test.ts",
];

const PGTAP_FILES = [
  "supabase/tests/create_feeding_event.sql",
  "supabase/tests/create_watering_event.sql",
];

/**
 * @typedef {{ name: string; status: "PASS" | "FAIL" | "SKIP"; detail?: string; pins?: string[] }} StepResult
 */
/** @type {StepResult[]} */
const results = [];

function log(msg) {
  process.stdout.write(`[irrigation-integrity] ${msg}\n`);
}

function fail(step, detail) {
  results.push({ name: step, status: "FAIL", detail });
  return false;
}

function ok(step, detail, pins) {
  results.push({ name: step, status: "PASS", detail, pins });
  return true;
}

function run(cmd, args, opts = {}) {
  log(`$ ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, {
    cwd: REPO_ROOT,
    stdio: opts.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    env: { ...process.env, ...(opts.env ?? {}) },
    shell: process.platform === "win32",
    encoding: "utf8",
  });
  if (r.error) throw r.error;
  return r;
}

function requireBin(bin) {
  const probe = spawnSync(bin, ["--version"], {
    stdio: "ignore",
    shell: process.platform === "win32",
  });
  if (probe.status !== 0) {
    console.error(`[irrigation-integrity] required binary not found on PATH: ${bin}`);
    process.exit(2);
  }
}

// -- Preflight --------------------------------------------------------------
for (const f of [...STATIC_PIN_FILES, ...PGTAP_FILES]) {
  if (!existsSync(resolve(REPO_ROOT, f))) {
    console.error(`[irrigation-integrity] missing expected file: ${f}`);
    process.exit(2);
  }
}
for (const bin of ["node", "bun", "supabase", "psql"]) requireBin(bin);

// -- 1. supabase start ------------------------------------------------------
let apiUrl, dbUrl, anonKey, serviceKey;
try {
  // Idempotent: `supabase start` is a no-op if already running.
  const start = run("supabase", ["start"], { capture: true });
  if (start.status !== 0) {
    fail("supabase start", (start.stderr || start.stdout || "").trim().slice(0, 400));
    printSummaryAndExit(1);
  }
  process.stdout.write(start.stdout ?? "");

  const status = run("supabase", ["status", "-o", "env"], { capture: true });
  if (status.status !== 0) {
    fail("supabase status", (status.stderr || status.stdout || "").trim().slice(0, 400));
    printSummaryAndExit(1);
  }
  const env = Object.fromEntries(
    (status.stdout || "")
      .split(/\r?\n/)
      .map((l) => l.match(/^([A-Z0-9_]+)="?(.*?)"?$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2]]),
  );
  apiUrl = env.API_URL;
  dbUrl = env.DB_URL;
  anonKey = env.ANON_KEY;
  serviceKey = env.SERVICE_ROLE_KEY;
  if (!apiUrl || !dbUrl || !anonKey || !serviceKey) {
    fail("supabase status", `missing keys in output: ${Object.keys(env).join(",")}`);
    printSummaryAndExit(1);
  }
  // Loopback guard — this suite must never touch a hosted project.
  const dbHost = new URL(dbUrl).hostname.toLowerCase();
  const apiHost = new URL(apiUrl).hostname.toLowerCase();
  const isLoopback = (h) =>
    h === "localhost" || h === "127.0.0.1" || h === "::1" || h.endsWith(".local");
  if (!isLoopback(dbHost) || !isLoopback(apiHost)) {
    fail("loopback guard", `refusing non-loopback stack api=${apiHost} db=${dbHost}`);
    printSummaryAndExit(1);
  }
  if (dbUrl.includes(PRODUCTION_PROJECT_REF) || apiUrl.includes(PRODUCTION_PROJECT_REF)) {
    fail("loopback guard", `production project ref detected in local stack env`);
    printSummaryAndExit(1);
  }
  ok("supabase start", `api=${apiHost} db=${dbHost}`);
} catch (e) {
  fail("supabase start", String(e?.message ?? e));
  printSummaryAndExit(1);
}

// -- 2. supabase db reset ---------------------------------------------------
{
  const r = run("supabase", ["db", "reset"]);
  if (r.status !== 0) {
    fail("supabase db reset", `exit ${r.status}`);
    printSummaryAndExit(1);
  }
  ok("supabase db reset", "migrations + seed.sql applied");
}

// -- 3. runtime harness -----------------------------------------------------
{
  const r = run(
    "bun",
    ["run", "scripts/run-irrigation-evidence-rls-harness.ts", "--confirm-local-security-lane"],
    {
      env: {
        IRRIGATION_EVIDENCE_RLS_HARNESS: "1",
        SUPABASE_URL: apiUrl,
        SUPABASE_DB_URL: dbUrl,
        SUPABASE_ANON_KEY: anonKey,
        SUPABASE_SERVICE_ROLE_KEY: serviceKey,
      },
    },
  );
  if (r.status !== 0) fail("runtime harness", `exit ${r.status}`);
  else
    ok("runtime harness", "loopback stack, disposable users", [
      "irrigation-evidence-rls-harness-static-safety.test.ts",
      "irrigation-evidence-static-safety.test.ts",
    ]);
}

// -- 4/5. pgTAP suites ------------------------------------------------------
for (const sql of PGTAP_FILES) {
  const r = run("psql", [dbUrl, "-v", "ON_ERROR_STOP=1", "-f", sql]);
  const label = `pgTAP ${sql.split("/").pop()}`;
  if (r.status !== 0) fail(label, `exit ${r.status}`);
  else ok(label, "structural + ACL matrix", ["trust-boundary-contract"]);
}

// -- 6. static safety pins --------------------------------------------------
{
  const r = run("bunx", ["vitest", "run", "--reporter=dot", ...STATIC_PIN_FILES]);
  if (r.status !== 0) fail("static safety pins", `exit ${r.status}`);
  else ok("static safety pins", `${STATIC_PIN_FILES.length} files`);
}

// -- Summary ----------------------------------------------------------------
printSummaryAndExit(results.some((r) => r.status === "FAIL") ? 1 : 0);

function printSummaryAndExit(code) {
  const line = "-".repeat(78);
  console.log(`\n${line}`);
  console.log("Irrigation Integrity Suite — comparison against static pins");
  console.log(line);
  const w = Math.max(...results.map((r) => r.name.length), 22);
  for (const r of results) {
    const badge = r.status === "PASS" ? "✅ PASS" : r.status === "FAIL" ? "❌ FAIL" : "⏭  SKIP";
    console.log(`${badge}  ${r.name.padEnd(w)}  ${r.detail ?? ""}`);
    if (r.pins?.length) {
      for (const p of r.pins) console.log(`         ↳ pin: ${p}`);
    }
  }
  console.log(line);
  const pass = results.filter((r) => r.status === "PASS").length;
  const failN = results.filter((r) => r.status === "FAIL").length;
  console.log(`Total: ${results.length}  Pass: ${pass}  Fail: ${failN}`);
  console.log(line);
  process.exit(code);
}
