import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Startup output can contain credentials. Publish fixed diagnostic signals,
// never raw lines, paths, exception messages, or unrecognized SQLSTATE text.
/** @type {ReadonlyArray<readonly [string, RegExp]>} */
const SIGNALS = [
  ["container_health_failure", /container.*(?:not healthy|unhealthy)|health check failed/i],
  ["database_sql_error", /\bERROR\s*:|\bSQLSTATE\b/i],
  ["docker_unavailable", /cannot connect to the docker daemon|docker daemon is not running/i],
  ["port_in_use", /address already in use|port is already allocated/i],
  [
    "registry_access_denied",
    /unauthorized: authentication required|pull access denied|denied: requested access/i,
  ],
  ["registry_rate_limit", /\btoomanyrequests\b|\bHTTP\s+429\b|429 Too Many Requests/i],
  [
    "registry_transport_error",
    /x509:|TLS handshake timeout|i\/o timeout|connection reset by peer/i,
  ],
];
const SQLSTATE_ALLOWLIST = new Set([
  "22023",
  "23505",
  "25001",
  "40001",
  "40P01",
  "42501",
  "42601",
  "42710",
  "42883",
  "42P01",
  "42P07",
  "P0001",
]);
const MAX_LOG_BYTES = 128 * 1024;

/**
 * Evidence of recognized patterns, not a determination of root cause.
 * @param {unknown} log
 * @returns {{version: 1, log_available: boolean, signals: string[], recognized_sqlstates: string[]}}
 */
export function summarizeStartupLog(log) {
  const text = typeof log === "string" ? log : "";
  const sqlstates = new Set();
  for (const match of text.matchAll(/\bSQLSTATE\s+([A-Z0-9]{5})\b/g)) {
    if (SQLSTATE_ALLOWLIST.has(match[1])) sqlstates.add(match[1]);
  }
  return {
    version: 1,
    log_available: typeof log === "string",
    signals: SIGNALS.filter(([, pattern]) => pattern.test(text)).map(([signal]) => signal),
    recognized_sqlstates: [...sqlstates].sort(),
  };
}

function readPrivateLogTail(path) {
  let fd;
  try {
    fd = openSync(path, "r");
    const stat = fstatSync(fd);
    if (!stat.isFile()) return { log: null, truncated: false };
    const size = Math.min(stat.size, MAX_LOG_BYTES);
    const buffer = Buffer.alloc(size);
    const length = readSync(fd, buffer, 0, size, stat.size - size);
    return {
      log: buffer.subarray(0, length).toString("utf8"),
      truncated: stat.size > MAX_LOG_BYTES,
    };
  } catch {
    return { log: null, truncated: false };
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function run(args) {
  const logFiles = args.filter((arg) => arg.startsWith("--log-file="));
  const phases = args.filter((arg) => arg.startsWith("--phase="));
  const phase = phases[0]?.slice("--phase=".length);
  const logFile = logFiles[0]?.slice("--log-file=".length);
  if (
    args.length !== 2 ||
    logFiles.length !== 1 ||
    phases.length !== 1 ||
    !logFile ||
    !["start", "reset"].includes(phase)
  ) {
    console.log(JSON.stringify({ version: 1, status: "invalid_arguments" }));
    return 2;
  }
  const { log, truncated } = readPrivateLogTail(logFile);
  const summary = summarizeStartupLog(log);
  console.log(JSON.stringify({ ...summary, phase, truncated }));
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = run(process.argv.slice(2));
}
