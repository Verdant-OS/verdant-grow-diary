/**
 * GHSA-mrhx-c7xc-m3w5 (zod, bun audit 1243066), GHSA-27r3-jxmh-p828 (body-parser,
 * 1243074) and the qs 6.16.1 pin that body-parser 2.4.0 needs. The lockfile
 * policy's floor must reject each vulnerable release on its own, independent of
 * the exact `overrides` pin, so a later lock regeneration cannot fall back below it.
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

function evaluateWith(packageName: string, version: string) {
  const manifest = {
    name: "verdant",
    version: "0.0.0",
    dependencies: { [MCP]: "0.24.0" },
    devDependencies: {},
    overrides: { [packageName]: version },
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
    [packageName]: [`${packageName}@${version}`, "", {}],
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

const floorErrors = (packageName: string, result: { errors: string[] }) =>
  result.errors.filter((error) => error.includes(`security floor for ${packageName} `));

describe.each([
  ["zod", "3.25.76", "4.6.7"],
  ["body-parser", "2.3.0", "2.4.0"],
  ["qs", "6.16.0", "6.16.1"],
])("%s security floor", (packageName, vulnerable, fixed) => {
  it(`rejects ${vulnerable} even when the override pins it`, () => {
    expect(floorErrors(packageName, evaluateWith(packageName, vulnerable))).toEqual([
      `bun.lock security floor for ${packageName} is ${fixed}; found ${vulnerable}.`,
    ]);
  });

  it(`accepts ${fixed}`, () => {
    expect(floorErrors(packageName, evaluateWith(packageName, fixed))).toEqual([]);
  });
});
