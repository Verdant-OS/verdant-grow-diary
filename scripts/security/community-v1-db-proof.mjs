import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** Runtime (RT) case IDs from the Task 2 backend packet §8, in table order. */
export const COMMUNITY_V1_REQUIRED_CASES = Object.freeze([
  "T-ISO-01",
  "T-ISO-02",
  "T-ISO-03",
  "T-ISO-04",
  "T-ISO-05",
  "T-PRO-01",
  "T-PRO-02",
  "T-PRO-03",
  "T-PRO-04",
  "T-FOL-01",
  "T-FOL-02",
  "T-ACC-01",
  "T-ACC-02",
  "T-ACC-03",
  "T-ACC-04",
  "T-PUB-01",
  "T-PUB-02",
  "T-PUB-03",
  "T-PUB-04",
  "T-PUB-05",
  "T-PUB-06",
  "T-PUB-07",
  "T-BLK-01",
  "T-BLK-02",
  "T-SRC-01",
  "T-LIFE-01",
  "T-LIFE-02",
  "T-MOD-01",
  "T-MOD-02",
  "T-MOD-03",
  "T-DIG-01",
  "T-DIG-02",
  "T-DIG-03",
  "T-FMT-01",
  "T-RL-01",
  "T-RL-02",
  "T-KS-01",
]);

export function requireLocalCommunityEnvironment(env) {
  try {
    for (const name of [
      "SUPABASE_URL",
      "SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_DB_URL",
    ]) {
      if (!env[name]?.trim()) throw new Error();
    }
    const api = new URL(env.SUPABASE_URL);
    const database = new URL(env.SUPABASE_DB_URL);
    if (
      api.protocol !== "http:" ||
      !LOOPBACK.has(api.hostname) ||
      api.username ||
      api.password ||
      api.search ||
      api.hash ||
      (api.pathname !== "/" && api.pathname !== "") ||
      !["postgres:", "postgresql:"].includes(database.protocol) ||
      !LOOPBACK.has(database.hostname) ||
      database.search ||
      database.hash ||
      !database.username ||
      !database.password ||
      !/^\/[a-zA-Z0-9_-]+$/.test(decodeURIComponent(database.pathname)) ||
      env.SUPABASE_ANON_KEY === env.SUPABASE_SERVICE_ROLE_KEY
    )
      throw new Error();
    return { api, database };
  } catch {
    throw new Error(
      "BLOCKED: community v1 proof requires distinct local API keys and loopback API/database URLs without query overrides.",
    );
  }
}

/** Test fixture SQL for the disposable database only; never exposed through an application RPC. */
export function runCommunityFixtureSql(sql, env = process.env, execute = execFileSync) {
  const { database } = requireLocalCommunityEnvironment(env);
  const childEnv = { ...env };
  // Drop inherited libpq routing (PGSERVICE, PGHOSTADDR, …) so only the validated
  // loopback connection below can be used.
  for (const name of Object.keys(childEnv)) {
    if (name.toUpperCase().startsWith("PG")) delete childEnv[name];
  }
  Object.assign(childEnv, {
    PGHOST: database.hostname.replace(/^\[|\]$/g, ""),
    PGPORT: database.port || "5432",
    PGUSER: decodeURIComponent(database.username),
    PGPASSWORD: decodeURIComponent(database.password),
    PGDATABASE: decodeURIComponent(database.pathname.slice(1)),
    PGOPTIONS: "-c statement_timeout=10000",
    PGCONNECT_TIMEOUT: "5",
    PGSSLMODE: "disable",
  });
  try {
    return execute("psql", ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-f", "-"], {
      input: sql,
      env: childEnv,
      stdio: ["pipe", "pipe", "pipe"],
      encoding: "utf8",
      timeout: 15_000,
      windowsHide: true,
    });
  } catch {
    throw new Error("BLOCKED: community v1 local SQL fixture command failed.");
  }
}

/**
 * Requires every RT case to have executed exactly once with no skips or todos.
 * Pass or fail of each case is reported, not judged: the RED run (2A) and the
 * GREEN run (2B) both need a complete execution receipt.
 */
