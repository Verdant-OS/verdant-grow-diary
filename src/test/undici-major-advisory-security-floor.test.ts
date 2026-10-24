/**
 * GHSA-xjj6-f33q-929c (undici, bun audit 1243114) affects three major lines:
 * >=6.23.0 <6.29.1, >=7.18.0 <7.30.1 and >=8.0.0 <8.12.2. The flat 6.29.1 floor
 * accepts any 7.x or 8.x release, so the policy also carries major-aware floors.
 * A later lock regeneration onto an affected 7.x or 8.x must fail even when the
 * override pins it.
 */
import { describe, expect, it } from "vitest";
import { relative, resolve } from "node:path";
import {
  BUN_LOCK_SECURITY_FLOORS,
  evaluatePolicy,
} from "../../scripts/check-bun-lockfile-policy.mjs";

const MCP = "@lovable.dev/mcp-js";
const CWD = resolve("virtual-repo");
const at = (name: string) => resolve(CWD, name);
// Joined at runtime: the policy scans tracked source for npm consumer commands,
// and this fixture needs the marker only inside its virtual README.
const NPM_MARKER = ["npm", "install"].join(" ");

function evaluateWithUndici(version: string) {
  const manifest = {
    name: "verdant",
    version: "0.0.0",
    dependencies: { [MCP]: "0.24.0" },
    devDependencies: {},
    overrides: { undici: version },
  };
  const packages = {
    [MCP]: [`${MCP}@0.24.0`, "", {}],
    ...Object.fromEntries(
      Object.entries(BUN_LOCK_SECURITY_FLOORS).map(([name, floor]) => [
        name,
        [`${name}@${floor}`, "", {}],
      ]),
    ),
    minimatch: ["minimatch@3.1.5", "", {}],
    undici: [`undici@${version}`, "", {}],
  };
  const files: Record<string, string> = {
    [at("package.json")]: JSON.stringify(manifest),
    [at("bun.lock")]: JSON.stringify({
      lockfileVersion: 1,
      workspaces: { "": { name: manifest.name, dependencies: manifest.dependencies } },
      overrides: manifest.overrides,
      packages,
    }),
    [at("config/dependency-lockfile-transition.json")]: JSON.stringify({
      schemaVersion: 2,
      canonicalPackageManager: "bun",
      canonicalLockfile: "bun.lock",
      owner: "Verdant dependency security",
      reason: "npm remains in a reviewed local setup entrypoint.",
      consumerContracts: [{ path: "README.md", markers: [NPM_MARKER] }],
    }),
    [at("README.md")]: NPM_MARKER,
  };
  const paths = new Set(Object.keys(files));
  return evaluatePolicy({
    cwd: CWD,
    exists: (path: string) => paths.has(path),
    readFile: (path: string) => {
      if (!(path in files)) throw new Error(`ENOENT: ${path}`);
      return files[path];
    },
    listFiles: () => [...paths],
    listTracked: () => [...paths].map((path) => relative(CWD, path).replaceAll("\\", "/")),
  });
}

const undiciErrors = (result: { errors: string[] }) =>
  result.errors.filter((error) => /security floor for undici\b/.test(error));

describe("undici major-aware security floors (GHSA-xjj6-f33q-929c)", () => {
  it.each(["6.29.0", "7.18.0", "7.30.0", "8.0.0", "8.12.1"])(
    "rejects affected %s even when the override pins it",
    (version) => {
      expect(undiciErrors(evaluateWithUndici(version))).toContain(
        `bun.lock major-aware security floor for undici rejected ${version}.`,
      );
    },
  );

  it.each(["6.29.1", "7.30.1", "8.12.2", "9.0.0"])("accepts %s", (version) => {
    expect(undiciErrors(evaluateWithUndici(version))).toEqual([]);
  });
});
