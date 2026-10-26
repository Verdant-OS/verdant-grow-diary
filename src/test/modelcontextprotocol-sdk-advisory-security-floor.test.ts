/**
 * GHSA-22jm-h49p-29qw and GHSA-6prh-2h8m-c8cw (advisories 1242628, 1242630):
 * @modelcontextprotocol/sdk <1.32.0 does not tie experimental tasks to their
 * session, and its client transports re-send custom headers across origins.
 * The lockfile policy's floor must reject a vulnerable SDK on its own,
 * independent of the exact `overrides["@modelcontextprotocol/sdk"]` pin, so a
 * later change that moves both the override and its pin cannot reintroduce it.
 */
import { describe, expect, it } from "vitest";
import { relative, resolve } from "node:path";
import {
  BUN_LOCK_SECURITY_FLOORS,
  evaluatePolicy,
} from "../../scripts/check-bun-lockfile-policy.mjs";

const MCP = "@lovable.dev/mcp-js";
const SDK = "@modelcontextprotocol/sdk";
const CWD = resolve("virtual-repo");
const at = (name: string) => resolve(CWD, name);
// Joined at runtime: the policy scans tracked source for npm consumer commands,
// and this fixture needs the marker only inside its virtual README.
const NPM_MARKER = ["npm", "install"].join(" ");

function evaluateWithSdk(version: string) {
  const manifest = {
    name: "verdant",
    version: "0.0.0",
    dependencies: { [MCP]: "0.24.0" },
    devDependencies: {},
    overrides: { [SDK]: version },
  };
  const packages = {
    [MCP]: [`${MCP}@0.24.0`, "", {}],
    ...Object.fromEntries(
      Object.entries(BUN_LOCK_SECURITY_FLOORS).map(([name, version]) => [
        name,
        [`${name}@${version}`, "", {}],
      ]),
    ),
    minimatch: ["minimatch@3.1.5", "", {}],
    [SDK]: [`${SDK}@${version}`, "", {}],
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

const floorErrors = (result: { errors: string[] }) =>
  result.errors.filter((error) => error.includes(`security floor for ${SDK}`));

describe("@modelcontextprotocol/sdk security floor (GHSA-22jm-h49p-29qw, GHSA-6prh-2h8m-c8cw)", () => {
  it("rejects the last vulnerable release even when the override pins it", () => {
    expect(floorErrors(evaluateWithSdk("1.31.0"))).toEqual([
      `bun.lock security floor for ${SDK} is 1.32.0; found 1.31.0.`,
    ]);
  });

  it("accepts the first fixed release", () => {
    expect(floorErrors(evaluateWithSdk("1.32.0"))).toEqual([]);
  });
});