export function requireExecutedCommunityProof(report) {
  const cases = (report?.testResults ?? []).flatMap((file) => file.assertionResults ?? []);
  const executed = cases.filter((item) => item.status === "passed" || item.status === "failed");
  const total = COMMUNITY_V1_REQUIRED_CASES.length;
  if (
    report?.numPendingTests !== 0 ||
    (report.numTodoTests ?? 0) !== 0 ||
    report.numTotalTests !== total ||
    cases.length !== total ||
    executed.length !== total ||
    COMMUNITY_V1_REQUIRED_CASES.some(
      (id) => cases.filter((item) => item.title?.startsWith(`${id} `)).length !== 1,
    )
  ) {
    throw new Error(
      `BLOCKED: community v1 proof requires all ${total} cases executed without skips.`,
    );
  }
  const passed = executed.filter((item) => item.status === "passed").length;
  return { passed, failed: total - passed };
}

/**
 * A RED failure must come from the absent Community V1 schema, never from fixture setup
 * or an assertion. The integration test throws this structured marker only after
 * PostgREST names the missing community function or table itself. It is matched
 * against the FIRST LINE of the case's first failure message, never anywhere in
 * the text, so an assertion diff that quotes a code cannot pass for RED.
 */
export const COMMUNITY_OBJECT_MISSING_LINE =
  /^(?:Error: )?COMMUNITY_OBJECT_MISSING (?:function|relation) community_[a-z_]+ (?:PGRST202|PGRST205)$/;

function firstFailureLine(item) {
  const first = item.failureMessages?.[0];
  return typeof first === "string" ? first.split("\n", 1)[0].trim() : "";
}

/** Task 2A receipt: every case executed and failed on a missing community function or relation. */
export function requireRedCommunityProof(report) {
  const { passed } = requireExecutedCommunityProof(report);
  const cases = (report?.testResults ?? []).flatMap((file) => file.assertionResults ?? []);
  if (
    passed !== 0 ||
    cases.some(
      (item) =>
        // A second failure on a case (an afterEach error) is not the missing schema.
        item.failureMessages?.length !== 1 ||
        !COMMUNITY_OBJECT_MISSING_LINE.test(firstFailureLine(item)),
    )
  ) {
    throw new Error(
      "BLOCKED: community v1 RED receipt requires every case to fail on a missing community function or relation.",
    );
  }
}

/** Env var naming the file the run-errors reporter writes for the proof runner. */
export const COMMUNITY_V1_RUN_ERRORS_ENV = "COMMUNITY_V1_RUN_ERRORS_FILE";

const RUN_ERROR_KEYS = ["moduleErrors", "suiteErrors", "unhandledErrors"];

/**
 * Vitest's JSON report drops a describe-level hook error and unhandled errors,
 * so a teardown failure could sit beside 37 marker failures unseen (Codex P1 at
 * 10bd581e). The runner loads this module as an extra Vitest reporter; it
 * writes only counts, never error text, to the file the runner names.
 */
export default class CommunityV1RunErrorsReporter {
  onTestRunEnd(testModules = [], unhandledErrors = []) {
    const path = process.env[COMMUNITY_V1_RUN_ERRORS_ENV];
    if (!path) return;
    let moduleErrors = 0;
    let suiteErrors = 0;
    for (const testModule of testModules) {
      moduleErrors += testModule.errors().length;
      for (const suite of testModule.children.allSuites()) suiteErrors += suite.errors().length;
    }
    writeFileSync(
      path,
      JSON.stringify({ moduleErrors, suiteErrors, unhandledErrors: unhandledErrors.length }),
    );
  }
}

/**
 * A RED receipt also needs a clean run outside the cases: zero module, suite and
 * unhandled errors from the reporter, and no file-level error in the JSON report.
 */
export function requireCleanCommunityRun(runErrors, report) {
  const counted =
    runErrors !== null &&
    typeof runErrors === "object" &&
    RUN_ERROR_KEYS.every((key) => runErrors[key] === 0);
  const fileErrors = (report?.testResults ?? []).some(
    (file) => typeof file.message === "string" && file.message !== "",
  );
  if (!counted || fileErrors) {
    throw new Error(
      "BLOCKED: community v1 RED receipt requires no suite, module or unhandled errors.",
    );
  }
}
