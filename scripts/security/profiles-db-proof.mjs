import { execFileSync } from "node:child_process";

const RPC_CASES = [
  "J: RPC-triggered gamification update is blocked by trigger",
  "J1/J2/J3: RPC single-field gamification updates are each blocked",
];
const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);

export function requireLocalProfileEnvironment(env) {
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
      "BLOCKED: profiles proof requires distinct local API keys and loopback API/database URLs without query overrides.",
    );
  }
}

/** Test fixture DDL only; never exports SQL through an application RPC. */
export function runProfileFixtureSql(sql, env = process.env, execute = execFileSync) {
  const { database } = requireLocalProfileEnvironment(env);
  const childEnv = { ...env };
  // libpq treats PGSERVICE="" as a service lookup, not as an unset option.
  // Remove inherited PG routing/configuration before supplying the validated
  // connection. This also prevents service files and platform PG wrappers from
  // redirecting this disposable fixture to a different database.
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
    execute("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", "-"], {
      input: sql,
      env: childEnv,
      stdio: ["pipe", "pipe", "pipe"],
      encoding: "utf8",
      timeout: 15_000,
      windowsHide: true,
    });
  } catch {
    throw new Error("BLOCKED: profiles local SQL fixture command failed.");
  }
}

export function requireExecutedProfileProof(report) {
  const cases = (report?.testResults ?? []).flatMap((file) => file.assertionResults ?? []);
  if (
    report?.success !== true ||
    report.numTotalTests !== 16 ||
    report.numPassedTests !== 16 ||
    report.numFailedTests !== 0 ||
    report.numPendingTests !== 0 ||
    (report.numTodoTests ?? 0) !== 0 ||
    cases.length !== 16 ||
    cases.some((item) => item.status !== "passed") ||
    new Set(cases.map((item) => item.fullName)).size !== 16 ||
    RPC_CASES.some((name) => cases.filter((item) => item.fullName?.endsWith(name)).length !== 1)
  ) {
    throw new Error(
      "BLOCKED: profiles proof requires all 16 distinct cases, including both RPC cases, executed and passed without skips.",
    );
  }
}
