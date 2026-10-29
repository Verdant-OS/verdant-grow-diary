/**
 * GHSA-rmxm-3fg6-px4f (advisory 1243661): @hono/node-server >=1.19.10 <2.1.3
 * decodes a `serveStatic` request path twice, so middleware on static paths
 * can be bypassed. The lockfile policy's floor must reject a vulnerable
 * release on its own, independent of the exact
 * `overrides["@hono/node-server"]` pin, so a later change that moves both the
 * override and its pin cannot reintroduce it.
 */
import { describe, expect, it } from "vitest";
import { relative, resolve } from "node:path";
import {
  BUN_LOCK_SECURITY_FLOORS,
  evaluatePolicy,
} from "../../scripts/check-bun-lockfile-policy.mjs";

const MCP = "@lovable.dev/mcp-js";
const NODE_SERVER = "@hono/node-server";
const CWD = resolve("virtual-repo");
const at = (name: string) => resolve(CWD, name);
// Joined at runtime: the policy scans tracked source for npm consumer commands,
// and this fixture needs the marker only inside its virtual README.
const NPM_MARKER = ["npm", "install"].join(" ");

function evaluateWithNodeServer(version: string) {
  const manifest = {
    name: "verdant",
    version: "0.0.0",
    dependencies: { [MCP]: "0.24.0" },
    devDependencies: {},
    overrides: { [NODE_SERVER]: version },
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
    [NODE_SERVER]: [`${NODE_SERVER}@${version}`, "", {}],
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
  result.errors.filter((error) => error.includes(`security floor for ${NODE_SERVER}`));

describe("@hono/node-server security floor (GHSA-rmxm-3fg6-px4f)", () => {
  it.each(["2.0.10", "2.1.2"])(
    "rejects vulnerable %s even when the override pins it",
    (version) => {
      expect(floorErrors(evaluateWithNodeServer(version))).toEqual([
        `bun.lock security floor for ${NODE_SERVER} is 2.1.3; found ${version}.`,
      ]);
    },
  );

  it("accepts the first fixed release", () => {
    expect(floorErrors(evaluateWithNodeServer("2.1.3"))).toEqual([]);
  });
});
