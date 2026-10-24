/**
 * GHSA-27r3-jxmh-p828 (advisory 1243074): body-parser >=2.0.0 <2.4.0 can be
 * crashed by trailing bytes after a compressed request body. The lockfile
 * policy's floor must reject a vulnerable body-parser on its own, independent
 * of the exact `overrides["body-parser"]` pin, so a later change that moves
 * both the override and its pin cannot reintroduce it.
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

function evaluateWithBodyParser(version: string) {
  const manifest = {
    name: "verdant",
    version: "0.0.0",
    dependencies: { [MCP]: "0.24.0" },
    devDependencies: {},
    overrides: { "body-parser": version },
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
    "body-parser": [`body-parser@${version}`, "", {}],
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
  result.errors.filter((error) => error.includes("security floor for body-parser"));

describe("body-parser security floor (GHSA-27r3-jxmh-p828)", () => {
  it("rejects the vulnerable release even when the override pins it", () => {
    expect(floorErrors(evaluateWithBodyParser("2.3.0"))).toEqual([
      "bun.lock security floor for body-parser is 2.4.0; found 2.3.0.",
    ]);
  });

  it("accepts the first fixed release", () => {
    expect(floorErrors(evaluateWithBodyParser("2.4.0"))).toEqual([]);
  });
});
