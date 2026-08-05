import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface PsqlSpawnStubResult {
  stdout?: string;
  stderr?: string;
  exit?: number;
}

export interface PsqlInvocation {
  command: string;
  args: string[];
  env: Record<string, string | undefined>;
}

export interface InstalledPsqlSpawnStub {
  invocationPath: string;
  nodeOptions: string;
  readInvocation(): PsqlInvocation;
}

/**
 * Installs a Node preload that intercepts only `spawnSync("psql", ...)`.
 *
 * This keeps the money-migration process-boundary tests deterministic and
 * cross-platform without requiring a real database client on the test runner.
 */
export function installPsqlSpawnStub(
  directory: string,
  result: PsqlSpawnStubResult,
): InstalledPsqlSpawnStub {
  const invocationPath = join(directory, "psql-invocation.json");
  const preloadPath = join(directory, "psql-spawn-preload.cjs");
  const preloadSource = `
const childProcess = require("node:child_process");
const { writeFileSync } = require("node:fs");
const { syncBuiltinESMExports } = require("node:module");

const originalSpawnSync = childProcess.spawnSync;
childProcess.spawnSync = function interceptedSpawnSync(command, args, options) {
  if (command !== "psql") {
    return originalSpawnSync.call(this, command, args, options);
  }

  const connectionEnv = {};
  for (const [key, value] of Object.entries(options?.env ?? {})) {
    const normalizedKey = key.toUpperCase();
    if (
      normalizedKey.startsWith("PG") ||
      normalizedKey === "DATABASE_URL" ||
      normalizedKey.startsWith("SUPABASE_")
    ) {
      connectionEnv[key] = value;
    }
  }

  writeFileSync(
    ${JSON.stringify(invocationPath)},
    JSON.stringify({
      command,
      args: Array.isArray(args) ? args : [],
      env: connectionEnv,
    }),
    "utf8",
  );

  const stdout = ${JSON.stringify(result.stdout ?? "")};
  const stderr = ${JSON.stringify(result.stderr ?? "")};
  return {
    pid: 1,
    output: [null, stdout, stderr],
    stdout,
    stderr,
    status: ${result.exit ?? 0},
    signal: null,
  };
};

syncBuiltinESMExports();
`;

  writeFileSync(preloadPath, preloadSource, "utf8");

  return {
    invocationPath,
    nodeOptions: `--require=${JSON.stringify(preloadPath.replace(/\\/g, "/"))}`,
    readInvocation() {
      if (!existsSync(invocationPath)) {
        throw new Error("Expected the psql spawn stub to record an invocation.");
      }
      return JSON.parse(readFileSync(invocationPath, "utf8")) as PsqlInvocation;
    },
  };
}
